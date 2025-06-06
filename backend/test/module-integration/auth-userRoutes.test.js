const request = require('supertest');
const express = require('express');
// Remove: const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Import actual middleware, models, and routes
 const { isAuthenticated, hasPermission } = require('../../src/middleware/authMiddleWare.js'); // Middleware is tested via routes
// IMPORTANT: You'll need your User model if you create users directly in DB for setup (e.g., initial admin)
const pool = require('../../src/config/db-connect'); // Import the pool for cleanup
const authRoutes = require('../../src/routes/authRoutes.js');
const userRoutes = require('../../src/routes/userRoutes.js');

// Retrieve JWT_SECRET for signing tokens directly in tests if needed
const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret) {
    throw new Error('FATAL ERROR: JWT_SECRET is not defined in the test environment. Make sure it is set in your .env file or environment variables.');
}

// --- Setup Express App with Actual Routes ---
const app = express();
app.use(express.json());

// Mount your actual application routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);

// --- Test Setup and Teardown ---
let server;
const testPort = 3003; // Use a different port for testing
let clienteRegisteredData; // Declare at the top level

beforeAll(async () => {
    // Start the Express server
    server = app.listen(testPort);
});

afterAll(async () => { // This afterAll is for the entire file
    if (server) {
        await new Promise(resolve => server.close(resolve));
    }
    // Clean up the main clienteRegisteredData user
    if (clienteRegisteredData && clienteRegisteredData.idutente) {
        try {
            await pool.query('DELETE FROM utente WHERE idutente = $1', [clienteRegisteredData.idutente]);
            console.log(`Cleaned up main test user (clienteRegisteredData) ID: ${clienteRegisteredData.idutente}`);
        } catch (error) {
            console.error(`Error cleaning up main test user (clienteRegisteredData) ID ${clienteRegisteredData.idutente}:`, error.message);
        }
    }

    // Close the database connection pool to allow Jest to exit
    await pool.end();
    console.log('Database pool closed.');
});

// --- Integration Tests for User Journey ---

