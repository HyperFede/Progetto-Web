const express = require('express');
const router = express.Router();
const pool = require('../config/db-connect'); // Assicurati che il percorso sia corretto
const { isAuthenticated, hasPermission } = require('../middleware/authMiddleWare');
const { createQueryBuilderMiddleware } = require('../middleware/queryBuilderMiddleware');

// Helper functions for transaction management
const beginTransaction = async (client) => client.query('BEGIN');
const commitTransaction = async (client) => client.query('COMMIT');
const rollbackTransaction = async (client) => client.query('ROLLBACK');

// Configuration for order filtering and sorting for Admins
const orderQueryConfig = {
    allowedFilters: [
        { queryParam: 'status', dbColumn: 'o.status', type: 'exact', dataType: 'string' },
        { queryParam: 'deleted', dbColumn: 'o.deleted', type: 'boolean', dataType: 'boolean' },
        { queryParam: 'idutente', dbColumn: 'o.idutente', type: 'exact', dataType: 'integer' },
        { queryParam: 'data_gte', dbColumn: 'o.data', type: 'gte', dataType: 'string' }, // Assumes YYYY-MM-DD
        { queryParam: 'data_lte', dbColumn: 'o.data', type: 'lte', dataType: 'string' }, // Assumes YYYY-MM-DD
        { queryParam: 'nomeutente_like', dbColumn: 'u.username', type: 'like', dataType: 'string' },
        { queryParam: 'emailutente_like', dbColumn: 'u.email', type: 'like', dataType: 'string' }
    ],
    allowedSortFields: ['idordine', 'data', 'ora', 'importototale', 'status', 'nomeutente', 'emailutente', 'deleted'], // These should match aliases or direct selectable columns
    defaultSortField: 'data',
    defaultSortOrder: 'DESC',
    // No baseWhereClause needed here as Admins see all by default, filters are additive.
};

// Configuration for client's "my orders" filtering and sorting
const clientOrderQueryConfig = {
    allowedFilters: [
        { queryParam: 'status', dbColumn: 'o.status', type: 'exact', dataType: 'string' },
        { queryParam: 'data_gte', dbColumn: 'o.data', type: 'gte', dataType: 'string' }, // Assumes YYYY-MM-DD
        { queryParam: 'data_lte', dbColumn: 'o.data', type: 'lte', dataType: 'string' }, // Assumes YYYY-MM-DD
    ],
    allowedSortFields: ['idordine', 'data', 'ora', 'importototale', 'status'],
    defaultSortField: 'data',
    defaultSortOrder: 'DESC',
};


// GET tutti gli ordini (pper admin)
router.get('/',
    isAuthenticated,
    hasPermission(['Admin']),
    createQueryBuilderMiddleware(orderQueryConfig), 
    async (req, res) => {
    try {
        // The base part of the query, joins are essential for filtering/sorting on user fields
        const queryText = `
            SELECT o.idordine, o.idutente, o.data, o.ora, o.importototale, o.status, o.deleted,
                   u.username AS nomeutente, u.email AS emailutente, u.indirizzo AS indirizzospedizione
            FROM Ordine o
            JOIN Utente u ON o.idutente = u.idutente
            ${req.sqlWhereClause} 
            ${req.sqlOrderByClause}
        `; // LIMIT and OFFSET for pagination can be added here if needed

        const ordersResult = await pool.query(queryText, req.sqlQueryValues);
        const ordersWithDetails = [];

        for (const order of ordersResult.rows) {
            const detailsQuery = await pool.query(
                `SELECT dor.idprodotto, dor.quantita, dor.prezzostoricounitario,
                        p.nome AS nomeprodotto,
                        (dor.quantita * dor.prezzostoricounitario) AS totaleriga
                 FROM DettagliOrdine dor
                 JOIN Prodotto p ON dor.idprodotto = p.idprodotto
                 WHERE dor.idordine = $1`,
                [order.idordine]
            );
            ordersWithDetails.push({
                ...order,
                importototale: parseFloat(order.importototale).toFixed(2),
                // indirizzospedizione is already part of 'order' due to the SELECT
                dettagli: detailsQuery.rows.map(d => ({
                    ...d,
                    prezzostoricounitario: parseFloat(d.prezzostoricounitario).toFixed(2),
                    totaleriga: parseFloat(d.totaleriga).toFixed(2)
                }))
            });
        }
        res.json(ordersWithDetails);

    } catch (error) {
        console.error('Errore nel recupero degli ordini:', error);
        res.status(500).json({ message: 'Errore del server durante il recupero degli ordini.' });
    }
});

