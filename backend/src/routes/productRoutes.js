const express = require('express');
const router = express.Router();
// Modifica il percorso del file del pool di connessione al database secondo necessitàù

const pool = require('../config/db-connect.js');
const { isAuthenticated, hasPermission } = require('../middleware/authMiddleWare.js'); // Import authentication middleware
const FileType = require('file-type'); // For inferring image MIME type
const { rawImageParser } = require('../middleware/fileUploadMiddleware.js'); // Importa il middleware specifico per le immagini


// Funzione di aiuto per trasformare i dati del prodotto prima di inviarli come risposta.
// Aggiunge l'URL dell'immagine se presente e rimuove il campo 'immagine', trasforma i numeri in float se necessario.
function transformProductForResponse(product, req) {
    const transformedProduct = { ...product }; // Create a copy to avoid modifying the original object from query
    if (transformedProduct.immagine) {
        transformedProduct.immagine_url = `${req.protocol}://${req.get('host')}/api/products/${transformedProduct.idprodotto}/image_content`;
        delete transformedProduct.immagine; // Rimuove il campo immagine coi dati binari dal risultato 
    }
    if (transformedProduct.prezzounitario !== null && transformedProduct.prezzounitario !== undefined) {
        transformedProduct.prezzounitario = parseFloat(transformedProduct.prezzounitario); //in Json restituirebbe una String, (non so il motivo)
    }
    return transformedProduct;
}

/**
 * @route POST /api/products
 * @description Crea un nuovo prodotto.
 *              Accessibile solo agli utenti di tipologia 'Artigiano'.
 *              L'ID dell'artigiano viene automaticamente preso dal token dell'utente autenticato.
 * @access Artigiano
 *
 * Interazione Black-Box:
 *  Input: Oggetto JSON nel corpo della richiesta (req.body) con i seguenti campi:
 *      {
 *          "nome": "String (obbligatorio)",
 *          "descrizione": "String (obbligatorio)",
 *          "categoria": "String (obbligatorio)",
 *          "prezzounitario": "Number (obbligatorio, non negativo)",
 *          "quantitadisponibile": "Integer (obbligatorio, non negativo)",
 *          // "idartigiano": "Non più accettato nel corpo, viene preso dal token"
 *      }
 *  Output:
 *      - Successo (201 Created): Oggetto JSON con i dati del prodotto creato.
 *        { "idprodotto": Number, "nome": String, ..., "idartigiano": Number, "deleted": false }
 *      - Errore (400 Bad Request):
 *          - Se i campi obbligatori mancano.
 *          - Se `prezzounitario` o `quantitadisponibile` non sono numeri validi o sono negativi.
 *      - Errore (403 Forbidden): (Non più applicabile per `idartigiano` nel corpo, ma il permesso 'Artigiano' è ancora richiesto).
 *      - Errore (409 Conflict): Se la creazione viola un vincolo univoco (errore 23505 dal DB, es. nome prodotto univoco per artigiano se implementato).
 *      - Errore (500 Internal Server Error): In caso di errore generico del server.
 *        { "error": "Stringa di errore" }
 */
