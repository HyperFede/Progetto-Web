const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });

const request = require('supertest');
const express = require('express');
const bcryptjs = require('bcryptjs');
const orderRoutes = require('../../../src/routes/orderRoutes'); // Adjust path as needed
const paymentRoutes = require('../../../src/routes/paymentRoutes'); // For verify-session
const pool = require('../../../src/config/db-connect'); // REAL pool

// --- Mocking Stripe ---
const mockStripeCheckoutSession = {
    id: 'cs_test_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0',
    url: 'https://checkout.stripe.com/pay/cs_test_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0',
    status: 'open', // or 'complete', 'expired'
    payment_status: 'unpaid', // or 'paid'
    client_reference_id: 'order_test_123', // This will be the order ID
    payment_intent: 'pi_test_12345',
    amount_total: 5000, // in cents
    currency: 'eur',
    // Add other relevant fields if your application uses them
};

jest.mock('stripe', () => {
    const mockCheckoutSessionsCreate = jest.fn();
    const mockCheckoutSessionsRetrieve = jest.fn();
    const mockCheckoutSessionsExpire = jest.fn();
    const mockPaymentIntentsRetrieve = jest.fn();

    const mockStripeModule = jest.fn().mockImplementation(() => ({
        checkout: {
            sessions: {
                create: mockCheckoutSessionsCreate,
                retrieve: mockCheckoutSessionsRetrieve,
                expire: mockCheckoutSessionsExpire,
            },
        },
        paymentIntents: {
            retrieve: mockPaymentIntentsRetrieve,
        }
    }));

    mockStripeModule._mockCheckoutSessionsCreate = mockCheckoutSessionsCreate;
    mockStripeModule._mockCheckoutSessionsRetrieve = mockCheckoutSessionsRetrieve;
    mockStripeModule._mockCheckoutSessionsExpire = mockCheckoutSessionsExpire;
    mockStripeModule._mockPaymentIntentsRetrieve = mockPaymentIntentsRetrieve;

    return mockStripeModule;
});

const Stripe = require('stripe');

// --- Mocking Middleware ---
const mockClienteUser = {
    idutente: 1, // Default mock user ID for Cliente
    username: 'mockcliente_order',
    tipologia: 'Cliente',
    email: 'client_order@example.com', // Needed for Stripe
};

const mockArtigianoUser = {
    idutente: 99, // Different ID for Admin/Artigiano in other contexts
    username: 'mockadmin_order', // Changed to admin for some tests
    tipologia: 'Artigiano',
    email: 'artigiano_order@example.com',
};

const mockAdminUser = {
    idutente: 100,
    username: 'mockadmin_order_global',
    tipologia: 'Admin',
    email: 'admin_order_global@example.com',
};

jest.mock('../../../src/middleware/authMiddleWare', () => ({
    isAuthenticated: jest.fn((req, res, next) => {
        if (req.headers['x-mock-auth'] === 'false') {
            return res.status(401).json({ message: 'Unauthorized for test' });
        }
        // Default to Cliente user unless 'x-mock-user-type' header is set
        const userType = req.headers['x-mock-user-type'] || 'Cliente';
        if (userType === 'Admin') {
            req.user = mockAdminUser;
        } else if (userType === 'Artigiano') {
            req.user = mockArtigianoUser;
        } else {
            req.user = mockClienteUser;
        }
        next();
    }),
    hasPermission: jest.fn(permissions => (req, res, next) => {
        if (!req.user || !permissions.includes(req.user.tipologia)) {
            return res.status(403).json({ message: 'Forbidden for test' });
        }
        next();
    }),
}));

const app = express();
app.use(express.json());
app.use('/api/orders', orderRoutes);
app.use('/api/payments', paymentRoutes); // Add payment routes for verify-session

let testClient;
let originalPoolQuery;
let originalPoolConnect; // To store the original pool.connect method
let testUserCliente;
let testUserArtigiano; // For creating products
let testUserAdmin; // For admin operations
let testProduct1;
let testProduct2;
const testProduct1Price = 15.99;
const testProduct1Stock = 10;

beforeAll(async () => {
    process.env.FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3001/test-frontend';
    jest.useFakeTimers(); // Use fake timers for setTimeout in orderRoutes
});

