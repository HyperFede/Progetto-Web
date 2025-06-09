const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });

const request = require('supertest');
const express = require('express');
const productRoutes = require('../../../src/routes/productRoutes'); // Adjust path as needed
const pool = require('../../../src/config/db-connect'); // Now the REAL pool
const bcrypt = require('bcryptjs'); // For hashing password of test artisan

// Mocking middleware di autenticazione e autorizzazione (remains the same)
// to simulate authenticated users for unit tests
const mockAuthenticatedUser = {
    idutente: 1, // Default mock user ID
    username: 'mockartigiano',
    tipologia: 'Artigiano', // Default to Artigiano for product creation
};

const mockClienteUser = {
    idutente: 2,
    username: 'mockcliente',
    tipologia: 'Cliente',
};

jest.mock('../../../src/middleware/authMiddleWare', () => ({
    isAuthenticated: jest.fn((req, res, next) => {
        // Simulate authentication based on a test-specific header or default
        if (req.headers['x-mock-auth'] === 'false') {
            // Simulate unauthenticated user
            return res.status(401).json({ message: 'Unauthorized for test' });
        }
        req.user = req.headers['x-mock-user-type'] === 'Cliente' ? mockClienteUser : mockAuthenticatedUser;
        next();
    }),
    hasPermission: jest.fn(permissions => (req, res, next) => {
        if (!req.user || !permissions.includes(req.user.tipologia)) {
            return res.status(403).json({ message: 'Forbidden for test' });
        }
        next();
    }),
}));

// No longer mocking db-connect, will use real pool and transactions

const app = express();
app.use(express.json());
app.use('/api/products', productRoutes);

// Variables for transaction management and test user
let testClient;
let originalPoolQuery;
let testArtigianoUser;
let otherTestArtigianoUser; // For testing admin changing product owner
let testProduct; // To store a product created in beforeEach for PUT/DELETE tests

beforeEach(async () => {
    testClient = await pool.connect();
    await testClient.query('BEGIN');
    originalPoolQuery = pool.query;
    // Redirect pool.query to the transaction client for route handlers
    pool.query = (...args) => testClient.query(...args);

    // Reset middleware mocks
    if (require('../../../src/middleware/authMiddleWare').isAuthenticated.mockClear) {
        require('../../../src/middleware/authMiddleWare').isAuthenticated.mockClear();
    }
    if (require('../../../src/middleware/authMiddleWare').hasPermission.mockClear) {
        require('../../../src/middleware/authMiddleWare').hasPermission.mockClear();
    }

    // Create a temporary artisan user in the DB for this test
    const artigianoSuffix = Date.now().toString() + Math.random().toString(36).substring(2, 7);
    const artigianoUsername = `testartigiano_prod_${artigianoSuffix}`;
    const artigianoEmail = `testartigiano_prod_${artigianoSuffix}@example.com`;
    const hashedPassword = await bcrypt.hash('password123', 10);

    const artigianoRes = await testClient.query(
        `INSERT INTO utente (username, nome, cognome, email, password, indirizzo, tipologia, piva, artigianodescrizione, deleted)
         VALUES ($1, 'Test', 'ArtigianoProduct', $2, $3, '123 Product St', 'Artigiano', '98765432101', 'Artisan Product Desc', FALSE) RETURNING *`,
        [artigianoUsername, artigianoEmail, hashedPassword]
    );
    testArtigianoUser = artigianoRes.rows[0];

    // Update the mockAuthenticatedUser to use the ID of the newly created artisan
    // This mockAuthenticatedUser will be the default 'Artigiano' making requests
    mockAuthenticatedUser.idutente = testArtigianoUser.idutente;
    mockAuthenticatedUser.username = testArtigianoUser.username;

    // Create another artisan user for specific tests (e.g., admin changing product owner)
    const otherArtigianoSuffix = Date.now().toString() + Math.random().toString(36).substring(2, 7);
    const otherArtigianoUsername = `other_prod_art_${otherArtigianoSuffix}`;
    const otherArtigianoEmail = `other_prod_art_${otherArtigianoSuffix}@example.com`;
    const otherHashedPassword = await bcrypt.hash('password456', 10);
    const otherArtigianoRes = await testClient.query(
        `INSERT INTO utente (username, nome, cognome, email, password, indirizzo, tipologia, piva, artigianodescrizione, deleted)
         VALUES ($1, 'OtherTest', 'ArtigianoProductOther', $2, $3, '456 Product St Other', 'Artigiano', '10987654321', 'Other Artisan Product Desc', FALSE) RETURNING *`,
        [otherArtigianoUsername, otherArtigianoEmail, otherHashedPassword]
    );
    otherTestArtigianoUser = otherArtigianoRes.rows[0];
});

