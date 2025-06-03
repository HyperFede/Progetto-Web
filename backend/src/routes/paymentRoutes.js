const express = require('express');
const router = express.Router();
const { isAuthenticated, hasPermission } = require('../middleware/authMiddleWare.js'); // Import isAuthenticated and hasPermission
const pool = require('../config/db-connect'); // Assicurati che il percorso sia corretto
const Stripe = require('stripe');

if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_WEBHOOK_SECRET) {
    console.error('FATAL ERROR: Stripe environment variables (secret key or webhook secret) are not defined.');
    process.exit(1);
}
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

// Funzioni di aiuto per la gestione delle transazioni (se non già in un modulo condiviso)
const beginTransaction = async (client) => client.query('BEGIN');
const commitTransaction = async (client) => client.query('COMMIT');
const rollbackTransaction = async (client) => client.query('ROLLBACK');

/**
 * Helper function to create SubOrdine records for each artisan involved in an order.
 * This is called after a payment is successfully verified and recorded.
 * @param {number} orderId - The ID of the main order.
 *@param {object} client - The database client to use for the transaction.
*/
 const createSubOrdiniForOrder = async (orderId,client) => {
    try {
        const insertSubOrdiniQuery = `
            INSERT INTO SubOrdine (IDOrdine, IDArtigiano, SubOrdineStatus) 
            SELECT DISTINCT
                $1::INTEGER,      -- IDOrdine
                p.IDArtigiano,'Da spedire'
            FROM
                DettagliOrdine dor
            JOIN
                Prodotto p ON dor.IDProdotto = p.IDProdotto
            WHERE
                dor.IDOrdine = $1::INTEGER
            ON CONFLICT (IDOrdine, IDArtigiano) DO NOTHING; 
        `;
        // SubOrdineStatus will use 'Da spedire'
        await client.query(insertSubOrdiniQuery, [orderId]);
        console.log(`[Verify Session] SubOrdini created/ensured for order ${orderId}. con status = 'Da spedire'`);
    } catch (error) {
        console.error(`[Verify Session] Error creating SubOrdini for order ${orderId}: ${error.message}`, error.stack);
        throw error; // Re-throw to be caught by the calling transaction block
    }
};
// POST per processare un pagamento per un ordine
// router.post('/process', async (req, res) => {
//     // Questo endpoint potrebbe essere deprecato se la Stripe Checkout Session viene creata direttamente da orderRoutes
//     const { orderId, paymentMethodDetails } = req.body;
//     res.status(501).send(`POST /api/payments/process - Not Implemented. Checkout initiated from order routes.`);
// });

// Gestore webhook Stripe (Approccio standard)
// Usa il middleware express.raw per questa rotta specifica per ottenere il corpo grezzo per la verifica della firma