beforeEach(async () => {
    testClient = await pool.connect();
    await testClient.query('BEGIN');

    originalPoolQuery = pool.query;
    pool.query = (...args) => testClient.query(...args);

    originalPoolConnect = pool.connect;
    // Mock pool.connect for the SUT. If the SUT calls pool.connect()
    // (e.g., in a setTimeout), it will get this mock.
    // This mock returns a client-like object that uses the single testClient for queries,
    // and its release() method is a no-op to prevent premature release of the actual testClient.
    pool.connect = jest.fn().mockImplementation(async () => {
        return {
            query: (...args) => {
                if (!testClient) {
                    console.error("Mocked pool.connect's client: testClient is null!");
                    throw new Error("Mocked pool.connect's client: testClient is null during query!");
                }
                return testClient.query(...args);
            },
            release: jest.fn(() => {
                return Promise.resolve(); // No-op release for this "virtual" client
            }),
            on: (eventName, handler) => { if (testClient) return testClient.on(eventName, handler); } // Basic delegation for 'on'
        };
    });

    // Reset middleware mocks
    require('../../../src/middleware/authMiddleWare').isAuthenticated.mockClear();
    require('../../../src/middleware/authMiddleWare').hasPermission.mockClear();

    // Clear and set default implementations for Stripe mock functions
    Stripe._mockCheckoutSessionsCreate.mockClear();
    Stripe._mockCheckoutSessionsRetrieve.mockClear();
    Stripe._mockCheckoutSessionsExpire.mockClear();
    Stripe._mockPaymentIntentsRetrieve.mockClear();

    Stripe._mockCheckoutSessionsCreate.mockResolvedValue(mockStripeCheckoutSession);
    Stripe._mockCheckoutSessionsRetrieve.mockImplementation(sessionId => {
        if (sessionId.startsWith('cs_test_')) {
            return Promise.resolve({ ...mockStripeCheckoutSession, id: sessionId, status: 'open', payment_status: 'unpaid' });
        }
        const error = new Error(`Mock Stripe: No session found with ID ${sessionId}`);
        error.code = 'resource_missing'; // Stripe's error code for not found
        return Promise.reject(error);
    });
    Stripe._mockCheckoutSessionsExpire.mockImplementation(sessionId => {
        if (sessionId.startsWith('cs_test_')) {
            return Promise.resolve({ ...mockStripeCheckoutSession, id: sessionId, status: 'expired' });
        }
        return Promise.reject(new Error(`Mock Stripe: No session to expire with ID ${sessionId}`));
    });
    Stripe._mockPaymentIntentsRetrieve.mockResolvedValue({ // Default for payment intent retrieval
        id: 'pi_test_12345',
        status: 'succeeded',
        payment_method_types: ['card'],
        payment_method: { type: 'card' } // Mocking expanded payment_method
    });

    // Create a Cliente user for cart operations
    const clienteSuffix = Date.now().toString() + Math.random().toString(36).substring(2, 7);
    const clienteUsername = `testcliente_order_${clienteSuffix}`;
    const clienteEmail = `testcliente_order_${clienteSuffix}@example.com`;
    const clienteHashedPassword = await bcryptjs.hash('passwordCliente', 10);
    const clienteRes = await testClient.query(
        `INSERT INTO utente (username, nome, cognome, email, password, indirizzo, tipologia, deleted)
         VALUES ($1, 'Test', 'ClienteOrder', $2, $3, '123 Order St, Order City', 'Cliente', FALSE) RETURNING *`,
        [clienteUsername, clienteEmail, clienteHashedPassword]
    );
    testUserCliente = clienteRes.rows[0];
    mockClienteUser.idutente = testUserCliente.idutente; // Update mock with real ID
    mockClienteUser.email = testUserCliente.email;

    // Create an Artigiano user to own products
    const artigianoSuffix = Date.now().toString() + Math.random().toString(36).substring(2, 7);
    const artigianoUsername = `testartigiano_order_${artigianoSuffix}`;
    const artigianoEmail = `testartigiano_order_${artigianoSuffix}@example.com`;
    const artigianoHashedPassword = await bcryptjs.hash('passwordArtigiano', 10);
    const artigianoRes = await testClient.query(
        `INSERT INTO utente (username, nome, cognome, email, password, indirizzo, tipologia, piva, artigianodescrizione, deleted)
         VALUES ($1, 'Test', 'ArtigianoOrder', $2, $3, '456 Artisan St', 'Artigiano', '11223344550', 'Desc Art', FALSE) RETURNING *`,
        [artigianoUsername, artigianoEmail, artigianoHashedPassword]
    );
    testUserArtigiano = artigianoRes.rows[0];
    mockArtigianoUser.idutente = testUserArtigiano.idutente;
    mockArtigianoUser.email = testUserArtigiano.email;

    // Create an Admin user
    const adminSuffix = Date.now().toString() + Math.random().toString(36).substring(2, 7);
    const adminUsername = `testadmin_order_${adminSuffix}`;
    const adminEmail = `testadmin_order_${adminSuffix}@example.com`;
    const adminHashedPassword = await bcryptjs.hash('passwordAdmin', 10);
    const adminRes = await testClient.query(
        `INSERT INTO utente (username, nome, cognome, email, password, indirizzo, tipologia, deleted,admintimestampcreazione)
         VALUES ($1, 'Test', 'AdminOrder', $2, $3, '789 Admin Ave', 'Admin', FALSE, NOW()) RETURNING *`,
        [adminUsername, adminEmail, adminHashedPassword]
    );
    testUserAdmin = adminRes.rows[0];
    mockAdminUser.idutente = testUserAdmin.idutente;
    mockAdminUser.email = testUserAdmin.email;

    // Create test products
    const product1Res = await testClient.query(
        `INSERT INTO Prodotto (nome, descrizione, categoria, prezzounitario, quantitadisponibile, idartigiano, deleted)
         VALUES ('Order Product 1', 'Desc P1', 'Cat Ord', $1, $2, $3, FALSE) RETURNING *`,
        [testProduct1Price, testProduct1Stock, testUserArtigiano.idutente]
    );
    testProduct1 = product1Res.rows[0];

    const product2Res = await testClient.query(
        `INSERT INTO Prodotto (nome, descrizione, categoria, prezzounitario, quantitadisponibile, idartigiano, deleted)
         VALUES ('Cart Product 2', 'Desc 2', 'Cat B', 20.00, 0, $1, FALSE) RETURNING *`, // Stock 0 for one test
        [testUserArtigiano.idutente]
    );
    testProduct2 = product2Res.rows[0];
});