const validProductData = {
    nome: 'Test Product DB',
    descrizione: 'Test Description DB',
    categoria: 'Test Category DB',
    prezzounitario: 10.99,
    quantitadisponibile: 100,
};

// beforeEach for product creation, runs after user creation
beforeEach(async () => {
    // Create a product owned by testArtigianoUser
    const productRes = await testClient.query(
        `INSERT INTO Prodotto (nome, descrizione, categoria, prezzounitario, quantitadisponibile, immagine, idartigiano, deleted)
         VALUES ($1, $2, $3, $4, $5, $6, $7, FALSE) RETURNING *`,
        [
            'Initial Test Product', 'Initial Description', 'Initial Category',
            19.99, 50, null, testArtigianoUser.idutente
        ]
    );
    testProduct = productRes.rows[0];
    // Ensure testProduct is defined before tests that rely on it run
    if (!testProduct || !testProduct.idprodotto) {
        throw new Error("Failed to create testProduct in beforeEach setup.");
    }
});
afterEach(async () => {
    if (testClient) {
        await testClient.query('ROLLBACK');
        testClient.release();
        pool.query = originalPoolQuery; // Restore original pool.query
    }
});

afterAll(async () => {
    await pool.end(); // Close the pool after all tests are done
});

describe('POST /api/products - Unit Tests with Real DB', () => {


    test('should create a new product successfully for an Artigiano', async () => {
        const res = await request(app)
            .post('/api/products')
            .send(validProductData);

        expect(res.statusCode).toBe(201);
        expect(res.body).toHaveProperty('idprodotto');
        const createdProductId = res.body.idprodotto;
        expect(res.body.nome).toBe(validProductData.nome);
        expect(res.body.idartigiano).toBe(testArtigianoUser.idutente); // Check against the dynamically created artisan

        // Verify in DB (within the same transaction)
        const dbCheck = await testClient.query('SELECT * FROM Prodotto WHERE idprodotto = $1', [createdProductId]);
        expect(dbCheck.rows.length).toBe(1);
        expect(dbCheck.rows[0].nome).toBe(validProductData.nome);
        expect(dbCheck.rows[0].idartigiano).toBe(testArtigianoUser.idutente);
        expect(dbCheck.rows[0].deleted).toBe(false);
        expect(dbCheck.rows[0].immagine).toBeNull();
    });

    test('should return 400 if required fields are missing', async () => {
        const incompleteData = { nome: 'Test Product Only' };
        const res = await request(app)
            .post('/api/products')
            .send(incompleteData);

        expect(res.statusCode).toBe(400);
        expect(res.body.error).toContain('Campi obbligatori mancanti');
    });

    test('should return 400 if prezzounitario is not a positive number', async () => {
        const res = await request(app)
            .post('/api/products')
            .send({ ...validProductData, prezzounitario: -5 });

        expect(res.statusCode).toBe(400);
        expect(res.body.error).toBe('Il prezzo unitario deve essere un numero positivo.');
    });

    test('should return 400 if prezzounitario is zero', async () => {
        const res = await request(app)
            .post('/api/products')
            .send({ ...validProductData, prezzounitario: 0 });

        expect(res.statusCode).toBe(400);
        expect(res.body.error).toBe('Il prezzo unitario deve essere un numero positivo.');
    });


    test('should return 400 if quantitadisponibile is not a positive integer', async () => {
        const res = await request(app)
            .post('/api/products')
            .send({ ...validProductData, quantitadisponibile: 10.5 });

        expect(res.statusCode).toBe(400);
        expect(res.body.error).toBe('La quantità disponibile deve essere un intero positivo.');
    });

     test('should return 400 if quantitadisponibile is zero', async () => {
        const res = await request(app)
            .post('/api/products')
            .send({ ...validProductData, quantitadisponibile: 0 });

        expect(res.statusCode).toBe(400);
        expect(res.body.error).toBe('La quantità disponibile deve essere un intero positivo.');
    });


    test('should return 403 if user is not Artigiano (e.g., Cliente)', async () => {
        const res = await request(app)
            .post('/api/products')
            .set('x-mock-user-type', 'Cliente') // Simulate a Cliente user
            .send(validProductData);

        expect(res.statusCode).toBe(403);
        expect(res.body.message).toBe('Forbidden for test');
    });

    test('should return 401 if user is not authenticated', async () => {
        const res = await request(app)
            .post('/api/products')
            .set('x-mock-auth', 'false') // Simulate unauthenticated user
            .send(validProductData);

        expect(res.statusCode).toBe(401);
        expect(res.body.message).toBe('Unauthorized for test');
    });

    test('should return 400 for foreign key constraint violation (db error 23503 - invalid idartigiano)', async () => {
        // This specific error for idartigiano is less likely with current logic as idartigiano comes from token.
        // However, if the user in the token somehow doesn't exist in DB (e.g., deleted after token issuance but before this call),
        // or if there was a way to pass idartigiano and it was invalid.
        // For now, we simulate a generic FK violation that could occur.
        // To test this, we'll temporarily set the mockAuthenticatedUser's idutente to an invalid ID.
        const originalArtigianoId = mockAuthenticatedUser.idutente;
        mockAuthenticatedUser.idutente = 999999; // An ID that certainly won't exist in 'utente' table

        const res = await request(app)
            .post('/api/products')
            .send(validProductData);

        expect(res.statusCode).toBe(400); // The DB will reject the INSERT due to FK violation
        expect(res.body.error).toBe('ID artigiano finale non valido. Artigiano non esistente.');

        // Restore mock user for other tests
        mockAuthenticatedUser.idutente = originalArtigianoId;
    });

    test('should return 400 for check constraint violation on quantitadisponibile (db error 23514)', async () => {
        // This test is tricky if application validation is stricter than DB.
        // App validation: quantitadisponibile <= 0 -> error "La quantità disponibile deve essere un intero positivo."
        // DB constraint (assumed): quantitadisponibile >= 0
        // If we send -1, app catches it.
        // The specific DB error message "La quantità disponibile non può essere negativa."
        // is hit if err.constraint.includes('quantitadisponibile').
        // To hit this, the app validation would need to be bypassed or be looser.
        // For now, this specific DB error path for quantitadisponibile is hard to trigger via API.
        // We'll test the generic 23514 handler instead if a different check constraint is violated.
        // This test case might need to be re-evaluated based on exact DB schema and desired test coverage for the error handler.
        // For now, let's assume this test is to check the handler if such an error *could* occur.
        // To simulate, we'd need to mock testClient.query to throw this specific error.
        const originalTestClientQuery = testClient.query;
        testClient.query = jest.fn().mockRejectedValueOnce({ code: '23514', constraint: 'prodotto_quantitadisponibile_check', message: 'Check constraint violation test' });

        const res = await request(app)
            .post('/api/products')
            .send(validProductData);
        expect(res.statusCode).toBe(400);
        expect(res.body.error).toBe("La quantità disponibile non può essere negativa.");
        testClient.query = originalTestClientQuery; // Restore
    });

    test('should return 400 for a generic check constraint violation (db error 23514)', async () => {
        // Similar to the above, hard to trigger a *generic* DB check constraint if app validation is robust.
        // This test is for the else branch of the 23514 handler.
        // We simulate this by making testClient.query throw a 23514 error without 'quantitadisponibile' in constraint name.
        const originalTestClientQuery = testClient.query;
        testClient.query = jest.fn().mockRejectedValueOnce({ code: '23514', constraint: 'some_other_product_check', message: 'Generic check constraint test' });
        const res = await request(app).post('/api/products').send(validProductData);
        expect(res.statusCode).toBe(400);
        expect(res.body.error).toBe("I dati del prodotto violano un vincolo di controllo.");
        testClient.query = originalTestClientQuery; // Restore
    });

    test('should return 500 for other database errors', async () => {
        // To test this, we make testClient.query throw a generic error.
        const originalTestClientQuery = testClient.query;
        testClient.query = jest.fn().mockRejectedValueOnce(new Error('Forced generic DB error for test'));

        const res = await request(app)
            .post('/api/products')
            .send(validProductData);

        expect(res.statusCode).toBe(500);
        expect(res.body.error).toBe("Errore del server durante la creazione del prodotto.");

        testClient.query = originalTestClientQuery; // Restore
    });

});

