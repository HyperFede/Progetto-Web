const express = require('express');
const router = express.Router();
const pool = require('../config/db-connect.js');
const { isAuthenticated, hasPermission } = require('../middleware/authMiddleWare.js'); // Import authentication middleware

// Helper function to start a transaction
const beginTransaction = async () => pool.query('BEGIN');
// Helper function to commit a transaction
const commitTransaction = async () => pool.query('COMMIT');
// Helper function to rollback a transaction
const rollbackTransaction = async () => pool.query('ROLLBACK');

// GET per ottenere tutti i dettagli dei carrelli di tutti gli utenti, solo per admin
/**
 * * GET /api/carts
 * * Ottiene tutti i dettagli dei carrelli di tutti gli utenti.
 * * Accessibile solo agli utenti autenticati con permessi di Admin.
 * * Restituisce un array di oggetti che rappresentano gli articoli del carrello,
 * * inclusi i dettagli del prodotto come nome e prezzo unitario.
 * * Gli articoli dei prodotti marcati come 'deleted' non vengono inclusi.
 * 
 *  Input:
 * - Nessun input richiesto. (Bearer token per autenticazione)
 * 
 *  Output:
 * - 200 OK: Un array di oggetti che rappresentano gli articoli del carrello,
 *   ciascuno con i campi:
 * *   - idcliente: ID del cliente
 * *   - idprodotto: ID del prodotto
 * *   - quantita: Quantità dell'articolo nel carrello
 * *   - totaleparziale: Totale parziale per l'articolo (quantità * prezzo unitario)
 * *   - nomeprodotto: Nome del prodotto
 * *   - prezzounitario: Prezzo unitario del prodotto
 * * - 500 Internal Server Error: Se si verifica un errore durante il recupero dei carrelli.
 * * 
 */
router.get('/', isAuthenticated,hasPermission(['Admin']), async (req, res) => {
    // Query per ottenere tutti gli articoli di tutti i carrelli, includendo il nome del prodotto
    // e il prezzo unitario, escludendo prodotti marcati come 'deleted'.
    const query = `
        SELECT dc.*, p.nome AS nomeprodotto, p.prezzounitario
        FROM dettaglicarrello dc
        JOIN Prodotto p ON dc.idprodotto = p.idprodotto
        WHERE p.deleted = FALSE
        ORDER BY dc.idcliente, p.nome ASC;
    `; // Ordina per cliente e poi per nome prodotto per una visualizzazione più organizzata
    
    try {
        const result = await pool.query(query);
        res.json(result.rows);
    } catch (error) { //NOSONAR
        console.error('Errore nel recupero dei carrelli:', error);
        res.status(500).json({ message: 'Errore del server durante il recupero dei carrelli.' });
    }
});

// GET per ottenere i dettagli del carrello di un utente specifico,
// accessibile solo agli utenti autenticati con permessi di Admin o Cliente, 
//gli admin possono vedere i carrelli di tutti gli utenti, i clienti solo il proprio

/**
 * * GET /api/carts/:idcliente
 * * @description Ottiene i dettagli del carrello di un utente specifico.
 * * @Access Accessibile solo agli utenti autenticati con permessi di Admin o Cliente.
 * * Un Cliente può vedere solo il proprio carrello. Un Admin può vedere qualsiasi carrello.
 * * Restituisce un array di oggetti che rappresentano gli articoli del carrello,
 * * inclusi i dettagli del prodotto come nome e prezzo unitario.
 * * Gli articoli dei prodotti marcati come 'deleted' non vengono inclusi (per design del sito).
 * 
 *  Input:
 * - Parametro di percorso `:idcliente` (ID del cliente il cui carrello si vuole visualizzare).
 * - Parametro di autenticazione (Bearer token per autenticazione).
 * *  Output:
 * - 200 OK: Un array di oggetti che rappresentano gli articoli del carrello,
 * *   ciascuno con i campi:
 * *   - idcliente: ID del cliente
 * *   - idprodotto: ID del prodotto
 * *   - quantita: Quantità dell'articolo nel carrello
 * *   - totaleparziale: Totale parziale per l'articolo (quantità * prezzo unitario)
 * *   - nomeprodotto: Nome del prodotto
 * *   - prezzounitario: Prezzo unitario del prodotto
 * - 403 Forbidden: Se un Cliente tenta di accedere al carrello di un altro cliente.
 * - 500 Internal Server Error: Se si verifica un errore durante il recupero del carrello.
 * - Response Structure: { "items": [], "totaleCarrello": 0.00 }
 * 
 */
