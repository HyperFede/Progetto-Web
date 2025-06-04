const express = require('express');
const router = express.Router();
const pool = require('../config/db-connect.js'); // Path from your original reviewRoutes.js
const FileType = require('file-type');
const { rawImageParser } = require('../middleware/fileUploadMiddleware.js'); // Assuming path
const { createQueryBuilderMiddleware } = require('../middleware/queryBuilderMiddleware.js');
const { isAuthenticated, hasPermission  } = require('../middleware/authMiddleWare.js'); // Assuming path

// Helper function to transform review data for responses
function transformReviewForResponse(review, req) {
    const transformedReview = { ...review }; // pg driver typically returns lowercase keys

    // Use lowercase keys as pg driver usually returns them
    if (transformedReview.immagine) { // Check if the 'immagine' column (BYTEA) was fetched and is not null
        transformedReview.immagine_url = `${req.protocol}://${req.get('host')}/api/reviews/${transformedReview.idrecensione}/image_content`;
    }
    delete transformedReview.immagine; // Always remove the BYTEA data from the response

    if (transformedReview.valutazione !== undefined && transformedReview.valutazione !== null) {
        transformedReview.valutazione = parseInt(transformedReview.valutazione, 10);
    }
    // Ensure date and time are formatted as needed, though usually they are fine as strings from DB
    return transformedReview;
}

// Helper function to check if the user is the owner of the review or an Admin
async function checkReviewOwnershipOrAdmin(reviewId, requestingUserId, requestingUserType) {
    if (requestingUserType === 'Admin') {
        return { authorized: true, status: 'Admin' };
    }
    const reviewQuery = await pool.query("SELECT IDUtente FROM Recensione WHERE IDRecensione = $1", [reviewId]);
    if (reviewQuery.rows.length === 0) {
        return { authorized: false, status: 'not_found' };
    }
    // Assuming pg returns lowercase 'idutente'
    if (reviewQuery.rows[0].idutente === requestingUserId) {
        return { authorized: true, status: 'Owner' };
    }
    return { authorized: false, status: 'Forbidden' };
}

// Configuration for review queries
const reviewQueryConfigBase = {
    allowedFilters: [
        { queryParam: 'idutente', dbColumn: 'r.IDUtente', type: 'exact', dataType: 'integer' },
        { queryParam: 'valutazione_gte', dbColumn: 'r.Valutazione', type: 'gte', dataType: 'integer' },
        { queryParam: 'valutazione_lte', dbColumn: 'r.Valutazione', type: 'lte', dataType: 'integer' },
        { queryParam: 'data_gte', dbColumn: 'r.Data', type: 'gte', dataType: 'string' }, // Assumes YYYY-MM-DD
        { queryParam: 'data_lte', dbColumn: 'r.Data', type: 'lte', dataType: 'string' }, // Assumes YYYY-MM-DD
        { queryParam: 'username_like', dbColumn: 'u.Username', type: 'like', dataType: 'string' },
    ],
    allowedSortFields: ['idrecensione', 'valutazione', 'data', 'username', 'nomeprodotto'], // nomeprodotto needs alias
    defaultSortField: 'data',
    defaultSortOrder: 'DESC',
    // Joins are implicit in the main query construction for these routes
    // baseWhereClause can be added if needed for specific routes (e.g., only non-deleted products if that was a review feature)
}

// --- CRUD API for Reviews ---