//TODO DA FARE SOLO CON DOCKER E STRIPE CLI in caso
/*
router.post('/webhook', express.raw({type: 'application/json'}), async (req, res) => {
    const sig = req.headers['stripe-signature'];
    let event;

    try {
        event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } catch (err) {
        console.error(`Webhook signature verification failed: ${err.message}`);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // Gestisci l'evento
    switch (event.type) {
        case 'checkout.session.completed':
            const session = event.data.object;
            console.log(`Received checkout.session.completed for session ID: ${session.id}`);

            const orderId = parseInt(session.client_reference_id || session.metadata.orderId, 10);
            const paymentIntentId = session.payment_intent;
            const amountTotal = session.amount_total / 100; // Riconverti da centesimi
            const currency = session.currency;
            const paymentStatus = session.payment_status; // es. 'paid'

            if (isNaN(orderId)) {
                console.error('Webhook Error: Invalid orderId from Stripe session.', session);
                return res.status(400).json({ error: 'Invalid orderId in webhook payload.' });
            }

            if (paymentStatus === 'paid') {
                const client = await pool.connect();
                try {
                    await beginTransaction(client);

                    // 1. Aggiorna lo stato dell'Ordine
                    const orderUpdateResult = await client.query(
                        `UPDATE Ordine SET Status = $1 WHERE idordine = $2 AND (Status = 'In attesa' OR Status = 'Pagamento fallito') RETURNING idordine, status`,
                        ['Pagato', orderId] // O 'In Lavorazione'
                    );

                    if (orderUpdateResult.rowCount === 0) {
                        console.warn(`Webhook: Order ${orderId} not found or not in a state to be updated to 'Pagato'. Current session: ${session.id}`);
                        // È possibile che l'ordine sia già stato processato da un webhook precedente, o che lo stato sia cambiato manualmente.
                        // Se è già 'Pagato', va bene. Se non trovato, è un problema.
                        // Considera di interrogare lo stato attuale per decidere se è un errore o se è già stato gestito.
                    } else {
                         console.log(`Webhook: Order ${orderId} status updated to 'Pagato'.`);
                    }

                    // 2. Crea un record di Pagamento (assumendo che esista una tabella 'Pagamento')
                    // Schema di esempio: idpagamento SERIAL, idordine INT, idtransazionestripe TEXT, importo NUMERIC, valuta TEXT, status TEXT, data TIMESTAMP
                    await client.query(
                        `INSERT INTO Pagamento (IDOrdine, StripePaymentIntentID, ImportoTotale, Valuta, StripeStatus, Modalita)
                         VALUES ($1, $2, $3, $4, $5, $6)
                         ON CONFLICT (StripePaymentIntentID) DO NOTHING`, // Usa il nome della colonna SQL per il target del conflitto
                        [orderId, paymentIntentId, amountTotal, currency.toUpperCase(), 'succeeded', session.payment_method_types ? session.payment_method_types.join(', ') : 'card'] // Corrisponde alle colonne SQL
                    );
                    console.log(`Webhook: Payment record created for order ${orderId}, Stripe PI: ${paymentIntentId}`);

                    await commitTransaction(client);
                } catch (dbError) {
                    await rollbackTransaction(client);
                    console.error(`Webhook DB Error for order ${orderId}, session ${session.id}: ${dbError.message}`, dbError.stack);
                    // Rispondi con 500 per segnalare a Stripe di riprovare (se applicabile per il tipo di errore)
                    return res.status(500).json({ error: 'Database processing error.' });
                } finally {
                    client.release();
                }
            } else {
                console.log(`Webhook: Checkout session ${session.id} for order ${orderId} completed but payment_status is '${paymentStatus}'. No action taken to mark as paid.`);
                // Potresti voler aggiornare lo stato dell'ordine a 'Pagamento fallito' qui
            }
            break;
        // ... gestisci altri tipi di evento
        default:
            console.log(`Unhandled event type ${event.type}`);
    }

    // Restituisci una risposta 200 per confermare la ricezione dell'evento
    res.status(200).json({ received: true });
});
*/
// POST per verificare una sessione di pagamento Stripe dopo il reindirizzamento
// Responsabilità del client: quando l'utente viene reindirizzato a questa rotta, deve inviare il sessionId della sessione pagata.
// Aggiorna lo stato dell'ordine e registra il pagamento nel database.

//Non testato su pagamento fallito (impossibile ottenerlo)
//Testato su ordine scaduto/in attesa


