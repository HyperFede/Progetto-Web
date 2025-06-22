const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });
const request = require('supertest');
const bcrypt = require('bcryptjs');
const express = require('express');
const userRoutes = require('../../../src/routes/userRoutes');

// Mock database connection
jest.mock('../../../src/config/db-connect', () => ({
    query: jest.fn(),
    connect: jest.fn(() => ({ // Mock connect to return an object
        query: jest.fn(),    // This mock client also needs a query method if it's used
        release: jest.fn(),  // Add the release method
    })),
    end: jest.fn(),
}));
const pool = require('../../../src/config/db-connect');

// Mock authentication middleware
// This variable will hold the user object for the test
let mockAuthenticatedUser = {
    idutente: 1,
    username: 'mocktestuser',
    nome: 'Mock',
    cognome: 'User',
    email: 'mock@example.com',
    tipologia: 'Admin',
    deleted: false
};

jest.mock('../../../src/middleware/authMiddleWare', () => ({
    isAuthenticated: jest.fn((req, res, next) => {
        req.user = mockAuthenticatedUser;
        next();
    }),
    hasPermission: jest.fn(permissions => (req, res, next) => {
        if (!req.user) return res.status(401).json({ message: 'Unauthorized' });

        const isSelf = permissions.includes('Self') && req.user.idutente === parseInt(req.params.id, 10);
        const hasRole = permissions.includes(req.user.tipologia);

        if (isSelf || hasRole) return next();

        return res.status(403).json({ message: 'Forbidden' });
    }),
    getUserFromToken: jest.fn()
}));

const app = express();
app.use(express.json());
app.use('/api/users', userRoutes);

// Helper function to generate unique user data
const generateUniqueUserData = (baseData, customSuffix = '') => {
    const suffix = customSuffix || Date.now().toString() + Math.random().toString(36).substring(2, 7);
    return {
        ...baseData,
        username: `${baseData.username}${suffix}`,
        email: `${baseData.email}${suffix}`
    };
};

const baseUserCliente = {
    username: 'testuser',
    nome: 'Test',
    cognome: 'User',
    email: 'test@example.com',
    password: 'password123',
    indirizzo: 'Test Indirizzo,43, Test Citta',
    tipologia: 'Cliente'
};

const baseUserArtigiano = {
    username: 'artigianotest',
    nome: 'Artigiano',
    cognome: 'Di Prova',
    email: 'artigiano@example.com',
    password: 'passwordArt123',
    tipologia: 'Artigiano',
    indirizzo: 'Test Indirizzo,43, Test Citta',
    piva: '12345678901',
    artigianodescrizione: 'Descrizione artigiano di prova'
};