// POST /reviews - Create a new review (image will be null initially)
router.post('/', isAuthenticated, hasPermission(['Cliente']), async (req, res) => {
    const { idprodotto, testo, valutazione } = req.body;
    const idutente = req.user.idutente; // Get user ID from authenticated user
    const currentDate = new Date();
    const data = currentDate.toISOString().split('T')[0]; // YYYY-MM-DD
    const ora = currentDate.toTimeString().split(' ')[0];  // HH:MM:SS

    if (!idprodotto || !testo || !valutazione || valutazione === undefined) {
        return res.status(400).json({ error: 'Missing required fields: idprodotto, testo, valutazione' });
    }

    const parsedValutazione = parseInt(valutazione, 10);
    if (isNaN(parsedValutazione) || parsedValutazione < 1 || parsedValutazione > 5) {
        return res.status(400).json({ error: 'Valutazione must be an integer between 1 and 5' });
    }
    try {
        // Rule: Cliente can only review a product they purchased and which was delivered.
        const purchaseVerificationQuery = await pool.query(
            `SELECT 1
             FROM Ordine o
             JOIN DettagliOrdine dor ON o.IDOrdine = dor.IDOrdine
             JOIN Prodotto p ON dor.IDProdotto = p.IDProd   otto
             JOIN SubOrdine so ON o.IDOrdine = so.IDOrdine AND p.IDArtigiano = so.IDArtigiano
             WHERE o.IDUtente = $1      -- Authenticated user's ID
               AND dor.IDProdotto = $2   -- Product being reviewed
               AND so.SubOrdineStatus = 'Consegnato'
               AND o.Deleted = FALSE    -- Consider only non-deleted orders
             LIMIT 1;`,
            [idutente, idprodotto]
        );

        if (purchaseVerificationQuery.rows.length === 0) {
            return res.status(403).json({ 
                error: "Forbidden: You can only review products you have purchased and that have been delivered." 
            });
        }

        // If verification passes, proceed to create the review
        const newReviewQuery = await pool.query(
            `INSERT INTO Recensione (IDUtente, IDProdotto, Testo, Valutazione, Immagine, Data, Ora)
            VALUES ($1, $2, $3, $4, NULL, $5, $6)
             RETURNING *`, // Immagine is NULL by default
            [idutente, idprodotto, testo, parsedValutazione, data, ora]
        );
        // pg driver returns lowercase keys by default unless column names are quoted in query
        res.status(201).json(transformReviewForResponse(newReviewQuery.rows[0], req));
    } catch (err) {
        console.error(err.message);
        if (err.constraint === 'recensione_valutazione_check') {
            return res.status(400).json({ error: 'Valutazione must be between 1 and 5.' });
        }
        if (err.message.includes('violates foreign key constraint')) {
            if (err.message.includes('recensione_idutente_fkey')) {
                // This should ideally not happen if idutente is from a valid token
                return res.status(400).json({ error: `User with IDUtente ${idutente} does not exist.` });
            }
            if (err.message.includes('recensione_idprodotto_fkey')) {
                return res.status(404).json({ error: `Product with IDProdotto ${idprodotto} does not exist.` });
            }
        }
        res.status(500).json({ error: 'Server error while creating review' });
    }
});

// GET /reviews/:id - Get a specific review by ID
router.get('/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const reviewQuery = await pool.query(
            `SELECT
                r.IDRecensione, r.IDUtente, r.IDProdotto, r.Testo, r.Valutazione, r.Immagine, r.Data, r.Ora,
                u.Username AS username,
                p.Nome AS nomeprodotto
             FROM Recensione r
             JOIN Utente u ON r.IDUtente = u.IDUtente
             JOIN Prodotto p ON r.IDProdotto = p.IDProdotto
             WHERE r.IDRecensione = $1`,
                        [id]
        );
        if (reviewQuery.rows.length === 0) {
            return res.status(404).json({ error: 'Review not found' });
        }
        res.json(transformReviewForResponse(reviewQuery.rows[0], req));
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ error: 'Server error while fetching review' });
    }
});

