const express = require('express');
const router = express.Router();
const pool = require('../config/db-connect'); // Assicurati che il percorso sia corretto
const { isAuthenticated, hasPermission } = require('../middleware/authMiddleWare');
const Stripe = require('stripe');

if (!process.env.STRIPE_SECRET_KEY) {
    console.error('FATAL ERROR: STRIPE_SECRET_KEY is not defined.');
    process.exit(1);
}
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

const { createQueryBuilderMiddleware } = require('../middleware/queryBuilderMiddleware');

// Funzioni di aiuto per la gestione delle transazioni
const beginTransaction = async (client) => client.query('BEGIN');
const commitTransaction = async (client) => client.query('COMMIT');
const rollbackTransaction = async (client) => client.query('ROLLBACK');

// Configurazione per il filtraggio e l'ordinamento degli ordini per gli Amministratori
const orderQueryConfig = {
    allowedFilters: [
        { queryParam: 'status', dbColumn: 'o.status', type: 'exact', dataType: 'string' },
        { queryParam: 'deleted', dbColumn: 'o.deleted', type: 'boolean', dataType: 'boolean' },
        { queryParam: 'idutente', dbColumn: 'o.idutente', type: 'exact', dataType: 'integer' },
        { queryParam: 'data_gte', dbColumn: 'o.data', type: 'gte', dataType: 'string' }, // Assumes YYYY-MM-DD
        { queryParam: 'data_lte', dbColumn: 'o.data', type: 'lte', dataType: 'string' }, // Assumes YYYY-MM-DD
        { queryParam: 'nomeutente_like', dbColumn: 'u.username', type: 'like', dataType: 'string' }, // Assumendo YYYY-MM-DD
        { queryParam: 'emailutente_like', dbColumn: 'u.email', type: 'like', dataType: 'string' } // Assumendo YYYY-MM-DD
    ],
    allowedSortFields: ['idordine', 'data', 'ora', 'importototale', 'status', 'nomeutente', 'emailutente', 'deleted'], // Questi dovrebbero corrispondere ad alias o colonne selezionabili direttamente
    defaultSortField: 'data',
    defaultSortOrder: 'DESC',
    // Nessuna baseWhereClause necessaria qui poiché gli Amministratori vedono tutto per impostazione predefinita, i filtri sono additivi.
};

// Configurazione per il filtraggio e l'ordinamento "i miei ordini" del cliente
const clientOrderQueryConfig = {
    allowedFilters: [
        { queryParam: 'status', dbColumn: 'o.status', type: 'exact', dataType: 'string' },
        { queryParam: 'data_gte', dbColumn: 'o.data', type: 'gte', dataType: 'string' }, // Assumendo YYYY-MM-DD
        { queryParam: 'data_lte', dbColumn: 'o.data', type: 'lte', dataType: 'string' }, // Assumendo YYYY-MM-DD
    ],
    allowedSortFields: ['idordine', 'data', 'ora', 'importototale', 'status'],
    defaultSortField: 'data',
    defaultSortOrder: 'DESC',
};

//TODO immagini da recuperare all'endpoint dedicato
// Funzione di aiuto per creare la sessione di checkout di Stripe
const createStripeCheckoutSession = async (orderId, orderItems, customerEmail, expiryDurationSeconds = 30*60) => {
    const line_items = orderItems.map(item => ({
        price_data: {
            currency: 'eur', // Modifica secondo necessità
            product_data: {
                name: item.nomeprodotto,
                // images: [item.immagineUrl], // Opzionale: se hai URL di immagini del prodotto

            },
            unit_amount: Math.round(parseFloat(item.prezzostoricounitario || item.prezzounitario) * 100), // Prezzo in centesimi
        },
        quantity: item.quantita,
    }));

    const expires_at_time= Math.floor(Date.now() / 1000) + expiryDurationSeconds; // Set expiration time in seconds since epoch

    const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card', 'paypal'],
        line_items,
        mode: 'payment',
        customer_email: customerEmail, // Opzionale: precompila il campo email di Stripe
        success_url: `${process.env.FRONTEND_URL}/payment-success?session_id={CHECKOUT_SESSION_ID}&order_id=${orderId}`,
        cancel_url: `${process.env.FRONTEND_URL}/payment-cancelled?order_id=${orderId}`,
        client_reference_id: orderId.toString(), // Collega la sessione Stripe al tuo ID ordine
        metadata: {
            orderId: orderId.toString(),
        },
        expires_at: expires_at_time, // Imposta la scadenza della sessione a 30 minuti
    });
    return session;
};

