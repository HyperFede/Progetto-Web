const express = require('express');
const router = express.Router();

// Assume db connection and middleware are set up and imported
const pool = require('../config/db-connect.js'); // Your actual database connection pool
const { isAuthenticated, hasPermission } = require('../middleware/authMiddleWare.js'); // Your actual auth middleware
const { rawImageParser } = require('../middleware/fileUploadMiddleware.js'); // Import the image middleware
const FileType = require('file-type'); // For inferring image MIME type
const { createQueryBuilderMiddleware } = require('../middleware/queryBuilderMiddleware.js'); // Import the query builder middleware

// Use the actual database pool
const db = pool;

const getCurrentTimestamp = () => new Date().toISOString();

const transformProblemaForResponse = (problema, req) => {
    const transformedProblema = { ...problema }; // Create a copy

    // Check for the raw image data (lowercase key from pg driver)
    if (transformedProblema.immagine && Buffer.isBuffer(transformedProblema.immagine)) {
        // Add the URL for the image content endpoint
        transformedProblema.immagine_url = `${req.protocol}://${req.get('host')}/api/problems/${transformedProblema.idproblema}/image_content`;
    }

    // Remove the raw image data from the JSON response
    delete transformedProblema.immagine;

    // Ensure numeric values are parsed if necessary (pg driver often returns strings for numeric types)
    if (transformedProblema.idproblema !== undefined && transformedProblema.idproblema !== null) {
        transformedProblema.idproblema = parseInt(transformedProblema.idproblema, 10);
    }
    if (transformedProblema.idcliente !== undefined && transformedProblema.idcliente !== null) {
        transformedProblema.idcliente = parseInt(transformedProblema.idcliente, 10);
    }
    if (transformedProblema.idartigiano !== undefined && transformedProblema.idartigiano !== null) {
        transformedProblema.idartigiano = parseInt(transformedProblema.idartigiano, 10);
    }
    if (transformedProblema.idadmin !== undefined && transformedProblema.idadmin !== null) {
        transformedProblema.idadmin = parseInt(transformedProblema.idadmin, 10);
    }
    return transformedProblema;
};

// Configuration for problem queries using the queryBuilderMiddleware
const problemQueryConfig = {
    allowedFilters: [
        { queryParam: 'idproblema', dbColumn: 'p.idproblema', type: 'exact', dataType: 'integer' },
        { queryParam: 'idcliente', dbColumn: 'p.idcliente', type: 'exact', dataType: 'integer' },
        { queryParam: 'idartigiano', dbColumn: 'p.idartigiano', type: 'exact', dataType: 'integer' },
        { queryParam: 'idordine', dbColumn: 'p.idordine', type: 'exact', dataType: 'integer' },
        { queryParam: 'status', dbColumn: 'p.status', type: 'exact', dataType: 'string' },
        { queryParam: 'descrizione_like', dbColumn: 'p.descrizione', type: 'like', dataType: 'string' },
        { queryParam: 'timestampsegnalazione_gte', dbColumn: 'p.timestampsegnalazione', type: 'gte', dataType: 'string' }, // Assumes ISO format
        { queryParam: 'timestampsegnalazione_lte', dbColumn: 'p.timestampsegnalazione', type: 'lte', dataType: 'string' }, // Assumes ISO format
        // Add filters for joined user fields if needed, e.g., username_cliente_like, username_artigiano_like
    ],
    allowedSortFields: ['idproblema', 'idordine', 'status', 'timestampsegnalazione', 'idcliente', 'idartigiano', 'idadmin'], // Add other relevant fields
    defaultSortField: 'timestampsegnalazione',
    defaultSortOrder: 'DESC',
};

// POST /api/problems - Create a new problema (Cliente or Artigiano)
router.post('/', isAuthenticated, hasPermission(['Cliente', 'Artigiano']), async (req, res) => {
    const { idordine, descrizione } = req.body; // 'immagine' is no longer handled here
    const { idutente, tipologia } = req.user;

    if (!idordine || !descrizione) {
        return res.status(400).json({ error: 'idordine and descrizione are required.' });
    }

    let idcliente = null;
    let idartigiano = null;

    if (tipologia && tipologia.toLowerCase() === 'cliente') { // Use lowercase comparison for safety
        idcliente = idutente;
    } else if (tipologia && tipologia.toLowerCase() === 'artigiano') { // Use lowercase comparison for safety
        idartigiano = idutente;
    } else {
        // This case should be caught by hasPermission, but as a safeguard:
        return res.status(403).json({ error: 'User role cannot create a problema.' });
    }

    const timestampsegnalazione = getCurrentTimestamp();
    const status = 'Aperto';

    try {
        // Insert the new problem, immagine will be NULL initially
        const query = `
            INSERT INTO Problema (idcliente, idartigiano, idordine, descrizione, status, immagine, timestampsegnalazione)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING *;
        `;
        const values = [idcliente, idartigiano, idordine, descrizione, status, null, timestampsegnalazione]; // immagine is NULL
        
        const result = await db.query(query, values);
        res.status(201).json(transformProblemaForResponse(result.rows[0], req));
    } catch (error) {
        console.error('Error creating problema:', error);
        res.status(500).json({ error: 'Failed to create problema.' });
    }
});

