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

// Global counter for generating unique suffixes for test users
let testUserCreationCounter = 0;

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

        // Generate a more robust unique suffix for this specific user creation call
        testUserCreationCounter++;
        const uniqueSuffix = `${Date.now()}_${testUserCreationCounter}_${Math.random().toString(36).substring(2, 7)}`;

        // Determine username: use from userProps if provided, otherwise generate a unique one from testUserData.username
        const finalUsername = userProps.username || `${testUserData.username}_${uniqueSuffix}`;

        // Determine email: use from userProps if provided, otherwise generate a unique one from testUserData.email
        let finalEmail;
        if (userProps.email) {
            finalEmail = userProps.email;
        } else {
            const [baseEmailUser, baseEmailDomain] = testUserData.email.split('@');
            // Ensure base email parts are valid and construct unique email
            if (baseEmailUser && baseEmailDomain) {
                finalEmail = `${baseEmailUser}_${uniqueSuffix}@${baseEmailDomain}`;
            } else {
                // Fallback if testUserData.email is not in a typical format (e.g., missing '@' or parts).
                // Use the base of the username (e.g., 'testuser' from 'testuser_base_int') for a more relevant email.
                const usernameForEmail = userProps.username || testUserData.username; // Use provided username if available for base
                const usernameBase = usernameForEmail.split('_')[0]; // Takes the part before the first underscore
                finalEmail = `${usernameBase}_${uniqueSuffix}@example.com`;
            }
        }

        // Ensure currentUserData has all necessary fields, defaulting from testUserData,
        // then applying userProps, and finally ensuring our unique username/email are set.
        const currentUserData = {
            ...testUserData,          // Load defaults
            ...userProps,             // Apply overrides from caller
            username: finalUsername,  // Ensure username is the one we decided (explicit or generated unique)
            email: finalEmail,        // Ensure email is the one we decided (explicit or generated unique)
        };

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(currentUserData.password, salt);
        
        // Step 1: Prepare data that will be parameterized
        // This should use the final determined username and email from currentUserData
        const paramData = {
            username: currentUserData.username, 
            nome: currentUserData.nome,
            cognome: currentUserData.cognome,
            email: currentUserData.email, 
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
                sqlValuePlaceholders.push('NOW()'); // Embed directly
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
            console.error(`Failed to create test user or retrieve ID. Attempted username: ${currentUserData.username}, email: ${currentUserData.email}. UserQuery result:`, userQuery);
            throw new Error('Failed to create test user in setupTestUserAndToken: No ID returned from INSERT.');
        }
        createdTestUserId = userQuery.rows[0].idutente;
        
        // Step 5: Sign the JWT
        const payload = { user: { id: createdTestUserId } };
        const createdValidToken = jwt.sign(payload, jwtSecret, { expiresIn: '1h' });
        return { userId: createdTestUserId, token: createdValidToken, username: currentUserData.username, tipologia: currentUserData.tipologia };
    }