router.get('/:idcliente', isAuthenticated, hasPermission(['Admin', 'Cliente']), async (req, res) => {
    const userId = req.user.idutente; // ID dell'utente autenticato
    const requestedCartUserId = parseInt(req.params.idcliente, 10); // ID del cliente il cui carrello si vuole visualizzare

    if (isNaN(requestedCartUserId)) {
        return res.status(400).json({ message: 'ID cliente non valido.' });
    }

    // Un Cliente può vedere solo il proprio carrello. Un Admin può vedere qualsiasi carrello.
    if (req.user.tipologia === 'Cliente' && userId !== requestedCartUserId) {
        return res.status(403).json({ message: 'Accesso negato. Non puoi visualizzare il carrello di un altro cliente' });
    }

    try {
        // Query per ottenere gli articoli del carrello e anche i dettagli del prodotto
        const query = `
            SELECT dc.idcliente, dc.idprodotto, dc.quantita, dc.totaleparziale, 
                   p.nome AS nomeprodotto, p.prezzounitario 
            FROM dettaglicarrello dc
            JOIN Prodotto p ON dc.idprodotto = p.idprodotto
            WHERE dc.idcliente = $1 AND p.deleted = FALSE
            ORDER BY p.nome ASC;
        `;
        const result = await pool.query(query, [requestedCartUserId]);
        
        // Anche se il carrello esiste ma tutti i prodotti sono stati eliminati (p.deleted = TRUE),
        // potrebbe restituire un array vuoto. Questo è corretto.
        // Se l'utente non ha mai aggiunto nulla, result.rows sarà vuoto.
        // Non è strettamente un 404 se l'utente esiste ma il carrello è vuoto.
        // Tuttavia, se si vuole un 404 se il carrello è vuoto:
        // if (result.rows.length === 0) {
        //     return res.status(404).json({ message: 'Carrello non trovato o vuoto per l\'utente specificato.' });
        // }

        const cartItems = result.rows;
        let totaleCarrello = 0;

        for (const item of cartItems) {
            // item.totaleparziale is likely a string if it comes from a NUMERIC/DECIMAL DB type.
            //  (in piu js fa cose strane con i numeri)
            totaleCarrello += parseFloat(item.totaleparziale) || 0;
        }

        // Format to 2 decimal places and ensure it's a number in the response.
        res.json({ items: cartItems, totaleCarrello: parseFloat(totaleCarrello.toFixed(2)) });
    } catch (error) { //NOSONAR
        console.error('Errore nel recupero del carrello:', error);
        res.status(500).json({ message: 'Errore del server durante il recupero del carrello.' });
    }
});

// POST /api/carts/items - Aggiunge un prodotto al carrello dell'utente autenticato o ne aggiorna la quantità.