// PUT /reviews/:id - Update an existing review
router.put('/:id', isAuthenticated, async (req, res) => {
    const { id } = req.params;
    const reviewId = parseInt(id, 10);
    const { testo, valutazione } = req.body;

    if (isNaN(reviewId)) {
        return res.status(400).json({ error: 'Invalid review ID format.' });
    }

    const authCheck = await checkReviewOwnershipOrAdmin(reviewId, req.user.idutente, req.user.tipologia);
    if (!authCheck.authorized) {
        if (authCheck.status === 'not_found') return res.status(404).json({ error: 'Review not found.' });
        return res.status(403).json({ error: 'Forbidden: You do not have permission to update this review.' });
    }

    let parsedValutazione;
    if (valutazione !== undefined) {
        parsedValutazione = parseInt(valutazione, 10);
        if (isNaN(parsedValutazione) || parsedValutazione < 1 || parsedValutazione > 5) {
            return res.status(400).json({ error: 'Valutazione must be an integer between 1 and 5' });
        }
    }

    if (testo === undefined && valutazione === undefined) {
        return res.status(400).json({ error: 'No fields to update provided (testo or valutazione).' });
    }

    try {
        const existingReviewQuery = await pool.query("SELECT Testo, Valutazione FROM Recensione WHERE IDRecensione = $1", [reviewId]);
        if (existingReviewQuery.rows.length === 0) { // Should be caught by authCheck, but good to have
            return res.status(404).json({ error: 'Review not found' });
        }

        const existingReview = existingReviewQuery.rows[0];
        const newTesto = testo !== undefined ? testo : existingReview.testo;
        const newValutazione = parsedValutazione !== undefined ? parsedValutazione : existingReview.valutazione;

        const updatedReviewQuery = await pool.query(
            `UPDATE Recensione
             SET Testo = $1, Valutazione = $2
             WHERE IDRecensione = $3
             RETURNING IDRecensione, IDUtente, IDProdotto, Testo, Valutazione, Immagine, Data, Ora`,
            [newTesto, newValutazione, reviewId]
        );

        res.json(transformReviewForResponse(updatedReviewQuery.rows[0], req));
    } catch (err) {
        console.error(err.message);
        if (err.constraint === 'recensione_valutazione_check') {
            return res.status(400).json({ error: 'Valutazione must be between 1 and 5.' });
        }
        res.status(500).json({ error: 'Server error while updating review' });
    }
});

// DELETE /reviews/:id - Delete a review
router.delete('/:id', isAuthenticated, async (req, res) => {
    const { id } = req.params;
    const reviewId = parseInt(id, 10);

    if (isNaN(reviewId)) {
        return res.status(400).json({ error: 'Invalid review ID format.' });
    }

    const authCheck = await checkReviewOwnershipOrAdmin(reviewId, req.user.idutente, req.user.tipologia);
    if (!authCheck.authorized) {
        if (authCheck.status === 'not_found') return res.status(404).json({ error: 'Review not found.' });
        return res.status(403).json({ error: 'Forbidden: You do not have permission to delete this review.' });
    }
    try {
        const deleteOp = await pool.query(
            "DELETE FROM Recensione WHERE IDRecensione = $1 RETURNING *",
            [reviewId]
        );
        if (deleteOp.rowCount === 0) { // Should be caught by authCheck, but good to have
            return res.status(404).json({ error: 'Review not found' });
        }
        res.json({ message: 'Review deleted successfully', deletedReview: transformReviewForResponse(deleteOp.rows[0], req) });

    } catch (err) {
        console.error(err.message);
        res.status(500).json({ error: 'Server error while deleting review' });
    }
});

// --- Special Routes ---