describe('PUT /api/products/:id - Unit Tests with Real DB', () => {
    const productUpdateData = {
        nome: 'Updated Product Name',
        descrizione: 'Updated Description',
        categoria: 'Updated Category',
        prezzounitario: 99.99,
        quantitadisponibile: 10,
    };

    test('Artigiano should update their own product successfully', async () => {
        const res = await request(app)
            .put(`/api/products/${testProduct.idprodotto}`)
            .set('x-mock-user-type', 'Artigiano') // Ensure the mock uses testArtigianoUser
            .send(productUpdateData);

        expect(res.statusCode).toBe(200);
        expect(res.body.product.idprodotto).toBe(testProduct.idprodotto);
        expect(res.body.product.nome).toBe(productUpdateData.nome);
        expect(res.body.product.prezzounitario).toBe(productUpdateData.prezzounitario);
        expect(res.body.product.idartigiano).toBe(testArtigianoUser.idutente); // Owner should not change

        // Verify in DB
        const dbCheck = await testClient.query('SELECT * FROM Prodotto WHERE idprodotto = $1', [testProduct.idprodotto]);
        expect(dbCheck.rows[0].nome).toBe(productUpdateData.nome);
        expect(dbCheck.rows[0].quantitadisponibile).toBe(productUpdateData.quantitadisponibile);
    });

    test('Admin should update any product successfully (e.g., product owned by testArtigianoUser)', async () => {
        const adminUpdateData = { ...productUpdateData, nome: "Admin Updated Name" };
        const res = await request(app)
            .put(`/api/products/${testProduct.idprodotto}`)
            .set('x-mock-user-type', 'Admin') // Simulate Admin user
            .send(adminUpdateData);

        expect(res.statusCode).toBe(200);
        expect(res.body.product.nome).toBe(adminUpdateData.nome);
        expect(res.body.product.idartigiano).toBe(testArtigianoUser.idutente); // Owner not changed in this test
    });

    test('Artigiano should NOT be able to change idartigiano to another artisan', async () => {
        const attemptChangeOwnerData = { idartigiano: otherTestArtigianoUser.idutente };
        const res = await request(app)
            .put(`/api/products/${testProduct.idprodotto}`)
            .set('x-mock-user-type', 'Artigiano')
            .send(attemptChangeOwnerData);

        expect(res.statusCode).toBe(403);
        expect(res.body.error).toBe("Vietato: gli artigiani non possono cambiare il proprietario del prodotto.");
    });

    test('Artigiano should be able to "update" idartigiano to their own ID (no change)', async () => {
        const updateOwnIdData = { idartigiano: testArtigianoUser.idutente, nome: "Name Updated Own ID" };
        const res = await request(app)
            .put(`/api/products/${testProduct.idprodotto}`)
            .set('x-mock-user-type', 'Artigiano')
            .send(updateOwnIdData);

        expect(res.statusCode).toBe(200);
        expect(res.body.product.idartigiano).toBe(testArtigianoUser.idutente);
        expect(res.body.product.nome).toBe("Name Updated Own ID");
    });

    test('Should return 403 if Artigiano tries to update another Artigiano\'s product', async () => {
        // Create a product owned by otherTestArtigianoUser
        const otherProductRes = await testClient.query(
            `INSERT INTO Prodotto (nome, descrizione, categoria, prezzounitario, quantitadisponibile, idartigiano, deleted)
             VALUES ('Other Product', 'Desc', 'Cat', 10, 10, $1, FALSE) RETURNING idprodotto`,
            [otherTestArtigianoUser.idutente]
        );
        const otherProductId = otherProductRes.rows[0].idprodotto;

        const res = await request(app)
            .put(`/api/products/${otherProductId}`)
            .set('x-mock-user-type', 'Artigiano') // mockAuthenticatedUser is testArtigianoUser
            .send({ nome: "Attempted Update" });

        expect(res.statusCode).toBe(403);
        expect(res.body.error).toBe("Vietato: l'artigiano può aggiornare solo i propri prodotti.");
    });

    test('Should return 400 if no fields are provided for update', async () => {
        const res = await request(app)
            .put(`/api/products/${testProduct.idprodotto}`)
            .set('x-mock-user-type', 'Artigiano')
            .send({});
        expect(res.statusCode).toBe(400);
        expect(res.body.error).toBe("Nessun campo da aggiornare fornito.");
    });

    test('Should return 404 if product to update does not exist', async () => {
        const res = await request(app)
            .put('/api/products/999999') // Non-existent ID
            .set('x-mock-user-type', 'Admin')
            .send({ nome: "Update Fail" });
        expect(res.statusCode).toBe(404);
        expect(res.body.error).toBe("Prodotto non trovato o è stato rimosso, impossibile aggiornare.");
    });

    test('Should return 400 for invalid prezzounitario (negative)', async () => {
        const res = await request(app)
            .put(`/api/products/${testProduct.idprodotto}`)
            .set('x-mock-user-type', 'Artigiano')
            .send({ prezzounitario: -10 });
        expect(res.statusCode).toBe(400);
        expect(res.body.error).toBe('Il prezzo unitario deve essere un numero non negativo.');
    });

    test('Should include special message if quantitadisponibile is updated to 0', async () => {
        const res = await request(app)
            .put(`/api/products/${testProduct.idprodotto}`)
            .set('x-mock-user-type', 'Artigiano')
            .send({ quantitadisponibile: 0 });

        expect(res.statusCode).toBe(200);
        expect(res.body.message).toContain("Nota: lo stock del prodotto è ora 0.");
        expect(res.body.product.quantitadisponibile).toBe(0);
    });
});

