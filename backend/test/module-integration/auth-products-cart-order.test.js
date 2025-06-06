// test/integration/complete-order-flow.test.js (or add to an existing integration file)
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') }); // Adjust path as needed

const request = require('supertest');
const express = require('express');
const bcryptjs = require('bcryptjs'); // For Admin password hashing
const pool = require('../../src/config/db-connect'); // REAL pool

// Assuming your main app instance or route modules
// For this example, let's define them. Adjust to your actual structure.
const userRoutes = require('../../src/routes/userRoutes'); // Assuming handles POST /api/users
const authRoutes = require('../../src/routes/authRoutes');
const productRoutes = require('../../src/routes/productRoutes');
const cartRoutes = require('../../src/routes/cartRoutes');
const orderRoutes = require('../../src/routes/orderRoutes');
const artigianoApproveRoutes = require('../../src/routes/artigianoApproveRoutes'); // Import approval routes
// const paymentRoutes = require('../../src/routes/paymentRoutes'); // If needed for verification later

const app = express();
app.use(express.json());
app.use('/api/approvals', artigianoApproveRoutes); // Mount approval routes
app.use('/api/users', userRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/orders', orderRoutes);
// app.use('/api/payments', paymentRoutes);


// --- Stripe Mocking (adapted from your unitOrderRoutes.test.js) ---
const mockStripeCheckoutSessionResponse = {
    id: 'cs_test_e2e_flow_123',
    url: 'https://checkout.stripe.com/pay/cs_test_e2e_flow_123',
    status: 'open',
    payment_status: 'unpaid',
    client_reference_id: null, // Will be set by your order creation logic
    payment_intent: 'pi_test_e2e_flow_123',
    amount_total: 0, // Will be calculated
    currency: 'eur',
};

jest.mock('stripe', () => {
    const mockCheckoutSessionsCreate = jest.fn();
    const mockCheckoutSessionsRetrieve = jest.fn(); // Keep if verify-session is tested later
    const mockCheckoutSessionsExpire = jest.fn();   // Keep if order cancellation is tested

    const mockStripeModule = jest.fn().mockImplementation(() => ({
        checkout: {
            sessions: {
                create: mockCheckoutSessionsCreate,
                retrieve: mockCheckoutSessionsRetrieve,
                expire: mockCheckoutSessionsExpire,
            },
        },
    }));

    mockStripeModule._mockCheckoutSessionsCreate = mockCheckoutSessionsCreate;
    mockStripeModule._mockCheckoutSessionsRetrieve = mockCheckoutSessionsRetrieve;
    mockStripeModule._mockCheckoutSessionsExpire = mockCheckoutSessionsExpire;
    return mockStripeModule;
});
const Stripe = require('stripe'); // Must be required after jest.mock

// --- Test Data Storage for Cleanup ---
let createdUserIds = [];
let createdProductIds = [];
let createdOrderIds = []; // To store actual order IDs from DB for cleanup

describe('E2E Order Flow: Cliente Registration, Cart, and Order Checkout Session', () => {
    jest.setTimeout(30000); // Increase timeout for integration tests

    let artigianoUser; // To create products
    let adminUser;
    let adminToken;
    let artigianoToken;
    let product1, product2;
    let originalP1Stock, originalP2Stock; // Variables to store original stock


    const clienteSuffix = `_e2e_cl_${Date.now()}`;
    const clienteCredentials = {
        username: `cli1${clienteSuffix}`,
        email: `cli1${clienteSuffix}@example.com`,
        password: 'cli1password',
        nome: 'Cliente',
        cognome: 'UnoE2E',
        indirizzo: '123 Test St, Test City',
        tipologia: 'Cliente'
    };
    let clienteAuthToken;
    let createdClienteUserId;


    beforeAll(async () => {
        process.env.FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3001/test-frontend';
        // jest.useFakeTimers(); // Only if your order/payment logic directly uses setTimeout AND you need to control it.
                              // For pure API interaction, often not needed or can complicate things.

        // 1. Create an Admin user directly in DB for approval tasks
        const adminSuffix = `_e2e_adm_${Date.now()}`;
        const adminUsername = `admin${adminSuffix}`;
        const adminEmail = `admin${adminSuffix}@example.com`;
        const adminPassword = 'adminpassword';
        const hashedAdminPassword = await bcryptjs.hash(adminPassword, 10);
        const adminRes = await pool.query(
            `INSERT INTO utente (username, nome, cognome, email, password, indirizzo, tipologia, deleted, admintimestampcreazione)
             VALUES ($1, 'AdminE2E', 'UserE2E', $2, $3, '1 Admin Rd', 'Admin', FALSE, NOW()) RETURNING *`,
            [adminUsername, adminEmail, hashedAdminPassword]
        );
        adminUser = adminRes.rows[0];
        createdUserIds.push(adminUser.idutente);
        const adminLoginRes = await request(app).post('/api/auth/login').send({ username: adminUsername, password: adminPassword });
        expect(adminLoginRes.statusCode).toBe(200);
        adminToken = adminLoginRes.body.token;
        if (!adminToken) throw new Error("Admin login failed, no token received.");

        // 2. Create an Artigiano user to own products
        const artigianoSuffix = `_e2e_art_${Date.now()}`;
        const artigianoData = {
            username: `art${artigianoSuffix}`,
            email: `art${artigianoSuffix}@example.com`,
            password: 'artpassword',
            tipologia: 'Artigiano',
            nome: 'Artigiano',
            cognome: 'E2E',
            indirizzo: '456 Craft Rd',
            piva: `1234567890${Math.floor(Math.random()*9)}`, // ensure unique piva
            artigianodescrizione: 'Makes E2E test products'
        };
        // Assuming /api/users can also register Artigianos or you have a separate endpoint
        let artigianoRegRes = await request(app).post('/api/users').send(artigianoData);
        if (artigianoRegRes.statusCode !== 201) {
            // Fallback if /api/users is only for Cliente, try /api/auth/register
            artigianoRegRes = await request(app).post('/api/auth/register').send(artigianoData);
             if (artigianoRegRes.statusCode !== 201) {
                console.error("Failed to register artigiano for test setup:", artigianoRegRes.body);
                throw new Error("Artigiano setup failed");
            }
        }
        expect(artigianoRegRes.statusCode).toBe(201); // Ensure artigiano registration was successful
        artigianoUser = artigianoRegRes.body.user || artigianoRegRes.body; // Adjust based on your API response
        if (!artigianoUser || !artigianoUser.idutente) throw new Error("Artigiano user object not found in registration response.");
        createdUserIds.push(artigianoUser.idutente);

        // 3. Fetch the idstorico for the Artigiano's pending approval
        const storicoQuery = await pool.query(
            "SELECT IDStorico FROM StoricoApprovazioni WHERE IDArtigiano = $1 AND Esito = 'In lavorazione' ORDER BY DataEsito DESC LIMIT 1",
            [artigianoUser.idutente]
        );
        if (storicoQuery.rows.length === 0) {
            throw new Error(`No 'In lavorazione' approval record found for Artigiano ID ${artigianoUser.idutente}`);
        }
        const idStoricoToApprove = storicoQuery.rows[0].idstorico;

        // 4. Admin approves the Artigiano
        const approvalRes = await request(app)
            .put(`/api/approvals/${idStoricoToApprove}/decide`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ esito: 'Approvato' });
        expect(approvalRes.statusCode).toBe(200);
        expect(approvalRes.body.esito).toBe('Approvato');

        // 5. Artigiano logs in (now approved)
        const artigianoLoginResApproved = await request(app).post('/api/auth/login').send({ username: artigianoData.username, password: artigianoData.password });
        expect(artigianoLoginResApproved.statusCode).toBe(200);
        artigianoToken = artigianoLoginResApproved.body.token;
        if (!artigianoToken) throw new Error("Approved Artigiano login failed, no token received.");

        // 6. Create Test Products by the now approved Artigiano
        const p1Data = { nome: 'E2E Product Alpha', descrizione: 'Alpha Desc', categoria: 'E2ECat', prezzounitario: 15.99, quantitadisponibile: 20 };
        let productCreationRes = await request(app).post('/api/products').set('Authorization', `Bearer ${artigianoToken}`).send(p1Data);
        
        
        expect(productCreationRes.statusCode).toBe(201); // Ensure product1 creation was successful
        product1 = productCreationRes.body; // productRoutes returns the product directly in the body
        if (!product1 || !product1.idprodotto) throw new Error("Product 1 creation failed or did not return expected object.");
        originalP1Stock = product1.quantitadisponibile; // Store original stock
        createdProductIds.push(product1.idprodotto);
        console.log('Created Product 1 ID:', product1.idprodotto);

        const p2Data = { nome: 'E2E Product Beta', descrizione: 'Beta Desc', categoria: 'E2ECat', prezzounitario: 25.50, quantitadisponibile: 10 };
        productCreationRes = await request(app).post('/api/products').set('Authorization', `Bearer ${artigianoToken}`).send(p2Data);
        expect(productCreationRes.statusCode).toBe(201); // Ensure product2 creation was successful
        originalP2Stock = productCreationRes.body.quantitadisponibile; // Store original stock
        product2 = productCreationRes.body; // productRoutes returns the product directly in the body
        if (!product2 || !product2.idprodotto) throw new Error("Product 2 creation failed or did not return expected object.");
        createdProductIds.push(product2.idprodotto);
        console.log('Created Product 2 ID:', product2.idprodotto);

        // 7. Configure Stripe Mock for this suite
        Stripe._mockCheckoutSessionsCreate.mockImplementation(async (sessionParams) => {
            if (!sessionParams.line_items || sessionParams.line_items.length === 0) {
                throw new Error("Stripe mock error: line_items are required and cannot be empty.");
            }
            const totalAmount = sessionParams.line_items.reduce((sum, item) => sum + (item.price_data.unit_amount * item.quantity), 0);
            return {
                ...mockStripeCheckoutSessionResponse,
                id: `cs_test_e2e_${Date.now()}`,
                url: `https://checkout.stripe.com/pay/cs_test_e2e_${Date.now()}`,
                client_reference_id: sessionParams.client_reference_id, // Should be set by your /reserve-and-create-checkout-session
                amount_total: totalAmount,
                currency: sessionParams.line_items[0]?.price_data?.currency || 'eur',
            };
        });
    });

    afterAll(async () => {
        // if (jest.isMockFunction(setTimeout)) { jest.useRealTimers(); }

        // Cleanup database
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            if (createdOrderIds.length > 0) {
                await client.query(`DELETE FROM DettagliOrdine WHERE idordine = ANY($1::int[])`, [createdOrderIds]);
                await client.query(`DELETE FROM Ordine WHERE idordine = ANY($1::int[])`, [createdOrderIds]);
            }
            // Cleanup StoricoApprovazioni for test artigiani
            if (createdUserIds.length > 0) { // Assuming artigianoUser.idutente is in createdUserIds
                await client.query(`DELETE FROM StoricoApprovazioni WHERE IDArtigiano = ANY($1::int[])`, [createdUserIds]);
            }
            // Delete cart items for created users (more robust than specific cart item IDs)
            if (createdUserIds.length > 0) {
                 await client.query(`DELETE FROM dettaglicarrello WHERE idcliente = ANY($1::int[])`, [createdUserIds]);
            }
            if (createdProductIds.length > 0) {
                await client.query(`DELETE FROM Prodotto WHERE idprodotto = ANY($1::int[])`, [createdProductIds]);
            }
            if (createdUserIds.length > 0) {
                await client.query(`DELETE FROM Utente WHERE idutente = ANY($1::int[])`, [createdUserIds]);
            }
            await client.query('COMMIT');
        } catch (err) {
            await client.query('ROLLBACK');
            console.error('Error during DB cleanup:', err);
        } finally {
            client.release();
        }
        await pool.end();
    });

    beforeEach(async () => { // Make beforeEach async
        // Clear mock history
        Stripe._mockCheckoutSessionsCreate.mockClear();

        // Reset product stock to original values before each test
        if (product1 && product1.idprodotto && originalP1Stock !== undefined) {
            await pool.query('UPDATE Prodotto SET quantitadisponibile = $1 WHERE idprodotto = $2', [originalP1Stock, product1.idprodotto]);
        }
        if (product2 && product2.idprodotto && originalP2Stock !== undefined) {
            await pool.query('UPDATE Prodotto SET quantitadisponibile = $1 WHERE idprodotto = $2', [originalP2Stock, product2.idprodotto]);
        }
    });

    test('Cliente registers, logs in, adds items to cart, and creates order checkout session', async () => {
        // 1. POST api/users/ (new cliente)
        let res = await request(app)
            .post('/api/users')
            .send(clienteCredentials);
        
        expect(res.statusCode).toBe(201); // Assuming 201 for successful registration
        expect(res.body.user || res.body).toHaveProperty('idutente');
        createdClienteUserId = (res.body.user || res.body).idutente;
        createdUserIds.push(createdClienteUserId); // Add to list for cleanup

        // 2. POST api/auth/login (login with that data)
        res = await request(app)
            .post('/api/auth/login')
            .send({ username: clienteCredentials.username, password: clienteCredentials.password });

        expect(res.statusCode).toBe(200);
        expect(res.body).toHaveProperty('token');
        clienteAuthToken = res.body.token;

        // 3. GET api/products/notdeleted
        res = await request(app)
            .get('/api/products/notdeleted') // Assuming this endpoint doesn't require auth, or add token if it does
            // .set('Authorization', `Bearer ${clienteAuthToken}`) // If auth is needed
        
        expect(res.statusCode).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
        expect(res.body.length).toBeGreaterThanOrEqual(2); // Expecting at least the two products we created

        // For debugging:
        // console.log('Product 1 from beforeAll:', JSON.stringify(product1, null, 2));
        // console.log('Product 2 from beforeAll:', JSON.stringify(product2, null, 2));
        // console.log('Fetched products from /notdeleted:', JSON.stringify(res.body.map(p => ({id: p.idprodotto, name: p.nome})), null, 2));
        // Find our specific products (optional, good for specific assertions)
        const fetchedProduct1 = res.body.find(p => p.idprodotto === product1.idprodotto);
        const fetchedProduct2 = res.body.find(p => p.idprodotto === product2.idprodotto);
        expect(fetchedProduct1).toBeDefined();
        expect(fetchedProduct2).toBeDefined();

        // 4. POST api/cart/items (add some quantity of prodottis)
        // Add product1 to cart
        const cartPayloadP1 = { idprodotto: product1.idprodotto, quantita: 2 };
        res = await request(app)
            .post('/api/cart/items') // Or just /api/cart if that's your endpoint
            .set('Authorization', `Bearer ${clienteAuthToken}`)
            .send(cartPayloadP1);
        
        expect(res.statusCode).toBe(201); // Or 200

        // Add product2 to cart
        const cartPayloadP2 = { idprodotto: product2.idprodotto, quantita: 1 };
        res = await request(app)
            .post('/api/cart/items') // Or just /api/cart
            .set('Authorization', `Bearer ${clienteAuthToken}`)
            .send(cartPayloadP2);

        expect(res.statusCode).toBe(201); // Or 201

        // 5. POST api/orders/reserve-and-create-checkout-session
        const orderPayload = {
            indirizzospedizione: clienteCredentials.indirizzo, // Or fetch from user profile
            metodospedizione: 'Standard E2E'
            // Any other required fields for this endpoint
        };
        res = await request(app)
            .post('/api/orders/reserve-and-create-checkout-session')
            .set('Authorization', `Bearer ${clienteAuthToken}`)
            .send(orderPayload);

        expect(res.statusCode).toBe(201); // Or 200, depending on your API
        expect(res.body).toHaveProperty('stripeSessionUrl');
        expect(res.body.stripeSessionUrl).toEqual(expect.stringContaining('https://checkout.stripe.com/pay/cs_test_e2e_'));
        expect(res.body).toHaveProperty('ordine'); // Expecting the temporary/preliminary order ID
        expect(res.body.ordine).toHaveProperty('idordine');
        expect(res.body.ordine).toHaveProperty('status');
        expect(res.body.ordine.status).toBe('In attesa'); 


        const preliminaryOrderId = res.body.ordine.idordine;
        expect(preliminaryOrderId).toBeGreaterThan(0);
        createdOrderIds.push(preliminaryOrderId); // Add for cleanup

        // Verify Stripe mock was called correctly
        expect(Stripe._mockCheckoutSessionsCreate).toHaveBeenCalledTimes(1);
        const stripeCallArgs = Stripe._mockCheckoutSessionsCreate.mock.calls[0][0];
        expect(stripeCallArgs.mode).toBe('payment');
        expect(stripeCallArgs.success_url).toEqual(expect.stringContaining(`/payment-success?session_id={CHECKOUT_SESSION_ID}&order_id=${preliminaryOrderId}`));
        expect(stripeCallArgs.cancel_url).toEqual(expect.stringContaining(`/payment-cancelled?order_id=${preliminaryOrderId}`));
        expect(stripeCallArgs.line_items.length).toBe(2);
        expect(stripeCallArgs.client_reference_id).toBe(preliminaryOrderId.toString()); // Stripe expects string
        expect(stripeCallArgs.customer_email).toBe(clienteCredentials.email);

        // Check line items (example for product1)
        const lineItemP1 = stripeCallArgs.line_items.find(item => item.price_data.product_data.name === product1.nome);
        expect(lineItemP1).toBeDefined();
        expect(lineItemP1.quantity).toBe(cartPayloadP1.quantita);
        expect(lineItemP1.price_data.unit_amount).toBe(Math.round(product1.prezzounitario * 100)); // Price in cents

        // Optionally, verify the order in the database (status should be 'In attesa di pagamento' or similar)
        const dbOrder = await pool.query('SELECT * FROM Ordine WHERE idordine = $1', [preliminaryOrderId]);
        expect(dbOrder.rows.length).toBe(1);
        expect(dbOrder.rows[0].idutente).toBe(createdClienteUserId);
    });

    test('Cliente orders, cancels, cart remains, and can re-order', async () => {
        // --- Setup: Register and Login a new Cliente for this specific test ---
        const testSuffix = `_cancel_reorder_${Date.now()}`;
        const specificClienteCredentials = {
            username: `cli_cancel${testSuffix}`,
            email: `cli_cancel${testSuffix}@example.com`,
            password: 'passwordCancel123',
            nome: 'Cancel',
            cognome: 'ReorderTest',
            indirizzo: '123 Cancel St, Test City',
            tipologia: 'Cliente'
        };
        let specificClienteRes = await request(app).post('/api/users').send(specificClienteCredentials);
        expect(specificClienteRes.statusCode).toBe(201);
        const specificClienteId = (specificClienteRes.body.user || specificClienteRes.body).idutente;
        createdUserIds.push(specificClienteId); // For cleanup

        specificClienteRes = await request(app).post('/api/auth/login').send({ username: specificClienteCredentials.username, password: specificClienteCredentials.password });
        expect(specificClienteRes.statusCode).toBe(200);
        const specificClienteToken = specificClienteRes.body.token;

        // --- 1. Add items to cart ---
        const cartP1 = { idprodotto: product1.idprodotto, quantita: 1 };
        await request(app)
            .post('/api/cart/items')
            .set('Authorization', `Bearer ${specificClienteToken}`)
            .send(cartP1)
            .expect(201);

        const cartP2 = { idprodotto: product2.idprodotto, quantita: 3 };
        await request(app)
            .post('/api/cart/items')
            .set('Authorization', `Bearer ${specificClienteToken}`)
            .send(cartP2)
            .expect(201);

        // --- 2. Create the initial order ---
        const initialOrderPayload = {
            indirizzospedizione: specificClienteCredentials.indirizzo,
            metodospedizione: 'Standard CancelTest'
        };
        let orderRes = await request(app)
            .post('/api/orders/reserve-and-create-checkout-session')
            .set('Authorization', `Bearer ${specificClienteToken}`)
            .send(initialOrderPayload);
        expect(orderRes.statusCode).toBe(201);
        const initialOrderId = orderRes.body.ordine.idordine;
        expect(initialOrderId).toBeGreaterThan(0);
        createdOrderIds.push(initialOrderId); // For cleanup

        // Verify stock was reduced for product1 and product2
        let p1StockCheck = await pool.query('SELECT quantitadisponibile FROM Prodotto WHERE idprodotto = $1', [product1.idprodotto]);
        expect(p1StockCheck.rows[0].quantitadisponibile).toBe(product1.quantitadisponibile - cartP1.quantita);
        let p2StockCheck = await pool.query('SELECT quantitadisponibile FROM Prodotto WHERE idprodotto = $1', [product2.idprodotto]);
        expect(p2StockCheck.rows[0].quantitadisponibile).toBe(product2.quantitadisponibile - cartP2.quantita);


        // --- 3. Cancel the order ---
        const cancelRes = await request(app)
            .post(`/api/orders/${initialOrderId}/cancel`)
            .set('Authorization', `Bearer ${specificClienteToken}`);
        expect(cancelRes.statusCode).toBe(200);
        expect(cancelRes.body.message).toMatch(/annullato con successo/i);

        // Verify order status is 'Scaduto' or similar
        const cancelledOrderCheck = await pool.query('SELECT status FROM Ordine WHERE idordine = $1', [initialOrderId]);
        expect(cancelledOrderCheck.rows[0].status).toBe('Scaduto');

        // Verify stock was restocked for product1 and product2
        p1StockCheck = await pool.query('SELECT quantitadisponibile FROM Prodotto WHERE idprodotto = $1', [product1.idprodotto]);
        expect(p1StockCheck.rows[0].quantitadisponibile).toBe(product1.quantitadisponibile); // Back to original
        p2StockCheck = await pool.query('SELECT quantitadisponibile FROM Prodotto WHERE idprodotto = $1', [product2.idprodotto]);
        expect(p2StockCheck.rows[0].quantitadisponibile).toBe(product2.quantitadisponibile); // Back to original

        // --- 4. Verify cart (dettaglicarrello) is NOT deleted ---
        const cartAfterCancelRes = await request(app)
            .get(`/api/cart/${specificClienteId}`) // Assuming your GET cart by user ID is /api/cart/:idcliente
            .set('Authorization', `Bearer ${specificClienteToken}`); // Or adminToken if only admin can get other's cart
        
        expect(cartAfterCancelRes.statusCode).toBe(200);
        expect(cartAfterCancelRes.body.items.length).toBe(2); // Cart should still have 2 item types
        const cartItemP1 = cartAfterCancelRes.body.items.find(item => item.idprodotto === product1.idprodotto);
        const cartItemP2 = cartAfterCancelRes.body.items.find(item => item.idprodotto === product2.idprodotto);
        expect(cartItemP1).toBeDefined();
        expect(cartItemP1.quantita).toBe(cartP1.quantita);
        expect(cartItemP2).toBeDefined();
        expect(cartItemP2.quantita).toBe(cartP2.quantita);

        // --- 5. User can re-order ---
        const reOrderPayload = {
            indirizzospedizione: specificClienteCredentials.indirizzo, // Can be the same or different
            metodospedizione: 'Express Reorder'
        };
        const reOrderRes = await request(app)
            .post('/api/orders/reserve-and-create-checkout-session')
            .set('Authorization', `Bearer ${specificClienteToken}`)
            .send(reOrderPayload);

        expect(reOrderRes.statusCode).toBe(201);
        expect(reOrderRes.body).toHaveProperty('ordine');
        const newOrderId = reOrderRes.body.ordine.idordine;
        expect(newOrderId).toBeGreaterThan(0);
        expect(newOrderId).not.toBe(initialOrderId); // Should be a new order
        createdOrderIds.push(newOrderId); // Add for cleanup

        // Verify stock was reduced again for product1 and product2
        p1StockCheck = await pool.query('SELECT quantitadisponibile FROM Prodotto WHERE idprodotto = $1', [product1.idprodotto]);
        expect(p1StockCheck.rows[0].quantitadisponibile).toBe(product1.quantitadisponibile - cartP1.quantita);
        p2StockCheck = await pool.query('SELECT quantitadisponibile FROM Prodotto WHERE idprodotto = $1', [product2.idprodotto]);
        expect(p2StockCheck.rows[0].quantitadisponibile).toBe(product2.quantitadisponibile - cartP2.quantita);

        // Verify the new order status is 'In attesa'
        const newOrderCheck = await pool.query('SELECT status FROM Ordine WHERE idordine = $1', [newOrderId]);
        expect(newOrderCheck.rows[0].status).toBe('In attesa');
    });
});
