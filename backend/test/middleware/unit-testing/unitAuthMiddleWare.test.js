const request = require('supertest');
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../../../src/config/db-connect');
const { isAuthenticated, hasPermission } = require('../../../src/middleware/authMiddleWare');


// Get the real JWT secret from the environment
const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret) {
    throw new Error('FATAL ERROR: JWT_SECRET is not defined in test environment.');
}

// Create a minimal Express app for testing the middleware
const app = express();
app.use(express.json()); // Needed if your middleware/routes process JSON bodies

// A test route that uses the isAuthenticated middleware
app.get('/protected', isAuthenticated, (req, res) => {
    // If isAuthenticated passes, req.user should be populated
    if (req.user) {
        res.status(200).json({ message: 'Access granted', user: req.user });
    } else {
        // This case should ideally not be reached if isAuthenticated works
        res.status(500).json({ message: 'Authentication middleware failed to populate user' });
    }
});

// Route for 'Self' only permission
app.get('/self-only/:id', isAuthenticated, hasPermission(['Self']), (req, res) => {
    res.status(200).json({ message: 'Self access granted', user: req.user, params: req.params });
});

// Route for Admin only
app.get('/admin-only', isAuthenticated, hasPermission(['Admin']), (req, res) => {
    res.status(200).json({ message: 'Admin access granted', user: req.user });
});

// Route for multiple allowed roles
app.get('/artigiano-or-admin', isAuthenticated, hasPermission(['Artigiano', 'Admin']), (req, res) => {
    res.status(200).json({ message: 'Artigiano or Admin access granted', user: req.user });
});

app.get('/cliente-only', isAuthenticated, hasPermission(['Cliente']), (req, res) => {
    res.status(200).json({ message: 'Cliente access granted', user: req.user });
});

// Global test user data and helper functions
const testUserData = {
    username: 'testuser_base_int', // Changed to a more generic base username
    password: 'cambioPassword123',
    nome: 'TestBase',
    cognome: 'UserInt',
    email: 'testbaseint@example.com',
    indirizzo: 'Via Test Base 1',
    tipologia: 'Cliente', // Default tipologia
};

// Helper function to create a user and token for tests
// This version can be used with a specific client (for transactions) or the main pool (for committed data)
// It now accepts an optional `userProps` object to override defaults from `testUserData`
async function setupTestUserAndToken(userProps = {}, dbClient = pool) {
        let createdTestUserId;

        // Ensure currentUserData has all necessary fields, defaulting from testUserData
        const currentUserData = { ...testUserData, ...userProps };

        // Use username and email directly from currentUserData
        const finalUsername = currentUserData.username;
        const finalEmail = currentUserData.email;

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(currentUserData.password, salt);

        // Step 1: Prepare data that will be parameterized
        const paramData = {
            username: finalUsername,
            nome: currentUserData.nome,
            cognome: currentUserData.cognome,
            email: finalEmail,
            password: hashedPassword,
            indirizzo: currentUserData.indirizzo,
            tipologia: currentUserData.tipologia,
            deleted: false,
        };

        // Initialize arrays for SQL construction based on paramData
        // Note: Object.values() order corresponds to Object.keys() for non-integer string keys in modern JS
        const sqlColumns = [...Object.keys(paramData)]; // Start with base columns
        // This array will temporarily hold all items for the VALUES clause,
        // which can be actual data or SQL function strings like 'NOW()'.
        const valueItemsForSql = [...Object.values(paramData)]; // Start with base values

        // Step 2: Conditionally add special columns or override parts
        if (currentUserData.tipologia === 'Admin') {
            // For Admin, admintimestampcreazione uses the SQL NOW() function directly
            sqlColumns.push('admintimestampcreazione');
            valueItemsForSql.push('NOW()'); // Add 'NOW()' as the item for this column
        } else if (currentUserData.tipologia === 'Artigiano') {
            // For Artigiano, add PIVA and descrizione as parameterized values
            if (currentUserData.piva !== undefined) { // Ensure piva exists before adding
                sqlColumns.push('piva');
                valueItemsForSql.push(currentUserData.piva);
            }
            if (currentUserData.artigianodescrizione !== undefined) { // Ensure artigianodescrizione exists
                sqlColumns.push('artigianodescrizione');
                valueItemsForSql.push(currentUserData.artigianodescrizione);
            }
        }
        
        // Step 3: Generate final actualQueryValues (for parameterization)
        // and sqlValuePlaceholders (for the SQL string)
        const actualQueryValues = [];
        const sqlValuePlaceholders = [];
        let placeholderIndex = 1; // Start placeholder indexing from $1

        for (const item of valueItemsForSql) {
            if (item === 'NOW()') { // Check for our special SQL function string
                sqlValuePlaceholders.push('NOW()'); // Embed directly (inutile, tanto viene cancellato subito)
            } else {
                actualQueryValues.push(item); // This is a value to be parameterized
                sqlValuePlaceholders.push(`$${placeholderIndex++}`); // Add placeholder and increment
            }
        }

        const sqlInsertStatement = `INSERT INTO utente (${sqlColumns.join(', ')}) VALUES (${sqlValuePlaceholders.join(', ')}) RETURNING idutente`;

        // Step 4: Execute the INSERT query
        const userQuery = await dbClient.query(
            sqlInsertStatement,
            actualQueryValues // These are only the values for the $N placeholders
        );

        if (!userQuery.rows || userQuery.rows.length === 0 || !userQuery.rows[0].idutente) {
            console.error(`Failed to create test user or retrieve ID. Attempted username: ${finalUsername}, email: ${finalEmail}. UserQuery result:`, userQuery);
            throw new Error('Failed to create test user in setupTestUserAndToken: No ID returned from INSERT.');
        }
        createdTestUserId = userQuery.rows[0].idutente;
        
        // Step 5: Sign the JWT
        const payload = { user: { id: createdTestUserId } };
        const createdValidToken = jwt.sign(payload, jwtSecret, { expiresIn: '1h' });
        return { userId: createdTestUserId, token: createdValidToken, username: finalUsername, tipologia: currentUserData.tipologia };
    }