/**
 * * POST /api/carts/items
 * * @description Aggiunge un prodotto al carrello dell'utente autenticato o ne aggiorna la quantità.
 * * Se il prodotto è già presente nel carrello, aggiorna la quantità e il totale parziale.
 * * Se il prodotto non è presente, lo aggiunge come nuovo articolo.
 * * @Access Accessibile solo agli utenti autenticati con permessi di Cliente.
 * *  Input:
 * - Corpo della richiesta (JSON):
 *  - idprodotto: ID del prodotto da aggiungere al carrello (obbligatorio).
 * *  - quantita: Quantità del prodotto da aggiungere al carrello (obbligatorio, deve essere un numero intero positivo).
 * *  Output:
 * - 201 Created: Se il prodotto è stato aggiunto con successo al carrello.
 *  Restituisce l'oggetto dell'articolo aggiunto con i campi:
 * *   - idcliente: ID del cliente
 * *   - idprodotto: ID del prodotto
 * *   - quantita: Quantità dell'articolo nel carrello
 * *   - totaleparziale: Totale parziale per l'articolo (quantità * prezzo unitario)
 * *   - nomeprodotto: Nome del prodotto
 * *   - prezzounitario: Prezzo unitario del prodotto
 * - 400 Bad Request: Se l'ID del prodotto o la quantità non sono validi.
 * - 404 Not Found: Se il prodotto non esiste o non è disponibile (quantitadisponibile <= 0).
 * 
 * - 409 Conflict: Se il prodotto è già presente nel carrello dell'utente.
 *   In questo caso, è obbligatorio (per ora) di usare PUT /api/carts/items/:idprodotto per aggiornare la quantità.
 * 
 * 
 * - 500 Internal Server Error: Se si verifica un errore durante l'aggiunta o l'aggiornamento dell'articolo nel carrello.
 */
router.post('/items', isAuthenticated, hasPermission(['Cliente']), async (req, res) => {
    const idcliente = req.user.idutente;
    const { idprodotto, quantita } = req.body; // 'quantita' is the initial quantity for the new item

    if (!idprodotto || typeof quantita !== 'number' || quantita <= 0 || !Number.isInteger(quantita)) {
        return res.status(400).json({ message: 'ID prodotto e quantità (intera, positiva) sono obbligatori.' });
    }

    try {
        await beginTransaction();

        const productQuery = await pool.query('SELECT nome, prezzounitario, quantitadisponibile FROM Prodotto WHERE idprodotto = $1 AND deleted = FALSE', [idprodotto]);
        if (productQuery.rows.length === 0) {
            await rollbackTransaction();
            return res.status(404).json({ message: 'Prodotto non trovato o non disponibile.' });
        }
        const prodotto = productQuery.rows[0];

        // Check if the item already exists in the cart for this user
        const cartItemQuery = await pool.query('SELECT quantita FROM dettaglicarrello WHERE idcliente = $1 AND idprodotto = $2', [idcliente, idprodotto]);
        if (cartItemQuery.rows.length > 0) {
            await rollbackTransaction();
            return res.status(409).json({ message: 'Articolo già presente nel carrello. Usa PUT /api/carts/items/:idprodotto per aggiornare la quantità.' });
        }
        
        // The 'quantita' from the request is the final quantity for the new item
        const finalQuantita = quantita;

        if (finalQuantita > prodotto.quantitadisponibile) {
            await rollbackTransaction();
            return res.status(400).json({ message: `Stock insufficiente. Disponibili: ${prodotto.quantitadisponibile}, richiesti: ${finalQuantita}` });
        }

        const totaleparziale = parseFloat(prodotto.prezzounitario) * finalQuantita;

        // Simple INSERT as we've already checked for conflicts
        const insertQuery = `
            INSERT INTO dettaglicarrello (idcliente, idprodotto, quantita, totaleparziale)
            VALUES ($1, $2, $3, $4)
            RETURNING *;
        `;
        const result = await pool.query(insertQuery, [idcliente, idprodotto, finalQuantita, totaleparziale]);
        const newDettaglioCart = result.rows[0];

        const responseItem = {
            idcliente: newDettaglioCart.idcliente,
            idprodotto: newDettaglioCart.idprodotto,
            quantita: newDettaglioCart.quantita,
            totaleparziale: newDettaglioCart.totaleparziale,
            nomeprodotto: prodotto.nome, // Aggiunto
            prezzounitario: prodotto.prezzounitario // Aggiunto (già presente in prodotto)
        };

        await commitTransaction();
        res.status(201).json(responseItem);
    } catch (error) { //NOSONAR
        await rollbackTransaction();
        console.error('Errore durante l\'aggiunta/aggiornamento dell\'articolo nel carrello:', error);
        res.status(500).json({ message: 'Errore del server durante l\'operazione sul carrello.' });
    }
});

