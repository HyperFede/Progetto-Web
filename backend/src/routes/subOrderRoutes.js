const express = require('express');
const router = express.Router();
const { isAuthenticated } = require('../middleware/authMiddleWare.js'); // Import isAuthenticated
const pool = require('../config/db-connect.js'); // Assuming your db connection pool is here

// Helper function for transaction management (optional but good practice)
const beginTransaction = async (client) => client.query('BEGIN');
const commitTransaction = async (client) => client.query('COMMIT');
const rollbackTransaction = async (client) => client.query('ROLLBACK');

const updateMainOrderStatusBasedOnSubOrders = async (orderId, client) => {
    try {
        console.log(`[Main Order Status Sync] Checking suborder statuses for Order ID: ${orderId}`);
        // Fetch all suborders for the given orderId
        const subOrdersResult = await client.query(
            'SELECT SubOrdineStatus FROM SubOrdine WHERE IDOrdine = $1::INTEGER',
            [orderId]
        );

        if (subOrdersResult.rows.length === 0) {
            console.log(`[Main Order Status Sync] No suborders found for Order ID: ${orderId}. No main order status change.`);
            return; // No suborders, so no change to main order status based on them
        }

        const subOrderStatuses = subOrdersResult.rows.map(so => so.subordinestatus); // pg returns lowercase
        const totalSubOrders = subOrderStatuses.length;

        let newMainOrderStatus = '';

        // Determine the new main order status
        const allConsegnato = subOrderStatuses.every(status => status === 'Consegnato');
        const allSpeditoOrConsegnato = subOrderStatuses.every(status => status === 'Spedito' || status === 'Consegnato');
        // 'Da spedire' is the earliest state after payment confirmation for suborders.
        // If any suborder is 'Da spedire', the main order is effectively 'Da spedire' until all parts progress.

        if (allConsegnato) {
            newMainOrderStatus = 'Consegnato';
        } else if (allSpeditoOrConsegnato) {
            // This means all are at least 'Spedito', and not all are 'Consegnato' (covered by the above).
            // So, at least one must be 'Spedito'.
            newMainOrderStatus = 'Spedito';
        } else {
            // If not all are 'Spedito' or 'Consegnato', it implies at least one is 'Da spedire'
            // (or an earlier valid state if your suborder lifecycle allows it before 'Da spedire').
            // Given suborders are created as 'Da spedire', this is the most likely fallback.
            newMainOrderStatus = 'Da spedire';
        }

        console.log(`[Main Order Status Sync] Calculated new main order status for Order ID ${orderId}: ${newMainOrderStatus}`);

        // Fetch current main order status
        const currentMainOrderResult = await client.query(
            'SELECT Status FROM Ordine WHERE IDOrdine = $1::INTEGER FOR UPDATE', // Lock for update
            [orderId]
        );

        if (currentMainOrderResult.rows.length === 0) {
            console.error(`[Main Order Status Sync] Main Order ID: ${orderId} not found during status sync.`);
            // This should not happen if we are operating on a valid orderId
            throw new Error(`Main Order ID: ${orderId} not found during status sync.`);
        }

        const currentMainOrderStatus = currentMainOrderResult.rows[0].status; // pg returns lowercase

        if (newMainOrderStatus && newMainOrderStatus !== currentMainOrderStatus) {
            await client.query(
                'UPDATE Ordine SET Status = $1 WHERE IDOrdine = $2::INTEGER',
                [newMainOrderStatus, orderId]
            );
            console.log(`[Main Order Status Sync] Main Order ID: ${orderId} status updated from '${currentMainOrderStatus}' to '${newMainOrderStatus}'.`);
        } else {
            console.log(`[Main Order Status Sync] Main Order ID: ${orderId} status ('${currentMainOrderStatus}') unchanged. Calculated: '${newMainOrderStatus}'.`);
        }

    } catch (error) {
        console.error(`[Main Order Status Sync] Error updating main order status for Order ID ${orderId}:`, error);
        // Re-throw the error so the calling transaction can be rolled back
        throw error;
    }
};

// --- Read Endpoints ---