// POST /api/products
router.post('/', isAuthenticated, hasPermission(['Artigiano']), async (req, res) => { // IT: Accesso solo per Artigiani
    try {
        // Destruttura i campi del prodotto. 'immagine' non è più gestita qui.
        const { nome, descrizione, categoria, prezzounitario, quantitadisponibile } = req.body;
        // Ottieni l'ID dell'utente autenticato dal token
        const authenticatedUserId = req.user.idutente; 
        const finalIdArtigiano = authenticatedUserId; 

        // Validazione di base
        if (!nome || !descrizione || !categoria || prezzounitario === undefined || quantitadisponibile === undefined) {
            return res.status(400).json({ error: 'Campi obbligatori mancanti: nome, descrizione, categoria, prezzounitario, quantitadisponibile sono richiesti.' });
        }
        if (typeof prezzounitario !== 'number' || prezzounitario <= 0) { 
            return res.status(400).json({ error: 'prezzounitario deve essere un numero non negativo.' });
        }
        if (typeof quantitadisponibile !== 'number' || quantitadisponibile <= 0 || !Number.isInteger(quantitadisponibile)) { 
            return res.status(400).json({ error: 'quantitadisponibile deve essere un intero non negativo.' });
        }

        // Usa minuscole per i nomi delle colonne del database nella query SQL
        // NB Il campo 'immagine' viene inserito come NULL. Verrà aggiornato tramite l'endpoint PUT dedicato.
        const newProduct = await pool.query(
            "INSERT INTO Prodotto (nome, descrizione, categoria, prezzounitario, quantitadisponibile, immagine, idartigiano, deleted) VALUES ($1, $2, $3, $4, $5, $6, $7, FALSE) RETURNING *",
            [nome, descrizione, categoria, prezzounitario, quantitadisponibile, null, finalIdArtigiano]
        );

        const productData = newProduct.rows[0];
        res.status(201).json(transformProductForResponse(productData, req));
    } catch (err) {
        console.error('Errore durante la creazione del prodotto:', err.message, err.stack);
        if (err.code === '23505') { // violazione_univocità
            return res.status(409).json({ error: 'Creazione prodotto fallita a causa di una violazione del vincolo di univocità.' });
        }
        if (err.code === '23503') { // violazione_chiave_esterna
            return res.status(400).json({ error: 'idartigiano finale non valido. Artigiano non esistente.' });
        }
        if (err.code === '23514') { // violazione_controllo (es. quantitadisponibile >= 0)
            if (err.constraint && err.constraint.includes('quantitadisponibile')) {
               return res.status(400).json({ error: "quantitadisponibile cannot be negative." });
            }
            return res.status(400).json({ error: "Product data violates a check constraint." });
        }
        res.status(500).json({ error: "Server error while creating product." });
    }
});

/**
 * @route GET /api/products/notdeleted
 * @description Recupera tutti i prodotti che non sono marcati come 'deleted'.
 *              Questa rotta è pubblica e non richiede autenticazione.
 * @access Public
 *
 * Interazione Black-Box:
 *  Input: Nessuno.
 *  Output:
 *      - Successo (200 OK): Array JSON di oggetti prodotto.
 *        [ { "idprodotto": Number, "nome": String, ..., "idartigiano": Number }, ... ]
 *      - Errore (500 Internal Server Error): In caso di errore del server.
 *        { "error": "Stringa di errore" }
 */
// GET /api/products/notdeleted
router.get('/notdeleted', async (req, res) => {
    // Nessuna autenticazione richiesta, rotta pubblica
    try {
        // Usa minuscole per i nomi delle colonne del database
        const allProducts = await pool.query(
            "SELECT idprodotto, nome, descrizione, categoria, prezzounitario, quantitadisponibile, immagine, idartigiano FROM Prodotto WHERE deleted = FALSE ORDER BY idprodotto ASC"
        );
        //per ogni prodotto (ogni riga del risultato) trasformiamo i dati per la risposta
        const productsWithUrls = allProducts.rows.map(product => transformProductForResponse(product, req));
        // Restituisce tutti i prodotti
        res.json(productsWithUrls);
    } catch (err) {
        console.error('Error fetching products:', err.message);
        res.status(500).json({ error: "Server error while fetching products." });
    }
});

/**
 * @route GET /api/products/ 
 * @description Recupera tutti i prodotti, inclusi quelli marcati come 'deleted'.
 *              Accessibile solo agli utenti di tipologia 'Admin'.
 * @access Admin
 *
 * Interazione Black-Box:
 *  Input: Nessuno.
 *  Output:
 *      - Successo (200 OK): Array JSON di oggetti prodotto.
 *        [ { "idprodotto": Number, "nome": String, ..., "idartigiano": Number, "deleted": Boolean }, ... ]
 *      - Errore (500 Internal Server Error): In caso di errore del server.
 *        { "error": "Stringa di errore" }
 */