// GET /api/orders/my-orders - For clients to retrieve their own orders with filtering
router.get('/my-orders',
    isAuthenticated,
    hasPermission(['Cliente']),
    createQueryBuilderMiddleware(clientOrderQueryConfig),
    async (req, res) => {
        const idcliente = req.user.idutente;
        
        // Base conditions for fetching client's own, non-deleted orders
        let whereConditions = [`o.idutente = $1`, `o.deleted = FALSE`];
        let queryValues = [idcliente];
        let placeholderOffset = 1; // Current number of placeholders used by base conditions

        // Integrate filters from queryBuilderMiddleware
        if (req.sqlWhereClause && req.sqlWhereClause.trim() !== '') {
            let middlewareWhere = req.sqlWhereClause.replace(/^WHERE\s*/i, '').trim(); // Remove 'WHERE' if present
            if (middlewareWhere) {
                // Renumber placeholders from middleware to follow our base condition placeholders
                middlewareWhere = middlewareWhere.replace(/\$(\d+)/g, (match, n) => `\$${parseInt(n) + placeholderOffset}`);
                whereConditions.push(`(${middlewareWhere})`); // Wrap middleware conditions in parentheses
                queryValues.push(...req.sqlQueryValues);
            }
        }
        
        const finalWhereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';
        
        try {
            const queryText = `
                SELECT o.idordine, o.idutente, o.data, o.ora, o.importototale, o.status, o.deleted,
                       u.username AS nomeutente, u.email AS emailutente, u.indirizzo AS indirizzospedizione
                FROM Ordine o
                JOIN Utente u ON o.idutente = u.idutente
                ${finalWhereClause}
                ${req.sqlOrderByClause}
            `; // LIMIT and OFFSET for pagination can be added here

            const ordersResult = await pool.query(queryText, queryValues);
            const ordersWithDetails = [];

            for (const order of ordersResult.rows) {
                const detailsQuery = await pool.query(
                    `SELECT dor.idprodotto, dor.quantita, dor.prezzostoricounitario,
                            p.nome AS nomeprodotto,
                            (dor.quantita * dor.prezzostoricounitario) AS totaleriga
                     FROM DettagliOrdine dor
                     JOIN Prodotto p ON dor.idprodotto = p.idprodotto
                     WHERE dor.idordine = $1`,
                    [order.idordine]
                );
                ordersWithDetails.push({
                    ...order,
                    importototale: parseFloat(order.importototale).toFixed(2),
                    dettagli: detailsQuery.rows.map(d => ({
                        ...d,
                        prezzostoricounitario: parseFloat(d.prezzostoricounitario).toFixed(2),
                        totaleriga: parseFloat(d.totaleriga).toFixed(2)
                    }))
                });
            }
            res.json(ordersWithDetails);
        } catch (error) {
            console.error('Errore nel recupero degli ordini del cliente:', error);
            res.status(500).json({ message: 'Errore del server durante il recupero degli ordini.' });
        }
    });