// GET tutti gli ordini (per admin)
router.get('/',
    isAuthenticated,
    hasPermission(['Admin']),
    createQueryBuilderMiddleware(orderQueryConfig), 
    async (req, res) => {
    try {
        // La parte base della query, i join sono essenziali per filtrare/ordinare sui campi utente
        const queryText = `
            SELECT o.idordine, o.idutente, o.data, o.ora, o.importototale, o.status, o.deleted,
                   u.username AS nomeutente, u.email AS emailutente, u.indirizzo AS indirizzospedizione
            FROM Ordine o
            JOIN Utente u ON o.idutente = u.idutente
            ${req.sqlWhereClause} 
            ${req.sqlOrderByClause}
        `; // LIMIT e OFFSET per la paginazione possono essere aggiunti qui se necessario

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
                // indirizzospedizione è già parte di 'order' grazie al SELECT
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

// GET /api/orders/my-orders - Per i clienti per recuperare i propri ordini con filtro
router.get('/my-orders',
    isAuthenticated,
    hasPermission(['Cliente']),
    createQueryBuilderMiddleware(clientOrderQueryConfig),
    async (req, res) => {
        const idcliente = req.user.idutente;
        
        // Condizioni base per recuperare gli ordini propri del cliente, non eliminati
        let whereConditions = [`o.idutente = $1`, `o.deleted = FALSE`];
        let queryValues = [idcliente];
        let placeholderOffset = 1; // Numero attuale di placeholder usati dalle condizioni base

        // Integra i filtri da queryBuilderMiddleware
        if (req.sqlWhereClause && req.sqlWhereClause.trim() !== '') {
            let middlewareWhere = req.sqlWhereClause.replace(/^WHERE\s*/i, '').trim(); // Rimuovi 'WHERE' se presente
            if (middlewareWhere) {
                // Rinumera i placeholder dal middleware per seguire i placeholder delle nostre condizioni base
                middlewareWhere = middlewareWhere.replace(/\$(\d+)/g, (match, n) => `\$${parseInt(n) + placeholderOffset}`);
                whereConditions.push(`(${middlewareWhere})`); // Racchiudi le condizioni del middleware tra parentesi
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
            `; // LIMIT e OFFSET per la paginazione possono essere aggiunti qui

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

        // L'admin può vedere qualsiasi ordine. Il cliente può vedere solo i propri ordini (non eliminati).
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
                // indirizzospedizione è già parte di 'order' grazie al SELECT
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
 * @route POST /api/orders/create
 * @description Crea un nuovo ordine, controlla lo stock, riserva gli articoli e svuota il carrello.
 *              Imposta una scadenza di 15 minuti per la prenotazione.
 * @access Cliente
 */
router.post('/reserve-and-create-checkout-session', isAuthenticated, hasPermission(['Cliente']), async (req, res) =>{
    const idcliente = req.user.idutente;
    // L'indirizzo di spedizione verrà recuperato esclusivamente dal database.
    let indirizzoSpedizione; 
    // const { indirizzospedizione } = req.body; // Se si volesse permettere di sovrascrivere l'indirizzo
    // const finalIndirizzoSpedizione = indirizzospedizione || indirizzospedizioneDefault;

    
    // Prima di procedere, conFtrolla se l'utente ha già un ordine in stato 'In attesa'.
    try {
        const existingPendingOrderQuery = await pool.query(
            `SELECT idordine, data, ora, importototale, status, stripecheckoutsessionid 
             FROM Ordine 
             WHERE idutente = $1 AND Status = 'In attesa' AND deleted = FALSE`,
            [idcliente]
        );

        if (existingPendingOrderQuery.rows.length > 0) {
            const pendingOrder = existingPendingOrderQuery.rows[0];
            let stripeSessionUrl = null;
            let userMessage = `Hai già un ordine (ID: ${pendingOrder.idordine}) in attesa di pagamento.`;

            if (pendingOrder.stripecheckoutsessionid) {
                try {
                    console.log(`[Order Checkout] User ${idcliente} has pending order ${pendingOrder.idordine} with Stripe session ID ${pendingOrder.stripecheckoutsessionid}. Verifying session...`);
                    const existingStripeSession = await stripe.checkout.sessions.retrieve(pendingOrder.stripecheckoutsessionid);
                    if (existingStripeSession && existingStripeSession.status === 'open') {
                        stripeSessionUrl = existingStripeSession.url;
                        userMessage += ` Puoi completare il pagamento usando il link fornito, oppure annullarlo all'endpoint /api/orders/${pendingOrder.idordine}/cancel.`;
                        console.log(`[Order Checkout] Existing Stripe session ${pendingOrder.stripecheckoutsessionid} for order ${pendingOrder.idordine} is 'open'. URL: ${stripeSessionUrl}`);
                    } else {
                        console.log(`[Order Checkout] Existing Stripe session ${pendingOrder.stripecheckoutsessionid} for order ${pendingOrder.idordine} is not 'open' (status: ${existingStripeSession ? existingStripeSession.status : 'not found'}). Will attempt to create a new one.`);
                    }
                } catch (stripeError) {
                    console.warn(`[Order Checkout] Error retrieving existing Stripe session ${pendingOrder.stripecheckoutsessionid} for order ${pendingOrder.idordine}: ${stripeError.message}. Will attempt to create a new one.`);
                }
            } else {
                console.log(`[Order Checkout] User ${idcliente} has pending order ${pendingOrder.idordine} but no Stripe session ID stored. Will attempt to create one.`);
            }

            if (!stripeSessionUrl) { // Se non c'è un URL di sessione esistente valido, creane uno nuovo per questo ordine in sospeso
                try {
                    console.log(`[Order Checkout] Attempting to create a new Stripe session for existing pending order ${pendingOrder.idordine}.`);
                    const pendingOrderDetailsQuery = await pool.query(
                        `SELECT dor.idprodotto, dor.quantita, dor.prezzostoricounitario, p.nome AS nomeprodotto
                         FROM DettagliOrdine dor
                         JOIN Prodotto p ON dor.idprodotto = p.idprodotto
                         WHERE dor.idordine = $1`,
                        [pendingOrder.idordine]
                    );
                    const pendingOrderItems = pendingOrderDetailsQuery.rows;

                    if (pendingOrderItems.length === 0) {
                        console.error(`[Order Checkout] Pending order ${pendingOrder.idordine} found but has no items. Cannot create Stripe session.`);
                        userMessage += ` Tuttavia, non è stato possibile generare un link di pagamento per questo ordine. Si prega di annullare questo ordine e crearne uno nuovo.`;
                    } else {
                        const userEmailQuery = await pool.query('SELECT email FROM Utente WHERE idutente = $1', [idcliente]);
                        const customerEmail = userEmailQuery.rows.length > 0 ? userEmailQuery.rows[0].email : null;

                        const newStripeSession = await createStripeCheckoutSession(pendingOrder.idordine, pendingOrderItems, customerEmail, 30 * 60);
                        await pool.query(
                            'UPDATE Ordine SET StripeCheckOutSessionID = $1 WHERE idordine = $2',
                            [newStripeSession.id, pendingOrder.idordine]
                        );
                        stripeSessionUrl = newStripeSession.url;
                        userMessage = `Hai già un ordine (ID: ${pendingOrder.idordine}) in attesa di pagamento. Se il link precedente non fosse valido, ne è stato generato uno aggiornato per completare il pagamento.`;
                        console.log(`[Order Checkout] New Stripe session ${newStripeSession.id} created and stored for existing pending order ${pendingOrder.idordine}. URL: ${stripeSessionUrl}`);
                    }
                } catch (newSessionError) {
                    console.error(`[Order Checkout] Failed to create a new Stripe session for pending order ${pendingOrder.idordine}:`, newSessionError);
                    userMessage = `Hai già un ordine (ID: ${pendingOrder.idordine}) in attesa di pagamento. Non è stato possibile generare un nuovo link di pagamento a causa di un errore. Si prega di provare ad annullare questo ordine e crearne uno nuovo, o attendere la sua scadenza.`;
                }
            }

            return res.status(409).json({ // 409 Conflitto
                message: userMessage,
                orderId: pendingOrder.idordine,
                existingOrder: true,
                stripeSessionUrl: stripeSessionUrl,
            });
        }
    } catch (error) {
        console.error('Errore durante la verifica di ordini in attesa di pagamento esistenti:', error);
        // È importante rilasciare il client se è stato acquisito, ma qui usiamo pool.query direttamente.
        return res.status(500).json({ message: 'Errore del server durante la verifica degli ordini in attesa di pagamento. Riprova.' });
    }


    //In questo ramo, l'utente non ha ordini in attesa, quindi possiamo procedere con la creazione di un nuovo ordine.

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
            // client.release(); // Rimosso: Il blocco finally gestirà questo.
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
             RETURNING idordine, Data, Ora, Status, ImportoTotale`, // Lo stato sarà 'In attesa'
            [idcliente, totaleOrdine, 'In attesa']
        );
        const newOrder = insertOrderQuery.rows[0];

        // --- Inizio del timer di prenotazione di 30 minuti per questo ordine specifico ---
        const orderIdForTimeout = newOrder.idordine;
        const reservationTimeoutMS = 30 * 60 * 1000; // 30 minuti in millisecondi

        console.log(`[Order Reservation] Order ID: ${orderIdForTimeout} - Scheduling 30-minute reservation expiry check.`);

        //Parte cancellata del todo
        //TODO parziale, si puo fare con cron-job periodoci (5 min) controllando gli ordini scaduti, e restockandoli
        setTimeout(async () => {
            const timeoutClient = await pool.connect(); // Ottieni un nuovo client per questa attività isolata
            try {
                console.log(`[Order Expiry Check] Order ID: ${orderIdForTimeout} - 30-minute timer expired. Checking status.`);
                await beginTransaction(timeoutClient);

                // Controlla lo stato corrente dell'ordine, bloccando la riga per l'aggiornamento
                const orderStatusQuery = await timeoutClient.query(
                    'SELECT Status, deleted FROM Ordine WHERE idordine = $1 FOR UPDATE', // Aggiungi 'deleted'
                    [orderIdForTimeout]
                );

                if (orderStatusQuery.rows.length === 0) {
                    console.log(`[Order Expiry Check] Order ID: ${orderIdForTimeout} - Order not found (possibly deleted). No action.`);
                    await rollbackTransaction(timeoutClient); // Rollback per precauzione
                    // Non rilasciare il client qui, il finally lo farà
                    return;
                }

                const currentOrderData = orderStatusQuery.rows[0];
                const currentStatus = currentOrderData.status;
                const isDeleted = currentOrderData.deleted;

                if (isDeleted) {
                    console.log(`[Order Expiry Check] Order ID: ${orderIdForTimeout} - Order is marked as soft-deleted. No stock rollback action from timeout.`);
                    await commitTransaction(timeoutClient); // Commit per rilasciare il blocco
                    return;
                }

                if (currentStatus === 'In attesa') { // Procedi solo se non eliminato temporaneamente e ancora 'In attesa'
                    console.log(`[Order Expiry Check] Order ID: ${orderIdForTimeout} - Status is 'In attesa' and not deleted. Rolling back stock.`);

                    // Recupera StripeCheckOutSessionID insieme ai dettagli dell'ordine
                    const orderDataForExpiry = await timeoutClient.query( //NOSONAR
                        'SELECT StripeCheckOutSessionID FROM Ordine WHERE idordine = $1',
                        [orderIdForTimeout]
                    );
                    const stripeSessionIdToExpire = orderDataForExpiry.rows[0]?.stripecheckoutsessionid; // Nota: il driver pg restituisce minuscolo
                    const orderDetailsQuery = await timeoutClient.query( //NOSONAR
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
                        "UPDATE Ordine SET Status = 'Scaduto' WHERE idordine = $1 AND Status = 'In attesa' AND deleted = FALSE", // Assicurati di non aggiornare se eliminato temporaneamente
                        [orderIdForTimeout]
                    );
                    console.log(`[Order Expiry Check] Order ID: ${orderIdForTimeout} - Stock rolled back, status set to 'Scaduto'.`);
                    
                    if (stripeSessionIdToExpire) {
                        try {
                            console.log(`[Order Expiry Check] Attempting to expire Stripe session ${stripeSessionIdToExpire} for order ${orderIdForTimeout}`);
                            await stripe.checkout.sessions.expire(stripeSessionIdToExpire);
                            console.log(`[Order Expiry Check] Stripe session ${stripeSessionIdToExpire} expired successfully.`);
                        } catch (stripeError) {
                            console.warn(`[Order Expiry Check] Could not expire Stripe session ${stripeSessionIdToExpire} for order ${orderIdForTimeout}: ${stripeError.message}. It might have already been paid or expired.`);
                        }
                    }
                    await commitTransaction(timeoutClient);
                } else {
                    console.log(`[Order Expiry Check] Order ID: ${orderIdForTimeout} - Status is '${currentStatus}'. No stock rollback needed.`);
                    await commitTransaction(timeoutClient); // Commit per rilasciare il blocco, anche se non ci sono modifiche
                }
            } catch (error) {
                console.error(`[Order Expiry Check] Order ID: ${orderIdForTimeout} - Error during processing:`, error);
                if (timeoutClient) await rollbackTransaction(timeoutClient);
            } finally {
                if (timeoutClient) timeoutClient.release();
            }
        }, reservationTimeoutMS);
        // --- Fine del timer di prenotazione di 30 minuti ---
    


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

        // Recupera l'email del cliente per Stripe
        const userEmailQuery = await pool.query('SELECT email FROM Utente WHERE idutente = $1', [idcliente]); // Usa direttamente il pool o lo stesso client
        const customerEmail = userEmailQuery.rows.length > 0 ? userEmailQuery.rows[0].email : null;

        // Create Stripe Checkout Session for the NEW order with 30-minute expiry
        const stripeSession = await createStripeCheckoutSession(newOrder.idordine, itemsForOrderDetails, customerEmail, 30 * 60); // 30 minutes
        
        // Memorizza l'ID della sessione Stripe con l'ordine
        await client.query(
            'UPDATE Ordine SET StripeCheckOutSessionID = $1 WHERE idordine = $2',
            [stripeSession.id, newOrder.idordine]
        );
        await commitTransaction(client);

        res.status(201).json({
            message: 'Ordine creato e articoli riservati con successo. Hai 30 minuti per completare il pagamento.',
            ordine: {
                idordine: newOrder.idordine,
                dataOrdine: newOrder.data,
                oraOrdine: newOrder.ora,
                status: newOrder.status,
                importoTotale: parseFloat(newOrder.importototale).toFixed(2)
            },
            existingOrder: false,
            stripeSessionId: stripeSession.id,
            stripeSessionUrl: stripeSession.url
        });


    } catch (error) {
        await rollbackTransaction(client);
        console.error('Errore durante la creazione dell\'ordine e la prenotazione degli articoli:', error);
        res.status(500).json({ message: 'Errore del server durante la creazione dell\'ordine.' });
    } finally {
        client.release(); // Rilascia il client al pool
    }
});


/**
 * @route POST /api/orders/:id/cancel
 * @description Cancels a pending order for the authenticated client.
 *              Restocks items and sets order status to 'Scaduto'.
 * @access Cliente
 */
router.post('/:id/cancel', isAuthenticated, hasPermission(['Cliente']), async (req, res) => {
    const orderId = parseInt(req.params.id, 10);
    const idcliente = req.user.idutente;

    if (isNaN(orderId)) {
        return res.status(400).json({ message: 'ID ordine non valido.' });
    }

    const client = await pool.connect();
    try {
        await beginTransaction(client);

        // 1. Recupera l'ordine, verifica la proprietà e lo stato (deve essere 'In attesa')
        const orderQuery = await client.query(
            'SELECT idordine, idutente, status,stripecheckoutsessionid FROM Ordine WHERE idordine = $1 AND deleted = FALSE FOR UPDATE',
            [orderId]
        );

        if (orderQuery.rows.length === 0) {
            await rollbackTransaction(client);
            return res.status(404).json({ message: 'Ordine non trovato.' });
        }
        const order = orderQuery.rows[0];

        const stripeSessionIdToCancel = order.stripecheckoutsessionid; // Nota: il driver pg restituisce minuscolo

        if (order.idutente !== idcliente) {
            await rollbackTransaction(client);
            return res.status(403).json({ message: 'Accesso negato. Non puoi cancellare questo ordine.' });
        }

        if (order.status !== 'In attesa') {
            await rollbackTransaction(client);
            return res.status(400).json({ message: `Impossibile cancellare l'ordine. Stato attuale: ${order.status}. (Deve essere 'In attesa')` });
        }

        // 2. Recupera i dettagli dell'ordine per rifornire
        const orderDetailsQuery = await client.query(
            `SELECT idprodotto, quantita FROM DettagliOrdine WHERE idordine = $1`,
            [orderId]
        );

        // 3. Rifornisci gli articoli
        for (const item of orderDetailsQuery.rows) {
            await client.query(
                'UPDATE Prodotto SET quantitadisponibile = quantitadisponibile + $1 WHERE idprodotto = $2',
                [item.quantita, item.idprodotto]
            );
        }

        // 4. Aggiorna lo stato dell'ordine a 'Scaduto'
        await client.query("UPDATE Ordine SET Status = 'Scaduto' WHERE idordine = $1", [orderId]);

        console.log(`[Order Cancel] Order ID ${orderId} status set to 'Scaduto'.`);

        if (stripeSessionIdToCancel) {
            try {
                console.log(`[Order Cancel] Attempting to expire Stripe session ${stripeSessionIdToCancel} for order ${orderId}`);
                await stripe.checkout.sessions.expire(stripeSessionIdToCancel);
                console.log(`[Order Cancel] Stripe session ${stripeSessionIdToCancel} expired successfully.`);
            } catch (stripeError) {
                // Va bene se fallisce, ad es. se la sessione è già scaduta o pagata. Registralo.
                console.warn(`[Order Cancel] Could not expire Stripe session ${stripeSessionIdToCancel} for order ${orderId}: ${stripeError.message}. It might have already been paid or expired.`);
            }
        }
        
        await commitTransaction(client);
        res.status(200).json({ message: `Ordine ID ${orderId} annullato con successo (Status=Scaduto) e articoli riassortiti.` });

    } catch (error) {
        if (client) await rollbackTransaction(client);
        console.error(`Errore durante l'annullamento dell'ordine ID ${orderId}:`, error);
        res.status(500).json({ message: 'Errore del server durante l\'annullamento dell\'ordine.' });
    } finally {
        if (client) client.release();
    }
});

