const request = require('supertest');
const express = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../../../src/config/db-connect');
const authRoutes = require('../../../src/routes/authRoutes'); 


// Mock the database connection pool
jest.mock('../../../src/config/db-connect', () => ({
    query: jest.fn(),
}));

// Mock bcrypt
jest.mock('bcryptjs', () => ({
    compare: jest.fn(),
}));

//TODELETE (non serve per le authRoutes che non chiedono permessi   )
// NEW: Mock authentication and permission middleware
// IMPORTANT: Adjust the path below to point to your actual auth middleware file.
// e.g., if your middleware is in 'src/middleware/auth.js'
// Also, adjust the function names (e.g., 'authenticate', 'authorize')
// to match what your middleware module exports and your authRoutes.js imports.
jest.mock('../../../src/middleware/authMiddleware.js', () => ({
    // Example: if your middleware exports 'authenticateToken'
    isAuthenticated: jest.fn((req, res, next) => {
        // For most routes, you might want to attach a mock user:
        // req.user = { id_utente: 'mockUserId', username: 'mockUser', tipologia: 'Cliente' };
        next(); // Proceed to the next middleware or route handler
    }),
    // Example: if your middleware exports 'hasPermissions'
    hasPermissions: jest.fn((permissions) => (req, res, next) => {
        next(); // Assume permission is granted
    }),
    // Add mocks for any other functions your authRoutes might use from this middleware.
    // If it's a default export, it might look like:
    // default: jest.fn((req, res, next) => next()),
}));

const app = express();
app.use(express.json());
app.use('/api/auth', authRoutes); // Mount the routes on a test app

describe('Auth Routes - POST /api/auth/login', () => {
    beforeEach(() => {
        // Reset mocks before each test
        pool.query.mockReset();
        bcrypt.compare.mockReset();
        jest.spyOn(console, 'error').mockImplementation(() => {}); // Suppress console.error during tests
    });

    afterEach(() => {
        console.error.mockRestore(); // Restore console.error
    });

    it('should login successfully with valid credentials', async () => {
        const mockUser = {
            id_utente: 1,
            username: 'testuser',
            password: 'hashedPassword',
            email: 'test@example.com',
            deleted: false,
        };
        pool.query.mockResolvedValueOnce({ rows: [mockUser] });
        bcrypt.compare.mockResolvedValueOnce(true);

        const response = await request(app)
            .post('/api/auth/login')
            .send({ username: 'testuser', password: 'password123' });

        expect(response.statusCode).toBe(200);
        expect(response.body.message).toBe('Login effettuato con successo.');
        expect(response.body.user).toBeDefined();
        expect(response.body.user.username).toBe('testuser');
        expect(response.body.user.password).toBeUndefined(); // Ensure password is not sent back
        expect(pool.query).toHaveBeenCalledWith(
            'SELECT * FROM utente WHERE username = $1 AND deleted = false',
            ['testuser']
        );
        expect(bcrypt.compare).toHaveBeenCalledWith('password123', 'hashedPassword');
    });

    it('should return 401 for invalid username', async () => {
        pool.query.mockResolvedValueOnce({ rows: [] }); // No user found

        const response = await request(app)
            .post('/api/auth/login')
            .send({ username: 'nonexistentuser', password: 'password123' });

        expect(response.statusCode).toBe(401);
        expect(response.body.message).toBe('Credenziali non valide.');
    });

    it('should return 401 for invalid password', async () => {
        const mockUser = {
            id_utente: 1,
            username: 'testuser',
            password: 'hashedPassword',
            deleted: false,
        };
        pool.query.mockResolvedValueOnce({ rows: [mockUser] });
        bcrypt.compare.mockResolvedValueOnce(false); // Password does not match

        const response = await request(app)
            .post('/api/auth/login')
            .send({ username: 'testuser', password: 'wrongpassword' });

        expect(response.statusCode).toBe(401);
        expect(response.body.message).toBe('Credenziali non valide.');
    });

    it('should return 401 for a user marked as deleted', async () => {
        // The query `WHERE username = $1 AND deleted = false` will return no rows
        // if the user exists but `deleted = true`.
        pool.query.mockResolvedValueOnce({ rows: [] });

        const response = await request(app)
            .post('/api/auth/login')
            .send({ username: 'deleteduser', password: 'password123' });

        expect(response.statusCode).toBe(401);
        expect(response.body.message).toBe('Credenziali non valide.');
        expect(pool.query).toHaveBeenCalledWith(
            'SELECT * FROM utente WHERE username = $1 AND deleted = false',
            ['deleteduser']
        );
    });

    it('should return 400 if username is missing', async () => {
        const response = await request(app)
            .post('/api/auth/login')
            .send({ password: 'password123' });

        expect(response.statusCode).toBe(400);
        expect(response.body.message).toBe('Username e Password sono obbligatori.');
    });

    it('should return 400 if password is missing', async () => {
        const response = await request(app)
            .post('/api/auth/login')
            .send({ username: 'testuser' });

        expect(response.statusCode).toBe(400);
        expect(response.body.message).toBe('Username e Password sono obbligatori.');
    });

    it('should return 500 if database query fails', async () => {
        pool.query.mockRejectedValueOnce(new Error('DB Error'));

        const response = await request(app)
            .post('/api/auth/login')
            .send({ username: 'testuser', password: 'password123' });

        expect(response.statusCode).toBe(500);
        expect(response.body.message).toBe('Errore del server durante il login.');
        expect(console.error).toHaveBeenCalled();
    });

    it('should return 500 if bcrypt.compare fails', async () => {
        const mockUser = {
            id_utente: 1,
            username: 'testuser',
            password: 'hashedPassword',
            deleted: false,
        };
        pool.query.mockResolvedValueOnce({ rows: [mockUser] });
        bcrypt.compare.mockRejectedValueOnce(new Error('Bcrypt Error'));

        const response = await request(app)
            .post('/api/auth/login')
            .send({ username: 'testuser', password: 'password123' });

        expect(response.statusCode).toBe(500);
        expect(response.body.message).toBe('Errore del server durante il login.');
        expect(console.error).toHaveBeenCalled();
    });
});