// GET un singolo ordine per ID
router.get('/:id', isAuthenticated, hasPermission(['Admin', 'Cliente']), async (req, res) => {
    const { id } = req.params;
    const orderId = parseInt(id, 10);

    if (isNaN(orderId)) {
        return res.status(400).json({ message: 'ID ordine non valido.' });
    }

    try {
        const orderQuery = await pool.query(
            `SELECT o.idordine, o.idutente, o.data, o.ora, o.importototale, o.status, o.deleted,
                    u.username AS nomeutente, u.email AS emailutente, u.indirizzo AS indirizzospedizione
             FROM Ordine o
             JOIN Utente u ON o.idutente = u.idutente
             WHERE o.idordine = $1`,
            [orderId]
        );

        if (orderQuery.rows.length === 0) {
            return res.status(404).json({ message: 'Ordine non trovato.' });
        }
        const order = orderQuery.rows[0];

        // Admin può vedere qualsiasi ordine. Cliente può vedere solo i propri ordini (non eliminati).
        if (req.user.tipologia === 'Admin' || 
            (req.user.tipologia === 'Cliente' && order.idutente === req.user.idutente && !order.deleted)) {
            
            const detailsQuery = await pool.query(
                `SELECT dor.idprodotto, dor.quantita, dor.prezzostoricounitario,
                        p.nome AS nomeprodotto,
                        (dor.quantita * dor.prezzostoricounitario) AS totaleriga
                 FROM DettagliOrdine dor
                 JOIN Prodotto p ON dor.idprodotto = p.idprodotto
                 WHERE dor.idordine = $1`,
                [orderId]
            );

            const fullOrder = {
                ...order,
                importototale: parseFloat(order.importototale).toFixed(2),
                // indirizzospedizione is already part of 'order' due to the SELECT
                dettagli: detailsQuery.rows.map(d => ({
                    ...d,
                    prezzostoricounitario: parseFloat(d.prezzostoricounitario).toFixed(2),
                    totaleriga: parseFloat(d.totaleriga).toFixed(2)
                }))
            };
            res.json(fullOrder);
        } else {
            // Se un cliente cerca un ordine non suo, o un ordine eliminato
            if (req.user.tipologia === 'Cliente' && (order.idutente !== req.user.idutente || order.deleted)) {
                return res.status(404).json({ message: 'Ordine non trovato.' });
            }
            return res.status(403).json({ message: 'Accesso negato a questo ordine.' });
        }
    } catch (error) {
        console.error('Errore nel recupero dell\'ordine:', error);
        res.status(500).json({ message: 'Errore del server durante il recupero dell\'ordine.' });
    }
});

/* TODO: la parte che dopo 15 minuti rende l'ordine expired e ripristina lo stock è stata commentata
/**
 * @route POST /api/orders/create-and-reserve
 * @description Crea un nuovo ordine, controlla lo stock, riserva gli articoli e svuota il carrello.
 *              Imposta una scadenza di 15 minuti per la prenotazione.
 * @access Cliente
 */
