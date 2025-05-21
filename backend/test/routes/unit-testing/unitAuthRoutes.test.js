const path = require('path'); // Importa il modulo 'path'
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') }); // Specifica il percorso del file .env
// __dirname si riferisce alla directory corrente del file (cioè src)
// '../.env' sale di un livello per trovare il file .env nella cartella backend
const request = require('supertest');
const bcrypt = require('bcryptjs');
const express = require('express');
const authRoutes = require('../../../src/routes/authRoutes'); // Import authRoutes
const pool = require('../../../src/config/db-connect');

const app = express();
app.use(express.json());
app.use('/api/auth', authRoutes); // Mount authRoutes

// Variabili per gestire la transazione
let testClient;
let originalPoolQuery;

// Inizia una transazione prima di ogni test
beforeEach(async () => {
    testClient = await pool.connect();
    await testClient.query('BEGIN');
    // Sostituisci temporaneamente pool.query con il metodo query del client transazionale
    originalPoolQuery = pool.query;
    pool.query = (...args) => testClient.query(...args);
});

// Esegui il rollback della transazione e rilascia il client dopo ogni test
// NB se il db è quello di test, potrebbe non servire, per ora lo lascio cosi non tocco i dati nostri
afterEach(async () => {
    if (testClient) {
        await testClient.query('ROLLBACK');
        testClient.release();
        // Ripristina il pool.query originale
        pool.query = originalPoolQuery;
    }
});

describe('POST /api/auth/login - Unit Tests', () => {
    const testUserCredentials = {
        nome: 'Test',
        cognome: 'UserLogin',
        email: 'testlogin@example.com',
        username: 'testloginuser',
        plainPassword: 'password123',
        hashedPassword: '', // Will be set in beforeAll
        indirizzo: 'Test Indirizzo,43, Test Citta',
        tipologia: 'Cliente'
    };
    let testUserId;

    beforeAll(async () => {
        // Hash password once
        testUserCredentials.hashedPassword = await bcrypt.hash(testUserCredentials.plainPassword, 10);
    });

    // beforeEach for this describe block to ensure user exists for relevant tests
    beforeEach(async () => {
        // Insert the test user for login tests
        // This happens within the transaction started by the outer beforeEach
        const result = await pool.query(
            `INSERT INTO utente (nome, cognome, email, username, password, indirizzo, tipologia)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             RETURNING idutente`,
            [
                testUserCredentials.nome,
                testUserCredentials.cognome,
                testUserCredentials.email,
                testUserCredentials.username,
                testUserCredentials.hashedPassword,
                testUserCredentials.indirizzo,
                testUserCredentials.tipologia
            ]
        );
        testUserId = result.rows[0].idutente;
    });

    it('should login successfully with valid credentials', async () => {
        const response = await request(app)
            .post('/api/auth/login')
            .send({
                username: testUserCredentials.username,
                password: testUserCredentials.plainPassword,
            });

        expect(response.statusCode).toBe(200);
        expect(response.body.message).toBe('Login effettuato con successo.');
        expect(response.body.user).toBeDefined();
        expect(response.body.user.username).toBe(testUserCredentials.username);
        expect(response.body.user.password).toBeUndefined();
    });

    it('should return 401 for invalid username', async () => {
        const response = await request(app)
            .post('/api/auth/login')
            .send({
                username: 'nonexistentuser',
                password: testUserCredentials.plainPassword,
            });

        expect(response.statusCode).toBe(401);
        expect(response.body.message).toBe('Credenziali non valide.');
    });

    it('should return 401 for invalid password', async () => {
        const response = await request(app)
            .post('/api/auth/login')
            .send({
                username: testUserCredentials.username,
                password: 'wrongpassword',
            });

        expect(response.statusCode).toBe(401);
        expect(response.body.message).toBe('Credenziali non valide.');
    });

    it('should return 401 for a user marked as deleted', async () => {
        // Mark the user as deleted for this specific test
        // This modification will be rolled back by the afterEach
        await pool.query('UPDATE utente SET deleted = true WHERE idutente = $1', [testUserId]);

        const response = await request(app)
            .post('/api/auth/login')
            .send({
                username: testUserCredentials.username,
                password: testUserCredentials.plainPassword,
            });

        expect(response.statusCode).toBe(401);
        expect(response.body.message).toBe('Credenziali non valide.');
    });

    it('should return 400 if username is missing', async () => {
        const response = await request(app)
            .post('/api/auth/login')
            .send({
                password: testUserCredentials.plainPassword,
            });

        expect(response.statusCode).toBe(400);
        expect(response.body.message).toBe('Username e Password sono obbligatori.');
    });

    it('should return 400 if password is missing', async () => {
        const response = await request(app)
            .post('/api/auth/login')
            .send({
                username: testUserCredentials.username,
            });

        expect(response.statusCode).toBe(400);
        expect(response.body.message).toBe('Username e Password sono obbligatori.');
    });
});