// Helper function to delete a test user by ID using the main pool
async function deleteTestUserById(userId) {
    // let result; // result was not used
    if (userId) {
        await pool.query('DELETE FROM utente WHERE idutente = $1', [userId]);
    } else {
        console.error('deleteTestUserById called without a userId.');
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
    let adminUser, clienteUser, approvedArtigianoUser, unapprovedArtigianoUser;

    beforeAll(async () => {
        // Create users with different roles once for all tests in this describe block
        // Generate a unique suffix for this batch of permission test users
        // to ensure uniqueness even for these "named" users across test suite runs.
        const permTestRunSuffix = `${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

        adminUser = await setupTestUserAndToken({
            username: `perm_admin_user_${permTestRunSuffix}`,
            email: `perm.admin_${permTestRunSuffix}@example.com`,
            tipologia: 'Admin'
        });
        clienteUser = await setupTestUserAndToken({
            username: `perm_cliente_user_${permTestRunSuffix}`,
            email: `perm.cliente_${permTestRunSuffix}@example.com`,
            tipologia: 'Cliente'
        });
        // This Artigiano user will be "approved" for testing scenarios that require an approved Artigiano
        approvedArtigianoUser = await setupTestUserAndToken({
            username: `perm_approved_artigiano_${permTestRunSuffix}`,
            email: `perm.approved.artigiano_${permTestRunSuffix}@example.com`,
            tipologia: 'Artigiano',
            piva: `1111111${permTestRunSuffix.slice(-4)}`, 
            artigianodescrizione: `Descrizione Artigiano Approvato Test ${permTestRunSuffix}`
        });

        // This Artigiano user will remain "unapproved"
        unapprovedArtigianoUser = await setupTestUserAndToken({
            username: `perm_unapproved_artigiano_${permTestRunSuffix}`,
            email: `perm.unapproved.artigiano_${permTestRunSuffix}@example.com`,
            tipologia: 'Artigiano',
            piva: `2222222${permTestRunSuffix.slice(-4)}`, // Ensure PIVA is unique if constrained
            artigianodescrizione: `Descrizione Artigiano Non Approvato Test ${permTestRunSuffix}`
        });

        // Simulate approval for approvedArtigianoUser by adminUser
        // This assumes your hasPermission middleware checks StoricoApprovazioni for Artigiano approval
        if (adminUser && approvedArtigianoUser) {
            try {
                await pool.query(
                    'INSERT INTO StoricoApprovazioni (idartigiano, idadmin, esito,dataesito) VALUES ($1, $2, $3, NOW())',
                    [approvedArtigianoUser.userId, adminUser.userId,'Approvato']
                );
            } catch (error) {
                console.error("Failed to insert into StoricoApprovazioni during test setup:", error);
                // Potentially throw error or handle as needed if this setup is critical
            }
        }
    });

    afterAll(async () => {
        // IMPORTANT: Clean up StoricoApprovazioni before deleting users to avoid FK violations
        if (adminUser && approvedArtigianoUser) { // Only if the approval was attempted
            await pool.query('DELETE FROM StoricoApprovazioni WHERE idartigiano = $1 AND idadmin = $2', [approvedArtigianoUser.userId, adminUser.userId]);
        }
        // Clean up all created users from utente table
        if (adminUser) await deleteTestUserById(adminUser.userId);
        if (clienteUser) await deleteTestUserById(clienteUser.userId);
        if (approvedArtigianoUser) await deleteTestUserById(approvedArtigianoUser.userId);
        if (unapprovedArtigianoUser) await deleteTestUserById(unapprovedArtigianoUser.userId);
    });

    // Test cases for /admin-only route (requires 'Admin')
    describe('/admin-only route (requires "Admin")', () => {
        const route = '/admin-only';
        const successMessage = 'Admin access granted';
        const scenarios = [
            { getUser: () => adminUser, expectedStatus: 200, description: 'Admin user' },
            { getUser: () => clienteUser, expectedStatus: 403, description: 'Cliente user' },
            { getUser: () => approvedArtigianoUser, expectedStatus: 403, description: 'Approved Artigiano user (not Admin)' },
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
            { getUser: () => approvedArtigianoUser, expectedStatus: 200, description: 'Approved Artigiano user' },
            { getUser: () => clienteUser, expectedStatus: 403, description: 'Cliente user' },
            { getUser: () => unapprovedArtigianoUser, expectedStatus: 403, description: 'Unapproved Artigiano user' },
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
                if (currentUser.tipologia === 'Artigiano') { // Specifically for the unapproved Artigiano
                    expect(response.body.message).toBe('Accesso negato. Il tuo account Artigiano non è ancora stato approvato.');
                } else { // For other users like Cliente who don't have permission
                    expect(response.body.message).toBe('Accesso negato. Non hai i permessi necessari per questa risorsa.');
                }
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
                .get(`${routeBase}/${approvedArtigianoUser.userId}`)
                .set('Authorization', `Bearer ${approvedArtigianoUser.token}`)
                .expect(200);

            expect(response.body.message).toBe(successMessage);
            expect(response.body.user.idutente).toBe(approvedArtigianoUser.userId);
            expect(response.body.params.id).toBe(String(approvedArtigianoUser.userId));
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