router.post('/create-and-reserve', isAuthenticated, hasPermission(['Cliente']), async (req, res) => {
    const idcliente = req.user.idutente;
    // L'indirizzo di spedizione verrà recuperato esclusivamente dal database.
    let indirizzoSpedizione; 
    // const { indirizzospedizione } = req.body; // Se si volesse permettere di sovrascrivere l'indirizzo
    // const finalIndirizzoSpedizione = indirizzospedizione || indirizzospedizioneDefault;

    // Prima di procedere, controlla se l'utente ha già un ordine in stato 'In attesa'.
    try {
        const existingPendingOrderQuery = await pool.query(
            `SELECT idordine, data, ora, importototale, status 
             FROM Ordine 
             WHERE idutente = $1 AND Status = 'In attesa' AND deleted = FALSE`,
            [idcliente]
        );

        if (existingPendingOrderQuery.rows.length > 0) {
            const pendingOrder = existingPendingOrderQuery.rows[0];
            // Instead of a 409 Conflict, we return a 200 OK with the details of the existing order.
            // This allows the frontend to handle the response more uniformly
            // and redirect directly to payment for the existing order.
            return res.status(200).json({
                message: `Hai già un ordine in attesa (ID: ${pendingOrder.idordine}). Procedi al pagamento o attendi la sua scadenza.`,
                ordine: {
                    idordine: pendingOrder.idordine,
                    dataOrdine: pendingOrder.data, // Assuming 'data' is the column name for date
                    oraOrdine: pendingOrder.ora,   // Assuming 'ora' is the column name for time
                    importoTotale: parseFloat(pendingOrder.importototale).toFixed(2),
                    status: pendingOrder.status
                },
                // Add a flag to indicate this is an existing order,
                // not a newly created one, for clarity on the frontend.
                existingOrder: true,
            });
        }
    } catch (error) {
        console.error('Errore durante la verifica di ordini in attesa di pagamento esistenti:', error);
        // È importante rilasciare il client se è stato acquisito, ma qui usiamo pool.query direttamente.
        return res.status(500).json({ message: 'Errore del server durante la verifica degli ordini in attesa di pagamento. Riprova.' });
    }

    // Recupera l'indirizzo di spedizione direttamente dal DB.
    console.log(`[Order Creation] Tentativo di recupero dell'indirizzo di spedizione dal DB per utente ${idcliente}.`);
    try {
        const userAddressQuery = await pool.query(
            'SELECT indirizzo FROM Utente WHERE idutente = $1 AND deleted = FALSE',
            [idcliente]
        );
        if (userAddressQuery.rows.length > 0 && userAddressQuery.rows[0].indirizzo) {
            indirizzoSpedizione = userAddressQuery.rows[0].indirizzo;
            console.log(`[Order Creation] Indirizzo di spedizione recuperato con successo dal DB per utente ${idcliente}.`);
        } else {
            console.log(`[Order Creation] Indirizzo non trovato nel DB o vuoto per utente ${idcliente}.`);
        }
    } catch (dbError) {
        console.error(`[Order Creation] Errore durante il recupero dell'indirizzo di spedizione dal DB per utente ${idcliente}:`, dbError);
        // Non bloccare l'esecuzione qui per un errore DB; il controllo successivo gestirà se l'indirizzo è ancora mancante.
        // Considerare di restituire 500 se il recupero dell'indirizzo è critico e fallisce per errore DB.
        // return res.status(500).json({ message: 'Errore del server durante il recupero dei dettagli utente. Riprova.' });
    }

    // Controllo finale: l'indirizzo di spedizione DEVE essere presente a questo punto.
    if (!indirizzoSpedizione) {
        return res.status(400).json({ message: 'Indirizzo di spedizione mancante. Per favore, aggiorna il tuo profilo utente.' });
    }
    // A questo punto, 'indirizzoSpedizione' contiene l'indirizzo valido.

    const client = await pool.connect(); // Ottieni un client dal pool per la transazione

    try {
        await beginTransaction(client);

        // 1. Recupera gli articoli del carrello del cliente
        const cartItemsQuery = await client.query(
            `SELECT dc.idprodotto, dc.quantita, p.nome AS nomeprodotto, p.prezzounitario, p.quantitadisponibile 
             FROM dettaglicarrello dc
             JOIN Prodotto p ON dc.idprodotto = p.idprodotto
             WHERE dc.idcliente = $1 AND p.deleted = FALSE`,
            [idcliente]
        );

        if (cartItemsQuery.rows.length === 0) {
            await rollbackTransaction(client);
            // client.release(); // Removed: The finally block will handle this.
            return res.status(400).json({ message: 'Il tuo carrello è vuoto.' });
        }

        const cartItems = cartItemsQuery.rows;
        let totaleOrdine = 0;
        const itemsForOrderDetails = [];

        // 2. Controlla lo stock e blocca le righe dei prodotti
        for (const item of cartItems) {
            // Blocca la riga del prodotto per l'aggiornamento per evitare race conditions
            const productStockQuery = await client.query(
                'SELECT quantitadisponibile, prezzounitario FROM Prodotto WHERE idprodotto = $1 AND deleted = FALSE FOR UPDATE',
                [item.idprodotto]
            );

            if (productStockQuery.rows.length === 0) {
                await rollbackTransaction(client);
                client.release();
                return res.status(400).json({ message: `Prodotto "${item.nomeprodotto}" (ID: ${item.idprodotto}) non più disponibile.` });
            }

            const currentProduct = productStockQuery.rows[0];
            if (item.quantita > currentProduct.quantitadisponibile) {
                await rollbackTransaction(client);
                client.release();
                return res.status(400).json({
                    message: `Stock insufficiente per il prodotto "${item.nomeprodotto}". Richiesti: ${item.quantita}, Disponibili: ${currentProduct.quantitadisponibile}.`
                });
            }
            // Usa il prezzo corrente del prodotto per i dettagli dell'ordine
            const prezzostoricounitario = parseFloat(currentProduct.prezzounitario);
            const totaleRiga = item.quantita * prezzostoricounitario;
            totaleOrdine += totaleRiga;

            itemsForOrderDetails.push({
                ...item,
                prezzostoricounitario: prezzostoricounitario,
            });
        }

        // 3. Crea l'ordine
        const insertOrderQuery = await client.query(
            `INSERT INTO Ordine (idutente, Data, Ora, ImportoTotale, Status, Deleted)
             VALUES ($1, CURRENT_DATE, CURRENT_TIME, $2, $3, FALSE)
             RETURNING idordine, Data, Ora, Status, ImportoTotale`, // Status will be 'In attesa'
            [idcliente, totaleOrdine, 'In attesa']
        );
        const newOrder = insertOrderQuery.rows[0];

        // --- Start of 15-minute reservation timer for this specific order ---
        const orderIdForTimeout = newOrder.idordine;
        const reservationTimeoutMS = 1 * 60 * 1000; // 1 minutes in milliseconds

        console.log(`[Order Creation] Order ID: ${orderIdForTimeout} - Scheduling 15-minute reservation expiry check.`);

        //Parte cancellata del todo
        /*
        setTimeout(async () => {
            const timeoutClient = await pool.connect(); // Get a new client for this isolated task
            try {
                console.log(`[Order Expiry Check] Order ID: ${orderIdForTimeout} - 15-minute timer expired. Checking status.`);
                await beginTransaction(timeoutClient);

                // Check the current status of the order, locking the row for update
                const orderStatusQuery = await timeoutClient.query(
                    'SELECT Status, deleted FROM Ordine WHERE idordine = $1 FOR UPDATE', // Add 'deleted'
                    [orderIdForTimeout]
                );

                if (orderStatusQuery.rows.length === 0) {
                    console.log(`[Order Expiry Check] Order ID: ${orderIdForTimeout} - Order not found (possibly deleted). No action.`);
                    await rollbackTransaction(timeoutClient); // Rollback as a precaution
                    // Non rilasciare il client qui, il finally lo farà
                    return;
                }

                const currentOrderData = orderStatusQuery.rows[0];
                const currentStatus = currentOrderData.status;
                const isDeleted = currentOrderData.deleted;

                if (isDeleted) {
                    console.log(`[Order Expiry Check] Order ID: ${orderIdForTimeout} - Order is marked as soft-deleted. No stock rollback action from timeout.`);
                    await commitTransaction(timeoutClient); // Commit to release the lock
                    return;
                }

                if (currentStatus === 'In attesa') { // Only proceed if not soft-deleted and still 'In attesa'
                    console.log(`[Order Expiry Check] Order ID: ${orderIdForTimeout} - Status is 'In attesa' and not deleted. Rolling back stock.`);

                    const orderDetailsQuery = await timeoutClient.query(
                        `SELECT idprodotto, quantita FROM DettagliOrdine WHERE idordine = $1`,
                        [orderIdForTimeout]
                    );

                    for (const item of orderDetailsQuery.rows) {
                        await timeoutClient.query(
                            'UPDATE Prodotto SET quantitadisponibile = quantitadisponibile + $1 WHERE idprodotto = $2',
                            [item.quantita, item.idprodotto]
                        );
                    }

                    await timeoutClient.query(
                        "UPDATE Ordine SET Status = 'Scaduto' WHERE idordine = $1 AND Status = 'In attesa' AND deleted = FALSE", // Ensure not to update if soft-deleted
                        [orderIdForTimeout]
                    );
                    console.log(`[Order Expiry Check] Order ID: ${orderIdForTimeout} - Stock rolled back, status set to 'Scaduto'.`);
                    await commitTransaction(timeoutClient);
                } else {
                    console.log(`[Order Expiry Check] Order ID: ${orderIdForTimeout} - Status is '${currentStatus}'. No stock rollback needed.`);
                    await commitTransaction(timeoutClient); // Commit to release the lock, even if no changes
                }
            } catch (error) {
                console.error(`[Order Expiry Check] Order ID: ${orderIdForTimeout} - Error during processing:`, error);
                if (timeoutClient) await rollbackTransaction(timeoutClient);
            } finally {
                if (timeoutClient) timeoutClient.release();
            }
        }, reservationTimeoutMS);
        // --- End of 15-minute reservation timer ---
        */

        // fine todo


        // 4. Riserva lo stock e crea i dettagli dell'ordine
        for (const orderItem of itemsForOrderDetails) {
            // Decrementa lo stock
            await client.query(
                'UPDATE Prodotto SET quantitadisponibile = quantitadisponibile - $1 WHERE idprodotto = $2',
                [orderItem.quantita, orderItem.idprodotto]
            );
            // Inserisci nei dettagli dell'ordine
            await client.query(
                `INSERT INTO DettagliOrdine (idordine, idprodotto, quantita, prezzostoricounitario)
                 VALUES ($1, $2, $3, $4)`,
                [newOrder.idordine, orderItem.idprodotto, orderItem.quantita, orderItem.prezzostoricounitario]
            );
        }

        // 5. Svuota il carrello
        await client.query('DELETE FROM dettaglicarrello WHERE idcliente = $1', [idcliente]);

        await commitTransaction(client);
        res.status(201).json({
            message: 'Ordine creato e articoli riservati con successo. Hai 15 minuti per completare il pagamento.',
            // Nota: scadenzaPrenotazione non può essere restituita se non memorizzata.
            // L'indirizzo di spedizione è quello del profilo utente.
            ordine: {
                idordine: newOrder.idordine,
                dataOrdine: newOrder.data,
                oraOrdine: newOrder.ora,
                status: newOrder.status,
                importoTotale: parseFloat(newOrder.importototale).toFixed(2)
            },
        });

    } catch (error) {
        await rollbackTransaction(client);
        console.error('Errore durante la creazione dell\'ordine e la prenotazione degli articoli:', error);
        res.status(500).json({ message: 'Errore del server durante la creazione dell\'ordine.' });
    } finally {
        client.release(); // Rilascia il client al pool
    }
});