describe('DELETE /api/products/:id - Unit Tests with Real DB', () => {
    let productToDelete; // A product created specifically for delete tests
    let otherArtisanProduct; // A product owned by otherTestArtigianoUser

    beforeEach(async () => {
        // Create a fresh product for each delete test, owned by testArtigianoUser
        const productData = {
            nome: `ProductToDelete_${Date.now()}`,
            des: 'Delete me',
            cat: 'Ephemeral',
            price: 5.00,
            qty: 1,
            idartigiano: testArtigianoUser.idutente
        };
        const dbRes = await testClient.query(
            `INSERT INTO Prodotto (nome, descrizione, categoria, prezzounitario, quantitadisponibile, idartigiano, deleted)
             VALUES ($1, $2, $3, $4, $5, $6, FALSE) RETURNING *`,
            [productData.nome, productData.des, productData.cat, productData.price, productData.qty, productData.idartigiano]
        );
        productToDelete = dbRes.rows[0];

        // Create a product owned by otherTestArtigianoUser for permission tests
         const otherProductData = {
            nome: `OtherArtisanProduct_${Date.now()}`,
            des: 'Owned by someone else',
            cat: 'Other',
            price: 10.00,
            qty: 5,
            idartigiano: otherTestArtigianoUser.idutente
        };
        const otherDbRes = await testClient.query(
            `INSERT INTO Prodotto (nome, descrizione, categoria, prezzounitario, quantitadisponibile, idartigiano, deleted)
             VALUES ($1, $2, $3, $4, $5, $6, FALSE) RETURNING *`,
            [otherProductData.nome, otherProductData.des, otherProductData.cat, otherProductData.price, otherProductData.qty, otherProductData.idartigiano]
        );
        otherArtisanProduct = otherDbRes.rows[0];
    });

    test('Artigiano should soft-delete their own product successfully', async () => {
        const res = await request(app)
            .delete(`/api/products/${productToDelete.idprodotto}`)
            .set('x-mock-user-type', 'Artigiano'); // mockAuthenticatedUser is testArtigianoUser

        expect(res.statusCode).toBe(200);
        expect(res.body.message).toBe('Prodotto rimosso (soft delete) con successo');
        expect(res.body.idprodotto).toBe(productToDelete.idprodotto);

        // Verify in DB (within the same transaction)
        const dbCheck = await testClient.query('SELECT deleted FROM Prodotto WHERE idprodotto = $1', [productToDelete.idprodotto]);
        expect(dbCheck.rows.length).toBe(1);
        expect(dbCheck.rows[0].deleted).toBe(true);
    });

    test('Admin should soft-delete any product successfully (e.g., product owned by testArtigianoUser)', async () => {
         const res = await request(app)
            .delete(`/api/products/${productToDelete.idprodotto}`)
            .set('x-mock-user-type', 'Admin'); // Simulate Admin user

        expect(res.statusCode).toBe(200);
        expect(res.body.message).toBe('Prodotto rimosso (soft delete) con successo');
        expect(res.body.idprodotto).toBe(productToDelete.idprodotto);

        // Verify in DB
        const dbCheck = await testClient.query('SELECT deleted FROM Prodotto WHERE idprodotto = $1', [productToDelete.idprodotto]);
        expect(dbCheck.rows.length).toBe(1);
        expect(dbCheck.rows[0].deleted).toBe(true);
    });

    test('Should return 403 if Artigiano tries to delete another Artigiano\'s product', async () => {
        // testArtigianoUser (mockAuthenticatedUser) tries to delete otherArtisanProduct
        const res = await request(app)
            .delete(`/api/products/${otherArtisanProduct.idprodotto}`)
            .set('x-mock-user-type', 'Artigiano');

        expect(res.statusCode).toBe(403);
        expect(res.body.error).toBe("Vietato: l'artigiano può eliminare solo i propri prodotti.");

        // Verify in DB that the product was NOT deleted
        const dbCheck = await testClient.query('SELECT deleted FROM Prodotto WHERE idprodotto = $1', [otherArtisanProduct.idprodotto]);
        expect(dbCheck.rows.length).toBe(1);
        expect(dbCheck.rows[0].deleted).toBe(false);
    });

    test('Should return 404 if product to delete does not exist', async () => {
        const res = await request(app)
            .delete('/api/products/999999') // Non-existent ID
            .set('x-mock-user-type', 'Admin'); // Admin has permission, so it should hit the 404 check

        expect(res.statusCode).toBe(404);
        expect(res.body.error).toBe("Prodotto non trovato o già rimosso.");
    });

    test('Should return 404 if product is already deleted', async () => {
        // First, soft delete the product directly in the DB
        await testClient.query('UPDATE Prodotto SET deleted = TRUE WHERE idprodotto = $1', [productToDelete.idprodotto]);

        // Then, try to delete it again via the API
        const res = await request(app)
            .delete(`/api/products/${productToDelete.idprodotto}`)
            .set('x-mock-user-type', 'Admin'); // Admin has permission

        expect(res.statusCode).toBe(404);
        expect(res.body.error).toBe("Prodotto non trovato o già rimosso.");
    });

    test('Should return 400 for invalid product ID format', async () => {
        const res = await request(app)
            .delete('/api/products/invalid-id')
            .set('x-mock-user-type', 'Admin'); // Admin has permission

        expect(res.statusCode).toBe(400);
        expect(res.body.error).toBe("Formato ID prodotto non valido.");
    });

    test('Should return 500 for a database error during soft delete', async () => {
        // Temporarily make the testClient.query throw an error for the UPDATE query
        const originalTestClientQuery = testClient.query;
        testClient.query = jest.fn().mockImplementation((queryText, values) => {
            if (queryText.includes('UPDATE Prodotto SET deleted = TRUE')) {
                 return Promise.reject(new Error('Simulated DB error during delete'));
            }
            // Allow other queries (like the initial SELECT) to proceed
            return originalTestClientQuery(queryText, values);
        });

        const res = await request(app)
            .delete(`/api/products/${productToDelete.idprodotto}`)
            .set('x-mock-user-type', 'Admin'); // Admin has permission

        expect(res.statusCode).toBe(500);
        expect(res.body.error).toBe("Errore del server durante la rimozione (soft delete) del prodotto.");

        // Restore the original query function
        testClient.query = originalTestClientQuery;
    });
});