// GET /api/suborders/order/:orderId
// Get all SubOrdine details for a specific main Order (useful for customer view)
// This endpoint fetches details grouped by artisan for a given order ID.
router.get('/order/:orderId', isAuthenticated, async (req, res) => {
    const { orderId } = req.params;
    const client = await pool.connect();

    try {
        // 1. Fetch main order details
        const mainOrderResult = await client.query(
            `SELECT
                IDOrdine,
                Status AS OrdineStatus,
                Data AS DataOrdine,
                Ora AS OraOrdine,
                ImportoTotale AS ImportoTotaleOrdine,
                IDUtente AS IDUtenteOrdine
             FROM Ordine
             WHERE IDOrdine = $1::INTEGER AND Deleted = FALSE`,
            [orderId]
        );

        if (mainOrderResult.rows.length === 0) {
            return res.status(404).json({ message: 'Order not found.' });
        }
        // PostgreSQL returns unquoted aliases in lowercase.
        const dbMainOrder = mainOrderResult.rows[0];

        // Authorization check
        // Admin can access any order's suborders.
        // Cliente can only access their own order's suborders.
        if (req.user.tipologia !== 'Admin' && req.user.idutente !== dbMainOrder.idutenteordine) {
            return res.status(403).json({ message: 'Access denied. You do not have permission to view suborders for this order.' });
        }


        // 2. Query to fetch SubOrdine items, including artisan name and associated products.
        // This query correctly links products to their respective artisans within the sub-order context
        // and uses historical prices.
        const subOrderItemsQuery = `
            SELECT
                so.IDArtigiano,
                u.Nome AS NomeArtigiano,
                u.Email AS EmailArtigiano,
                so.SubOrdineStatus,
                p.IDProdotto,
                p.Nome AS NomeProdotto,
                p.Descrizione AS DescrizioneProdotto,
                dor.PrezzoStoricoUnitario,
                dor.Quantita,
                (dor.PrezzoStoricoUnitario * dor.Quantita) AS SubtotaleProdotto
            FROM
                SubOrdine so
            JOIN
                Utente u ON so.IDArtigiano = u.IDUtente
            JOIN
                DettagliOrdine dor ON so.IDOrdine = dor.IDOrdine
            JOIN
                Prodotto p ON dor.IDProdotto = p.IDProdotto AND p.IDArtigiano = so.IDArtigiano -- Ensures product belongs to this suborder's artisan
            WHERE
                so.IDOrdine = $1::INTEGER
            ORDER BY
                so.IDArtigiano, p.Nome; -- Order by artisan, then product name
        `;

        const subOrderItemsResult = await client.query(subOrderItemsQuery, [orderId]);

        // 3. Structure the results
        const artigianiMap = new Map();

        subOrderItemsResult.rows.forEach(row => {
            // Destructure with lowercase keys as returned by pg driver for unquoted aliases
            const {
                idartigiano,
                nomeartigiano,
                emailartigiano,
                subordinestatus,
                idprodotto,
                nomeprodotto,
                descrizioneprodotto,
                prezzostoricounitario,
                quantita,
                subtotaleprodotto
            } = row;

            if (!artigianiMap.has(idartigiano)) {
                artigianiMap.set(idartigiano, {
                    IDArtigiano: idartigiano,
                    NomeArtigiano: nomeartigiano,
                    EmailArtigiano: emailartigiano,
                    SubOrdineStatus: subordinestatus,
                    Prodotti: []
                });
            }

            const parsedPrezzo = parseFloat(prezzostoricounitario);
            const parsedSubtotale = parseFloat(subtotaleprodotto);

            artigianiMap.get(idartigiano).Prodotti.push({
                IDProdotto: idprodotto,
                NomeProdotto: nomeprodotto,
                DescrizioneProdotto: descrizioneprodotto,
                PrezzoStoricoUnitario: isNaN(parsedPrezzo) ? "0.00" : parsedPrezzo.toFixed(2),
                Quantita: quantita,
                SubtotaleProdotto: isNaN(parsedSubtotale) ? "0.00" : parsedSubtotale.toFixed(2)
            });
        });

        // Construct the response object, mapping DB fields (lowercase) to desired response keys (CamelCase)
        const response = {
            IdOrdine: dbMainOrder.idordine,
            OrdineStatus: dbMainOrder.ordinestatus,
            DataOrdine: dbMainOrder.dataordine,
            OraOrdine: dbMainOrder.oraordine,
            IdUtenteOrdine: dbMainOrder.idutenteordine,
            Artigiani: Array.from(artigianiMap.values())
        };

        // Handle ImportoTotaleOrdine: access the lowercase key from dbMainOrder
        const totalFromDb = dbMainOrder.importototaleordine; // Key from DB is lowercase
        const parsedTotal = parseFloat(totalFromDb);
        response.ImportoTotaleOrdine = isNaN(parsedTotal) ? "0.00" : parsedTotal.toFixed(2);

        res.status(200).json(response);

    } catch (error) {
        console.error(`Error fetching suborders for order ${orderId}:`, error);
        res.status(500).json({ message: 'Error fetching suborder details.', error: error.message });
    } finally {
        client.release();
    }
});