// GET /products/:productId/reviews - Get all reviews for a specific product
router.get('/product/:productId', async (req, res) => {
    const productId = parseInt(req.params.productId, 10);

    if (isNaN(productId)) {
        return res.status(400).json({ error: 'Invalid Product ID format.' });
    }

    // Create a specific config for this route, excluding product ID from filters
    const productReviewsConfig = {
        ...reviewQueryConfigBase,
        allowedFilters: reviewQueryConfigBase.allowedFilters.concat([
             // No idprodotto here, it's fixed by the route
            { queryParam: 'nomeprodotto_like', dbColumn: 'p.Nome', type: 'like', dataType: 'string' } // Already in base, but ensure p.Nome
        ]),
    };

    // Manually create a middleware instance for this request to pass productId
    const queryBuilder = createQueryBuilderMiddleware(productReviewsConfig);

    queryBuilder(req, res, async () => { // Call the middleware function
        try {
            let queryParams = [productId];
            let whereClauses = [`r.IDProdotto = $${queryParams.length}`];

            if (req.sqlWhereClause && req.sqlWhereClause.trim() !== '') {
                let middlewareWhere = req.sqlWhereClause.replace(/^WHERE\s+/i, '').trim();
                if (middlewareWhere) {
                    const placeholderOffset = queryParams.length;
                    middlewareWhere = middlewareWhere.replace(/\$(\d+)/g, (match, n) => `\$${parseInt(n) + placeholderOffset}`);
                    whereClauses.push(`(${middlewareWhere})`);
                    queryParams.push(...req.sqlQueryValues);
                }
            }

            const finalWhereClause = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

            const queryText =
                `SELECT
                    r.IDRecensione, r.IDUtente, r.IDProdotto, r.Testo, r.Valutazione, r.Immagine, r.Data, r.Ora,
                    u.Username AS username,
                    p.Nome AS nomeprodotto
                 FROM Recensione r
                 JOIN Utente u ON r.IDUtente = u.IDUtente
                 JOIN Prodotto p ON r.IDProdotto = p.IDProdotto
                 ${finalWhereClause}
                 ${req.sqlOrderByClause || `ORDER BY r.Data DESC, r.Ora DESC`}`; // Fallback order

            const reviewsQuery = await pool.query(queryText, queryParams);
            const transformedReviews = reviewsQuery.rows.map(review => transformReviewForResponse(review, req));
            res.json(transformedReviews);

        } catch (err) {
            console.error(`Error fetching reviews for product ${productId}:`, err.message, err.stack);
            res.status(500).json({ error: 'Server error while fetching reviews for product' });
        }
    });
});

// GET /reviews - Get all reviews (use with caution if you have many reviews)
router.get('/', createQueryBuilderMiddleware({
    ...reviewQueryConfigBase,
    allowedFilters: reviewQueryConfigBase.allowedFilters.concat([
        { queryParam: 'idprodotto', dbColumn: 'r.IDProdotto', type: 'exact', dataType: 'integer' },
        { queryParam: 'nomeprodotto_like', dbColumn: 'p.Nome', type: 'like', dataType: 'string' }
    ])
}), async (req, res) => {
    try {
        const queryText =
            `SELECT
                r.IDRecensione, r.IDUtente, r.IDProdotto, r.Testo, r.Valutazione, r.Immagine, r.Data, r.Ora,
                u.Username AS username,
                p.Nome AS nomeprodotto
             FROM Recensione r
             JOIN Utente u ON r.IDUtente = u.IDUtente
             JOIN Prodotto p ON r.IDProdotto = p.IDProdotto
             ${req.sqlWhereClause}
             ${req.sqlOrderByClause}`;

        const allReviewsQuery = await pool.query(queryText, req.sqlQueryValues);
        const transformedReviews = allReviewsQuery.rows.map(review => transformReviewForResponse(review, req));
        res.json(transformedReviews);
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ error: 'Server error while fetching all reviews' });
    }
});

// --- Image Handling Routes ---