// GET /api/problems - Get all problemi (Admin only)
router.get('/', isAuthenticated, hasPermission(['Admin']), createQueryBuilderMiddleware(problemQueryConfig), async (req, res) => {
    try { // Use isAuthenticated and hasPermission from authMiddleWare.js
        const query = `
            -- Select all problems, with optional filters and sorting applied by middleware
            -- Joins are needed to potentially filter/sort by related user info in the future
            SELECT p.*, 
                   uc.username AS username_cliente,
                   ua.username AS username_artigiano,
                   uadmin.username AS username_admin
            FROM Problema p
            LEFT JOIN Utente uc ON p.idcliente = uc.idutente
            LEFT JOIN Utente ua ON p.idartigiano = ua.idutente
            LEFT JOIN Utente uadmin ON p.idadmin = uadmin.idutente
            ${req.sqlWhereClause} -- Add WHERE clause from middleware
            ${req.sqlOrderByClause}; -- Add ORDER BY clause from middleware
        `;
        const result = await db.query(query, req.sqlQueryValues); // Pass values from middleware
        res.status(200).json(result.rows.map(p => transformProblemaForResponse(p, req)));
    } catch (error) {
        console.error('Error fetching all problemi:', error);
        res.status(500).json({ error: 'Failed to fetch problemi.' });
    }
});

// GET /api/problems/me - Get problemi reported by or assigned to the current user (Cliente or Artigiano), with filters
router.get('/me', isAuthenticated, hasPermission(['Cliente', 'Artigiano']), createQueryBuilderMiddleware(problemQueryConfig), async (req, res) => {
    const { idutente, tipologia } = req.user;
    let queryText;
    let whereConditions = [];
    let queryValues = [];
    let placeholderOffset = 0;

    // Base condition: filter by the authenticated user's ID, depending on their role
    if (tipologia && tipologia.toLowerCase() === 'cliente') {
        whereConditions.push(`p.idcliente = $1`);
        queryValues.push(idutente);
        placeholderOffset = 1;
    } else if (tipologia && tipologia.toLowerCase() === 'artigiano') {
        whereConditions.push(`p.idartigiano = $1`);
        queryValues.push(idutente);
        placeholderOffset = 1;
    } else {
        // Should be caught by hasPermission
        return res.status(403).json({ error: 'Invalid user role for this endpoint.' });
    }

    // Integrate filters from queryBuilderMiddleware
    if (req.sqlWhereClause && req.sqlWhereClause.trim() !== '') {
        let middlewareWhere = req.sqlWhereClause.replace(/^WHERE\s*/i, '').trim(); // Remove 'WHERE' if present
        if (middlewareWhere) {
            // Renumber placeholders from middleware to follow our base condition's placeholders
            middlewareWhere = middlewareWhere.replace(/\$(\d+)/g, (match, n) => `\$${parseInt(n) + placeholderOffset}`);
            whereConditions.push(`(${middlewareWhere})`); // Wrap middleware conditions in parentheses
            queryValues.push(...req.sqlQueryValues);
        }
    }

    const finalWhereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    queryText = `
        SELECT p.*,
               uc.username AS username_cliente,
               ua.username AS username_artigiano,
               uadmin.username AS username_admin
        FROM Problema p
        LEFT JOIN Utente uc ON p.idcliente = uc.idutente
        LEFT JOIN Utente ua ON p.idartigiano = ua.idutente
        LEFT JOIN Utente uadmin ON p.idadmin = uadmin.idutente
        ${finalWhereClause}
        ${req.sqlOrderByClause || `ORDER BY p.timestampsegnalazione DESC`}; -- Use middleware order or fallback
    `;

    try {
        const result = await db.query(queryText, queryValues); // Pass combined values
        res.status(200).json(result.rows.map(p => transformProblemaForResponse(p, req)));
    } catch (error) {
        console.error(`Error fetching problemi for user ${idutente}:`, error);
        res.status(500).json({ error: 'Failed to fetch user problemi.' });
    }
});