afterEach(async () => {
    // Run any timers that were scheduled during the test by the SUT (System Under Test).
    // This is crucial when jest.useFakeTimers() is active for the test suite,
    // as it allows asynchronous operations in the SUT (e.g., those in setTimeout)
    // to complete or be processed before teardown.
    // Use runOnlyPendingTimers to avoid issues with infinitely recursive timers,
    // which could be the "loop or something" you suspect.
    jest.runOnlyPendingTimers();

    if (testClient) {
        // Capture current client and originalPoolQuery in case of errors or async issues
        const clientForTeardown = testClient; // Use a different name to avoid confusion
        const queryToRestore = originalPoolQuery;
        const connectToRestore = originalPoolConnect;

        try {
            // Use the captured client instance directly for ROLLBACK.
            await clientForTeardown.query('ROLLBACK');
        } catch (rollbackError) {
            console.error('Error during ROLLBACK in afterEach:', rollbackError);
            // Continue to ensure client is released and pool.query is restored.
        } finally {
            try {
                clientForTeardown.release(); // CRITICAL: Always release the client
            } catch (releaseError) {
                console.error('Error during client.release() in afterEach:', releaseError);
            }

            // Restore original pool methods using the captured functions
            if (typeof queryToRestore === 'function') {
                pool.query = queryToRestore;
            }
            if (typeof connectToRestore === 'function') {
                pool.connect = connectToRestore;
            }

            // Nullify the file-scoped variables *after* all operations are complete
            // and mocks have been restored.
            testClient = null;
            originalPoolQuery = null;
            originalPoolConnect = null;
        }
    } else {
        // Fallback if testClient was already null (e.g., error in beforeEach)
        // Attempt to restore mocks if their originals were somehow captured.
        if (originalPoolQuery) pool.query = originalPoolQuery;
        if (originalPoolConnect) pool.connect = originalPoolConnect;
        originalPoolQuery = null; // Ensure they are nulled for next test
        originalPoolConnect = null;
    }
});

afterAll(async () => {
    jest.useRealTimers(); // Ensure this is called before pool.end()
    await pool.end();
});