router.get('/', isAuthenticated, hasPermission(['Admin']), async (req, res) => { // IT: Accesso solo per Admin
    try {
        const allProductsIncludingDeleted = await pool.query(
            "SELECT idprodotto, nome, descrizione, categoria, prezzounitario, quantitadisponibile, immagine, idartigiano, deleted FROM Prodotto ORDER BY idprodotto ASC"
        );

        const productsWithUrls = allProductsIncludingDeleted.rows.map(product => transformProductForResponse(product, req));
        res.json(productsWithUrls);
    } catch (err) {
        console.error('Error fetching all products (including deleted):', err.message, err.stack);
        res.status(500).json({ error: "Server error while fetching all products." });
    }
});

/**
 * @route GET /api/products/:id
 * @description Recupera un singolo prodotto tramite il suo ID, solo se non è marcato come 'deleted'.
 *              Questa rotta è pubblica e non richiede autenticazione.
 * @access Public
 *
 * Interazione Black-Box:
 *  Input:
 *      - Parametro di rotta `id`: ID numerico del prodotto.
 *  Output:
 *      - Successo (200 OK): Oggetto JSON con i dati del prodotto.
 *        { "idprodotto": Number, "nome": String, ..., "idartigiano": Number, "deleted": false }
 *      - Errore (400 Bad Request): Se l'ID del prodotto fornito non è un numero valido.
 *        { "error": "Invalid product ID format." }
 *      - Errore (404 Not Found): Se il prodotto con l'ID specificato non esiste o è marcato come 'deleted'.
 *        { "error": "Product not found or has been deleted." }
 *      - Errore (500 Internal Server Error): In caso di errore del server.
 *        { "error": "Stringa di errore" }
 */
// GET /api/products/:id
// Questa rotta è ora pubblica, nessuna autenticazione richiesta.
router.get('/:id', async (req, res) => { 
    try {
        const { id } = req.params;
        const productId = parseInt(id, 10);
        // const authenticatedUser = req.user; // Rimosso poiché l'autenticazione non è più richiesta
 
        if (isNaN(productId)) {
            return res.status(400).json({ error: "Invalid product ID format." });
        }
        // Usa minuscole per i nomi delle colonne del database
        const productResult = await pool.query("SELECT * FROM Prodotto WHERE idprodotto = $1 AND deleted = FALSE", [productId]);

        if (productResult.rows.length === 0) {
            return res.status(404).json({ error: "Prodotto non trovato o è stato eliminato." });
        }

        const productData = productResult.rows[0];
        res.json(transformProductForResponse(productData, req));
    } catch (err) {
        console.error('Error fetching product by ID:', err.message);
        res.status(500).json({ error: "Server error while fetching product." });
    }
});

/**
 * @route PUT /api/products/:id
 * @description Aggiorna i dati di un prodotto esistente.
 *              Accessibile agli utenti 'Artigiano' (solo per i propri prodotti) e 'Admin' (per qualsiasi prodotto).
 *              Gli Artigiani non possono cambiare l'`idartigiano` del prodotto.
 *              Gli Admin possono cambiare l'`idartigiano` del prodotto.
 * @access Artigiano, Admin
 *
 * Interazione Black-Box:
 *  Input:
 *      - Parametro di rotta `id`: ID numerico del prodotto da aggiornare.
 *      - Corpo della richiesta (req.body): Oggetto JSON con i campi da aggiornare (tutti opzionali).
 *        {
 *          "nome": "String",
 *          "descrizione": "String",
 *          "categoria": "String",
 *          "prezzounitario": "Number (non negativo)",
 *          "quantitadisponibile": "Integer (non negativo)",
 *          // "immagine": "String (base64 encoded o null)" - Questo campo non verrà più usato qui
 *          "idartigiano": "Number (intero, solo se l'utente è Admin e vuole cambiare proprietario)"
 *        }
 *  Output:
 *      - Successo (200 OK): Oggetto JSON con un messaggio e i dati del prodotto aggiornato.
 *        { "message": "Product updated successfully", "product": { ... } }
 *      - Errore (400 Bad Request): ID prodotto non valido, nessun campo fornito per l'aggiornamento,
 *                                 valori non validi per `prezzounitario`, `quantitadisponibile`, `immagine`,
 *                                 o `idartigiano` (se fornito).
 *      - Errore (403 Forbidden): Se un Artigiano tenta di aggiornare un prodotto non suo, o tenta di cambiare `idartigiano`.
 *      - Errore (404 Not Found): Se il prodotto da aggiornare non esiste o è stato eliminato.
 *      - Errore (500 Internal Server Error): In caso di errore del server, inclusi violazioni di vincoli DB (es. `idartigiano` non esistente se modificato da Admin).
 *        { "error": "Stringa di errore" }
 */