// DELETE (Eliminazione temporanea) un ordine per ID - Solo Admin
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

        // Effettua l'eliminazione temporanea
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

1. Gestione Pagamenti (es. in `paymentRoutes.js`):
    * Un endpoint per processare il pagamento per un `idordine`.
    * Se il pagamento ha successo: aggiorna `Ordine.Status` (es. a 'Pagato', 'In Lavorazione').
      Il `setTimeout` per la scadenza della prenotazione (se ancora attivo) controllerà lo stato
      e non procederà con il rollback se l'ordine non è più 'In attesa'.

2. Processo in Background per Prenotazioni Scadute:
    * Al momento della creazione dell'ordine, viene avviato un `setTimeout` di 15 minuti specifico per quell'ordine.
    * Se il server si riavvia, questi `setTimeout` in memoria vengono persi.
    * **RACCOMANDAZIONE FORTE**: Implementare un meccanismo di fallback (es. un cron job o un loop `setTimeout` in `server.js`
      che gira periodicamente, ad esempio ogni minuto) per gestire gli ordini che potrebbero essere "orfani"
      a causa di un riavvio del server. Questo job di fallback userebbe la logica "pure-Postgres":
      a. Determina le prenotazioni scadute (ordini 'In attesa' più vecchi di 15 minuti) usando la query:
         `SELECT idordine FROM Ordine WHERE Status = 'In attesa' AND (Data + Ora + INTERVAL '15 minutes') < NOW();`
      b. Per ciascun ordine scaduto:
         i. In una transazione, recupera i `DettagliOrdine` per quell'ordine.
         ii. Ripristina `Prodotto.quantitadisponibile` per ciascun articolo.
         iii.Aggiorna `Ordine.Status` a 'Scaduto' (o simile).
    * Questo approccio combinato (setTimeout per reattività immediata + job di fallback per robustezza)
      offre un buon compromesso.
*/