// DELETE (Soft Delete) un ordine per ID - Solo Admin
router.delete('/:id', isAuthenticated, hasPermission(['Admin']), async (req, res) => {
    const { id } = req.params;
    const orderId = parseInt(id, 10);

    if (isNaN(orderId)) {
        return res.status(400).json({ message: 'ID ordine non valido.' });
    }

    const client = await pool.connect();
    try {
        await beginTransaction(client);

        const orderQuery = await client.query(
            'SELECT idordine, status, deleted FROM Ordine WHERE idordine = $1 FOR UPDATE',
            [orderId]
        );

        if (orderQuery.rows.length === 0) {
            await rollbackTransaction(client);
            return res.status(404).json({ message: 'Ordine non trovato.' });
        }

        const order = orderQuery.rows[0];

        if (order.deleted) {
            await rollbackTransaction(client);
            return res.status(400).json({ message: 'Ordine già contrassegnato come eliminato.' });
        }

        // Effettua il soft delete
        await client.query(
            'UPDATE Ordine SET deleted = TRUE WHERE idordine = $1',
            [orderId]
        );

        await commitTransaction(client);
        res.json({ message: `Ordine ID ${orderId} contrassegnato come eliminato con successo.` });

    } catch (error) {
        if (client) await rollbackTransaction(client);
        console.error(`Errore durante l'eliminazione (soft delete) dell'ordine ID ${orderId}:`, error);
        res.status(500).json({ message: 'Errore del server durante l\'eliminazione dell\'ordine.' });
    } finally {
        if (client) client.release();
    }
});