// GET /api/suborders/artisan/:artisanId
// Get all SubOrdine records for a specific Artisan (useful for artisan dashboard)
// This endpoint fetches all suborders assigned to a particular artisan across different main orders.
// Protected: Admin can see any artisan's suborders. Artisan can only see their own.
router.get('/artisan/:artisanId', isAuthenticated, async (req, res) => {
    const requestedArtisanId = parseInt(req.params.artisanId, 10);
    const client = await pool.connect();

    if (isNaN(requestedArtisanId)) {
        return res.status(400).json({ message: 'Invalid Artisan ID format.' });
    }

    // Authorization check
    // Admin can access any artisan's suborders.
    // Artigiano can only access their own suborders.
    // Cliente and other types are denied.
    if (req.user.tipologia !== 'Admin' &&
        (req.user.tipologia !== 'Artigiano' || req.user.idutente !== requestedArtisanId)) {
        return res.status(403).json({ message: 'Access denied. You do not have permission to view these suborders.' });
    }

    try {
        // Query to fetch SubOrdine details for a specific artisan, including associated products
        const query = `
            SELECT
                so.IDOrdine,
                so.IDArtigiano,
                so.SubOrdineStatus,
                u.Nome AS NomeArtigiano, 
                p.IDProdotto,
                p.Nome AS NomeProdotto,
                p.Descrizione AS DescrizioneProdotto, -- Added for consistency
                dor.PrezzoStoricoUnitario, -- Use historical price
                dor.Quantita,
                (dor.PrezzoStoricoUnitario * dor.Quantita) AS SubtotaleProdotto,
                o.Data AS DataOrdine -- Use the actual column name from Ordine table
            FROM
                SubOrdine so
            JOIN -- Added join for Utente table
                Utente u ON so.IDArtigiano = u.IDUtente
            JOIN -- Corrected join for DettagliOrdine
                DettagliOrdine dor ON so.IDOrdine = dor.IDOrdine
            JOIN -- Corrected join for Prodotto, ensuring it's for the suborder's artisan
                Prodotto p ON dor.IDProdotto = p.IDProdotto AND p.IDArtigiano = so.IDArtigiano
            JOIN
                Ordine o ON so.IDOrdine = o.IDOrdine
            WHERE
                so.IDArtigiano = $1::INTEGER -- Primary filter by artisan ID
            ORDER BY
                o.Data DESC, so.IDOrdine, p.Nome; -- Order by main order date, then order ID, then product
        `;

        const result = await client.query(query, [requestedArtisanId]);

        // Structure the results, grouping products under each SubOrdine
        const subOrdersGrouped = result.rows.reduce((acc, row) => {
            // Destructure with lowercase keys as returned by pg driver for unquoted aliases
            const {
                idordine,
                idartigiano,
                subordinestatus,
                nomeartigiano,
                dataordine,
                idprodotto, nomeprodotto, descrizioneprodotto, prezzostoricounitario, quantita, subtotaleprodotto
            } = row;

            // Use the composite key (IDOrdine, IDArtigiano) to find the subOrder group
            let subOrder = acc.find(so => so.IDOrdine === idordine && so.IDArtigiano === idartigiano);

            if (!subOrder) {
                subOrder = {
                    IDOrdine: idordine,
                    IDArtigiano: idartigiano,
                    NomeArtigiano: nomeartigiano,
                    SubOrdineStatus: subordinestatus,
                    DataOrdine: dataordine,
                    Prodotti: []
                };
                acc.push(subOrder);
            }

            // Add product details to the current subOrder
            subOrder.Prodotti.push({
                IDProdotto: idprodotto,
                NomeProdotto: nomeprodotto,
                DescrizioneProdotto: descrizioneprodotto,
                PrezzoStoricoUnitario: parseFloat(prezzostoricounitario).toFixed(2),
                Quantita: quantita,
                SubtotaleProdotto: parseFloat(subtotaleprodotto).toFixed(2)
            });

            return acc;
        }, []);

        if (subOrdersGrouped.length === 0) {
            res.status(404).json({ message: 'No suborders found for this artisan ID.' });
        } else {
            res.status(200).json(subOrdersGrouped);
        }

    } catch (error) {
        console.error(`Error fetching suborders for artisan ${requestedArtisanId}:`, error);
        res.status(500).json({ message: 'Error fetching artisan suborder details.', error: error.message });
    } finally {
        client.release();
    }
});