// PUT /api/products/:id
router.put('/:id', isAuthenticated, hasPermission(['Artigiano','Admin']), async (req, res) => {
    // IT: Accesso per Artigiano (proprio prodotto) o Admin (qualsiasi prodotto)
    try {
        const { id } = req.params;
        const productId = parseInt(id, 10);
        const authenticatedUser = req.user; // Ottieni l'oggetto utente completo
        const authenticatedUserId = authenticatedUser.idutente;

        if (isNaN(productId)) {
            return res.status(400).json({ error: "Invalid product ID format." });
        }

        // Recupera il prodotto corrente per vedere se esiste e non è eliminato
        const existingProductQuery = await pool.query("SELECT * FROM Prodotto WHERE idprodotto = $1 AND deleted = FALSE", [productId]);
        if (existingProductQuery.rows.length === 0) {
            return res.status(404).json({ error: "Prodotto non trovato o è stato eliminato, impossibile aggiornare." });
        }
        const existingProduct = existingProductQuery.rows[0];

        // Autorizzazione: L'Artigiano può aggiornare solo i propri prodotti. L'Admin può aggiornare qualsiasi prodotto.
        if (authenticatedUser.tipologia === 'Artigiano' && existingProduct.idartigiano !== authenticatedUserId) {
            return res.status(403).json({ error: "Vietato: L'Artigiano può aggiornare solo i propri prodotti." });
        }

        // Destruttura con chiavi minuscole attese dal corpo della richiesta
        // Rinomina idartigiano dal corpo in newIdArtigiano per evitare confusione con existingProduct.idartigiano
        // 'immagine' non è più gestita qui.
        const { nome, descrizione, categoria, prezzounitario, quantitadisponibile, idartigiano: newIdArtigiano } = req.body;

        // Usa chiavi minuscole da req.body per l'oggetto degli aggiornamenti
        const updates = {};
        if (nome !== undefined) updates.nome = nome;
        if (descrizione !== undefined) updates.descrizione = descrizione;
        if (categoria !== undefined) updates.categoria = categoria;
        if (prezzounitario !== undefined) {
            if (typeof prezzounitario !== 'number' || prezzounitario < 0) {
                return res.status(400).json({ error: 'prezzounitario deve essere un numero non negativo.' });
            }
            updates.prezzounitario = prezzounitario;
        }
        if (quantitadisponibile !== undefined) {
            if (typeof quantitadisponibile !== 'number' || quantitadisponibile < 0 || !Number.isInteger(quantitadisponibile)) {
                return res.status(400).json({ error: 'quantitadisponibile deve essere un intero non negativo.' });
            }
            updates.quantitadisponibile = quantitadisponibile;
        }
        // Gestisci l'aggiornamento di idartigiano in base al ruolo dell'utente
        if (newIdArtigiano !== undefined) {
            if (typeof newIdArtigiano !== 'number' || !Number.isInteger(newIdArtigiano)) {
                return res.status(400).json({ error: 'idartigiano must be an integer.' });
            }

            if (authenticatedUser.tipologia === 'Admin') {
                // L'Admin può cambiare il proprietario del prodotto con qualsiasi ID Artigiano valido
                updates.idartigiano = newIdArtigiano;
            } else if (authenticatedUser.tipologia === 'Artigiano') {
                // Artigiano is updating their own product (ownership already verified by the check at the beginning of the route).
                // They cannot change the owner to someone else.
                // The newIdArtigiano, if provided, must be their own ID.
                if (newIdArtigiano !== authenticatedUserId) {
                    return res.status(403).json({ error: "Vietato: Gli Artigiani non possono cambiare il proprietario del prodotto." });
                }
                // Se newIdArtigiano è il proprio ID, è un aggiornamento valido (anche se possibilmente ridondante se invariato).
                updates.idartigiano = newIdArtigiano;
            }
            // Nessun caso 'else' necessario poiché il middleware hasPermission limita a 'Admin' o 'Artigiano'
        }

        // La gestione del campo 'immagine' è rimossa da questa rotta.

        if (Object.keys(updates).length === 0) {
            return res.status(400).json({ error: "Nessun campo da aggiornare fornito." });
        }

        const setClauses = [];
        const values = [];
        let paramIndex = 1;

        for (const [key, value] of Object.entries(updates)) {
            setClauses.push(`${key} = $${paramIndex++}`); // le chiavi sono già nomi di colonna db minuscoli
            values.push(value);
        }

        values.push(productId); // Per WHERE idprodotto = $N
        // Usa minuscole per i nomi delle colonne del database
        const queryText = `UPDATE Prodotto SET ${setClauses.join(', ')} WHERE idprodotto = $${paramIndex} AND deleted = FALSE RETURNING *`;

        const updatedProductResult = await pool.query(queryText, values);

        if (updatedProductResult.rows.length === 0) {
            // Questo potrebbe accadere se il record è stato eliminato da un altro processo o se non si è verificata alcuna modifica effettiva che soddisfacesse i criteri
            return res.status(404).json({ error: "Il prodotto non può essere aggiornato o non sono state applicate modifiche." });
        }
        
        const productData = updatedProductResult.rows[0]; // il driver pg restituisce chiavi minuscole
        const transformedProduct = transformProductForResponse(productData, req);
        res.json({ message: "Product updated successfully", product: transformedProduct });
    } catch (err) {
        console.error('Errore durante l\'aggiornamento del prodotto:', err.message, err.stack);
        if (err.code === '23503') { // violazione_chiave_esterna
            return res.status(400).json({ error: 'Invalid idartigiano. Artisan does not exist.' });
        }
        if (err.code === '23514') { // check_violation
            if (err.constraint && err.constraint.includes('quantitadisponibile')) {
                return res.status(400).json({ error: "quantitadisponibile cannot be negative." });
            }
            return res.status(400).json({ error: "Update violates a check constraint." });
        }
        if (err.code === '23505') { // violazione_univocità
            return res.status(409).json({ error: 'Update failed due to a unique constraint violation.' });
        }
        res.status(500).json({ error: "Server error while updating product." });
    }
});