// GET /api/problems/:id - Get a specific problema by ID (Admin, or associated Cliente/Artigiano)
router.get('/:id', isAuthenticated, async (req, res) => { // This route already has auth checks inside
    const { id } = req.params;
    const { idutente, tipologia } = req.user;

    try {
        const query = `
            SELECT p.*, 
                   uc.username AS username_cliente,
                   ua.username AS username_artigiano,
                   uadmin.username AS username_admin
            FROM Problema p
            LEFT JOIN Utente uc ON p.idcliente = uc.idutente
            LEFT JOIN Utente ua ON p.idartigiano = ua.idutente
            LEFT JOIN Utente uadmin ON p.idadmin = uadmin.idutente
            WHERE p.idproblema = $1;
        `;
        const result = await db.query(query, [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Problema not found.' });
        }

        const problema = result.rows[0];

        if (tipologia && tipologia.toLowerCase() === 'admin' || // Use lowercase comparison
            (tipologia && tipologia.toLowerCase() === 'cliente' && problema.idcliente === idutente) ||
            (tipologia && tipologia.toLowerCase() === 'artigiano' && problema.idartigiano === idutente)) {
            res.status(200).json(transformProblemaForResponse(problema, req));
        } else {
            return res.status(403).json({ error: 'Forbidden: You do not have permission to view this problema.' });
        }
    } catch (error) {
        console.error(`Error fetching problema ${id}:`, error);
        res.status(500).json({ error: 'Failed to fetch problema.' });
    }
});

// PUT /api/problems/:id/status - Update the status of a problema (Admin only)
router.put('/:id/status', isAuthenticated, hasPermission(['Admin']), async (req, res) => {
    const { id } = req.params;
    const { status } = req.body; // Using lowercase to match schema
    const { idutente: idadmin } = req.user; // Admin taking action

    if (!status || !['In lavorazione', 'Risolto'].includes(status)) {
        return res.status(400).json({ error: "Invalid status. Must be 'In lavorazione' or 'Risolto'." });
    }

    try {
        const updateQuery = `
            UPDATE Problema
            SET status = $1, idadmin = $2
            WHERE idproblema = $3
            RETURNING *;
        `;
        const result = await db.query(updateQuery, [status, idadmin, id]);

        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Problema not found or no change made.' });
        }
        res.status(200).json(transformProblemaForResponse(result.rows[0], req));
    } catch (error) {
        console.error(`Error updating problema ${id} status:`, error);
        res.status(500).json({ error: 'Failed to update problema status.' });
    }
});

// DELETE /api/problems/:id - Delete a problema (Admin only)
router.delete('/:id', isAuthenticated, hasPermission(['Admin']), async (req, res) => {
    const { id } = req.params;

    try {
        const query = 'DELETE FROM Problema WHERE idproblema = $1 RETURNING idproblema;';
        const result = await db.query(query, [id]);

        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Problema not found.' });
        }
        res.status(204).send();
    } catch (error) {
        console.error(`Error deleting problema ${id}:`, error);
        res.status(500).json({ error: 'Failed to delete problema.' });
    }
});

// --- Image Handling Routes ---

// Helper function to check if the user is the owner of the problem or an Admin
async function checkProblemaOwnershipOrAdmin(problemaId, requestingUserId, requestingUserRole) {
    if (requestingUserRole && requestingUserRole.toLowerCase() === 'admin') { // Use requestingUserRole (which will be tipologia)
        return { authorized: true, status: 'Admin' };
    }
    const problemaQuery = await db.query("SELECT idcliente, idartigiano FROM Problema WHERE idproblema = $1", [problemaId]);
    if (problemaQuery.rows.length === 0) {
        return { authorized: false, status: 'not_found' };
    }
    const problema = problemaQuery.rows[0]; // pg returns lowercase keys

    // Check if the requesting user is the client or artisan who reported the problem
    if ((requestingUserRole && requestingUserRole.toLowerCase() === 'cliente' && problema.idcliente === requestingUserId) ||
        (requestingUserRole && requestingUserRole.toLowerCase() === 'artigiano' && problema.idartigiano === requestingUserId)) {
        return { authorized: true, status: 'Owner' };
    }

    return { authorized: false, status: 'Forbidden' };
}

