const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });
const request = require('supertest');
const express = require('express');
const cartRoutes = require('../../../src/routes/cartRoutes');
const bcrypt = require('bcryptjs');

// Mock database connection
jest.mock('../../../src/config/db-connect', () => ({
    query: jest.fn(),
    connect: jest.fn(),
    end: jest.fn(),
}));
const pool = require('../../../src/config/db-connect');

// Mock authentication middleware
const mockClienteUser = {
    idutente: 1,
    username: 'mockcliente_cart',
    tipologia: 'Cliente',
};

const mockArtigianoUser = {
    idutente: 2,
    username: 'mockartigiano_cart',
    tipologia: 'Artigiano',
};

jest.mock('../../../src/middleware/authMiddleWare', () => ({
    isAuthenticated: jest.fn((req, res, next) => {
        if (req.headers['x-mock-auth'] === 'false') {
            return res.status(401).json({ message: 'Unauthorized for test' });
        }
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

// Mock data
const testUserCliente = {
    idutente: 1,
    username: 'testcliente',
    tipologia: 'Cliente',
};

const testUserArtigiano = {
    idutente: 2,
    username: 'testartigiano',
    tipologia: 'Artigiano',
};

const testProduct1 = {
    idprodotto: 1,
    nome: 'Cart Product 1',
    descrizione: 'Desc 1',
    categoria: 'Cat A',
    prezzounitario: 10.00,
    quantitadisponibile: 5,
    idartigiano: testUserArtigiano.idutente,
    deleted: false,
};

const testProduct2 = {
    idprodotto: 2,
    nome: 'Cart Product 2',
    descrizione: 'Desc 2',
    categoria: 'Cat B',
    prezzounitario: 20.00,
    quantitadisponibile: 0,
    idartigiano: testUserArtigiano.idutente,
    deleted: false,
};

const testProductDeleted = {
    idprodotto: 3,
    nome: 'Deleted Product',
    descrizione: 'Desc Deleted',
    categoria: 'Cat Del',
    prezzounitario: 5.00,
    quantitadisponibile: 10,
    idartigiano: testUserArtigiano.idutente,
    deleted: true,
};

beforeEach(() => {
    jest.clearAllMocks();

    // Update mock user IDs
    mockClienteUser.idutente = testUserCliente.idutente;
});

describe('POST /api/carts/items - Add item to cart', () => {
    test('Cliente should add a new item to their cart successfully', async () => {
        pool.query.mockResolvedValue({ rows: [testProduct1] }); // Product exists
        pool.query.mockResolvedValue({ rows: [] }); // No existing cart item
        pool.query.mockResolvedValue({
            rows: [{
                idprodotto: testProduct1.idprodotto,
                quantita: 2,
                idcliente: testUserCliente.idutente,
                totaleparziale: 20.00,
                nomeprodotto: testProduct1.nome
            }]
        }); // Insert result

        const res = await request(app)
            .post('/api/carts/items')
            .set('x-mock-user-type', 'Cliente')
            .send({ idprodotto: testProduct1.idprodotto, quantita: 2 });

        expect(res.statusCode).toBe(200);
        expect(res.body.idprodotto).toBe(testProduct1.idprodotto);
        expect(res.body.quantita).toBe(2);
    });

    test('should return 404 if product does not exist', async () => {
        pool.query.mockResolvedValue({ rows: [] }); // Product not found

        const res = await request(app)
            .post('/api/carts/items')
            .set('x-mock-user-type', 'Cliente')
            .send({ idprodotto: 99999, quantita: 1 });

        expect(res.statusCode).toBe(404);
        expect(res.body.message).toBe('Prodotto non trovato o non disponibile.');
    });
});

describe('PUT /api/carts/items/:idprodotto - Update item quantity in cart', () => {
    const initialQuantity = 3;
    const cartItem = {
        idcliente: testUserCliente.idutente,
        idprodotto: testProduct1.idprodotto,
        quantita: initialQuantity,
        totaleparziale: initialQuantity * testProduct1.prezzounitario
    };

    beforeEach(() => {
        // Mock existing cart item
        pool.query.mockResolvedValue({ rows: [cartItem] });
    });

    test('Cliente should update item quantity successfully', async () => {
        const newQuantity = 5;
        pool.query.mockResolvedValue({ rows: [testProduct1] }); // Product exists
        pool.query.mockResolvedValue({
            rows: [{ ...cartItem, quantita: newQuantity }]
        }); // Update result

        const res = await request(app)
            .put(`/api/carts/items/${testProduct1.idprodotto}`)
            .set('x-mock-user-type', 'Cliente')
            .send({ quantita: newQuantity });

        expect(res.statusCode).toBe(200);
        expect(res.body.quantita).toBe(newQuantity);
    });
});

describe('GET /api/carts/:idcliente - Get cart details', () => {
    test('Cliente should get their own cart successfully', async () => {
        const cartItems = [
            {
                idprodotto: testProduct1.idprodotto,
                quantita: 2,
                totaleparziale: 20.00,
                nomeprodotto: testProduct1.nome,
                prezzounitario: testProduct1.prezzounitario
            },
            {
                idprodotto: testProduct2.idprodotto,
                quantita: 1,
                totaleparziale: 20.00,
                nomeprodotto: testProduct2.nome,
                prezzounitario: testProduct2.prezzounitario
            }
        ];

        pool.query.mockResolvedValueOnce({ rows: cartItems });
        pool.query.mockResolvedValueOnce({ rows: [testProduct1, testProduct2] }); // Products

        const res = await request(app)
            .get(`/api/carts/${testUserCliente.idutente}`)
            .set('x-mock-user-type', 'Cliente');

        expect(res.statusCode).toBe(200);
        expect(res.body.items.length).toBe(2);
        expect(res.body.totaleCarrello).toBe(40.00);
    });
});

describe('PUT /api/carts/items/:idprodotto/add - Increment item quantity', () => {
    const initialQuantity = 3;
    const cartItem = {
        idcliente: testUserCliente.idutente,
        idprodotto: testProduct1.idprodotto,
        quantita: initialQuantity,
        totaleparziale: initialQuantity * testProduct1.prezzounitario
    };

    beforeEach(() => {
        pool.query.mockResolvedValueOnce({ rows: [cartItem] }); // Existing cart item
    });

    test('Cliente should increment item quantity successfully', async () => {
        const quantityToAdd = 2;
        const newQuantity = initialQuantity + quantityToAdd;

        pool.query.mockResolvedValueOnce({ rows: [testProduct1] }); // Product exists
        pool.query.mockResolvedValueOnce({
            rows: [{ ...cartItem, quantita: newQuantity }]
        }); // Update result

        const res = await request(app)
            .put(`/api/carts/items/${testProduct1.idprodotto}/add`)
            .set('x-mock-user-type', 'Cliente')
            .send({ quantita: quantityToAdd });

        expect(res.statusCode).toBe(200);
        expect(res.body.quantita).toBe(newQuantity);
    });
});

describe('PUT /api/carts/items/:idprodotto/subtract - Decrement item quantity', () => {
    const initialQuantity = 5;
    const cartItem = {
        idcliente: testUserCliente.idutente,
        idprodotto: testProduct1.idprodotto,
        quantita: initialQuantity,
        totaleparziale: initialQuantity * testProduct1.prezzounitario
    };

    beforeEach(() => {
        pool.query.mockResolvedValueOnce({ rows: [cartItem] }); // Existing cart item
    });

    test('Cliente should decrement item quantity successfully', async () => {
        const quantityToSubtract = 2;
        const newQuantity = initialQuantity - quantityToSubtract;

        pool.query.mockResolvedValue({ rows: [testProduct1] }); // Product exists
        pool.query.mockResolvedValue({
            rows: [{ ...cartItem, quantita: newQuantity }]
        }); // Update result

        const res = await request(app)
            .put(`/api/carts/items/${testProduct1.idprodotto}/subtract`)
            .set('x-mock-user-type', 'Cliente')
            .send({ quantita: quantityToSubtract });

        expect(res.statusCode).toBe(200);
        expect(res.body.quantita).toBe(newQuantity);
    });
});