/**
 * @route DELETE /api/products/:id
 * @description Esegue una "soft delete" di un prodotto, impostando il campo 'deleted' a true.
 *              Accessibile agli utenti 'Artigiano' (solo per i propri prodotti) e 'Admin' (per qualsiasi prodotto).
 * @access Artigiano, Admin
 *
 * Interazione Black-Box:
 *  Input:
 *      - Parametro di rotta `id`: ID numerico del prodotto da eliminare.
 *  Output:
 *      - Successo (200 OK): Oggetto JSON con un messaggio di conferma e l'ID del prodotto eliminato.
 *        { "message": "Product soft deleted successfully", "idprodotto": Number }
 *      - Errore (400 Bad Request): Se l'ID del prodotto fornito non è un numero valido.
 *        { "error": "Invalid product ID format." }
 *      - Errore (403 Forbidden): Se un Artigiano tenta di eliminare un prodotto non suo.
 *        { "error": "Forbidden: Artigiano can only delete their own products." }
 *      - Errore (404 Not Found): Se il prodotto da eliminare non esiste o è già stato eliminato.
 *        { "error": "Product not found or already deleted." }
 *      - Errore (500 Internal Server Error): In caso di errore del server.
 *        { "error": "Stringa di errore" }
 */
// DELETE /api/products/:id
router.delete('/:id', isAuthenticated, hasPermission(['Artigiano','Admin']), async (req, res) => {
    // IT: Accesso per Artigiano (proprio prodotto) o Admin (qualsiasi prodotto)
    try {
        const { id } = req.params;
        const productId = parseInt(id, 10);
        const authenticatedUser = req.user; // Ottieni l'oggetto utente completo

        if (isNaN(productId)) {
            return res.status(400).json({ error: "Invalid product ID format." });
        }

        // Controlla se il prodotto esiste e non è eliminato
        // Non è necessario recuperare 'immagine' qui perché non la eliminiamo dal filesystem
        const productCheck = await pool.query("SELECT idartigiano, immagine FROM Prodotto WHERE idprodotto = $1 AND deleted = FALSE", [productId]);
        if (productCheck.rows.length === 0) {
            return res.status(404).json({ error: "Prodotto non trovato o già eliminato." });
        }
        const productToDelete = productCheck.rows[0];

        // Autorizzazione: L'Artigiano può eliminare solo i propri prodotti. L'Admin può eliminare qualsiasi prodotto.
        if (authenticatedUser.tipologia === 'Artigiano' && productCheck.rows[0].idartigiano !== authenticatedUser.idutente) {
            return res.status(403).json({ error: "Vietato: L'Artigiano può eliminare solo i propri prodotti." });
        }

        let deleteQueryText;
        let deleteQueryValues;

        if (authenticatedUser.tipologia === 'Admin') {
            // L'Admin può eliminare qualsiasi prodotto
            deleteQueryText = "UPDATE Prodotto SET deleted = TRUE WHERE idprodotto = $1 AND deleted = FALSE RETURNING idprodotto";
            deleteQueryValues = [productId];
        } else { 
            // L'utente è Artigiano e la proprietà è stata confermata dal controllo precedente
            deleteQueryText = "UPDATE Prodotto SET deleted = TRUE WHERE idprodotto = $1 AND idartigiano = $2 AND deleted = FALSE RETURNING idprodotto";
            deleteQueryValues = [productId, authenticatedUser.idutente];
        }
        // Esegui la soft delete impostando deleted a TRUE
        const deleteProduct = await pool.query(deleteQueryText, deleteQueryValues);

        if (deleteProduct.rowCount === 0) {
            // Questo può accadere se il prodotto è stato eliminato tra il controllo e l'aggiornamento (race condition)
            // o se era già eliminato e `AND deleted = FALSE` nell'UPDATE ha impedito un aggiornamento.
            return res.status(404).json({ error: "Prodotto non trovato o già eliminato." });
        }
        // Se si volesse pulire il campo immagine nel DB durante la soft delete, si aggiungerebbe:
        // await pool.query("UPDATE Prodotto SET immagine = NULL WHERE idprodotto = $1", [productId]);
        // Ma per ora, la soft delete non tocca il campo immagine, c'è un ednpoint dedicato.

        res.json({ message: "Prodotto eliminato (soft delete) con successo", idprodotto: deleteProduct.rows[0].idprodotto });
    } catch (err) {
        console.error('Errore durante il soft delete del prodotto:', err.message);
        res.status(500).json({ error: "Server error while soft deleting product." });
    }
});