module.exports = router;

/*
Considerazioni per la logica successiva (fuori da questo endpoint):

1.  Gestione Pagamenti (es. in `paymentRoutes.js`):
    *   Un endpoint per processare il pagamento per un `idordine`.
    *   Se il pagamento ha successo: aggiorna `Ordine.Status` (es. a 'Pagato', 'In Lavorazione').
        Il `setTimeout` per la scadenza della prenotazione (se ancora attivo) controllerà lo stato
        e non procederà con il rollback se l'ordine non è più 'In attesa'.

2.  Processo Background per Prenotazioni Scadute:
    *   Al momento della creazione dell'ordine, viene avviato un `setTimeout` di 15 minuti specifico per quell'ordine.
    *   Se il server si riavvia, questi `setTimeout` in memoria vengono persi.
    *   **RACCOMANDAZIONE FORTE**: Implementare un meccanismo di fallback (es. un cron job o un loop `setTimeout` in `server.js`
        che gira periodicamente, ad esempio ogni minuto) per gestire gli ordini che potrebbero essere "orfani"
        a causa di un riavvio del server. Questo job di fallback userebbe la logica "pure-Postgres":
        a.  Determina le prenotazioni scadute (ordini 'In attesa' più vecchi di 15 minuti) usando la query:
            `SELECT idordine FROM Ordine WHERE Status = 'In attesa' AND (Data + Ora + INTERVAL '15 minutes') < NOW();`
        b.  Per ciascun ordine scaduto:
            i.  In una transazione, recupera i `DettagliOrdine` per quell'ordine.
            ii. Ripristina `Prodotto.quantitadisponibile` per ciascun articolo.
            iii.Aggiorna `Ordine.Status` a 'Scaduto' (o simile).
    *   Questo approccio combinato (setTimeout per reattività immediata + job di fallback per robustezza)
        offre un buon compromesso.
*/