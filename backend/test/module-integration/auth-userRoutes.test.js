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

beforeAll(async () => {
    // Start the Express server
    server = app.listen(testPort);
});

afterAll(async () => {
    if (server) {
        await new Promise(resolve => server.close(resolve));
    }
});

// --- Integration Tests for User Journey ---

describe('User Journey: Registration, Login, API Access', () => {
    let clienteRegisteredData; // To store data returned from registration
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
        
        test('should return 401 if the token is expired', async () => {
            expect(clienteRegisteredData).toBeDefined(); // Relies on the user created in the outer scope
            expect(clienteRegisteredData.idutente).toBeDefined();

            // Sign a token that expires almost immediately
            const expiredToken = jwt.sign(
                { user: { id: clienteRegisteredData.idutente } },
                jwtSecret,
                { expiresIn: '1ms' } // Set a very short expiration time
            );

            // Wait for a moment to ensure the token has expired
            await new Promise(resolve => setTimeout(resolve, 100)); // Wait 100ms

            const res = await request(app)
                .get(`/api/users/${clienteRegisteredData.idutente}`) // Attempt to access a protected route
                .set('Authorization', `Bearer ${expiredToken}`);

            expect(res.statusCode).toBe(401);
            expect(res.body.message).toBe('Accesso non autorizzato. Token non valido o scaduto.');
        });
        test('Cliente should be able to delete their own account via DELETE /api/users/:id', async () => {
            // For this, let's register and login a temporary user to delete
            const tempClienteDetails = { ...newClienteDetails, email: 'tempdelete@example.com', username: 'tempdeleteuser' };
            const registerRes = await request(app).post('/api/users').send(tempClienteDetails);
            expect(registerRes.statusCode).toBe(201);
            // Store id for cleanup piu tardi
            tempClienteIdForCleanup = registerRes.body.idutente;

            const loginRes = await request(app).post('/api/auth/login').send({ username: tempClienteDetails.username, password: tempClienteDetails.password });
            expect(loginRes.statusCode).toBe(200);
            const tempClienteToken = loginRes.body.token;

            const deleteRes = await request(app)
                .delete(`/api/users/${tempClienteIdForCleanup}`)
                .set('Authorization', `Bearer ${tempClienteToken}`);
            expect(deleteRes.statusCode).toBe(200); // Or 204
            expect(deleteRes.body.message).toContain('eliminato');
            //TODO: modifica il controllo che deve venire da parte di un admin, in quanto ora viene fatto da se stesso e ovviamente non passa
            // Verify user is gone or marked as deleted 
            const verifyRes = await request(app)
                .get(`/api/users/${tempClienteIdForCleanup}`)
                .set('Authorization', `Bearer ${tempClienteToken}`);
            //NOTA il messaggio di errore non viene da get api/user, ma da authMiddleWare, in quanto NON PASSA isAuthenticated, perchè è eliminato
            expect(verifyRes.statusCode).toBe(401); // 
            expect(verifyRes.body.message).toMatch('Accesso non autorizzato. Utente non più attivo.'); 
          });



        afterAll(async () => {
        // Clean up users created during these tests
            if (clienteRegisteredData && clienteRegisteredData.idutente) {
                try {
                    console.log(`Attempting to clean up user ID: ${clienteRegisteredData.idutente}`);
                    // Use a direct database call to delete the user
                    // This bypasses API permissions and directly cleans the test data.
                    await pool.query('DELETE FROM utente WHERE idutente = $1', [clienteRegisteredData.idutente]);
                    console.log(`Successfully cleaned up user ID: ${clienteRegisteredData.idutente}`);
                } catch (error) {
                    console.error(`Error cleaning up user ID ${clienteRegisteredData.idutente}:`, error.message);
                    // Optionally, re-throw or handle if cleanup failure is critical
                }
            }

            // Clean up the temporary user created for the delete test
            if (tempClienteIdForCleanup) {
                try {
                    console.log(`Attempting to clean up temporary user ID: ${tempClienteIdForCleanup}`);
                    await pool.query('DELETE FROM utente WHERE idutente = $1', [tempClienteIdForCleanup]);
                    console.log(`Successfully cleaned up temporary user ID: ${tempClienteIdForCleanup}`);
                } catch (error) {
                    console.error(`Error cleaning up temporary user ID ${tempClienteIdForCleanup}:`, error.message);
                }
            }
        });
    });
});