/**
 * @route PUT /api/products/:id/image
 * @description Carica/Aggiorna l'immagine per un prodotto esistente.
 *              L'immagine viene inviata come `application/octet-stream`.
 *              L'immagine binaria viene salvata direttamente nel database.
 * @access Artigiano (per i propri prodotti), Admin
 *
 * Interazione Black-Box:
 *  Input:
 *      - Parametro di rotta `id`: ID numerico del prodotto.
 *      - Corpo della richiesta: Dati binari dell'immagine (`application/octet-stream`).
 *      - Header `Content-Type`: Deve essere un tipo MIME immagine valido (es. `image/jpeg`, `image/png`).
 *  Output:
 *      - Successo (200 OK): Oggetto JSON con un messaggio di conferma.
 *        { "message": "Immagine aggiornata con successo per il prodotto ID X" }
 *      - Errore (400 Bad Request): ID prodotto non valido, nessun dato immagine nel corpo.
 *      - Errore (403 Forbidden): Se un Artigiano tenta di aggiornare l'immagine di un prodotto non suo.
 *      - Errore (404 Not Found): Se il prodotto non esiste o è stato eliminato.
 *      - Errore (413 Payload Too Large): Se la dimensione del file supera il limite configurato.
 *      - Errore (415 Unsupported Media Type): Se il Content-Type non è un tipo di immagine supportato.
 *      - Errore (500 Internal Server Error): In caso di errore del server.
 */