// PUT /api/carts/items/:idprodotto - Aggiorna la quantità di un prodotto specifico nel carrello dell'utente autenticato.

/**
 * * * PUT /api/carts/items/:idprodotto
 * * @description Aggiorna la quantità di un prodotto specifico nel carrello dell'utente autenticato.
 * * Se la nuova quantità specificata è <= 0, l'articolo viene rimosso dal carrello.
 * * Se la nuova quantità è positiva e maggiore della disponibilità del prodotto, restituisce un errore 400.
 * * @Access Accessibile solo agli utenti autenticati con permessi di Cliente.
 * * Input:
 * - Parametro di percorso `:idprodotto` (ID del prodotto da aggiornare).
 * - Corpo della richiesta (JSON):
 *   - quantita: Nuova quantità del prodotto nel carrello (obbligatorio, deve essere un numero intero).
 *                 Se <= 0, l'articolo verrà rimosso.
 * * Output:
 * - 200 OK: Se la quantità è stata aggiornata con successo o l'articolo è stato rimosso.
 *   Se aggiornato (quantita > 0), restituisce l'oggetto dell'articolo aggiornato con i campi:
 * *   - idcliente: ID del cliente
 * *   - idprodotto: ID del prodotto
 * *   - quantita: Nuova quantità dell'articolo nel carrello
 * *   - totaleparziale: Nuovo totale parziale per l'articolo (quantità * prezzo unitario)
 * *   - nomeprodotto: Nome del prodotto
 * *   - prezzounitario: Prezzo unitario del prodotto
 *   Se rimosso (quantita <= 0), restituisce un messaggio di conferma.
 * - 400 Bad Request: Se l'ID del prodotto non è valido, la quantità non è un numero intero,
 *                    o se la quantità è positiva ma supera lo stock disponibile.
 * - 404 Not Found: Se il prodotto (dal catalogo Prodotti) non esiste o non è disponibile,
 *                    oppure se l'articolo non è presente nel carrello dell'utente
 *                    (e si tenta di aggiornarlo invece di aggiungerlo con POST).
 * - 500 Internal Server Error: Se si verifica un errore durante l'aggiornamento o la rimozione
 *                              dell'articolo nel carrello.
 */