// GET /api/problems/:id/image_content - Retrieve the image content for a specific problema (Admin, or associated Cliente/Artigiano)
router.get('/:id/image_content', isAuthenticated, async (req, res) => { // Added isAuthenticated middleware
    const { id } = req.params;
    const problemaId = parseInt(id, 10);

    if (isNaN(problemaId)) {
        return res.status(400).json({ error: "Invalid problema ID format." });
    }

    // Authorization check: Admin or the associated Cliente/Artigiano
    const authCheck = await checkProblemaOwnershipOrAdmin(problemaId, req.user.idutente, req.user.tipologia);
    if (!authCheck.authorized) {
        if (authCheck.status === 'not_found') {
             // Return 404 if the problem doesn't exist, even if unauthorized
             return res.status(404).json({ error: 'Problema not found.' });
        }
        // Otherwise, it's a permission issue
        return res.status(403).json({ error: 'Forbidden: You do not have permission to view this image.' });
    }

    // If authorized, proceed to fetch and serve the image
    try {
        const problemaQuery = await db.query(
            "SELECT immagine FROM Problema WHERE idproblema = $1",
            [problemaId]
        );

        if (problemaQuery.rows.length === 0 || !problemaQuery.rows[0].immagine) {
            return res.status(404).json({ error: "Image not found for this problema." });
        }

        const imageBuffer = problemaQuery.rows[0].immagine;

        if (!(imageBuffer instanceof Buffer)) {
            console.error(`Image data corrupted or invalid format in DB for problema ID ${problemaId}.`);
            return res.status(500).json({ error: "Image data corrupted or invalid format." });
        }

        const fileTypeResult = await FileType.fromBuffer(imageBuffer);

        if (fileTypeResult) {
            res.setHeader('Content-Type', fileTypeResult.mime);
        } else {
            res.setHeader('Content-Type', 'application/octet-stream'); // Fallback
        }
        res.send(imageBuffer);

    } catch (err) {
        console.error(`Error retrieving image content for problema ID ${problemaId}:`, err.message, err.stack);
        res.status(500).json({ error: "Server error while retrieving image content." });
    }
});

// PUT /api/problems/:id/image - Upload or update the image for a specific problema (Admin, or associated Cliente/Artigiano)
router.put('/:id/image', isAuthenticated, rawImageParser('10mb'), async (req, res) => {
    const { id } = req.params;
    const problemaId = parseInt(id, 10);
    
    if (isNaN(problemaId)) {
        return res.status(400).json({ error: "Invalid problema ID format." });
    }

    if (!req.body || req.body.length === 0) {
        return res.status(400).json({ error: "No image data received." });
    }

    const authCheck = await checkProblemaOwnershipOrAdmin(problemaId, req.user.idutente, req.user.tipologia);
    if (!authCheck.authorized) {
        if (authCheck.status === 'not_found') return res.status(404).json({ error: 'Problema not found.' });
        return res.status(403).json({ error: 'Forbidden: You do not have permission to update the image for this problema.' });
    }

    try {
        const updateResult = await db.query(
            "UPDATE Problema SET immagine = $1 WHERE idproblema = $2",
            [req.body, problemaId]
        );

        if (updateResult.rowCount === 0) {
            return res.status(404).json({ error: "Problema not found, image update failed." });
        }

        res.status(200).json({ message: `Image updated successfully for problema ID ${problemaId}` });

    } catch (err) {
        console.error(`Error updating image for problema ID ${problemaId}:`, err.message, err.stack);
        if (err.type === 'entity.too.large') {
             return res.status(413).json({ error: `Image too large. Limit: 10mb.` });
        }
        res.status(500).json({ error: "Server error while updating image." });
    }
});

// DELETE /api/problems/:id/image - Delete the image for a specific problema (Admin, or associated Cliente/Artigiano)
router.delete('/:id/image', isAuthenticated, async (req, res) => {
    const { id } = req.params;
    const problemaId = parseInt(id, 10);

    if (isNaN(problemaId)) {
        return res.status(400).json({ error: "Invalid problema ID format." });
    }

    const authCheck = await checkProblemaOwnershipOrAdmin(problemaId, req.user.idutente, req.user.tipologia); // Use req.user.tipologia
    if (!authCheck.authorized) {
        if (authCheck.status === 'not_found') return res.status(404).json({ error: 'Problema not found.' });
        return res.status(403).json({ error: 'Forbidden: You do not have permission to delete the image for this problema.' });
    }

    try {
        const problemaCheck = await db.query("SELECT immagine FROM Problema WHERE idproblema = $1", [problemaId]);
        if (problemaCheck.rows.length === 0) { 
            return res.status(404).json({ error: "Problema not found." });
        }
        if (problemaCheck.rows[0].immagine === null) {
            return res.status(404).json({ error: "Problema does not have an image associated." });
        }

        const updateResult = await db.query(
            "UPDATE Problema SET immagine = NULL WHERE idproblema = $1",
            [problemaId]
        );

        if (updateResult.rowCount === 0) {
            return res.status(404).json({ error: "Problema not found, image deletion failed." });
        }

        res.status(200).json({ message: `Image deleted successfully for problema ID ${problemaId}` });

    } catch (err) {
        console.error(`Error deleting image for problema ID ${problemaId}:`, err.message, err.stack);
        res.status(500).json({ error: "Server error while deleting image." });
    }
});

module.exports = router;