describe('User API Unit Tests', () => {
    let mockClient; // To hold the mock client returned by pool.connect()

    beforeEach(() => {
        jest.clearAllMocks();

        // Setup mock client for transaction-based routes (like POST /users)
        mockClient = {
            query: jest.fn(),
            release: jest.fn(),
        };
        pool.connect.mockResolvedValue(mockClient);
    });

    describe('POST /api/users', () => {
        test('Crea utente Cliente correttamente', async () => {
            const uniqueClienteData = generateUniqueUserData(baseUserCliente);
            const mockUserId = 123;

            pool.query.mockResolvedValueOnce({
                rows: [{ idutente: mockUserId }]
            }); // This mocks direct pool.query calls, not client.query

            // The mock should not include the password, just like the real RETURNING clause
            const { password, ...clienteDataWithoutPassword } = uniqueClienteData;
            // Mock the client.query calls for the transaction
            mockClient.query
                .mockResolvedValueOnce({}) // BEGIN
                .mockResolvedValueOnce({ rows: [{ idutente: mockUserId, ...clienteDataWithoutPassword }] }) // INSERT
                .mockResolvedValueOnce({}); // COMMIT

            const res = await request(app)
                .post('/api/users')
                .send(uniqueClienteData);

            expect(res.statusCode).toBe(201);
            expect(res.body).toMatchObject({
                idutente: mockUserId,
                username: uniqueClienteData.username,
                tipologia: 'Cliente'
            });
            expect(res.body).not.toHaveProperty('password');

            // Verify that client.query was called for BEGIN, INSERT, COMMIT
            expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
            expect(mockClient.query).toHaveBeenCalledWith(
                expect.stringContaining('INSERT INTO utente'),
                expect.any(Array)
            );
            expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
            expect(mockClient.release).toHaveBeenCalledTimes(1);
        });
        test('Crea utente Artigiano correttamente', async () => {
            const uniqueArtigianoData = generateUniqueUserData(baseUserArtigiano);
            const mockUserId = 456;

            pool.query.mockResolvedValueOnce({
                rows: [{ idutente: mockUserId }]
            });
            // The mock should not include the password, just like the real RETURNING clause
            const { password, ...artigianoDataWithoutPassword } = uniqueArtigianoData;
            // Mock the client.query calls for the transaction
            mockClient.query.mockResolvedValueOnce({}) // BEGIN
                .mockResolvedValueOnce({ rows: [{ idutente: mockUserId, ...artigianoDataWithoutPassword }] }) // INSERT
                .mockResolvedValueOnce({}); // COMMIT
            const res = await request(app)
                .post('/api/users')
                .send(uniqueArtigianoData);

            expect(res.statusCode).toBe(201);
            expect(res.body).toMatchObject({
                idutente: mockUserId,
                username: uniqueArtigianoData.username,
                tipologia: 'Artigiano',
                piva: baseUserArtigiano.piva,
                artigianodescrizione: baseUserArtigiano.artigianodescrizione
            });
            expect(res.body).not.toHaveProperty('password');
            expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
            expect(mockClient.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO utente'), expect.any(Array));
            expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
            expect(mockClient.release).toHaveBeenCalledTimes(1);
        });

        test('Errore 400 per tipologia non valida', async () => {
            const res = await request(app)
                .post('/api/users')
                .send({ ...generateUniqueUserData(baseUserCliente), tipologia: 'InvalidType' });

            expect(res.statusCode).toBe(400);
            expect(res.body.message).toBe('Tipologia non valida. Deve essere "Cliente", "Artigiano" o "Admin".');
        });

        test('Errore 400 per campi mancanti', async () => {
            const res = await request(app)
                .post('/api/users')
                .send({ username: 'incomplete' });

            expect(res.statusCode).toBe(400);
            expect(res.body.message).toBe('Username, Nome,Cognome, Email, Password, Indirizzo,Tipologia, sono campi obbligatori.');
        });

        test('Errore 403 per tentativo di creazione Admin', async () => {
            const res = await request(app)
                .post('/api/users')
                .send({ ...baseUserCliente, tipologia: 'Admin' });

            expect(res.statusCode).toBe(403);
            expect(res.body.message).toBe('La creazione di utenti Admin tramite API non è permessa.');
        });

        test('Errore 409 per username o email già esistente', async () => {
            const uniqueInitialUserData = generateUniqueUserData(baseUserCliente, `initial_${Date.now()}`);
            const { password, ...initialDataWithoutPassword } = uniqueInitialUserData;

            // Mock the client.query calls for the transaction
            // For the first user creation (which is not part of this test's assertion, but setup)
            mockClient.query.mockResolvedValueOnce({}) // BEGIN
                .mockResolvedValueOnce({ rows: [{ idutente: 1, ...initialDataWithoutPassword }] }) // INSERT
                .mockResolvedValueOnce({}); // COMMIT

            // For the username conflict attempt
            mockClient.query.mockResolvedValueOnce({}) // BEGIN
                .mockRejectedValueOnce({ code: '23505', constraint: 'utente_username_key' }) // INSERT (conflict)
                .mockResolvedValueOnce({}); // ROLLBACK (implicitly handled by catch block)

            // For the email conflict attempt
            mockClient.query.mockResolvedValueOnce({}) // BEGIN
                .mockRejectedValueOnce({ code: '23505', constraint: 'utente_email_key' }) // INSERT (conflict)
                .mockResolvedValueOnce({}); // ROLLBACK (implicitly handled by catch block)

            // First user creation
            await request(app).post('/api/users').send(uniqueInitialUserData);

            // Username conflict
            const conflictingUsernameAttempt = {
                ...baseUserCliente,
                username: uniqueInitialUserData.username,
                email: `conflict_email_${Date.now()}${Math.random()}@example.com`
            };
            const resUsernameConflict = await request(app)
                .post('/api/users')
                .send(conflictingUsernameAttempt);
            expect(resUsernameConflict.statusCode).toBe(409);

            // Email conflict
            const conflictingEmailAttempt = {
                ...baseUserCliente,
                username: `conflict_user_${Date.now()}${Math.random()}`,
                email: uniqueInitialUserData.email
            };
            const resEmailConflict = await request(app)
                .post('/api/users')
                .send(conflictingEmailAttempt);
            expect(resEmailConflict.statusCode).toBe(409);
        });
    });

    // TEST GET

    // TEST GET SINGOLO
    describe('GET /api/users/:id', () => {
        test('Recupera utente esistente (Admin visualizza Cliente)', async () => {
            const mockUserId = 123;
            const mockUser = {
                idutente: mockUserId,
                username: 'testuser',
                tipologia: 'Cliente',
                deleted: false
            };

            pool.query.mockResolvedValueOnce({ rows: [mockUser] });

            const { getUserFromToken } = require('../../../src/middleware/authMiddleWare');
            getUserFromToken.mockResolvedValue(mockAuthenticatedUser);

            const res = await request(app)
                .get(`/api/users/${mockUserId}`)
                .set('Authorization', 'Bearer faketoken');

            expect(res.statusCode).toBe(200);
        });



        test('Unauthenticated user gets 401 for Cliente profile', async () => {
            const mockUserId = 789;
            const mockUser = {
                idutente: mockUserId,
                tipologia: 'Cliente',
                deleted: false
            };

            pool.query.mockResolvedValueOnce({ rows: [mockUser] });

            const { getUserFromToken } = require('../../../src/middleware/authMiddleWare');
            getUserFromToken.mockResolvedValue(null);

            const res = await request(app).get(`/api/users/${mockUserId}`);

            expect(res.statusCode).toBe(401);
            expect(res.body.message).toBe('Autenticazione richiesta per visualizzare questo profilo.');
        });

        test('Cliente fetches their own profile successfully', async () => {
            const mockUserId = 123;
            const mockUser = {
                idutente: mockUserId,
                username: 'testuser',
                tipologia: 'Cliente',
                deleted: false
            };

            pool.query.mockResolvedValueOnce({ rows: [mockUser] });

            const { getUserFromToken } = require('../../../src/middleware/authMiddleWare');
            getUserFromToken.mockResolvedValue(mockUser);

            const res = await request(app)
                .get(`/api/users/${mockUserId}`)
                .set('Authorization', 'Bearer faketokenforcliente');

            expect(res.statusCode).toBe(200);
            expect(res.body).toEqual(mockUser);
        });

        test('Cliente gets 403 trying to fetch another Cliente profile', async () => {
            const mockUserId = 123;
            const mockUser = {
                idutente: mockUserId,
                tipologia: 'Cliente',
                deleted: false
            };

            pool.query.mockResolvedValueOnce({ rows: [mockUser] });

            const { getUserFromToken } = require('../../../src/middleware/authMiddleWare');
            getUserFromToken.mockResolvedValue({
                idutente: 456,
                tipologia: 'Cliente'
            });

            const res = await request(app)
                .get(`/api/users/${mockUserId}`)
                .set('Authorization', 'Bearer faketokenforcliente');

            expect(res.statusCode).toBe(403);
            expect(res.body.message).toBe('Accesso negato. Non hai i permessi necessari per visualizzare questo utente.');
        });


        test('Non-Admin user gets 404 for a deleted user profile', async () => {
            const mockUserId = 123;

            pool.query.mockResolvedValueOnce({ rows: [] });

            const { getUserFromToken } = require('../../../src/middleware/authMiddleWare');
            getUserFromToken.mockResolvedValue(null);

            const res = await request(app).get(`/api/users/${mockUserId}`);

            expect(res.statusCode).toBe(401);
        });

        test('Errore 404 per utente inesistente', async () => {
            pool.query.mockResolvedValueOnce({ rows: [] });

            const res = await request(app).get('/api/users/99999');
            expect(res.statusCode).toBe(401);
        });
    });

    //TEST GET ALL NOT DELETED
    describe('GET /api/users/notdeleted', () => {
        test('Recupera lista utenti non cancellati', async () => {
            const mockUsers = [
                { idutente: 1, deleted: false },
                { idutente: 2, deleted: false }
            ];

            pool.query.mockResolvedValueOnce({ rows: mockUsers });

            const res = await request(app).get('/api/users/notdeleted');

            expect(res.statusCode).toBe(200);
            expect(Array.isArray(res.body)).toBe(true);
            res.body.forEach(user => {
                expect(user.deleted).toBe(false);
            });
        });
    });
});