router.put('/items/:idprodotto', isAuthenticated, hasPermission(['Cliente']), async (req, res) => {
    const idcliente = req.user.idutente;
    const idprodotto = parseInt(req.params.idprodotto, 10);
    const { quantita: nuovaQuantita } = req.body;

    if (isNaN(idprodotto)) {
        return res.status(400).json({ message: 'ID prodotto non valido.' });
    }
    if (typeof nuovaQuantita !== 'number' || !Number.isInteger(nuovaQuantita)) {
        return res.status(400).json({ message: 'La quantità deve essere un numero intero.' });
    }

    try {
        await beginTransaction();

        const productQuery = await pool.query('SELECT nome, prezzounitario, quantitadisponibile FROM Prodotto WHERE idprodotto = $1 AND deleted = FALSE', [idprodotto]);
        if (productQuery.rows.length === 0) {
            await rollbackTransaction();
            return res.status(404).json({ message: 'Prodotto non trovato o non disponibile.' });
        }
        const prodotto = productQuery.rows[0];

        // Controlla se l'articolo è nel carrello
        const cartItemCheckQuery = await pool.query('SELECT quantita FROM dettaglicarrello WHERE idcliente = $1 AND idprodotto = $2', [idcliente, idprodotto]);
        if (cartItemCheckQuery.rows.length === 0) {
            await rollbackTransaction();
            return res.status(404).json({ message: 'Articolo non trovato nel carrello. Utilizzare POST /api/carts/items per aggiungere un nuovo articolo.' });
        }

        if (nuovaQuantita <= 0) {
            // Rimuovi l'articolo dal carrello
            await pool.query('DELETE FROM dettaglicarrello WHERE idcliente = $1 AND idprodotto = $2', [idcliente, idprodotto]);
            await commitTransaction();
            return res.status(200).json({ message: 'Articolo rimosso dal carrello poiché la quantità specificata è zero o inferiore.' });
        } else {
            // Aggiorna la quantità dell'articolo
            if (nuovaQuantita > prodotto.quantitadisponibile) {
                await rollbackTransaction();
                return res.status(400).json({ message: `Stock insufficiente. Disponibili: ${prodotto.quantitadisponibile}, richiesti: ${nuovaQuantita}` });
            }

            const totaleparziale = parseFloat(prodotto.prezzounitario) * nuovaQuantita;

            const updateQuery = `
                UPDATE dettaglicarrello 
                SET quantita = $1, totaleparziale = $2 
                WHERE idcliente = $3 AND idprodotto = $4
                RETURNING *;
            `;
            const result = await pool.query(updateQuery, [nuovaQuantita, totaleparziale, idcliente, idprodotto]);

            // Se result.rows[0] non esiste, significa che l'update non ha trovato righe,
            // il che non dovrebbe accadere se cartItemCheckQuery ha trovato l'articolo.
            // Tuttavia, per robustezza, si potrebbe aggiungere un controllo.
            const updatedDettaglioCart = result.rows[0];

            const responseItem = {
                idcliente: updatedDettaglioCart.idcliente,
                idprodotto: updatedDettaglioCart.idprodotto,
                quantita: updatedDettaglioCart.quantita,
                totaleparziale: updatedDettaglioCart.totaleparziale,
                nomeprodotto: prodotto.nome,
                prezzounitario: prodotto.prezzounitario
            };

            await commitTransaction();
            res.json(responseItem);
        }
    } catch (error) { //NOSONAR
        await rollbackTransaction();
        console.error('Errore durante l\'aggiornamento/rimozione dell\'articolo nel carrello:', error);
        res.status(500).json({ message: 'Errore del server durante l\'operazione sul carrello.' });
    }
});

// PUT /api/cart/items/:idprodotto/add - Incrementa la quantità di un prodotto specifico nel carrello.

/**
 * * PUT /api/cart/items/:idprodotto/add
 * * @description Incrementa la quantità di un prodotto specifico nel carrello dell'utente autenticato.
 * * Se il prodotto non esiste nel carrello, restituisce un errore 404.
 * * Se la nuova quantità supera la disponibilità del prodotto, restituisce un errore 400.
 * * @Access Accessibile solo agli utenti autenticati con permessi di Cliente.
 * * Input:
 * - Parametro di percorso `:idprodotto` (ID del prodotto da incrementare).
 * - Corpo della richiesta (JSON):
 *  - quantita: Quantità da aggiungere al prodotto nel carrello (obbligatorio, deve essere un numero intero positivo >0).
 * * * Output:
 * - 200 OK: Se la quantità è stata incrementata con successo.
 *  Restituisce l'oggetto dell'articolo aggiornato con i campi:
 * *   - idcliente: ID del cliente
 * *   - idprodotto: ID del prodotto
 * *   - quantita: Nuova quantità dell'articolo nel carrello
 * *   - totaleparziale: Nuovo totale parziale per l'articolo (quantità * prezzo unitario)
 * *   - nomeprodotto: Nome del prodotto
 * *   - prezzounitario: Prezzo unitario del prodotto
 * - 400 Bad Request: Se l'ID del prodotto o la quantità da aggiungere non sono validi.
 * - 404 Not Found: Se il prodotto non esiste o non è disponibile (quantitadisponibile <= 0) o se l'articolo non è nel carrello.
 *  In questo caso, è obbligatorio (per ora) di usare POST /api/carts/items per aggiungerlo.
 * - 500 Internal Server Error: Se si verifica un errore durante l'incremento della quantità nel carrello.
 */
