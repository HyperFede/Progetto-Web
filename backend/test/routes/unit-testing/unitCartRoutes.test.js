const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });

const request = require('supertest');
const express = require('express');
const bcrypt = require('bcryptjs');
const cartRoutes = require('../../../src/routes/cartRoutes'); // Adjust path as needed
const pool = require('../../../src/config/db-connect'); // REAL pool

// Mocking middleware
const mockClienteUser = {
    idutente: 1, // Default mock user ID for Cliente
    username: 'mockcliente_cart',
    tipologia: 'Cliente',
};

const mockArtigianoUser = {
    idutente: 2, // Different ID for Artigiano
    username: 'mockartigiano_cart',
    tipologia: 'Artigiano',
};

jest.mock('../../../src/middleware/authMiddleWare', () => ({
    isAuthenticated: jest.fn((req, res, next) => {
        if (req.headers['x-mock-auth'] === 'false') {
            return res.status(401).json({ message: 'Unauthorized for test' });
        }
        // Default to Cliente user unless 'x-mock-user-type' header is set
        const userType = req.headers['x-mock-user-type'] || 'Cliente';
        req.user = userType === 'Artigiano' ? mockArtigianoUser : mockClienteUser;
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
app.use('/api/carts', cartRoutes);

let testClient;
let originalPoolQuery;
let testUserCliente;
let testUserArtigiano; // For creating products
let testProduct1;
let testProduct2;

beforeAll(async () => {
    // Create a general client for setup if needed, but most will be in beforeEach
});

beforeEach(async () => {
    testClient = await pool.connect();
    await testClient.query('BEGIN');
    originalPoolQuery = pool.query;
    pool.query = (...args) => testClient.query(...args);

    // Reset middleware mocks
    require('../../../src/middleware/authMiddleWare').isAuthenticated.mockClear();
    require('../../../src/middleware/authMiddleWare').hasPermission.mockClear();

    // Create a Cliente user for cart operations
    const clienteSuffix = Date.now().toString() + Math.random().toString(36).substring(2, 7);
    const clienteUsername = `testcliente_cart_${clienteSuffix}`;
    const clienteEmail = `testcliente_cart_${clienteSuffix}@example.com`;
    const clienteHashedPassword = await bcrypt.hash('password123', 10);
    const clienteRes = await testClient.query(
        `INSERT INTO utente (username, nome, cognome, email, password, indirizzo, tipologia, deleted)
         VALUES ($1, 'Test', 'ClienteCart', $2, $3, '123 Cart St', 'Cliente', FALSE) RETURNING *`,
        [clienteUsername, clienteEmail, clienteHashedPassword]
    );
    testUserCliente = clienteRes.rows[0];
    mockClienteUser.idutente = testUserCliente.idutente; // Update mock with real ID

    // Create an Artigiano user to own products
    const artigianoSuffix = Date.now().toString() + Math.random().toString(36).substring(2, 7);
    const artigianoUsername = `testartigiano_cart_owner_${artigianoSuffix}`;
    const artigianoEmail = `testartigiano_cart_owner_${artigianoSuffix}@example.com`;
    const artigianoHashedPassword = await bcrypt.hash('passwordArt', 10);
    const artigianoRes = await testClient.query(
        `INSERT INTO utente (username, nome, cognome, email, password, indirizzo, tipologia, piva, artigianodescrizione, deleted)
         VALUES ($1, 'Test', 'ArtigianoCartOwner', $2, $3, '456 Artisan St', 'Artigiano', '11223344556', 'Desc', FALSE) RETURNING *`,
        [artigianoUsername, artigianoEmail, artigianoHashedPassword]
    );
    testUserArtigiano = artigianoRes.rows[0];

    // Create test products
    const product1Res = await testClient.query(
        `INSERT INTO Prodotto (nome, descrizione, categoria, prezzounitario, quantitadisponibile, idartigiano, deleted)
         VALUES ('Cart Product 1', 'Desc 1', 'Cat A', 10.00, 5, $1, FALSE) RETURNING *`,
        [testUserArtigiano.idutente]
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
    if (testClient) {
        await testClient.query('ROLLBACK');
        testClient.release();
        pool.query = originalPoolQuery;
    }
});

afterAll(async () => {
    await pool.end();
});

describe('POST /api/carts/items - Add item to cart', () => {
    test('Cliente should add a new item to their cart successfully', async () => {
        const res = await request(app)
            .post('/api/carts/items')
            .set('x-mock-user-type', 'Cliente') // Ensures req.user is testUserCliente
            .send({ idprodotto: testProduct1.idprodotto, quantita: 2 });

        expect(res.statusCode).toBe(201);
        expect(res.body.idprodotto).toBe(testProduct1.idprodotto);
        expect(res.body.quantita).toBe(2);
        expect(res.body.idcliente).toBe(testUserCliente.idutente);
        expect(parseFloat(res.body.totaleparziale)).toBe(2 * parseFloat(testProduct1.prezzounitario));
        expect(res.body.nomeprodotto).toBe(testProduct1.nome);

        // Verify in DB
        const dbCheck = await testClient.query(
            'SELECT * FROM dettaglicarrello WHERE idcliente = $1 AND idprodotto = $2',
            [testUserCliente.idutente, testProduct1.idprodotto]
        );
        expect(dbCheck.rows.length).toBe(1);
        expect(dbCheck.rows[0].quantita).toBe(2);
    });

    test('should return 404 if product does not exist', async () => {
        const res = await request(app)
            .post('/api/carts/items')
            .set('x-mock-user-type', 'Cliente')
            .send({ idprodotto: 99999, quantita: 1 }); // Non-existent product

        expect(res.statusCode).toBe(404);
        expect(res.body.message).toBe('Prodotto non trovato o non disponibile.');
    });

    test('should return 400 if requested quantity exceeds available stock', async () => {
        const res = await request(app)
            .post('/api/carts/items')
            .set('x-mock-user-type', 'Cliente')
            .send({ idprodotto: testProduct1.idprodotto, quantita: testProduct1.quantitadisponibile + 1000 });

        expect(res.statusCode).toBe(400);
        expect(res.body.message).toContain('Stock insufficiente.');
    });

     test('should return 400 if product stock is zero (using testProduct2)', async () => {
        const res = await request(app)
            .post('/api/carts/items')
            .set('x-mock-user-type', 'Cliente')
            .send({ idprodotto: testProduct2.idprodotto, quantita: 1 });

        expect(res.statusCode).toBe(400);
        expect(res.body.message).toContain('Stock insufficiente.');
    });

    test('should return 400 if idprodotto is missing', async () => {
        const res = await request(app)
            .post('/api/carts/items')
            .set('x-mock-user-type', 'Cliente')
            .send({ quantita: 1 });

        expect(res.statusCode).toBe(400);
        expect(res.body.message).toBe('ID prodotto e quantità (intera, positiva) sono obbligatori.');
    });

    test('should return 400 if quantita is missing or invalid (zero)', async () => {
        const res = await request(app)
            .post('/api/carts/items')
            .set('x-mock-user-type', 'Cliente')
            .send({ idprodotto: testProduct1.idprodotto, quantita: 0 });

        expect(res.statusCode).toBe(400);
        expect(res.body.message).toBe('ID prodotto e quantità (intera, positiva) sono obbligatori.');
    });

    test('should return 400 if quantita is not an integer', async () => {
        const res = await request(app)
            .post('/api/carts/items')
            .set('x-mock-user-type', 'Cliente')
            .send({ idprodotto: testProduct1.idprodotto, quantita: 1.5 });

        expect(res.statusCode).toBe(400);
        expect(res.body.message).toBe('ID prodotto e quantità (intera, positiva) sono obbligatori.');
    });

    test('should return 403 if user is not Cliente (e.g., Artigiano)', async () => {
        const res = await request(app)
            .post('/api/carts/items')
            .set('x-mock-user-type', 'Artigiano') // Simulate Artigiano user
            .send({ idprodotto: testProduct1.idprodotto, quantita: 1 });

        expect(res.statusCode).toBe(403);
        expect(res.body.message).toBe('Forbidden for test');
    });

    test('should return 401 if user is not authenticated', async () => {
        const res = await request(app)
            .post('/api/carts/items')
            .set('x-mock-auth', 'false') // Simulate unauthenticated user
            .send({ idprodotto: testProduct1.idprodotto, quantita: 1 });

        expect(res.statusCode).toBe(401);
        expect(res.body.message).toBe('Unauthorized for test');
    });
});

describe('PUT /api/carts/items/:idprodotto - Update item quantity in cart', () => {
    let cartItem; // To store an item added to the cart in beforeEach

    // Add an item to the cart before each test in this describe block
    beforeEach(async () => {
        // Ensure testUserCliente and testProduct1 are available from the outer beforeEach
        if (!testUserCliente || !testProduct1) {
             throw new Error("Setup failed: testUserCliente or testProduct1 not available.");
        }
        // Add an item to the cart directly in the DB for testing updates
        const initialQuantity = 3;
        const initialTotal = parseFloat(testProduct1.prezzounitario) * initialQuantity;
        const insertRes = await testClient.query(
            `INSERT INTO dettaglicarrello (idcliente, idprodotto, quantita, totaleparziale)
             VALUES ($1, $2, $3, $4) RETURNING *`,
            [testUserCliente.idutente, testProduct1.idprodotto, initialQuantity, initialTotal]
        );
        cartItem = insertRes.rows[0];
        if (!cartItem) {
             throw new Error("Setup failed: Could not insert initial cart item.");
        }
    });

    test('Cliente should update item quantity successfully', async () => {
        const newQuantity = 5;
        const res = await request(app)
            .put(`/api/carts/items/${testProduct1.idprodotto}`)
            .set('x-mock-user-type', 'Cliente')
            .send({ quantita: newQuantity });

        expect(res.statusCode).toBe(200);
        expect(res.body.idprodotto).toBe(testProduct1.idprodotto);
        expect(res.body.quantita).toBe(newQuantity);
        expect(res.body.idcliente).toBe(testUserCliente.idutente);
        expect(parseFloat(res.body.totaleparziale)).toBe(newQuantity * parseFloat(testProduct1.prezzounitario));
        expect(res.body.nomeprodotto).toBe(testProduct1.nome);

        // Verify in DB
        const dbCheck = await testClient.query(
            'SELECT * FROM dettaglicarrello WHERE idcliente = $1 AND idprodotto = $2',
            [testUserCliente.idutente, testProduct1.idprodotto]
        );
        expect(dbCheck.rows.length).toBe(1);
        expect(dbCheck.rows[0].quantita).toBe(newQuantity);
    });

    test('Cliente should remove item if quantity is updated to 0', async () => {
        const newQuantity = 0;
        const res = await request(app)
            .put(`/api/carts/items/${testProduct1.idprodotto}`)
            .set('x-mock-user-type', 'Cliente')
            .send({ quantita: newQuantity });

        expect(res.statusCode).toBe(200);
        expect(res.body.message).toBe('Articolo rimosso dal carrello poiché la quantità specificata è zero o inferiore.');

        // Verify in DB
        const dbCheck = await testClient.query(
            'SELECT * FROM dettaglicarrello WHERE idcliente = $1 AND idprodotto = $2',
            [testUserCliente.idutente, testProduct1.idprodotto]
        );
        expect(dbCheck.rows.length).toBe(0); // Item should be removed
    });

     test('Cliente should remove item if quantity is updated to a negative number', async () => {
        const newQuantity = -1;
        const res = await request(app)
            .put(`/api/carts/items/${testProduct1.idprodotto}`)
            .set('x-mock-user-type', 'Cliente')
            .send({ quantita: newQuantity });

        expect(res.statusCode).toBe(200);
        expect(res.body.message).toBe('Articolo rimosso dal carrello poiché la quantità specificata è zero o inferiore.');

        // Verify in DB
        const dbCheck = await testClient.query(
            'SELECT * FROM dettaglicarrello WHERE idcliente = $1 AND idprodotto = $2',
            [testUserCliente.idutente, testProduct1.idprodotto]
        );
        expect(dbCheck.rows.length).toBe(0); // Item should be removed
    });

    test('should return 404 if product does not exist or is deleted', async () => {
        const res = await request(app)
            .put('/api/carts/items/99999') // Non-existent product ID
            .set('x-mock-user-type', 'Cliente')
            .send({ quantita: 1 });

        expect(res.statusCode).toBe(404);
        expect(res.body.message).toBe('Prodotto non trovato o non disponibile.');
    });

    test('should return 404 if item is not in the cart', async () => {
        // Use testProduct2 which is not added to the cart in beforeEach
        const res = await request(app)
            .put(`/api/carts/items/${testProduct2.idprodotto}`)
            .set('x-mock-user-type', 'Cliente')
            .send({ quantita: 1 });

        expect(res.statusCode).toBe(404);
        expect(res.body.message).toBe('Articolo non trovato nel carrello. Utilizzare POST /api/carts/items per aggiungere un nuovo articolo.');
    });

    test('should return 400 if requested quantity exceeds available stock', async () => {
        const res = await request(app)
            .put(`/api/carts/items/${testProduct1.idprodotto}`)
            .set('x-mock-user-type', 'Cliente')
            .send({ quantita: testProduct1.quantitadisponibile + 1 });

        expect(res.statusCode).toBe(400);
        expect(res.body.message).toContain('Stock insufficiente.');
    });

    test('should return 400 if quantita is missing or not an integer', async () => {
        const res = await request(app)
            .put(`/api/carts/items/${testProduct1.idprodotto}`)
            .set('x-mock-user-type', 'Cliente')
            .send({}); // Missing quantity

        expect(res.statusCode).toBe(400);
        expect(res.body.message).toBe('La quantità deve essere un numero intero.');

        const resFloat = await request(app)
            .put(`/api/carts/items/${testProduct1.idprodotto}`)
            .set('x-mock-user-type', 'Cliente')
            .send({ quantita: 1.5 }); // Float quantity

        expect(resFloat.statusCode).toBe(400);
        expect(resFloat.body.message).toBe('La quantità deve essere un numero intero.');
    });

    test('should return 403 if user is not Cliente', async () => {
        const res = await request(app)
            .put(`/api/carts/items/${testProduct1.idprodotto}`)
            .set('x-mock-user-type', 'Artigiano') // Simulate Artigiano
            .send({ quantita: 1 });

        expect(res.statusCode).toBe(403);
        expect(res.body.message).toBe('Forbidden for test');
    });

    test('should return 401 if user is not authenticated', async () => {
        const res = await request(app)
            .put(`/api/carts/items/${testProduct1.idprodotto}`)
            .set('x-mock-auth', 'false') // Simulate unauthenticated
            .send({ quantita: 1 });

        expect(res.statusCode).toBe(401);
        expect(res.body.message).toBe('Unauthorized for test');
    });
});


describe('GET /api/carts/:idcliente - Get cart details for a specific client', () => {
    let cartItem1, cartItem2, deletedProductCartItem;
    let testProductDeleted; // A product that will be marked as deleted

    beforeEach(async () => {
        // Ensure testUserCliente, testProduct1, testProduct2 are available
        if (!testUserCliente || !testProduct1 || !testProduct2 || !testUserArtigiano) {
            throw new Error("Setup failed: testUserCliente, testProduct1, or testProduct2 not available.");
        }

        // Create a product that will be marked as deleted
        const deletedProductRes = await testClient.query(
            `INSERT INTO Prodotto (nome, descrizione, categoria, prezzounitario, quantitadisponibile, idartigiano, deleted)
             VALUES ('Deleted Cart Product', 'Desc Deleted', 'Cat Del', 5.00, 10, $1, TRUE) RETURNING *`,
            [testUserArtigiano.idutente]
        );
        testProductDeleted = deletedProductRes.rows[0];

        // Add items to testUserCliente's cart directly in the DB
        const q1 = 2;
        const tp1 = parseFloat(testProduct1.prezzounitario) * q1;
        const item1Res = await testClient.query(
            `INSERT INTO dettaglicarrello (idcliente, idprodotto, quantita, totaleparziale)
             VALUES ($1, $2, $3, $4) RETURNING *`,
            [testUserCliente.idutente, testProduct1.idprodotto, q1, tp1]
        );
        cartItem1 = item1Res.rows[0];

        const q2 = 1;
        const tp2 = parseFloat(testProduct2.prezzounitario) * q2; // testProduct2 has stock 0, but cart can hold it
        const item2Res = await testClient.query(
            `INSERT INTO dettaglicarrello (idcliente, idprodotto, quantita, totaleparziale)
             VALUES ($1, $2, $3, $4) RETURNING *`,
            [testUserCliente.idutente, testProduct2.idprodotto, q2, tp2]
        );
        cartItem2 = item2Res.rows[0];

        // Add an item for the deleted product
        const qDel = 3;
        const tpDel = parseFloat(testProductDeleted.prezzounitario) * qDel;
        const deletedItemRes = await testClient.query(
            `INSERT INTO dettaglicarrello (idcliente, idprodotto, quantita, totaleparziale)
             VALUES ($1, $2, $3, $4) RETURNING *`,
            [testUserCliente.idutente, testProductDeleted.idprodotto, qDel, tpDel]
        );
        deletedProductCartItem = deletedItemRes.rows[0];

        if (!cartItem1 || !cartItem2 || !deletedProductCartItem) {
            throw new Error("Setup failed: Could not insert initial cart items for GET test.");
        }
    });

    test('Cliente should get their own cart successfully', async () => {
        const res = await request(app)
            .get(`/api/carts/${testUserCliente.idutente}`)
            .set('x-mock-user-type', 'Cliente');

        expect(res.statusCode).toBe(200);
        expect(res.body).toHaveProperty('items');
        expect(res.body).toHaveProperty('totaleCarrello');
        expect(Array.isArray(res.body.items)).toBe(true);
        // Should only contain non-deleted products
        expect(res.body.items.length).toBe(2); // testProduct1 and testProduct2 (even if stock 0)
        expect(res.body.items.some(item => item.idprodotto === testProduct1.idprodotto)).toBe(true);
        expect(res.body.items.some(item => item.idprodotto === testProduct2.idprodotto)).toBe(true);
        expect(res.body.items.some(item => item.idprodotto === testProductDeleted.idprodotto)).toBe(false);

        const expectedTotal = parseFloat(cartItem1.totaleparziale) + parseFloat(cartItem2.totaleparziale);
        expect(res.body.totaleCarrello).toBe(parseFloat(expectedTotal.toFixed(2)));

        res.body.items.forEach(item => {
            expect(item.prezzounitario).toMatch(/^\d+\.\d{2}$/);
            expect(item.totaleparziale).toMatch(/^\d+\.\d{2}$/);
        });
    });

    test('Admin should get any client\'s cart successfully', async () => {
        const res = await request(app)
            .get(`/api/carts/${testUserCliente.idutente}`)
            .set('x-mock-user-type', 'Admin'); // Simulate Admin user

        expect(res.statusCode).toBe(200);
        expect(res.body.items.length).toBe(2); // Only non-deleted
        const expectedTotal = parseFloat(cartItem1.totaleparziale) + parseFloat(cartItem2.totaleparziale);
        expect(res.body.totaleCarrello).toBe(parseFloat(expectedTotal.toFixed(2)));
    });

    test('Cliente should get 403 trying to access another client\'s cart', async () => {
        const otherClientId = testUserCliente.idutente + 1; // A different ID
        const res = await request(app)
            .get(`/api/carts/${otherClientId}`)
            .set('x-mock-user-type', 'Cliente');

        expect(res.statusCode).toBe(403);
        expect(res.body.message).toBe('Accesso negato. Non puoi visualizzare il carrello di un altro cliente');
    });

    test('Should return 400 for invalid idcliente format', async () => {
        const res = await request(app)
            .get('/api/carts/invalid-id')
            .set('x-mock-user-type', 'Admin');
        expect(res.statusCode).toBe(400);
        expect(res.body.message).toBe('ID cliente non valido.');
    });

    test('Should return 401 if user is not authenticated', async () => {
        const res = await request(app)
            .get(`/api/carts/${testUserCliente.idutente}`)
            .set('x-mock-auth', 'false');
        expect(res.statusCode).toBe(401);
        expect(res.body.message).toBe('Unauthorized for test');
    });
});

describe('PUT /api/carts/items/:idprodotto/add - Increment item quantity in cart', () => {
    let cartItem; // To store an item added to the cart in beforeEach
    const initialQuantity = 3;

    // Add an item to the cart before each test in this describe block
    beforeEach(async () => {
        // Ensure testUserCliente and testProduct1 are available from the outer beforeEach
        if (!testUserCliente || !testProduct1) {
             throw new Error("Setup failed: testUserCliente or testProduct1 not available.");
        }
        // Add an item to the cart directly in the DB for testing updates
        const initialTotal = parseFloat(testProduct1.prezzounitario) * initialQuantity;
        const insertRes = await testClient.query(
            `INSERT INTO dettaglicarrello (idcliente, idprodotto, quantita, totaleparziale)
             VALUES ($1, $2, $3, $4) RETURNING *`,
            [testUserCliente.idutente, testProduct1.idprodotto, initialQuantity, initialTotal]
        );
        cartItem = insertRes.rows[0];
        if (!cartItem) {
             throw new Error("Setup failed: Could not insert initial cart item for ADD test.");
        }
    });

    test('Cliente should increment item quantity successfully', async () => {
        const quantityToAdd = 2;
        const expectedNewQuantity = initialQuantity + quantityToAdd;

        const res = await request(app)
            .put(`/api/carts/items/${testProduct1.idprodotto}/add`)
            .set('x-mock-user-type', 'Cliente')
            .send({ quantita: quantityToAdd });

        expect(res.statusCode).toBe(200);
        expect(res.body.idprodotto).toBe(testProduct1.idprodotto);
        expect(res.body.quantita).toBe(expectedNewQuantity);
        expect(res.body.idcliente).toBe(testUserCliente.idutente);
        expect(parseFloat(res.body.totaleparziale)).toBe(expectedNewQuantity * parseFloat(testProduct1.prezzounitario));
        expect(res.body.nomeprodotto).toBe(testProduct1.nome);

        // Verify in DB
        const dbCheck = await testClient.query(
            'SELECT * FROM dettaglicarrello WHERE idcliente = $1 AND idprodotto = $2',
            [testUserCliente.idutente, testProduct1.idprodotto]
        );
        expect(dbCheck.rows.length).toBe(1);
        expect(dbCheck.rows[0].quantita).toBe(expectedNewQuantity);
    });

    test('should return 400 if quantity to add is missing or invalid (zero, negative, float)', async () => {
        // Missing quantity
        let res = await request(app)
            .put(`/api/carts/items/${testProduct1.idprodotto}/add`)
            .set('x-mock-user-type', 'Cliente')
            .send({});
        expect(res.statusCode).toBe(400);
        expect(res.body.message).toBe('La quantità da aggiungere deve essere un numero intero positivo.');

        // Zero quantity
        res = await request(app)
            .put(`/api/carts/items/${testProduct1.idprodotto}/add`)
            .set('x-mock-user-type', 'Cliente')
            .send({ quantita: 0 });
        expect(res.statusCode).toBe(400);
        expect(res.body.message).toBe('La quantità da aggiungere deve essere un numero intero positivo.');

        // Negative quantity
        res = await request(app)
            .put(`/api/carts/items/${testProduct1.idprodotto}/add`)
            .set('x-mock-user-type', 'Cliente')
            .send({ quantita: -1 });
        expect(res.statusCode).toBe(400);
        expect(res.body.message).toBe('La quantità da aggiungere deve essere un numero intero positivo.');

        // Float quantity
        res = await request(app)
            .put(`/api/carts/items/${testProduct1.idprodotto}/add`)
            .set('x-mock-user-type', 'Cliente')
            .send({ quantita: 1.5 });
        expect(res.statusCode).toBe(400);
        expect(res.body.message).toBe('La quantità da aggiungere deve essere un numero intero positivo.');
    });

    test('should return 404 if product associated with cart item does not exist or is deleted', async () => {
        // Delete the product directly in DB for this test
        await testClient.query('UPDATE Prodotto SET deleted = TRUE WHERE idprodotto = $1', [testProduct1.idprodotto]);

        const res = await request(app)
            .put(`/api/carts/items/${testProduct1.idprodotto}/add`)
            .set('x-mock-user-type', 'Cliente')
            .send({ quantita: 1 });

        expect(res.statusCode).toBe(404);
        expect(res.body.message).toBe('Prodotto non trovato o non disponibile.');
    });

    test('should return 404 if item is not in the cart', async () => {
        // Use testProduct2 which is not added to the cart in beforeEach
        const res = await request(app)
            .put(`/api/carts/items/${testProduct2.idprodotto}/add`)
            .set('x-mock-user-type', 'Cliente')
            .send({ quantita: 1 });

        expect(res.statusCode).toBe(404);
        expect(res.body.message).toBe('Articolo non trovato nel carrello. Usa POST /api/carts/items per aggiungerlo.');
    });

    test('should return 400 if incrementing quantity exceeds available stock', async () => {
        const quantityToAdd = testProduct1.quantitadisponibile - initialQuantity + 1; // Add just enough to exceed stock

        const res = await request(app)
            .put(`/api/carts/items/${testProduct1.idprodotto}/add`)
            .set('x-mock-user-type', 'Cliente')
            .send({ quantita: quantityToAdd });

        expect(res.statusCode).toBe(400);
        expect(res.body.message).toContain('Stock insufficiente.');
    });

    // Basic auth/permission tests (assuming covered by general PUT tests, but can add if needed)
    test('should return 403 if user is not Cliente', async () => {
        const res = await request(app)
            .put(`/api/carts/items/${testProduct1.idprodotto}/add`)
            .set('x-mock-user-type', 'Artigiano') // Simulate Artigiano
            .send({ quantita: 1 });
        expect(res.statusCode).toBe(403);
        expect(res.body.message).toBe('Forbidden for test');
    });

    test('should return 401 if user is not authenticated', async () => {
        const res = await request(app)
            .put(`/api/carts/items/${testProduct1.idprodotto}/add`)
            .set('x-mock-auth', 'false') // Simulate unauthenticated
            .send({ quantita: 1 });
        expect(res.statusCode).toBe(401);
        expect(res.body.message).toBe('Unauthorized for test');
    });
});

describe('PUT /api/carts/items/:idprodotto/subtract - Decrement item quantity in cart', () => {
    let cartItem; // To store an item added to the cart in beforeEach
    const initialQuantity = 5; // Start with enough quantity to subtract

    // Add an item to the cart before each test in this describe block
    beforeEach(async () => {
        // Ensure testUserCliente and testProduct1 are available from the outer beforeEach
        if (!testUserCliente || !testProduct1) {
             throw new Error("Setup failed: testUserCliente or testProduct1 not available.");
        }
        // Add an item to the cart directly in the DB for testing updates
        const initialTotal = parseFloat(testProduct1.prezzounitario) * initialQuantity;
        const insertRes = await testClient.query(
            `INSERT INTO dettaglicarrello (idcliente, idprodotto, quantita, totaleparziale)
             VALUES ($1, $2, $3, $4) RETURNING *`,
            [testUserCliente.idutente, testProduct1.idprodotto, initialQuantity, initialTotal]
        );
        cartItem = insertRes.rows[0];
        if (!cartItem) {
             throw new Error("Setup failed: Could not insert initial cart item for SUBTRACT test.");
        }
    });

    test('Cliente should decrement item quantity successfully (quantity remains positive)', async () => {
        const quantityToSubtract = 2;
        const expectedNewQuantity = initialQuantity - quantityToSubtract; // 5 - 2 = 3

        const res = await request(app)
            .put(`/api/carts/items/${testProduct1.idprodotto}/subtract`)
            .set('x-mock-user-type', 'Cliente')
            .send({ quantita: quantityToSubtract });

        expect(res.statusCode).toBe(200);
        expect(res.body.idprodotto).toBe(testProduct1.idprodotto);
        expect(res.body.quantita).toBe(expectedNewQuantity);
        expect(res.body.idcliente).toBe(testUserCliente.idutente);
        expect(parseFloat(res.body.totaleparziale)).toBe(expectedNewQuantity * parseFloat(testProduct1.prezzounitario));
        expect(res.body.nomeprodotto).toBe(testProduct1.nome);

        // Verify in DB
        const dbCheck = await testClient.query(
            'SELECT * FROM dettaglicarrello WHERE idcliente = $1 AND idprodotto = $2',
            [testUserCliente.idutente, testProduct1.idprodotto]
        );
        expect(dbCheck.rows.length).toBe(1);
        expect(dbCheck.rows[0].quantita).toBe(expectedNewQuantity);
    });

    test('Cliente should remove item if quantity is decremented to 0', async () => {
        const quantityToSubtract = initialQuantity; // Subtract the full amount (5)

        const res = await request(app)
            .put(`/api/carts/items/${testProduct1.idprodotto}/subtract`)
            .set('x-mock-user-type', 'Cliente')
            .send({ quantita: quantityToSubtract });

        expect(res.statusCode).toBe(200);
        expect(res.body.message).toBe('Articolo rimosso dal carrello poiché la quantità è scesa a zero o un valore inferiore.');

        // Verify in DB
        const dbCheck = await testClient.query(
            'SELECT * FROM dettaglicarrello WHERE idcliente = $1 AND idprodotto = $2',
            [testUserCliente.idutente, testProduct1.idprodotto]
        );
        expect(dbCheck.rows.length).toBe(0); // Item should be removed
    });

     test('Cliente should remove item if quantity is decremented to a negative number', async () => {
        const quantityToSubtract = initialQuantity + 1; // Subtract more than available (5 + 1 = 6)

        const res = await request(app)
            .put(`/api/carts/items/${testProduct1.idprodotto}/subtract`)
            .set('x-mock-user-type', 'Cliente')
            .send({ quantita: quantityToSubtract });

        expect(res.statusCode).toBe(200);
        expect(res.body.message).toBe('Articolo rimosso dal carrello poiché la quantità è scesa a zero o un valore inferiore.');

        // Verify in DB
        const dbCheck = await testClient.query(
            'SELECT * FROM dettaglicarrello WHERE idcliente = $1 AND idprodotto = $2',
            [testUserCliente.idutente, testProduct1.idprodotto]
        );
        expect(dbCheck.rows.length).toBe(0); // Item should be removed
    });

    test('should return 400 if quantity to subtract is missing or invalid (zero, negative, float)', async () => {
        // Missing quantity
        let res = await request(app)
            .put(`/api/carts/items/${testProduct1.idprodotto}/subtract`)
            .set('x-mock-user-type', 'Cliente')
            .send({});
        expect(res.statusCode).toBe(400);
        expect(res.body.message).toBe('La quantità da sottrarre deve essere un numero intero positivo.');

        // Zero quantity
        res = await request(app)
            .put(`/api/carts/items/${testProduct1.idprodotto}/subtract`)
            .set('x-mock-user-type', 'Cliente')
            .send({ quantita: 0 });
        expect(res.statusCode).toBe(400);
        expect(res.body.message).toBe('La quantità da sottrarre deve essere un numero intero positivo.');

        // Negative quantity
        res = await request(app)
            .put(`/api/carts/items/${testProduct1.idprodotto}/subtract`)
            .set('x-mock-user-type', 'Cliente')
            .send({ quantita: -1 });
        expect(res.statusCode).toBe(400);
        expect(res.body.message).toBe('La quantità da sottrarre deve essere un numero intero positivo.');

        // Float quantity
        res = await request(app)
            .put(`/api/carts/items/${testProduct1.idprodotto}/subtract`)
            .set('x-mock-user-type', 'Cliente')
            .send({ quantita: 1.5 });
        expect(res.statusCode).toBe(400);
        expect(res.body.message).toBe('La quantità da sottrarre deve essere un numero intero positivo.');
    });

    test('should return 404 if product associated with cart item does not exist or is deleted', async () => {
        // Delete the product directly in DB for this test
        await testClient.query('UPDATE Prodotto SET deleted = TRUE WHERE idprodotto = $1', [testProduct1.idprodotto]);

        const res = await request(app)
            .put(`/api/carts/items/${testProduct1.idprodotto}/subtract`)
            .set('x-mock-user-type', 'Cliente')
            .send({ quantita: 1 });

        expect(res.statusCode).toBe(404);
        expect(res.body.message).toBe('Prodotto associato all\'articolo del carrello non trovato o non disponibile.');
    });

    test('should return 404 if item is not in the cart', async () => {
        // Use testProduct2 which is not added to the cart in beforeEach
        const res = await request(app)
            .put(`/api/carts/items/${testProduct2.idprodotto}/subtract`)
            .set('x-mock-user-type', 'Cliente')
            .send({ quantita: 1 });

        expect(res.statusCode).toBe(404);
        expect(res.body.message).toBe('Articolo non trovato nel carrello.');
    });

    // Basic auth/permission tests (assuming covered by general PUT tests, but can add if needed)
    test('should return 403 if user is not Cliente', async () => {
        const res = await request(app)
            .put(`/api/carts/items/${testProduct1.idprodotto}/subtract`)
            .set('x-mock-user-type', 'Artigiano') // Simulate Artigiano
            .send({ quantita: 1 });
        expect(res.statusCode).toBe(403);
        expect(res.body.message).toBe('Forbidden for test');
    });

    test('should return 401 if user is not authenticated', async () => {
        const res = await request(app)
            .put(`/api/carts/items/${testProduct1.idprodotto}/subtract`)
            .set('x-mock-auth', 'false') // Simulate unauthenticated
            .send({ quantita: 1 });
        expect(res.statusCode).toBe(401);
        expect(res.body.message).toBe('Unauthorized for test');
    });
});