// Helper function to delete a test user by ID using the main pool
async function deleteTestUserById(userId) {
    let result;
    if (userId) {
        result = await pool.query('DELETE FROM utente WHERE idutente = $1', [userId]);
    } else {
        console.err('deleteTestUserById called without a userId.');
        return;
    }
}


describe('Unit test: isAuthenticated Middleware', () => {
    // --- Database Setup and Teardown ---
    // Some tests will manage data within transactions, others (like authenticated happy path) will use committed data.

    // --- Test Cases ---

    describe('Authenticated Scenarios', () => {
        // For this describe block, we'll create a committed user for the main happy path test
        // so the middleware (using a separate DB connection) can see it.
        let currentTestUserId;
        let currentValidToken;
        let currentTestUsername;

        beforeEach(async () => {
            // Create a user using the default pool connection; this will be auto-committed or committed by default.
            const setup = await setupTestUserAndToken(); // Uses global pool, data is committed
            currentTestUserId = setup.userId;
            currentValidToken = setup.token;
            currentTestUsername = setup.username; // This will be testUserData.username
        });

        afterEach(async () => {
            // Clean up the committed user
            await deleteTestUserById(currentTestUserId);
            currentTestUserId = null;
            currentValidToken = null;
            currentTestUsername = null;
        });

        test('should allow access with a valid JWT', async () => {
            const response = await request(app)
                .get('/protected')
                .set('Authorization', `Bearer ${currentValidToken}`)
                .expect(200);

            expect(response.body.message).toBe('Access granted');
            expect(response.body.user).toBeDefined();
            expect(response.body.user.idutente).toBe(currentTestUserId);
            expect(response.body.user.username).toBe(currentTestUsername);
        });

        test('should return 401 if the user associated with the token is deleted', async () => {
            // The user (currentTestUserId) was created and committed in beforeEach.
            // Now, soft-delete this user. This change must also be visible to the middleware.
            await pool.query('UPDATE utente SET deleted = true WHERE idutente = $1', [currentTestUserId]);

            const response = await request(app)
                .get('/protected')
                .set('Authorization', `Bearer ${currentValidToken}`) // Use the valid token for the now deleted user
                .expect(401);
            expect(response.body.message).toBe('Accesso non autorizzato. Utente non più attivo.');
        });
    });


    // Tests that don't require a pre-existing user or don't modify the DB
    // can be outside the transaction-managed describe block, or manage their own.
    test('should return 401 if no token is provided', async () => {
        const response = await request(app)
            .get('/protected')
            .expect(401);

        expect(response.body.message).toBe('Accesso non autorizzato. Token mancante o malformato.');
    });

    test('should return 401 if the token is malformed', async () => {
        const response = await request(app)
            .get('/protected')
            .set('Authorization', 'Bearer malformed.token') // Invalid format
            .expect(401);

        expect(response.body.message).toBe('Accesso non autorizzato. Token non valido o scaduto.');
    });

    test('should return 401 if the token has an invalid signature', async () => {
        // The user ID in the payload doesn't matter for signature verification,
        // only the secret used to sign it does.
        const invalidToken = jwt.sign({ user: { id: 9999 } }, 'wrong_secret', { expiresIn: '1h' });

        const response = await request(app)
            .get('/protected')
            .set('Authorization', `Bearer ${invalidToken}`)
            .expect(401);
        expect(response.body.message).toBe('Accesso non autorizzato. Token non valido o scaduto.');
    });

});