router.put('/items/:idprodotto/add', isAuthenticated, hasPermission(['Cliente']), async (req, res) => {
    const idcliente = req.user.idutente;
    const idprodotto = parseInt(req.params.idprodotto, 10);
    const { quantita } = req.body;

    if (isNaN(idprodotto)) {
        return res.status(400).json({ message: 'ID prodotto non valido.' });
    }
    if (typeof quantita  !== 'number' || quantita <= 0 || !Number.isInteger(quantita )) {
        return res.status(400).json({ message: 'La quantità da aggiungere deve essere un numero intero positivo.' });
    }

    try {
        await beginTransaction();

        // 1. Controlla l'esistenza e la disponibilità del prodotto
        const productQuery = await pool.query('SELECT nome, prezzounitario, quantitadisponibile FROM Prodotto WHERE idprodotto = $1 AND deleted = FALSE', [idprodotto]);
        if (productQuery.rows.length === 0) {
            await rollbackTransaction();
            return res.status(404).json({ message: 'Prodotto non trovato o non disponibile.' });
        }
        const prodotto = productQuery.rows[0];

        // 2. Controlla se l'articolo è già nel carrello
        const cartItemQuery = await pool.query('SELECT quantita FROM dettaglicarrello WHERE idcliente = $1 AND idprodotto = $2', [idcliente, idprodotto]);
        if (cartItemQuery.rows.length === 0) {
            await rollbackTransaction();
            return res.status(404).json({ message: 'Articolo non trovato nel carrello. Usa POST /api/carts/items per aggiungerlo.' });
        }
        const currentCartQuantity = cartItemQuery.rows[0].quantita;

        // 3. Calcola la nuova quantità e controlla lo stock
        const nuovaQuantita = currentCartQuantity + quantita;
        if (nuovaQuantita > prodotto.quantitadisponibile) {
            await rollbackTransaction();
            return res.status(400).json({ message: `Stock insufficiente. Disponibili: ${prodotto.quantitadisponibile}, richiesti (totale): ${nuovaQuantita}` });
        }

        // 4. Calcola il nuovo totale parziale
        const totaleparziale = parseFloat(prodotto.prezzounitario) * nuovaQuantita;

        // 5. Aggiorna l'articolo nel carrello
        const updateQuery = `
            UPDATE dettaglicarrello 
            SET quantita = $1, totaleparziale = $2 
            WHERE idcliente = $3 AND idprodotto = $4
            RETURNING *;
        `;
        const result = await pool.query(updateQuery, [nuovaQuantita, totaleparziale, idcliente, idprodotto]);

        const updatedDettaglioCart = result.rows[0];
        const responseItem = {
            idcliente: updatedDettaglioCart.idcliente,
            idprodotto: updatedDettaglioCart.idprodotto,
            quantita: updatedDettaglioCart.quantita,
            totaleparziale: updatedDettaglioCart.totaleparziale,
            nomeprodotto: prodotto.nome,
            prezzounitario: prodotto.prezzounitario
        };

        await commitTransaction();
        res.json(responseItem);
    } catch (error) { //NOSONAR
        await rollbackTransaction();
        console.error('Errore durante l\'incremento della quantità nel carrello:', error);
        res.status(500).json({ message: 'Errore del server durante l\'operazione sul carrello.' });
    }
});

// PUT /api/cart/items/:idprodotto/subtract - Decrementa la quantità di un prodotto specifico nel carrello.
// Se la quantità diventa <= 0, l'articolo viene rimosso.