// La definizione di rawImageUploadMiddleware è stata rimossa.
router.put('/:id/image', isAuthenticated, hasPermission(['Artigiano', 'Admin']), rawImageParser('10mb'), async (req, res) => {
    try {
        const { id } = req.params;
        const productId = parseInt(id, 10);
        const authenticatedUser = req.user;

        if (isNaN(productId)) {
            return res.status(400).json({ error: "ID prodotto non valido." });
        }

        // Verifica che il corpo della richiesta (immagine) non sia vuoto
        if (!req.body || req.body.length === 0) {
            return res.status(400).json({ error: "Nessun dato immagine ricevuto." });
        }

        // Controlla l'esistenza del prodotto e i permessi
        const productQuery = await pool.query("SELECT idartigiano FROM Prodotto WHERE idprodotto = $1 AND deleted = FALSE", [productId]);
        if (productQuery.rows.length === 0) {
            return res.status(404).json({ error: "Prodotto non trovato o eliminato." });
        }

        if (authenticatedUser.tipologia === 'Artigiano' && productQuery.rows[0].idartigiano !== authenticatedUser.idutente) {
            return res.status(403).json({ error: "Vietato: L'Artigiano può aggiornare immagini solo per i propri prodotti." });
        }

        // Salva il buffer dell'immagine (req.body) direttamente nel database
        const updateResult = await pool.query(
            "UPDATE Prodotto SET immagine = $1 WHERE idprodotto = $2",
            [req.body, productId]
        );

        if (updateResult.rowCount === 0) {
            // Non dovrebbe accadere se il controllo precedente ha avuto successo, ma è una sicurezza
            return res.status(404).json({ error: "Aggiornamento immagine fallito, prodotto non trovato." });
        }

        res.status(200).json({ message: `Immagine aggiornata con successo per il prodotto ID ${productId}` });

    } catch (err) {
        console.error(`Errore durante l'aggiornamento dell'immagine per il prodotto ID ${req.params.id}:`, err.message, err.stack);
        if (err.type === 'entity.too.large') { // Questo blocco potrebbe non essere più raggiunto se l'onerror nel middleware funziona correttamente.
            return res.status(413).json({ error: `Immagine troppo grande. Limite: 10mb.` });
        }
        res.status(500).json({ error: "Errore del server durante l'aggiornamento dell'immagine." });
    }
});

/**
 * @route DELETE /api/products/:id/image
 * @description Rimuove l'immagine associata a un prodotto (imposta il campo immagine a NULL nel DB).
 * @access Artigiano (per i propri prodotti), Admin
 */