describe('Integration Test: hasPermission Middleware', () => {
    let adminUser, clienteUser, artigianoUser;

    beforeAll(async () => {
        // Create users with different roles once for all tests in this describe block
        // These users will be committed to the DB.
        adminUser = await setupTestUserAndToken({
            username: 'perm_admin_user_v2', // Updated for clarity
            email: 'perm.admin@example.com',
            tipologia: 'Admin'
        });
        clienteUser = await setupTestUserAndToken({
            username: 'perm_cliente_user_v2', // Updated for clarity
            email: 'perm.cliente@example.com',
            tipologia: 'Cliente'
        });
        artigianoUser = await setupTestUserAndToken({
            username: 'perm_artigiano_user_v2',
            email: 'perm.artigiano@example.com',
            tipologia: 'Artigiano',
            piva: `01234567890`, // Example PIVA
            artigianodescrizione: 'Descrizione Artigiano di Test' // Example description
        });
    });

    afterAll(async () => {
        // Clean up all created users
        if (adminUser) await deleteTestUserById(adminUser.userId);
        if (clienteUser) await deleteTestUserById(clienteUser.userId);
        if (artigianoUser) await deleteTestUserById(artigianoUser.userId);
    });

    // Test cases for /admin-only route (requires 'Admin')
    describe('/admin-only route (requires "Admin")', () => {
        const route = '/admin-only';
        const successMessage = 'Admin access granted';
        const scenarios = [
            { getUser: () => adminUser, expectedStatus: 200, description: 'Admin user' },
            { getUser: () => clienteUser, expectedStatus: 403, description: 'Cliente user' },
            { getUser: () => artigianoUser, expectedStatus: 403, description: 'Artigiano user' },
        ];

        test.each(scenarios)('should return $expectedStatus for $description', async ({ getUser, expectedStatus }) => {
            const currentUser = getUser();
            const response = await request(app)
                .get(route)
                .set('Authorization', `Bearer ${currentUser.token}`)
                .expect(expectedStatus);

            if (expectedStatus === 200) {
                expect(response.body.message).toBe(successMessage);
                expect(response.body.user.tipologia).toBe(currentUser.tipologia);
            } else if (expectedStatus === 403) {
                expect(response.body.message).toBe('Accesso negato. Non hai i permessi necessari per questa risorsa.');
            }
        });
    });

    // Test cases for /artigiano-or-admin route (requires 'Artigiano' or 'Admin')
    describe('/artigiano-or-admin route (requires "Artigiano" or "Admin")', () => {
        const route = '/artigiano-or-admin';
        const successMessage = 'Artigiano or Admin access granted';
        const scenarios = [
            { getUser: () => adminUser, expectedStatus: 200, description: 'Admin user' },
            { getUser: () => artigianoUser, expectedStatus: 200, description: 'Artigiano user' },
            { getUser: () => clienteUser, expectedStatus: 403, description: 'Cliente user' },
        ];

        test.each(scenarios)('should return $expectedStatus for $description', async ({ getUser, expectedStatus }) => {
            const currentUser = getUser();
            const response = await request(app)
                .get(route)
                .set('Authorization', `Bearer ${currentUser.token}`)
                .expect(expectedStatus);

            if (expectedStatus === 200) {
                expect(response.body.message).toBe(successMessage);
                expect(response.body.user.tipologia).toBe(currentUser.tipologia);
            } else if (expectedStatus === 403) {
                expect(response.body.message).toBe('Accesso negato. Non hai i permessi necessari per questa risorsa.');
            }
        });
    });

    // Test cases for /self-only/:id route (requires 'Self')
    describe('/self-only/:id route (requires "Self")', () => {
        const routeBase = '/self-only';
        const successMessage = 'Self access granted';

        test('Cliente user should access their own resource ID', async () => {
            const response = await request(app)
                .get(`${routeBase}/${clienteUser.userId}`)
                .set('Authorization', `Bearer ${clienteUser.token}`)
                .expect(200);

            expect(response.body.message).toBe(successMessage);
            expect(response.body.user.idutente).toBe(clienteUser.userId);
            expect(response.body.params.id).toBe(String(clienteUser.userId)); // params.id is a string
        });

        test('Artigiano user should access their own resource ID', async () => {
            const response = await request(app)
                .get(`${routeBase}/${artigianoUser.userId}`)
                .set('Authorization', `Bearer ${artigianoUser.token}`)
                .expect(200);

            expect(response.body.message).toBe(successMessage);
            expect(response.body.user.idutente).toBe(artigianoUser.userId);
            expect(response.body.params.id).toBe(String(artigianoUser.userId));
        });

        test('Admin user should access their own resource ID (as "Self" applies to any user type)', async () => {
            const response = await request(app)
                .get(`${routeBase}/${adminUser.userId}`)
                .set('Authorization', `Bearer ${adminUser.token}`)
                .expect(200);

            expect(response.body.message).toBe(successMessage);
            expect(response.body.user.idutente).toBe(adminUser.userId);
            expect(response.body.params.id).toBe(String(adminUser.userId));
        });

        test('Cliente user should NOT access another user\'s resource ID', async () => {
            // Attempt to access admin's resource as clienteUser
            const targetResourceId = adminUser.userId; 
            const response = await request(app)
                .get(`${routeBase}/${targetResourceId}`)
                .set('Authorization', `Bearer ${clienteUser.token}`)
                .expect(403);

            expect(response.body.message).toBe('Accesso negato. Non hai i permessi necessari per questa risorsa.');
        });
    });

});