// GET /reviews/:id/image_content - Retrieve image content for a review
router.get('/:id/image_content', async (req, res) => {
    const { id } = req.params;
    const reviewId = parseInt(id, 10);

    if (isNaN(reviewId)) {
        return res.status(400).json({ error: "Invalid review ID format." });
    }

    try {
        const reviewQuery = await pool.query(
            "SELECT Immagine FROM Recensione WHERE IDRecensione = $1",
            [reviewId]
        );

        if (reviewQuery.rows.length === 0 || !reviewQuery.rows[0].immagine) {
            return res.status(404).json({ error: "Image not found for this review." });
        }

        const imageBuffer = reviewQuery.rows[0].immagine;

        if (!(imageBuffer instanceof Buffer)) {
            console.error(`Image data corrupted or invalid format in DB for review ID ${reviewId}.`);
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
        console.error(`Error retrieving image content for review ID ${reviewId}:`, err.message, err.stack);
        res.status(500).json({ error: "Server error while retrieving image content." });
    }
});

// PUT /reviews/:id/image - Upload/Update image for a review
router.put('/:id/image', isAuthenticated, rawImageParser('10mb'), async (req, res) => {
    const { id } = req.params;
    const reviewId = parseInt(id, 10);

    if (isNaN(reviewId)) {
        return res.status(400).json({ error: "Invalid review ID format." });
    }

    if (!req.body || req.body.length === 0) {
        return res.status(400).json({ error: "No image data received." });
    }
    
    // Check Content-Type for basic image validation (already done by rawImageParser's fileFilter option if configured)
    const contentType = req.headers['content-type'];
    if (!contentType || !contentType.startsWith('image/')) {
        // This check might be redundant if rawImageParser has a filter, but good for defense in depth
        // return res.status(415).json({ error: 'Unsupported Media Type. Only image files are allowed.' });
    }


    const authCheck = await checkReviewOwnershipOrAdmin(reviewId, req.user.idutente, req.user.tipologia);
    if (!authCheck.authorized) {
        if (authCheck.status === 'not_found') return res.status(404).json({ error: 'Review not found.' });
        return res.status(403).json({ error: 'Forbidden: You do not have permission to update the image for this review.' });
    }

    try {
        const updateResult = await pool.query(
            "UPDATE Recensione SET Immagine = $1 WHERE IDRecensione = $2",
            [req.body, reviewId]
        );

        if (updateResult.rowCount === 0) {
            // This case should ideally be caught by the authCheck finding the review
            return res.status(404).json({ error: "Review not found, image update failed." });
        }

        res.status(200).json({ message: `Image updated successfully for review ID ${reviewId}` });

    } catch (err) {
        console.error(`Error updating image for review ID ${reviewId}:`, err.message, err.stack);
        // rawImageParser might throw its own errors (e.g., size limit) which could be caught here
        // or handled by its onError callback if defined in the middleware.
        if (err.type === 'entity.too.large') { // Example, if error is propagated
             return res.status(413).json({ error: `Image too large. Limit: 10mb.` });
        }
        res.status(500).json({ error: "Server error while updating image." });
    }
});

// DELETE /reviews/:id/image - Delete image for a review
router.delete('/:id/image', isAuthenticated, async (req, res) => {
    const { id } = req.params;
    const reviewId = parseInt(id, 10);

    if (isNaN(reviewId)) {
        return res.status(400).json({ error: "Invalid review ID format." });
    }

    const authCheck = await checkReviewOwnershipOrAdmin(reviewId, req.user.idutente, req.user.tipologia);
    if (!authCheck.authorized) {
        if (authCheck.status === 'not_found') return res.status(404).json({ error: 'Review not found.' });
        return res.status(403).json({ error: 'Forbidden: You do not have permission to delete the image for this review.' });
    }
    
    try {
        // Check if there is an image to delete
        const reviewCheck = await pool.query("SELECT Immagine FROM Recensione WHERE IDRecensione = $1", [reviewId]);
        if (reviewCheck.rows.length === 0) { // Should be caught by authCheck
            return res.status(404).json({ error: "Review not found." });
        }
        if (reviewCheck.rows[0].immagine === null) {
            return res.status(404).json({ error: "Review does not have an image to delete." });
        }

        const updateResult = await pool.query(
            "UPDATE Recensione SET Immagine = NULL WHERE IDRecensione = $1",
            [reviewId]
        );

        if (updateResult.rowCount === 0) {
            // This case should ideally be caught by the authCheck
            return res.status(404).json({ error: "Review not found, image deletion failed." });
        }

        res.status(200).json({ message: `Image deleted successfully for review ID ${reviewId}` });

    } catch (err) {
        console.error(`Error deleting image for review ID ${reviewId}:`, err.message, err.stack);
        res.status(500).json({ error: "Server error while deleting image." });
    }
});
module.exports = router;