router.delete('/:id/image', isAuthenticated, hasPermission(['Artigiano', 'Admin']), async (req, res) => {
    try {
        const { id } = req.params;
        const productId = parseInt(id, 10);
        const authenticatedUser = req.user;

        if (isNaN(productId)) {
            return res.status(400).json({ error: "ID prodotto non valido." });
        }

        // Controlla l'esistenza del prodotto e i permessi
        const productQuery = await pool.query("SELECT idartigiano, immagine FROM Prodotto WHERE idprodotto = $1 AND deleted = FALSE", [productId]);
        if (productQuery.rows.length === 0) {
            return res.status(404).json({ error: "Prodotto non trovato o eliminato." });
        }
        const product = productQuery.rows[0];

        if (authenticatedUser.tipologia === 'Artigiano' && product.idartigiano !== authenticatedUser.idutente) {
            return res.status(403).json({ error: "Vietato: L'Artigiano può rimuovere immagini solo per i propri prodotti." });
        }

        if (product.immagine === null) {
            return res.status(404).json({ error: "Il prodotto non ha un'immagine associata da rimuovere." });
        }

        // Imposta il campo immagine a NULL nel database
        const updateResult = await pool.query(
            "UPDATE Prodotto SET immagine = NULL WHERE idprodotto = $1",
            [productId]
        );

        if (updateResult.rowCount === 0) {
            return res.status(404).json({ error: "Rimozione immagine fallita, prodotto non trovato." });
        }

        res.status(200).json({ message: `Immagine rimossa con successo per il prodotto ID ${productId}` });

    } catch (err) {
        console.error(`Errore durante la rimozione dell'immagine per il prodotto ID ${req.params.id}:`, err.message, err.stack);
        res.status(500).json({ error: "Errore del server durante la rimozione dell'immagine." });
    }
});

/**
 * @route GET /api/products/:id/image_content
 * @description Recupera i dati binari dell'immagine di un prodotto.
 * @access Public
 */
router.get('/:id/image_content', async (req, res) => {
    try {
        const { id } = req.params;
        const productId = parseInt(id, 10);

        if (isNaN(productId)) {
            return res.status(400).json({ error: "ID prodotto non valido." });
        }

        const productQuery = await pool.query(
            "SELECT immagine FROM Prodotto WHERE idprodotto = $1 AND deleted = FALSE",
            [productId]
        );

        if (productQuery.rows.length === 0 || !productQuery.rows[0].immagine) {
            return res.status(404).json({ error: "Immagine non trovata per questo prodotto." });
        }

        const imageBuffer = productQuery.rows[0].immagine;

        // Check: Ensure imageBuffer is actually a Buffer
        if (!(imageBuffer instanceof Buffer)) {
            console.error(`Dati immagine corrotti o formato non valido nel database per prodotto ID ${productId}. Tipo ricevuto: ${typeof imageBuffer}`);
            return res.status(500).json({ error: "Dati immagine corrotti o formato non valido nel database." });
        }

        // Inferisci il tipo MIME dal buffer (es. 'image/jpeg', 'image/png')

        // Modifichiamo la chiamata per usare 'fileTypeFromBuffer'
        const fileTypeResult = await FileType.fileTypeFromBuffer(imageBuffer); 

        if (fileTypeResult) {
            res.setHeader('Content-Type', fileTypeResult.mime);
            console.log(`Immagine recuperata per prodotto ID ${productId}, tipo MIME: ${fileTypeResult.mime}`);
        } else {
            // Fallback se il tipo non può essere determinato, o se si vuole essere generici
            res.setHeader('Content-Type', 'application/octet-stream');
        }
        
        res.send(imageBuffer);

    } catch (err) {
        console.error(`Errore durante il recupero del contenuto dell'immagine per il prodotto ID ${req.params.id}:`, err.message, err.stack);
        res.status(500).json({ error: "Errore del server durante il recupero del contenuto dell'immagine." });
    }
});

module.exports = router;