/**
 * * PUT /api/cart/items/:idprodotto/subtract
 * * @description Decrementa la quantità di un prodotto specifico nel carrello dell'utente autenticato.
 * * Se la quantità diventa <= 0, l'articolo viene rimosso dal carrello.
 * * @Access Accessibile solo agli utenti autenticati con permessi di Cliente.
 * * Input:
 * - Parametro di percorso `:idprodotto` (ID del prodotto da decrementare).
 * - Corpo della richiesta (JSON):
 * - quantita: Quantità da sottrarre dal prodotto nel carrello (obbligatorio, deve essere un numero intero positivo >0).
 * * * Output:
 * - 200 OK: Se la quantità è stata decrementata con successo.
 * *   Restituisce l'oggetto dell'articolo aggiornato con i campi:
 * *   - idcliente: ID del cliente
 * *   - idprodotto: ID del prodotto
 * *   - quantita: Nuova quantità dell'articolo nel carrello
 * *   - totaleparziale: Nuovo totale parziale per l'articolo (quantità * prezzo unitario)
 * *   - nomeprodotto: Nome del prodotto
 * *   - prezzounitario: Prezzo unitario del prodotto
 * - 400 Bad Request: Se l'ID del prodotto o la quantità da sottrarre non sono validi.
 * - 404 Not Found: Se il prodotto non esiste o non è disponibile (quantitadisponibile <= 0) o se l'articolo non è nel carrello.
 *  In questo caso, è obbligatorio (per ora) di usare POST /api/carts/items per aggiungerlo.
 * 
 * * - 500 Internal Server Error: Se si verifica un errore durante il decremento della quantità nel carrello.
 */
router.put('/items/:idprodotto/subtract', isAuthenticated, hasPermission(['Cliente']), async (req, res) => {
    const idcliente = req.user.idutente;
    const idprodotto = parseInt(req.params.idprodotto, 10);
    const { quantita  } = req.body;

    if (isNaN(idprodotto)) {
        return res.status(400).json({ message: 'ID prodotto non valido.' });
    }
    if (typeof quantita  !== 'number' || quantita  <= 0 || !Number.isInteger(quantita )) {
        return res.status(400).json({ message: 'La quantità da sottrarre deve essere un numero intero positivo.' });
    }

    try {
        await beginTransaction();

        const productQuery = await pool.query('SELECT nome, prezzounitario FROM Prodotto WHERE idprodotto = $1 AND deleted = FALSE', [idprodotto]);
        if (productQuery.rows.length === 0) {
            await rollbackTransaction();
            // Anche se stiamo sottraendo, il prodotto deve esistere per calcolare il prezzo parziale se non viene eliminato.
            return res.status(404).json({ message: 'Prodotto associato all\'articolo del carrello non trovato o non disponibile.' });
        }
        const prodotto = productQuery.rows[0];

        const cartItemQuery = await pool.query('SELECT quantita FROM dettaglicarrello WHERE idcliente = $1 AND idprodotto = $2', [idcliente, idprodotto]);
        if (cartItemQuery.rows.length === 0) {
            await rollbackTransaction();
            return res.status(404).json({ message: 'Articolo non trovato nel carrello.' });
        }
        const currentCartQuantity = cartItemQuery.rows[0].quantita;

        const nuovaQuantita = currentCartQuantity - quantita ;

        if (nuovaQuantita <= 0) {
            // Rimuovi l'articolo dal carrello
            await pool.query('DELETE FROM dettaglicarrello WHERE idcliente = $1 AND idprodotto = $2', [idcliente, idprodotto]);
            await commitTransaction();
            return res.status(200).json({ message: 'Articolo rimosso dal carrello poiché la quantità è scesa a zero o un valore inferiore.' });
        } else {
            // Aggiorna la quantità e il totale parziale
            const totaleparziale = parseFloat(prodotto.prezzounitario) * nuovaQuantita;
            const updateQuery = `
                UPDATE dettaglicarrello 
                SET quantita = $1, totaleparziale = $2 
                WHERE idcliente = $3 AND idprodotto = $4
                RETURNING *;
            `;
            const result = await pool.query(updateQuery, [nuovaQuantita, totaleparziale, idcliente, idprodotto]);
            const updatedDettaglioCart = result.rows[0];
            const responseItem = {
                idcliente: updatedDettaglioCart.idcliente,
                idprodotto: updatedDettaglioCart.idprodotto,
                quantita: updatedDettaglioCart.quantita,
                totaleparziale: updatedDettaglioCart.totaleparziale,
                nomeprodotto: prodotto.nome,
                prezzounitario: prodotto.prezzounitario
            };

            await commitTransaction();
            res.json(responseItem);
        }
    } catch (error) { //NOSONAR
        await rollbackTransaction();
        console.error('Errore durante il decremento della quantità nel carrello:', error);
        res.status(500).json({ message: 'Errore del server durante l\'operazione sul carrello.' });
    }
});

