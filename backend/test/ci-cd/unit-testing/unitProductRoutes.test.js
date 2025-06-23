const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });
const request = require('supertest');
const express = require('express');
const productRoutes = require('../../../src/routes/productRoutes');
const bcrypt = require('bcryptjs');

// Mock database connection
jest.mock('../../../src/config/db-connect', () => ({
    query: jest.fn(),
    connect: jest.fn(),
    end: jest.fn(),
}));
const pool = require('../../../src/config/db-connect');

// Mock authentication middleware
const mockAuthenticatedUser = {
    idutente: 1,
    username: 'mockartigiano',
    tipologia: 'Artigiano',
};

const mockClienteUser = {
    idutente: 2,
    username: 'mockcliente',
    tipologia: 'Cliente',
};

// Add a mock Admin user
const mockAdminUser = {
    idutente: 3,
    username: 'mockadmin',
    tipologia: 'Admin',
};

jest.mock('../../../src/middleware/authMiddleWare', () => ({
    isAuthenticated: jest.fn((req, res, next) => {
        if (req.headers['x-mock-auth'] === 'false') {
            return res.status(401).json({ message: 'Unauthorized for test' });
        }
        const userTypeHeader = req.headers['x-mock-user-type'];
        if (userTypeHeader === 'Cliente') {
            req.user = mockClienteUser;
        } else if (userTypeHeader === 'Admin') {
            req.user = mockAdminUser;
        } else { // Default to Artigiano if no specific type or unknown type
            req.user = mockAuthenticatedUser;
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
app.use('/api/products', productRoutes);

// Helper function to generate unique user data
const generateUniqueUserData = (baseData, suffix) => {
    return {
        ...baseData,
        username: `${baseData.username}${suffix}`,
        email: `${baseData.email}${suffix}`,
    };
};

// Mock data
const testArtigianoUser = {
    idutente: 1,
    username: 'testartigiano',
    tipologia: 'Artigiano',
};

const otherTestArtigianoUser = {
    idutente: 2,
    username: 'otherartigiano',
    tipologia: 'Artigiano',
};

const testProduct = {
    idprodotto: 1,
    nome: 'Test Product',
    descrizione: 'Test Description',
    categoria: 'Test Category',
    prezzounitario: 10.99,
    quantitadisponibile: 100,
    idartigiano: testArtigianoUser.idutente,
    deleted: false,
};

const validProductData = {
    nome: 'Test Product DB',
    descrizione: 'Test Description DB',
    categoria: 'Test Category DB',
    prezzounitario: 10.99,
    quantitadisponibile: 100,
};

beforeEach(() => {
    jest.clearAllMocks();

    // Reset mock user IDs
    mockAuthenticatedUser.idutente = testArtigianoUser.idutente;
    mockAuthenticatedUser.username = testArtigianoUser.username;
});
/*
describe('POST /api/products - Unit Tests', () => {
    test('should create a new product successfully for an Artigiano', async () => {
        const mockProductId = 123;
        pool.query.mockResolvedValueOnce({
            rows: [{ idprodotto: mockProductId, ...validProductData }]
        });

        const res = await request(app)
            .post('/api/products')
            .send(validProductData);

        expect(res.statusCode).toBe(201);
        expect(res.body).toHaveProperty('idprodotto', mockProductId);
        expect(res.body.nome).toBe(validProductData.nome);
    });

    test('should return 400 if required fields are missing', async () => {
        const res = await request(app)
            .post('/api/products')
            .send({ nome: 'Test Product Only' });

        expect(res.statusCode).toBe(400);
        expect(res.body.error).toContain('Campi obbligatori mancanti');
    });

    test('should return 403 if user is not Artigiano', async () => {
        const res = await request(app)
            .post('/api/products')
            .set('x-mock-user-type', 'Cliente')
            .send(validProductData);

        expect(res.statusCode).toBe(403);
        expect(res.body.message).toBe('Forbidden for test');
    });

    test('should return 500 for database errors', async () => {
        pool.query.mockRejectedValueOnce(new Error('DB error'));

        const res = await request(app)
            .post('/api/products')
            .send(validProductData);

        expect(res.statusCode).toBe(500);
        expect(res.body.error).toBe("Errore del server durante la creazione del prodotto.");
    });
});
*/
describe('PUT /api/products/:id - Unit Tests', () => {
    const productUpdateData = {
        nome: 'Updated Product Name',
        descrizione: 'Updated Description',
        categoria: 'Updated Category',
        prezzounitario: 99.99,
        quantitadisponibile: 10,
    };

    test('Artigiano should update their own product successfully', async () => {
        // 1. Mock the initial SELECT query (existingProductQuery)
        pool.query.mockResolvedValueOnce({
            rows: [{ ...testProduct, idartigiano: mockAuthenticatedUser.idutente }] // Ensure it's owned by the authenticated user
        });

        // 2. Mock the UPDATE query (updateResult)
        const updatedProductWithArtisanId = { ...testProduct, ...productUpdateData, idartigiano: mockAuthenticatedUser.idutente };
        pool.query.mockResolvedValueOnce({
            rows: [updatedProductWithArtisanId]
        });

        // 3. Mock the SELECT query for the artisan's name (artisanQuery)
        pool.query.mockResolvedValueOnce({
            rows: [{ nome: mockAuthenticatedUser.username }]
        });

        // Ensure mockAuthenticatedUser is set to an Artigiano who owns the product
        mockAuthenticatedUser.idutente = testProduct.idprodotto; // Set the authenticated user's ID to match the product's artisan ID
        mockAuthenticatedUser.tipologia = 'Artigiano';
        mockAuthenticatedUser.username = 'mockartigiano';


        const res = await request(app)
            .put(`/api/products/${testProduct.idprodotto}`)
            .set('x-mock-user-type', 'Artigiano')
            .send(productUpdateData);

        expect(res.statusCode).toBe(200);
        expect(res.body.product.nome).toBe(productUpdateData.nome);
    });

    test('Should return 403 if Artigiano tries to update another Artigiano\'s product', async () => {
        pool.query.mockResolvedValueOnce({
            rows: [{ ...testProduct, idartigiano: otherTestArtigianoUser.idutente }]
        });

        const res = await request(app)
            .put(`/api/products/${testProduct.idprodotto}`)
            .set('x-mock-user-type', 'Artigiano')
            .send({ nome: "Attempted Update" });

        expect(res.statusCode).toBe(403);
        expect(res.body.error).toBe("Vietato: l'artigiano può aggiornare solo i propri prodotti.");
    });

    test('Should return 404 if product to update does not exist', async () => {
        pool.query.mockResolvedValueOnce({ rows: [] });

        const res = await request(app)
            .put('/api/products/999999')
            .set('x-mock-user-type', 'Admin')
            .send({ nome: "Update Fail" });

        expect(res.statusCode).toBe(404);
        expect(res.body.error).toBe("Prodotto non trovato o è stato rimosso, impossibile aggiornare.");
    });
});

describe('DELETE /api/products/:id - Unit Tests', () => {
    test('Admin should soft-delete a product successfully', async () => {
        // 1. Mock the initial SELECT query (productCheck) to return the product's artisan ID
        pool.query.mockResolvedValue({
            rows: [{ idartigiano: testArtigianoUser.idutente, immagine: null }] // Simulate the product owned by the authenticated artisan
        });
        // 2. Mock the UPDATE query for the soft delete itself, returning rowCount and the ID
        pool.query.mockResolvedValue({
            rowCount: 1, // Indicate one row was updated
            rows: [{ idprodotto: testProduct.idprodotto }] // Return the ID of the deleted product
        });

        const res = await request(app)
            .delete(`/api/products/${testProduct.idprodotto}`)
            .set('x-mock-user-type', 'Admin');

            console.log(res.body);
        expect(res.statusCode).toBe(200);
        expect(res.body.message).toBe('Prodotto rimosso (soft delete) con successo');
    });

    test('Should return 403 if Artigiano tries to delete another Artigiano\'s product', async () => {
        pool.query.mockResolvedValueOnce({
            rows: [{ ...testProduct, idartigiano: otherTestArtigianoUser.idutente }]
        });

        const res = await request(app)
            .delete(`/api/products/${testProduct.idprodotto}`)
            .set('x-mock-user-type', 'Artigiano');

        expect(res.statusCode).toBe(403);
        expect(res.body.error).toBe("Vietato: l'artigiano può eliminare solo i propri prodotti.");
    });

    test('Should return 404 if product to delete does not exist', async () => {
        pool.query.mockResolvedValueOnce({ rows:[]});

        const res = await request(app)
            .delete('/api/products/999999')
            .set('x-mock-user-type', 'Admin');

        expect(res.statusCode).toBe(404);
        expect(res.body.error).toBe("Prodotto non trovato o già rimosso.");
    });
});

describe('GET /api/products - Unit Tests', () => {
    test('should retrieve all products (not deleted) successfully', async () => {
        const mockProducts = [
            { idprodotto: 1, nome: 'Product 1' },
            { idprodotto: 2, nome: 'Product 2' }
        ];

        pool.query.mockResolvedValueOnce({ rows: mockProducts });

        const res = await request(app).get('/api/products/notdeleted');

        expect(res.statusCode).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
        expect(res.body.length).toBe(2);
    });

    test('should retrieve a product by ID successfully', async () => {
        pool.query.mockResolvedValueOnce({ rows: [testProduct] });

        const res = await request(app)
            .get(`/api/products/${testProduct.idprodotto}`);

        expect(res.statusCode).toBe(200);
        expect(res.body.idprodotto).toBe(testProduct.idprodotto);
    });

    test('should return 404 if product does not exist', async () => {
        pool.query.mockResolvedValueOnce({ rows: [] });

        const res = await request(app)
            .get('/api/products/999999');

        expect(res.statusCode).toBe(404);
    });
});