const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });

const request = require('supertest');
const express = require('express');
const bcryptjs = require('bcryptjs');
const pool = require('../../../src/config/db-connect');
const paymentRoutes = require('../../../src/routes/paymentRoutes');
const authRoutes = require('../../../src/routes/authRoutes'); // For login

const app = express();
app.use(express.json());
app.use('/api/payments', paymentRoutes);
app.use('/api/auth', authRoutes);

// --- Stripe Mocking ---
// Move these declarations ABOVE the jest.mock(...) so they exist when the factory runs:
var mockSessionRetrieveFn;
var mockPaymentIntentsRetrieveFn;

jest.mock('stripe', () => {
  mockSessionRetrieveFn = jest.fn();
  mockPaymentIntentsRetrieveFn = jest.fn();

  return jest.fn().mockImplementation(() => ({
    checkout: {
      sessions: { retrieve: mockSessionRetrieveFn },
    },
    paymentIntents: { retrieve: mockPaymentIntentsRetrieveFn },
  }));
});


// --- Test Data Storage for Cleanup ---
let createdUserIds = [];
let createdProductIds = [];
let createdOrderIds = [];
let createdPaymentIntentIds = []; // Store StripePaymentIntentID from Pagamento table

describe('Payment API - /api/payments/verify-session', () => {
    jest.setTimeout(30000);

    let clienteUser, otherClienteUser, adminUser;
    let clienteToken, otherClienteToken;
    let testProduct;
    let testOrder; // Order created for clienteUser

    const mockStripeSessionBase = {
        id: 'cs_test_mock_session_123',
        payment_intent: 'pi_test_mock_intent_123',
        client_reference_id: null, // Will be set to order ID
        amount_total: 0, // Will be calculated
        currency: 'eur',
        status: 'complete', // Default to complete for successful verification path
        payment_status: 'paid', // Default to paid
    };

    beforeAll(async () => {
        const suffix = `_paytest_${Date.now()}`;
        const hashedPassword = await bcryptjs.hash('password123', 10);

        // Admin User (for potential setup/cleanup if needed, not directly for this endpoint)
        const adminRes = await pool.query(
            `INSERT INTO utente (username, nome, cognome, email, password, indirizzo, tipologia, admintimestampcreazione)
             VALUES ($1, 'Admin', 'PayTest', $2, $3, 'Admin Address', 'Admin', NOW()) RETURNING *`,
            [`admin${suffix}`, `admin_pay${suffix}@example.com`, hashedPassword]
        );
        adminUser = adminRes.rows[0];
        createdUserIds.push(adminUser.idutente);

        // Cliente User
        const clienteRes = await pool.query(
            `INSERT INTO utente (username, nome, cognome, email, password, indirizzo, tipologia)
             VALUES ($1, 'Cliente', 'PayTest', $2, $3, 'Cliente Address', 'Cliente') RETURNING *`,
            [`cliente${suffix}`, `cliente_pay${suffix}@example.com`, hashedPassword]
        );
        clienteUser = clienteRes.rows[0];
        createdUserIds.push(clienteUser.idutente);
        const clienteLogin = await request(app).post('/api/auth/login').send({ username: clienteUser.username, password: 'password123' });
        clienteToken = clienteLogin.body.token;

        // Other Cliente User (for permission tests)
        const otherClienteRes = await pool.query(
            `INSERT INTO utente (username, nome, cognome, email, password, indirizzo, tipologia)
             VALUES ($1, 'OtherCliente', 'PayTest', $2, $3, 'Other Address', 'Cliente') RETURNING *`,
            [`othercliente${suffix}`, `othercliente_pay${suffix}@example.com`, hashedPassword]
        );
        otherClienteUser = otherClienteRes.rows[0];
        createdUserIds.push(otherClienteUser.idutente);
        const otherClienteLogin = await request(app).post('/api/auth/login').send({ username: otherClienteUser.username, password: 'password123' });
        otherClienteToken = otherClienteLogin.body.token;


        // Artigiano User (to own the product)
        const artigianoRes = await pool.query(
            `INSERT INTO utente (username, nome, cognome, email, password, indirizzo, tipologia, piva, artigianodescrizione)
             VALUES ($1, 'Artigiano', 'PayTest', $2, $3, 'Artigiano Address', 'Artigiano', '12345PAYTEST', 'Makes pay test items') RETURNING *`,
            [`artigiano${suffix}`, `artigiano_pay${suffix}@example.com`, hashedPassword]
        );
        const artigianoUser = artigianoRes.rows[0];
        createdUserIds.push(artigianoUser.idutente);
        // Approve artigiano
        await pool.query(
            `INSERT INTO StoricoApprovazioni (IDArtigiano, Esito, IDAdmin, DataEsito)
             VALUES ($1, 'Approvato', $2, NOW())`,
            [artigianoUser.idutente, adminUser.idutente]
        );

        // Test Product
        const productRes = await pool.query(
            `INSERT INTO Prodotto (nome, descrizione, categoria, prezzounitario, quantitadisponibile, idartigiano, deleted)
             VALUES ($1, $2, $3, $4, $5, $6, FALSE) RETURNING *`,
            [`Payment Test Product ${suffix}`, 'Product for payment verification', 'Test Category', 20.00, 10, artigianoUser.idutente]
        );
        testProduct = productRes.rows[0];
        createdProductIds.push(testProduct.idprodotto);
    });

    beforeEach(async () => {
        mockSessionRetrieveFn.mockReset();
        mockPaymentIntentsRetrieveFn.mockReset();

        // Create a fresh order in 'In attesa' state for clienteUser
        const orderTotal = testProduct.prezzounitario * 2;
        const orderRes = await pool.query(
            `INSERT INTO Ordine (idutente, Data, Ora, ImportoTotale, Status, Deleted, StripeCheckOutSessionID)
             VALUES ($1, CURRENT_DATE, CURRENT_TIME, $2, 'In attesa', FALSE, $3) RETURNING *`,
            [clienteUser.idutente, orderTotal, `cs_test_order_${Date.now()}`] // Store a dummy session ID initially
        );
        testOrder = orderRes.rows[0];
        createdOrderIds.push(testOrder.idordine);

        // Create DettagliOrdine for this order
        await pool.query(
            `INSERT INTO DettagliOrdine (idordine, idprodotto, quantita, prezzostoricounitario)
             VALUES ($1, $2, $3, $4)`,
            [testOrder.idordine, testProduct.idprodotto, 2, testProduct.prezzounitario]
        );

        // Add item to clienteUser's cart (for cart clearing test)
        await pool.query(
            `INSERT INTO dettaglicarrello (idcliente, idprodotto, quantita, totaleparziale)
             VALUES ($1, $2, $3, $4) ON CONFLICT (idcliente, idprodotto) DO NOTHING`,
            [clienteUser.idutente, testProduct.idprodotto, 2, testProduct.prezzounitario * 2]
        );
    });

    afterEach(async () => {
        // Clean up orders, details, suborders, payments created in beforeEach or during tests
        if (testOrder && testOrder.idordine) {
            await pool.query('DELETE FROM SubOrdine WHERE IDOrdine = $1', [testOrder.idordine]);
            await pool.query('DELETE FROM DettagliOrdine WHERE idordine = $1', [testOrder.idordine]);
            await pool.query('DELETE FROM Pagamento WHERE IDOrdine = $1', [testOrder.idordine]);
            await pool.query('DELETE FROM Ordine WHERE idordine = $1', [testOrder.idordine]);
        }
        // Clear cart for clienteUser
        await pool.query('DELETE FROM dettaglicarrello WHERE idcliente = $1', [clienteUser.idutente]);
    });

    afterAll(async () => {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            // More robust cleanup using collected IDs
            if (createdOrderIds.length > 0) {
                await client.query(`DELETE FROM SubOrdine WHERE IDOrdine = ANY($1::int[])`, [createdOrderIds]);
                await client.query(`DELETE FROM DettagliOrdine WHERE idordine = ANY($1::int[])`, [createdOrderIds]);
                await client.query(`DELETE FROM Pagamento WHERE IDOrdine = ANY($1::int[])`, [createdOrderIds]);
                await client.query(`DELETE FROM Ordine WHERE idordine = ANY($1::int[])`, [createdOrderIds]);
            }
            if (createdProductIds.length > 0) {
                await client.query(`DELETE FROM Prodotto WHERE idprodotto = ANY($1::int[])`, [createdProductIds]);
            }
            if (createdUserIds.length > 0) {
                // Delete approval history for artisans first
                const artigianoUserIdsForCleanup = (await client.query('SELECT idutente FROM Utente WHERE idutente = ANY($1::int[]) AND tipologia = \'Artigiano\'', [createdUserIds])).rows.map(r => r.idutente);
                if (artigianoUserIdsForCleanup.length > 0) {
                    await client.query(`DELETE FROM StoricoApprovazioni WHERE IDArtigiano = ANY($1::int[])`, [artigianoUserIdsForCleanup]);
                }
                await client.query(`DELETE FROM Utente WHERE idutente = ANY($1::int[])`, [createdUserIds]);
            }
            await client.query('COMMIT');
        } catch (err) {
            await client.query('ROLLBACK');
            console.error('Error during DB cleanup in payment.test.js:', err);
        } finally {
            client.release();
        }
        await pool.end();
    });

    test('should successfully verify a paid session, update order, create payment, create suborders, and clear cart', async () => {
        const mockSessionId = `cs_test_paid_${Date.now()}`;
        const mockPaymentIntentId = `pi_test_paid_${Date.now()}`;
        mockSessionRetrieveFn.mockResolvedValue({
            ...mockStripeSessionBase,
            id: mockSessionId,
            payment_intent: mockPaymentIntentId,
            client_reference_id: testOrder.idordine.toString(),
            amount_total: testOrder.importototale * 100,
            payment_status: 'paid',
            status: 'complete'
        });

        const res = await request(app)
            .post('/api/payments/verify-session')
            .set('Authorization', `Bearer ${clienteToken}`)
            .send({ sessionid: mockSessionId });

        expect(res.statusCode).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.message).toContain('Payment verified, order updated, and cart cleared.');
        expect(res.body.orderStatus).toBe('Da spedire');

        // Verify DB changes
        const dbOrder = await pool.query('SELECT Status FROM Ordine WHERE idordine = $1', [testOrder.idordine]);
        expect(dbOrder.rows[0].status).toBe('Da spedire');

        const dbPayment = await pool.query('SELECT * FROM Pagamento WHERE IDOrdine = $1 AND StripePaymentIntentID = $2', [testOrder.idordine, mockPaymentIntentId]);
        expect(dbPayment.rows.length).toBe(1);
        expect(dbPayment.rows[0].stripestatus).toBe('succeeded');
        createdPaymentIntentIds.push(mockPaymentIntentId); // For potential cleanup if needed

        const dbSubOrders = await pool.query('SELECT * FROM SubOrdine WHERE IDOrdine = $1', [testOrder.idordine]);
        expect(dbSubOrders.rows.length).toBeGreaterThan(0); // Assuming testProduct's artisan gets a suborder
        dbSubOrders.rows.forEach(so => {
            expect(so.subordinestatus).toBe('Da spedire');
        });

        const dbCart = await pool.query('SELECT * FROM dettaglicarrello WHERE idcliente = $1', [clienteUser.idutente]);
        expect(dbCart.rows.length).toBe(0); // Cart should be empty
    });

    test('should handle an unpaid session (status complete, payment_status unpaid) by setting order to Scaduto', async () => {
        const mockSessionId = `cs_test_unpaid_${Date.now()}`;
        mockSessionRetrieveFn.mockResolvedValue({
            ...mockStripeSessionBase,
            id: mockSessionId,
            client_reference_id: testOrder.idordine.toString(),
            payment_status: 'unpaid',
            status: 'complete', // Stripe can have 'complete' session with 'unpaid' payment_status
        });

        const res = await request(app)
            .post('/api/payments/verify-session')
            .set('Authorization', `Bearer ${clienteToken}`)
            .send({ sessionid: mockSessionId });

        expect(res.statusCode).toBe(200);
        expect(res.body.success).toBe(false);
        expect(res.body.message).toContain("Payment status for session");
        expect(res.body.message).toContain("is 'unpaid'");
        expect(res.body.orderStatus).toBe('Scaduto');

        const dbOrder = await pool.query('SELECT Status FROM Ordine WHERE idordine = $1', [testOrder.idordine]);
        expect(dbOrder.rows[0].status).toBe('Scaduto');
    });

    test('should return 404 if Stripe session is not found', async () => {
        const mockSessionId = `cs_test_notfound_${Date.now()}`;
        mockSessionRetrieveFn.mockRejectedValueOnce({
            type: 'StripeInvalidRequestError',
            code: 'resource_missing',
            message: 'No such checkout.session',
        });

        const res = await request(app)
            .post('/api/payments/verify-session')
            .set('Authorization', `Bearer ${clienteToken}`)
            .send({ sessionid: mockSessionId });

        expect(res.statusCode).toBe(404);
        expect(res.body.error).toBe('Checkout Session not found on Stripe.');
    });

    test('should return 400 if session ID is missing in request', async () => {
        const res = await request(app)
            .post('/api/payments/verify-session')
            .set('Authorization', `Bearer ${clienteToken}`)
            .send({});

        expect(res.statusCode).toBe(400);
        expect(res.body.error).toBe('Session ID is required.');
    });

    test('should return 404 if order ID from Stripe session does not exist in DB', async () => {
        const mockSessionId = `cs_test_invalid_order_ref_${Date.now()}`;
        const nonExistentOrderId = 999999;
        mockSessionRetrieveFn.mockResolvedValue({
            ...mockStripeSessionBase,
            id: mockSessionId,
            client_reference_id: nonExistentOrderId.toString(),
            payment_status: 'paid',
        });

        const res = await request(app)
            .post('/api/payments/verify-session')
            .set('Authorization', `Bearer ${clienteToken}`)
            .send({ sessionid: mockSessionId });

        expect(res.statusCode).toBe(404);
        expect(res.body.error).toContain(`Order ${nonExistentOrderId} associated with the payment was not found`);
    });

    test('should return 403 if Cliente tries to verify session for an order they do not own', async () => {
        // testOrder is owned by clienteUser
        const mockSessionId = `cs_test_authz_fail_${Date.now()}`;
        mockSessionRetrieveFn.mockResolvedValue({
            ...mockStripeSessionBase,
            id: mockSessionId,
            client_reference_id: testOrder.idordine.toString(), // Order owned by clienteUser
            payment_status: 'paid',
        });

        const res = await request(app)
            .post('/api/payments/verify-session')
            .set('Authorization', `Bearer ${otherClienteToken}`) // otherClienteUser tries to verify
            .send({ sessionid: mockSessionId });

        expect(res.statusCode).toBe(403);
        expect(res.body.error).toBe('Access denied. You do not have permission to verify this payment session.');
    });

    test('should handle already processed order gracefully (e.g., status Da spedire)', async () => {
        // Manually set order to 'Da spedire'
        await pool.query(`UPDATE Ordine SET Status = 'Da spedire' WHERE idordine = $1`, [testOrder.idordine]);

        const mockSessionId = `cs_test_already_processed_${Date.now()}`;
        const mockPaymentIntentId = `pi_test_already_processed_${Date.now()}`;
        mockSessionRetrieveFn.mockResolvedValue({
            ...mockStripeSessionBase,
            id: mockSessionId,
            payment_intent: mockPaymentIntentId,
            client_reference_id: testOrder.idordine.toString(),
            payment_status: 'paid',
        });

        const res = await request(app)
            .post('/api/payments/verify-session')
            .set('Authorization', `Bearer ${clienteToken}`)
            .send({ sessionid: mockSessionId });

        expect(res.statusCode).toBe(200);
        expect(res.body.success).toBe(true); // Still success, as payment is verified
        expect(res.body.message).toContain('Payment verified, order updated, and cart cleared.'); // Message might be generic
        
        // Verify order status remains 'Da spedire'
        const dbOrder = await pool.query('SELECT Status FROM Ordine WHERE idordine = $1', [testOrder.idordine]);
        expect(dbOrder.rows[0].status).toBe('Da spedire');

        // Verify payment record is still created/ensured (idempotency of payment record)
        const dbPayment = await pool.query('SELECT * FROM Pagamento WHERE IDOrdine = $1 AND StripePaymentIntentID = $2', [testOrder.idordine, mockPaymentIntentId]);
        expect(dbPayment.rows.length).toBe(1);
        createdPaymentIntentIds.push(mockPaymentIntentId);

        // Verify SubOrdini are created/ensured
        const dbSubOrders = await pool.query('SELECT * FROM SubOrdine WHERE IDOrdine = $1', [testOrder.idordine]);
        expect(dbSubOrders.rows.length).toBeGreaterThan(0);

        // Verify cart is cleared
        const dbCart = await pool.query('SELECT * FROM dettaglicarrello WHERE idcliente = $1', [clienteUser.idutente]);
        expect(dbCart.rows.length).toBe(0);
    });

    test('should correctly determine payment method type from expanded payment_method', async () => {
        const mockSessionId = `cs_test_pm_type_${Date.now()}`;
        const mockPaymentIntentId = `pi_test_pm_type_${Date.now()}`;
        
        // Mock Stripe session retrieval (using the global mock function)
        mockSessionRetrieveFn.mockResolvedValue({
            ...mockStripeSessionBase,
            id: mockSessionId,
            payment_intent: mockPaymentIntentId,
            client_reference_id: testOrder.idordine.toString(),
            amount_total: testOrder.importototale * 100,
            payment_status: 'paid',
            status: 'complete',
        });

        // Mock Stripe payment intent retrieval (using the global mock function)
        mockPaymentIntentsRetrieveFn.mockResolvedValue({
            id: mockPaymentIntentId,
            payment_method: {
                id: 'pm_mock_card_123',
                type: 'card', // Simulate 'card' as the payment method type
                // ... other payment_method details
            },
            // ... other payment_intent details
        });

        const res = await request(app)
            .post('/api/payments/verify-session')
            .set('Authorization', `Bearer ${clienteToken}`)
            .send({ sessionid: mockSessionId });

        expect(res.statusCode).toBe(200);
        expect(res.body.success).toBe(true);

        // Verify that stripe.paymentIntents.retrieve was called
        expect(mockPaymentIntentsRetrieveFn).toHaveBeenCalledWith(
            mockPaymentIntentId,
            { expand: ['payment_method'] }
        );

        // Verify the payment record in the DB has the correct 'Modalita'
        const dbPayment = await pool.query('SELECT Modalita FROM Pagamento WHERE StripePaymentIntentID = $1', [mockPaymentIntentId]);
        expect(dbPayment.rows.length).toBe(1);
        expect(dbPayment.rows[0].modalita).toBe('card'); // Check if 'card' was stored
        createdPaymentIntentIds.push(mockPaymentIntentId);

        // Restore original Stripe mock if it was changed globally, or ensure mocks are scoped per test/describe
        // For this setup, jest.mock at the top level is fine, and we re-mocked Stripe for this specific test.
    });

});