// --- Update Endpoint ---


/**
 * Input:
 * 
 * newstatus: 'Spedito' // or any other valid status such as 'In attesa', 'Da spedire', 'Consegnato'
 */

// PUT /api/suborders/order/:orderId/artisan/:artisanId/status
// Update the status of a specific SubOrdine (primarily for artisans)
// NOTE: This endpoint MUST be protected to ensure only the assigned artisan or an admin can update the status.
// We now use both orderId and artisanId to identify the specific SubOrdine.
router.put('/order/:orderId/artisan/:artisanId/status', isAuthenticated, async (req, res) => {
    const { newStatus } = req.body; // Expecting { newStatus: 'Spedito' } or similar
    const client = await pool.connect();

    // Define allowed status transitions (optional but good practice)
    // This is a simplified example; real-world might need more complex logic
    const allowedStatuses = ['In attesa', 'Da spedire', 'Spedito', 'Consegnato'];
    
    if (!allowedStatuses.includes(newStatus)) {
        return res.status(400).json({ message: `Invalid status provided. Allowed statuses are: ${allowedStatuses.join(', ')}` });
    }

    // Extract orderId and artisanId from params to identify the SubOrdine
    const orderId = parseInt(req.params.orderId, 10);
    const artisanId = parseInt(req.params.artisanId, 10);

    if (isNaN(orderId) || isNaN(artisanId)) {
        return res.status(400).json({ message: 'Invalid Order ID or Artisan ID format.' });
    }

    // Use a single try-catch block for the entire request processing
    try {
        // Authorization check: Fetch the suborder first to get the assigned artisan ID
        const subOrderCheckQuery = await client.query(
            'SELECT IDArtigiano FROM SubOrdine WHERE IDOrdine = $1::INTEGER AND IDArtigiano = $2::INTEGER FOR UPDATE', // Lock the row for update
            [orderId, artisanId]
        );

        if (subOrderCheckQuery.rows.length === 0) {
            // Suborder not found for this order/artisan combination
            return res.status(404).json({ message: 'Suborder not found for the specified Order ID and Artisan ID.' });
        }

        const assignedArtisanId = subOrderCheckQuery.rows[0].idartigiano; // pg returns lowercase

        // Admin can update any suborder status.
        // Artigiano can only update their own suborder status.
        if (req.user.tipologia !== 'Admin' && (req.user.tipologia !== 'Artigiano' || req.user.idutente !== assignedArtisanId)) {
            return res.status(403).json({ message: 'Access denied. You do not have permission to update this suborder status.' });
        }

        // If authorization passes, proceed with the update within a transaction
        await beginTransaction(client);

        const updateQuery = `
            UPDATE SubOrdine
            SET SubOrdineStatus = $1
            WHERE IDOrdine = $2::INTEGER AND IDArtigiano = $3::INTEGER
            RETURNING IDOrdine, IDArtigiano, SubOrdineStatus; -- Return updated data using the composite key
        `;

        // Pass newStatus, orderId, and artisanId as parameters
        const result = await client.query(updateQuery, [newStatus, orderId, artisanId]);

        if (result.rowCount === 0) {
            // This should ideally not be reached if the initial check passed, but as a safeguard
            await rollbackTransaction(client);
            return res.status(404).json({ message: 'Suborder not found or no changes made.' });
        }

        // After successfully updating the suborder, update the main order status
        await updateMainOrderStatusBasedOnSubOrders(orderId, client);

        await commitTransaction(client);
        res.status(200).json({
            message: 'Suborder status updated successfully.',
            subOrder: result.rows[0] // Return the updated suborder info
        });

    } catch (error) { // This catch block now handles errors from the initial check, transaction start, or the update query
        if (client) await rollbackTransaction(client); // Ensure rollback if client exists
        console.error(`Error updating status for suborder (Order: ${orderId}, Artisan: ${artisanId}):`, error);
        res.status(500).json({ message: 'Error updating suborder status.', error: error.message });
    }

});

// --- Delete Endpoint ---
// As discussed, direct user deletion of SubOrdine is unlikely.
// Deletion is typically handled by cascading deletes from the main Ordine
// or via admin tools. No user-facing DELETE endpoint is provided here.



module.exports = router;