router.post('/verify-session', isAuthenticated, hasPermission(['Cliente']), async (req, res) => {
    const { sessionid: actualPaidSessionId } = req.body;
    if (!actualPaidSessionId) {
        return res.status(400).json({ error: 'Session ID is required.' });
    }

    try {
        // 1. Recupera la sessione effettivamente pagata da Stripe usando l'ID della sessione dal reindirizzamento di Stripe
        const stripeSession = await stripe.checkout.sessions.retrieve(actualPaidSessionId);

        if (!stripeSession) { // Non dovrebbe idealmente essere raggiunto se Stripe ha reindirizzato con successo
            return res.status(404).json({ error: 'Checkout Session not found on Stripe.' });
        }

        // 2. Estrai orderId da QUESTO oggetto sessione Stripe (quello che è stato pagato)
        const orderIdFromPaidSession = parseInt(stripeSession.client_reference_id || stripeSession.metadata.orderId, 10);

        if (isNaN(orderIdFromPaidSession)) {
            console.error('Verify Session Error: Invalid orderId from the paid Stripe session object.', stripeSession);
            return res.status(400).json({ error: 'Invalid orderId in paid Stripe session data.' });
        }

        const finalOrderId = orderIdFromPaidSession; // Questo è l'ID ordine definitivo per le operazioni DB.
        console.log(`[Verify Session] Processing order ID ${finalOrderId} from Stripe session ${actualPaidSessionId}.`);

        // 4. Recupera l'ordine dal DB usando finalOrderId.
        //    Questo permette di controllare il suo stato attuale, il proprietario e il suo StripeCheckoutSessionID memorizzato.
        const orderQuery = await pool.query(
            'SELECT IDUtente, StripeCheckOutSessionID, Status FROM Ordine WHERE idordine = $1', 
            [finalOrderId]
        );
        if (orderQuery.rows.length === 0) {
            console.error(`Verify Session Error: Order ${finalOrderId} (from paid session) not found in DB. Paid session: ${actualPaidSessionId}.`);
            // Questo implica che un ordine associato a un pagamento riuscito non esiste nel nostro sistema, il che è un problema critico.
            return res.status(404).json({ error: `Order ${finalOrderId} associated with the payment was not found in our system.` });
        }
        const dbOrder = orderQuery.rows[0];

        // At this point, hasPermission(['Cliente']) has already ensured req.user.tipologia is 'Cliente'.
        // The following check ensures the 'Cliente' owns this specific order.
        // Authorization: Check if the order belongs to the authenticated user
        if (req.user.idutente !== dbOrder.idutente) {
            console.warn(`[Verify Session] AuthZ failed: User ${req.user.idutente} attempted to verify session ${actualPaidSessionId} for order ${finalOrderId} owned by user ${dbOrder.idutente}.`);
            return res.status(403).json({ error: 'Access denied. You do not have permission to verify this payment session.' });
        }

        // Informativo: Registra se l'ID sessione memorizzato nel DB differisce da quello appena pagato.
        // Questo va bene se è stata creata una nuova sessione per un ordine in sospeso, e una più vecchia è stata usata per il pagamento.
        // L'actualPaidSessionId è quello che conta per l'elaborazione.
        if (dbOrder.stripecheckoutsessionid && dbOrder.stripecheckoutsessionid !== actualPaidSessionId) {
            console.warn(`Verify Session Info: For order ${finalOrderId}, the paid session was ${actualPaidSessionId}, but DB had ${dbOrder.stripecheckoutsessionid} stored. Processing based on the actually paid session.`);
        }

        const paymentIntentId = stripeSession.payment_intent;
        const amountTotal = stripeSession.amount_total / 100; // Riconverti da centesimi
        const currency = stripeSession.currency;
        const paymentStatus = stripeSession.payment_status; // es. 'paid'

        if (paymentStatus === 'paid') {
            const pgClient = await pool.connect(); // Rinominato per evitare conflitti
            try {
                await beginTransaction(pgClient);

                // 1. Aggiorna lo stato dell'Ordine
                const orderUpdateResult = await pgClient.query(
                    `UPDATE Ordine SET Status = $1 WHERE idordine = $2 AND (Status = 'In attesa' OR Status = 'Pagamento fallito') RETURNING idordine, status`,
                    ['Da spedire', finalOrderId]
                );

                if (orderUpdateResult.rowCount === 0) {
                    // Check current status to see if it's already paid
                    // const currentOrderQuery = await pgClient.query('SELECT status FROM Ordine WHERE idordine = $1', [finalOrderId]); // Abbiamo già dbOrder.status
                    if (['Da spedire', 'In Lavorazione', 'Pagato', 'Spedito', 'Consegnato'].includes(dbOrder.status)) {
                        console.log(`Verify Session: Order ${finalOrderId} already in a processed state ('${dbOrder.status}'). No status update needed from this verification for session ${actualPaidSessionId}.`);
                    } else {
                        console.warn(`Verify Session: Order ${finalOrderId} (paid via session ${actualPaidSessionId}) was not updated. Current DB status: '${dbOrder.status}'. It might not have been 'In attesa' or 'Pagamento fallito'.`);
                    }
                } else {
                     console.log(`Verify Session: Order ${finalOrderId} status updated to 'Da spedire' from paid session ${actualPaidSessionId}.`);
                }

                                // Determine the actual payment method used
                let actualPaymentMethodType = 'unknown'; // Default
                if (paymentIntentId) {
                    try {
                        const paymentIntent = await stripe.paymentIntents.retrieve(
                            paymentIntentId,
                            { expand: ['payment_method'] } // Expand the payment_method object
                        );
                        if (paymentIntent.payment_method && paymentIntent.payment_method.type) {
                            actualPaymentMethodType = paymentIntent.payment_method.type;
                        } else {
                            console.warn(`[Verify Session] Could not determine specific payment method type from expanded payment_method for PI: ${paymentIntentId}. Using default '${actualPaymentMethodType}'.`);
                        }
                    } catch (piError) {
                        console.error(`[Verify Session] Error retrieving PaymentIntent ${paymentIntentId} to determine payment method: ${piError.message}. Using default '${actualPaymentMethodType}'.`);
                    }
                } else {
                    console.error(`[Verify Session] CRITICAL: Stripe session ${actualPaidSessionId} is 'paid' but has no payment_intent ID. Modalita will be '${actualPaymentMethodType}'.`);
                }

                // 2. Crea un record di Pagamento
                await pgClient.query(
                    `INSERT INTO Pagamento (IDOrdine, StripePaymentIntentID, ImportoTotale, Valuta, StripeStatus, Modalita)
                     VALUES ($1, $2, $3, $4, $5, $6)
                     ON CONFLICT (StripePaymentIntentID) DO NOTHING`, // Assumendo che StripePaymentIntentID sia unico
                    [finalOrderId, paymentIntentId, amountTotal, currency.toUpperCase(), 'succeeded', actualPaymentMethodType]
                );
                console.log(`Verify Session: Payment record created/ensured for order ${finalOrderId} (Stripe PI: ${paymentIntentId}) from paid session ${actualPaidSessionId}.`);

                //3. Crea SubOrdini per ogni artigiano coinvolto nell'ordine
                await createSubOrdiniForOrder(finalOrderId,pgClient);

                await commitTransaction(pgClient);
                res.status(200).json({ success: true, message: 'Payment verified and order updated.', orderStatus: 'Da spedire', paymentStatus: stripeSession.payment_status });
            } catch (dbError) {
                await rollbackTransaction(pgClient);
                console.error(`Verify Session DB Error for order ${finalOrderId} (paid session ${actualPaidSessionId}): ${dbError.message}`, dbError.stack);
                res.status(500).json({ error: 'Database processing error.' });
            } finally {
                pgClient.release();
            }8
        } else {
            console.log(`Verify Session: Paid session ${actualPaidSessionId} for order ${finalOrderId} has payment_status '${paymentStatus}'. This is unexpected for a success redirect.`);
            let updatedOrderStatus = dbOrder.status;
            // Se la sessione è 'complete' ma payment_status è 'unpaid', è un fallimento.
            if (dbOrder.status === 'In attesa' && stripeSession.status === 'complete' && paymentStatus === 'unpaid') {
                const pgClient = await pool.connect();
                try {
                    await beginTransaction(pgClient);
                    await pgClient.query(
                        `UPDATE Ordine SET Status = 'Scaduto' WHERE idordine = $1 AND Status = 'In attesa'`,
                        [finalOrderId]
                    );
                    updatedOrderStatus = 'Scaduto'; // Aggiorna lo stato dell'ordine a 'Scaduto'
                    console.log(`Verify Session: Order ${finalOrderId} status updated to 'Scaduto' due to unpaid (but complete) session ${actualPaidSessionId}.`);
                    await commitTransaction(pgClient);
                } catch (dbError) {
                    await rollbackTransaction(pgClient);
                    console.error(`Verify Session DB Error (handling non-paid for complete session) for order ${finalOrderId}: ${dbError.message}`, dbError.stack);
                } finally {
                    pgClient.release();
                }
            }
            res.status(200).json({ success: false, message: `Payment status for session ${actualPaidSessionId} is '${paymentStatus}'. Order status: ${updatedOrderStatus}.`, orderStatus: updatedOrderStatus, paymentStatus: stripeSession.payment_status });
        }
    } catch (stripeError) {
        console.error(`Error retrieving Stripe session ${actualPaidSessionId}:`, stripeError);
        let statusCode = 500;
        let errorMsg = 'Failed to retrieve session from Stripe.';
        if (stripeError.type === 'StripeInvalidRequestError') {
             if (stripeError.code === 'resource_missing') { // Codice errore Stripe per "No such checkout.session"
                statusCode = 404;
                errorMsg = 'Checkout Session not found on Stripe.';
             } else {
                statusCode = 400; // Altri errori di richiesta non validi
                errorMsg = 'Invalid request to Stripe.';
             }
        }
        res.status(statusCode).json({ error: errorMsg, details: stripeError.message });
    }
});

module.exports = router;