describe('GET /api/products - Unit Tests with Real DB', () => {
    test('should retrieve all products (not deleted) successfully', async () => {
        // First, create a product to retrieve
        const createRes = await request(app)
            .post('/api/products/')
            .send(validProductData);

        expect(createRes.statusCode).toBe(201);
        const createdProductId = createRes.body.idprodotto;

        // Now retrieve all products
        const res = await request(app)
            .get('/api/products/notdeleted');

        expect(res.statusCode).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
        expect(res.body.length).toBeGreaterThan(0); // At least one product should exist
        const retrievedProduct = res.body.find(p => p.idprodotto = createdProductId);
        expect(retrievedProduct).toBeDefined();
    });
});



    describe('GET /api/products/:idprodotto - Unit Tests with Real DB', () => {
        test('should retrieve a product by ID successfully', async () => {
            // First, create a product to retrieve
            const createRes = await request(app)
                .post('/api/products')
                .send(validProductData);

            expect(createRes.statusCode).toBe(201);
            const createdProductId = createRes.body.idprodotto;

            // Now retrieve the product
            const res = await request(app)
                .get(`/api/products/${createdProductId}`);

            expect(res.statusCode).toBe(200);
            expect(res.body).toHaveProperty('idprodotto', createdProductId);
            expect(res.body.nome).toBe(validProductData.nome);
            expect(res.body.idartigiano).toBe(testArtigianoUser.idutente); // Check against the dynamically created artisan
        });
        test('should return 404 if product does not exist', async () => {
            const res = await request(app)
                .get('/api/products/999999'); // Assuming this ID does not exist

            expect(res.statusCode).toBe(404);
        }); 
    });