// DELETE /api/carts/items/:idprodotto - Rimuove un prodotto specifico dal carrello dell'utente autenticato.
/**
 * * * DELETE /api/carts/items/:idprodotto
 * * @description Rimuove un prodotto specifico dal carrello dell'utente autenticato.
 * * Se il prodotto non esiste nel carrello, restituisce un errore 404.
 * * @Access Accessibile solo agli utenti autenticati con permessi di Cliente.
 * * Input:
 * - Parametro di percorso `:idprodotto` (ID del prodotto da rimuovere).
 * * Output:
 * - 200 OK: Se il prodotto è stato rimosso con successo dal carrello.
 *  Restituisce un messaggio di successo.
 * * - 400 Bad Request: Se l'ID del prodotto non è valido.
 * - 404 Not Found: Se il prodotto non esiste nel carrello dell'utente.
 * * - 500 Internal Server Error: Se si verifica un errore durante la rimozione del prodotto dal carrello.
 */
router.delete('/items/:idprodotto', isAuthenticated, hasPermission(['Cliente']), async (req, res) => {
    const idcliente = req.user.idutente;
    const idprodotto = parseInt(req.params.idprodotto, 10);

    if (isNaN(idprodotto)) {
        return res.status(400).json({ message: 'ID prodotto non valido.' });
    }

    try {
        const result = await pool.query('DELETE FROM dettaglicarrello WHERE idcliente = $1 AND idprodotto = $2', [idcliente, idprodotto]);

        if (result.rowCount === 0) {
            // No rows were deleted, meaning the item was not found in the user's cart.
            return res.status(404).json({ message: 'Articolo non trovato nel carrello.' });
        }
        // Item successfully removed.
        res.status(200).json({ message: 'Articolo rimosso dal carrello con successo.' });
    } catch (error) { //NOSONAR
        console.error('Errore durante la rimozione dell\'articolo dal carrello:', error);
        res.status(500).json({ message: 'Errore del server durante la rimozione dal carrello.' });
    }
});

// DELETE /api/carts/clear - Svuota il carrello dell'utente autenticato.

/**
 * * * DELETE /api/carts/clear
 * * @description Svuota il carrello dell'utente autenticato.
 * * Rimuove tutti gli articoli dal carrello dell'utente.
 * * @Access Accessibile solo agli utenti autenticati con permessi di Cliente.
 * * Input:
 * - Nessun input richiesto. (Bearer token per autenticazione)
 * * Output:
 * - 200 OK: Se il carrello è stato svuotato con successo.
 * Restituisce un messaggio di successo.
 * * - 500 Internal Server Error: Se si verifica un errore durante lo svuotamento del carrello.
 * 
 */
router.delete('/clear', isAuthenticated, hasPermission(['Cliente']), async (req, res) => {
    const idcliente = req.user.idutente;
    try {
        await pool.query('DELETE FROM dettaglicarrello WHERE idcliente = $1', [idcliente]);
        res.status(200).json({ message: 'Carrello svuotato con successo.' });
    } catch (error) { //NOSONAR
        console.error('Errore durante lo svuotamento del carrello:', error);
        res.status(500).json({ message: 'Errore del server durante lo svuotamento del carrello.' });
    }
});

module.exports = router;