describe('User Journey: Registration, Login, API Access', () => {
    let clienteToken;


    const newClienteDetails = {
        username: 'aanewlivecliente',
        nome: 'Live',
        cognome: 'Cliente',
        email: 'aalive.cliente@example.com',
        password: 'passwordLiveCliente123',
        tipologia: 'Cliente', // Assuming registration defaults or sets this
        indirizzo: 'Via Test Reale 123, Città Reale, PR, 12345',
        // Add other fields required by your POST /api/users endpoint for registration
    };

    
    beforeAll(async () => {
        // Placeholder for any setup needed before all Cliente tests.
        // For example, ensuring the database is clean or specific test data exists.
        console.log('Starting Cliente user journey tests.');
    });
    
    test('should register a new Cliente via POST /api/users', async () => {
        const res = await request(app)
            .post('/api/users')
            .send(newClienteDetails);

        expect(res.statusCode).toBe(201); // 201 == 200 per post
        expect(res.body).toHaveProperty('idutente');
        expect(res.body.email).toBe(newClienteDetails.email);
        expect(res.body.username).toBe(newClienteDetails.username);
        expect(res.body.tipologia).toBe('Cliente'); 
        expect(res.body).not.toHaveProperty('password');

        clienteRegisteredData = res.body; // Store the response data including the ID
    });

    test('should login as the newly registered Cliente via POST /api/auth/login', async () => {
        // Depends on the previous test succeeding
        expect(clienteRegisteredData).toBeDefined();
        expect(clienteRegisteredData.idutente).toBeDefined();

        const res = await request(app)
            .post('/api/auth/login')
            .send({
                username: newClienteDetails.username,
                password: newClienteDetails.password,
            });

        expect(res.statusCode).toBe(200);
        expect(res.body).toHaveProperty('token');
        expect(res.body).toHaveProperty('user');
        expect(res.body.user.email).toBe(newClienteDetails.email);
        expect(res.body.user.idutente).toBe(clienteRegisteredData.idutente);
        clienteToken = res.body.token; // Save token for subsequent tests
    });
    
    test('Cliente should update their own profile via PUT /api/users/:id', async () => {
        // Depends on previous tests
        expect(clienteRegisteredData).toBeDefined();
        expect(clienteRegisteredData.idutente).toBeDefined();
        expect(clienteToken).toBeDefined();

        const updatedProfileData = {
            nome: 'Live Cliente Updated',
            indirizzo: 'Nuovo Indirizzo Reale 456, Nuova Città, NC, 67890',
            // Add other fields that a Cliente is allowed to update
            // Do NOT include fields they cannot update (e.g., email, username, tipologia by themselves)
        };

        const res = await request(app)
            .put(`/api/users/${clienteRegisteredData.idutente}`)
            .set('Authorization', `Bearer ${clienteToken}`)
            .send(updatedProfileData);

        expect(res.statusCode).toBe(200);
        expect(res.body.idutente).toBe(clienteRegisteredData.idutente);
        expect(res.body.nome).toBe(updatedProfileData.nome);
        expect(res.body.indirizzo).toBe(updatedProfileData.indirizzo);
        // Verify other updated fields
    });

    // Additional combination tests
    describe('Further API Access Combinations', () => {
        let tempClienteIdForCleanup; // To store ID of the user created in the delete test, utile per il cleanup
        test('Cliente should NOT be able to get all users via GET /api/users', async () => {
            expect(clienteToken).toBeDefined();
            const res = await request(app)
                .get('/api/users')
                .set('Authorization', `Bearer ${clienteToken}`);
            expect(res.statusCode).toBe(403); // Forbidden
            // Check for your specific "permission denied" message
            expect(res.body.message).toMatch(/Accesso negato|permessi necessari/i);
        });

        test('Cliente should NOT be able to update another user\'s (Admin) profile via PUT /api/users/:id', async () => {
            // This test now needs a different target user ID if admin is removed.
            // For simplicity, we'll assume there's some other user ID (e.g., 999) that is not the current cliente.
            const otherUserId = 999; // A placeholder for another user's ID
            
            expect(clienteToken).toBeDefined();

            const res = await request(app)
                .put(`/api/users/${otherUserId}`)
                .set('Authorization', `Bearer ${clienteToken}`)
                .send({ nome: 'Attempted Update By Cliente' });
            expect(res.statusCode).toBe(403);
            
        });
        
       
    }); // End of the main 'User Journey' describe block for registration/login

    // Start a new describe block for more isolated tests to prevent token bleeding
    describe('Isolated Token and Account Tests', () => {
        let isolatedTestUser; // User for these specific tests
        let isolatedTestUserId;

        beforeAll(async () => {
            // Create a dedicated user for this block of tests
            const userDetails = {
                username: 'isolatedUserForTokenTest',
                nome: 'Isolated',
                cognome: 'User',
                email: 'isolated.user@example.com',
                password: 'passwordIsolated123',
                tipologia: 'Cliente',
                indirizzo: '123 Isolation Drive',
            };
            const registerRes = await request(app).post('/api/users').send(userDetails);
            expect(registerRes.statusCode).toBe(201);
            isolatedTestUser = registerRes.body;
            isolatedTestUserId = isolatedTestUser.idutente;
        });

        test('should return 401 if the token is expired', async () => {
            expect(isolatedTestUser).toBeDefined();
            expect(isolatedTestUserId).toBeDefined();

            // Sign a token that is already expired by setting 'iat' and 'exp' in the past
            // and NOT providing the 'expiresIn' option.
            // Ensure 'exp' is a Unix timestamp (seconds since epoch).
            const iatTime = Math.floor(Date.now() / 1000) - (60 * 60); // Issued 1 hour ago
            const expTime = Math.floor(Date.now() / 1000) - (30 * 60); // Expired 30 minutes ago
            
            //console.log('[ISOLATED_TEST_DEBUG] Creating expired token with iat:', iatTime, 'exp:', expTime, 'for user ID:', isolatedTestUserId);

            const expiredToken = jwt.sign(
                { 
                    user: { id: isolatedTestUserId },
                    iat: iatTime,
                    exp: expTime
                },                jwtSecret // No 'expiresIn' option
            );
            
            // Log the token that is ABOUT to be sent
            //console.log('[ISOLATED_TEST_DEBUG] Expired token variable right before sending:', expiredToken);
            //console.log('[ISOLATED_TEST_DEBUG] Target URL for expired token test:', `/api/users/${isolatedTestUserId}`);

            const apiRequest = request(app)
                .get(`/api/users/${isolatedTestUserId}`) // Attempt to access a protected route
                .set('Authorization', `Bearer ${expiredToken}`);
            
            const res = await apiRequest;

            expect(res.statusCode).toBe(401);
            expect(res.body.message).toBe('Autenticazione richiesta per visualizzare questo profilo.'); 
        });
        test('Cliente should be able to delete their own account via DELETE /api/users/:id', async () => {
            // For this, let's register and login a temporary user to delete
            const tempClienteDetails = { username: 'tempdeleteuser', nome: 'Temp', cognome: 'Delete', email: 'tempdelete@example.com', password: 'passwordTemp123', tipologia: 'Cliente', indirizzo: 'Temp Address' };
            const registerRes = await request(app).post('/api/users').send(tempClienteDetails);
            expect(registerRes.statusCode).toBe(201);
            // Store id for cleanup piu tardi
            const tempClienteIdForThisTest = registerRes.body.idutente; // Use a local const

            const loginRes = await request(app).post('/api/auth/login').send({ username: tempClienteDetails.username, password: tempClienteDetails.password});
            expect(loginRes.statusCode).toBe(200);
            const tempClienteToken = loginRes.body.token;

            const deleteRes = await request(app)
                .delete(`/api/users/${tempClienteIdForThisTest}`)
                .set('Authorization', `Bearer ${tempClienteToken}`);
            expect(deleteRes.statusCode).toBe(200); // Or 204
            expect(deleteRes.body.message).toContain('eliminato');

            // Verify user is no longer accessible with their old token because they are marked as deleted
            const verifyRes = await request(app)
                .get(`/api/users/${tempClienteIdForThisTest}`)
                .set('Authorization', `Bearer ${tempClienteToken}`);
            // After soft deletion, a non-Admin attempting to GET the user profile should receive a 404
            expect(verifyRes.statusCode).toBe(404); 
            expect(verifyRes.body.message).toBe('Utente non trovato.'); 

            // Cleanup this specific temporary user
            if (tempClienteIdForThisTest) {
                await pool.query('DELETE FROM utente WHERE idutente = $1', [tempClienteIdForThisTest]);
                console.log(`Cleaned up user from delete test: ${tempClienteIdForThisTest}`);
            }
          });



        afterAll(async () => {
            // Clean up the user created for this isolated describe block
            if (isolatedTestUserId) {
                try {
                    await pool.query('DELETE FROM utente WHERE idutente = $1', [isolatedTestUserId]);
                    console.log(`Cleaned up isolatedTestUser ID: ${isolatedTestUserId}`);
                } catch (error) {
                    console.error(`Error cleaning up isolatedTestUser ID ${isolatedTestUserId}:`, error.message);
                }
            }
        });
    });
});