describe('GET /api/orders/my-orders', () => {
    let order1, order2;

    beforeEach(async () => {
        // Create a couple of orders for testUserCliente
        const orderData1 = {
            idcliente: testUserCliente.idutente,
            totaleordine: 50.00,
            indirizzospedizione: testUserCliente.indirizzo,
            metodospedizione: 'Standard',
            status: 'Da spedire', // Example status
            stripe_session_id: `cs_myorders_1_${Date.now()}`
        };
        const orderRes1 = await testClient.query(
            `INSERT INTO Ordine (idutente, importototale, status, stripecheckoutsessionid, data, ora)
             VALUES ($1, $2, $3, $4, CURRENT_DATE, CURRENT_TIME) RETURNING *`,
            [orderData1.idcliente, orderData1.totaleordine, orderData1.status, orderData1.stripe_session_id]
        );
        order1 = orderRes1.rows[0];

        // Add details for order1
        await testClient.query(
            `INSERT INTO DettagliOrdine (idordine, idprodotto, quantita, prezzostoricounitario) VALUES ($1, $2, 2, $3)`,
            [order1.idordine, testProduct1.idprodotto, testProduct1.prezzounitario]
        );

        const orderData2 = {
            idcliente: testUserCliente.idutente,
            totaleordine: 25.00,
            indirizzospedizione: testUserCliente.indirizzo,
            metodospedizione: 'Express',
            status: 'Spedito', // Example status
            stripe_session_id: `cs_myorders_2_${Date.now()}`
        };
        const orderRes2 = await testClient.query(
            `INSERT INTO Ordine (idutente, importototale, status, stripecheckoutsessionid, data, ora)
             VALUES ($1, $2, $3, $4, CURRENT_DATE - INTERVAL '1 day', CURRENT_TIME) RETURNING *`, // Order from yesterday
            [orderData2.idcliente, orderData2.totaleordine, orderData2.status, orderData2.stripe_session_id]
        );
        order2 = orderRes2.rows[0];
        await testClient.query(
            `INSERT INTO DettagliOrdine (idordine, idprodotto, quantita, prezzostoricounitario) VALUES ($1, $2, 1, $3)`,
            [order2.idordine, testProduct1.idprodotto, testProduct1.prezzounitario] // Assuming testProduct1 for simplicity
        );
    });

    test('Cliente should retrieve their own orders successfully', async () => {
        const res = await request(app)
            .get('/api/orders/my-orders')
            .set('x-mock-user-type', 'Cliente');

        expect(res.statusCode).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
        expect(res.body.length).toBe(2); // Expecting the two orders created
        
        const orderIds = res.body.map(o => o.idordine);
        expect(orderIds).toContain(order1.idordine);
        expect(orderIds).toContain(order2.idordine);

        res.body.forEach(order => {
            expect(order.idutente).toBe(testUserCliente.idutente);
            expect(order).toHaveProperty('dettagli');
            expect(Array.isArray(order.dettagli)).toBe(true);
            expect(order.dettagli.length).toBeGreaterThan(0);
            expect(order.dettagli[0]).toHaveProperty('nomeprodotto');
        });
    });

    test('Cliente with no orders should retrieve an empty array', async () => {
        // Ensure this client has no orders by using a different client or clearing orders for testUserCliente
        // For simplicity, let's assume testUserCliente might have orders from other tests,
        // so we'll use a new client ID for this test or ensure no orders exist for mockClienteUser.
        // The current setup uses mockClienteUser.idutente which is testUserCliente.idutente.
        // We'll rely on the transaction rollback to isolate this.
        // First, ensure no orders for this specific user in this transaction.
        await testClient.query('DELETE FROM dettagliordine WHERE idordine IN (SELECT idordine FROM ordine WHERE idutente = $1)', [testUserCliente.idutente]);
        await testClient.query('DELETE FROM Ordine WHERE idutente = $1', [testUserCliente.idutente]);

        const res = await request(app)
            .get('/api/orders/my-orders')
            .set('x-mock-user-type', 'Cliente');

        expect(res.statusCode).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
        expect(res.body.length).toBe(0);
    });

    test('Artigiano should get 403 when trying to access /my-orders', async () => {
        const res = await request(app)
            .get('/api/orders/my-orders')
            .set('x-mock-user-type', 'Artigiano');

        expect(res.statusCode).toBe(403);
        expect(res.body.message).toBe('Forbidden for test');
    });

    test('Unauthenticated user should get 401 when trying to access /my-orders', async () => {
        const res = await request(app)
            .get('/api/orders/my-orders')
            .set('x-mock-auth', 'false');

        expect(res.statusCode).toBe(401);
        expect(res.body.message).toBe('Unauthorized for test');
    });


});