// backend/tests/productRoutes.test.js

const request = require('supertest');
const bcrypt = require('bcryptjs');
const app = require('../../src/server.js'); // Updated path to your main Express app file
const pool = require('../../src/config/db-connect'); // Adjusted path to your database pool

describe('Product API Routes (using other Routes)', () => {
    let adminToken;
    let artigianoToken;
    let artigianoUser;
    let adminUser;
    let otherArtigianoUser; // For testing cross-artisan scenarios
    let createdProductIdByArtigiano;
    // let createdProductIdByAdmin; // Admins should not create products, so this variable is not needed.

    beforeAll(async () => {
        // Clean database tables thoroughly before tests start.
        // We will now selectively delete test data in afterAll instead of truncating.
        // Adjust if using a different database.

        // Generate a unique suffix for this test run
        const testRunSuffix = `${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

        // --- Create Admin User & Get Token --- (non è possibile creare un utente tramite API per design, quindi lo facciamo qui)s
        const adminPassword = 'password123';
        const hashedAdminPassword = await bcrypt.hash(adminPassword, 10);
        const adminUsername = `testadmin_${testRunSuffix}`;
        const adminEmail = `testadmin_${testRunSuffix}@example.com`;
        const adminRes = await pool.query(
            `INSERT INTO utente (username, nome, cognome, email, password, indirizzo, tipologia, admintimestampcreazione)
             VALUES ($1, $2, $3, $4, $5, $6, $7, NOW()) RETURNING *`,
            [adminUsername, 'Test', 'Admin', adminEmail, hashedAdminPassword, '123 Admin St', 'Admin']
        );
        adminUser = adminRes.rows[0];
        const adminLoginRes = await request(app)
            .post('/api/auth/login')
            .send({ username: adminUsername, password: adminPassword });
        if (!adminLoginRes.body.token) throw new Error('Admin login failed in test setup.');
        adminToken = adminLoginRes.body.token;
        console.log('Admin user created and token obtained:', adminToken);

        // --- Create Artigiano User & Get Token --- (tramite API)
        const artigianoPassword = 'password123';

        const artigianoUsername = `testartigiano_${testRunSuffix}`;
        const artigianoEmail = `testartigiano_${testRunSuffix}@example.com`;
        const artigianoDetails = {
            username: artigianoUsername,
            nome: 'Test',
            cognome: 'Artigiano',
            email: artigianoEmail,
            password: artigianoPassword,
            indirizzo: '123 Art St',
            tipologia: 'Artigiano',
            piva: '12345678901', // Required for Artigiano
            artigianodescrizione: 'Handmade Goods by Test Artigiano', // Required for Artigiano
            // The userRoutes POST /api/users does not handle negozio, orariolavoro, cittanegozio directly
            // These would need to be updated via a PUT /api/users/:id if necessary after creation
            // or your POST /api/users route would need to be extended to handle them.
            // For now, we'll stick to what POST /api/users accepts.
        };
        const artigianoRegisterRes = await request(app)
            .post('/api/users')
            .send(artigianoDetails);

        if (artigianoRegisterRes.statusCode !== 201) {
            console.error('Artigiano registration failed in test setup:', artigianoRegisterRes.body);
            throw new Error('Artigiano registration failed in test setup.');
        }
        artigianoUser = artigianoRegisterRes.body; // API returns the created user object
        
        const artigianoLoginRes = await request(app)
            .post('/api/auth/login')
            .send({ username: artigianoUsername, password: artigianoPassword });
        if (!artigianoLoginRes.body.token) throw new Error('Artigiano login failed in test setup.');
        artigianoToken = artigianoLoginRes.body.token;

        // --- Approve the main Artigiano User ---
        // The POST /api/users for Artigiano (used above) automatically creates an 'In lavorazione' record in StoricoApprovazioni.
        // We now find that record and update it to 'Approvato' using the adminUser.
        if (artigianoUser && artigianoUser.idutente && adminUser && adminUser.idutente) {
            try {
                const approvalUpdateRes = await pool.query(
                    `UPDATE StoricoApprovazioni
                     SET Esito = 'Approvato', IDAdmin = $1, DataEsito = NOW()
                     WHERE IDArtigiano = $2 AND Esito = 'In lavorazione'
                     RETURNING IDStorico, Esito`,
                    [adminUser.idutente, artigianoUser.idutente]
                );
                if (approvalUpdateRes.rowCount === 0) {
                    console.warn(`[Test Setup] Could not find an 'In lavorazione' approval record for artigianoUser ID ${artigianoUser.idutente} to update to 'Approvato'. The user might have been approved in a previous (failed) run or the initial record was not created as expected.`);
                } else {
                    console.log(`[Test Setup] Artigiano user ID ${artigianoUser.idutente} has been approved by admin ID ${adminUser.idutente}. StoricoApprovazioni record ID ${approvalUpdateRes.rows[0].idstorico}, new Esito: ${approvalUpdateRes.rows[0].esito}.`);
                }
            } catch (error) {
                console.error(`[Test Setup] Error occurred while trying to approve artigianoUser ID ${artigianoUser.idutente}:`, error);
                throw new Error('Failed to approve artigianoUser in test setup due to a database error.');
            }
        } else {
            throw new Error('Cannot proceed with Artigiano approval: artigianoUser or adminUser details are missing or not properly initialized.');
        }

        // --- Create Another Artigiano User (for permission tests) ---
        const otherArtigianoPassword = 'password123';

        const otherArtigianoUsername = `otherartigiano_${testRunSuffix}`;
        const otherArtigianoEmail = `other_${testRunSuffix}@example.com`;
        const otherArtigianoDetails = {
            username: otherArtigianoUsername,
            nome: 'Other',
            cognome: 'Art',
            email: otherArtigianoEmail,
            password: otherArtigianoPassword,
            indirizzo: '456 Other St',
            tipologia: 'Artigiano',
            piva: '09876543210', // Required
            artigianodescrizione: 'Other Goods by Other Artigiano', // Required
        };
        const otherArtigianoRegisterRes = await request(app)
            .post('/api/users')
            .send(otherArtigianoDetails);

        if (otherArtigianoRegisterRes.statusCode !== 201) {
            console.error('Other Artigiano registration failed in test setup:', otherArtigianoRegisterRes.body);
            throw new Error('Other Artigiano registration failed in test setup.');
        }
        otherArtigianoUser = otherArtigianoRegisterRes.body;

        // --- Approve the otherArtigianoUser ---
        // Similar to the main artigianoUser, this one also needs to be approved for certain tests.
        if (otherArtigianoUser && otherArtigianoUser.idutente && adminUser && adminUser.idutente) {
            try {
                const otherApprovalUpdateRes = await pool.query(
                    `UPDATE StoricoApprovazioni
                     SET Esito = 'Approvato', IDAdmin = $1, DataEsito = NOW()
                     WHERE IDArtigiano = $2 AND Esito = 'In lavorazione'
                     RETURNING IDStorico, Esito`,
                    [adminUser.idutente, otherArtigianoUser.idutente]
                );
                if (otherApprovalUpdateRes.rowCount === 0) {
                    console.warn(`[Test Setup] Could not find an 'In lavorazione' approval record for otherArtigianoUser ID ${otherArtigianoUser.idutente} to update to 'Approvato'.`);
                } else {
                    console.log(`[Test Setup] Other Artigiano user ID ${otherArtigianoUser.idutente} has been approved by admin ID ${adminUser.idutente}. StoricoApprovazioni record ID ${otherApprovalUpdateRes.rows[0].idstorico}, new Esito: ${otherApprovalUpdateRes.rows[0].esito}.`);
                }
            } catch (error) {
                console.error(`[Test Setup] Error occurred while trying to approve otherArtigianoUser ID ${otherArtigianoUser.idutente}:`, error);
                throw new Error('Failed to approve otherArtigianoUser in test setup due to a database error.');
            }
        } else {
            throw new Error('Cannot proceed with Other Artigiano approval: otherArtigianoUser or adminUser details are missing or not properly initialized.');
        }
        // Token for otherArtigiano will be fetched within specific tests if needed.
    });

    afterAll(async () => {
        // Clean up test-specific data
        const userIdsToDelete = [];
        if (adminUser && adminUser.idutente) {
            userIdsToDelete.push(adminUser.idutente);
        }
        if (artigianoUser && artigianoUser.idutente) {
            userIdsToDelete.push(artigianoUser.idutente);
        }
        if (otherArtigianoUser && otherArtigianoUser.idutente) {
            userIdsToDelete.push(otherArtigianoUser.idutente);
        }

        if (userIdsToDelete.length > 0) {
            try {
                // Delete products associated with these test users
                // This should also cover products whose IDs might be in createdProductIdByArtigiano or createdProductIdByAdmin
                await pool.query(`DELETE FROM Prodotto WHERE idartigiano = ANY($1::int[])`, [userIdsToDelete]);
                console.log('Test products deleted for users:', userIdsToDelete);
                // Delete the test users themselves
                await pool.query(`DELETE FROM Utente WHERE idutente = ANY($1::int[])`, [userIdsToDelete]);
                console.log('Test users deleted:', userIdsToDelete);
            } catch (err) {
                console.error('Error during test data cleanup:', err.message, err.stack);
            }
        }
        await pool.end(); // Close the database connection pool
    });

    // --- Test POST /api/products ---
    describe('POST /api/products', () => {
        test('should create a new product when authenticated as Artigiano', async () => {
            const newProduct = {
                nome: 'Artisan Product',
                descrizione: 'Handmade by artisan',
                categoria: 'Handcraft',
                prezzounitario: 25.99,
                quantitadisponibile: 10,
                immagine: null // Or a base64 string: 'base64encodedimage...'
            };
            const res = await request(app)
                .post('/api/products')
                .set('Authorization', `Bearer ${artigianoToken}`)
                .send(newProduct);
            expect(res.statusCode).toEqual(201);
            expect(res.body).toHaveProperty('idprodotto');
            expect(res.body.nome).toBe(newProduct.nome);
            expect(res.body.idartigiano).toBe(artigianoUser.idutente);
            createdProductIdByArtigiano = res.body.idprodotto;
        });

        test('should return 403 if Admin tries to create a product', async () => {
            const newProduct = {
                nome: 'Admin Created Product',
                descrizione: 'Created by admin for an artisan',
                categoria: 'Admin Special',
                prezzounitario: 99.99,
                quantitadisponibile: 5,
                idartigiano: artigianoUser.idutente // Admin might attempt to specify an artisan
            };
            const res = await request(app)
                .post('/api/products')
                .set('Authorization', `Bearer ${adminToken}`)
                .send(newProduct);
            expect(res.statusCode).toEqual(403); // Forbidden due to hasPermission(['Artigiano'])
            // Check for the specific permission denied message from your hasPermission middleware
            expect(res.body).toHaveProperty('message');
            if (res.body.message) { // Add a null check for safety
                expect(res.body.message).toMatch(/Accesso negato. Non hai i permessi necessari per questa risorsa./i);
            }
        });

        it('should return 400 if required fields are missing', async () => {
            const newProduct = { nome: 'Incomplete Product' }; // Missing other required fields
            const res = await request(app)
                .post('/api/products')
                .set('Authorization', `Bearer ${artigianoToken}`)
                .send(newProduct);
            expect(res.statusCode).toEqual(400);
        });

        it('should return 401 if not authenticated', async () => {
            const newProduct = { nome: 'Unauthorized Product', descrizione: 'Desc', categoria: 'Cat', prezzounitario: 1, quantitadisponibile: 1 };
            const res = await request(app)
                .post('/api/products')
                .send(newProduct);
            expect(res.statusCode).toEqual(401); // Assuming isAuthenticated middleware sends 401
        });
    });

    // --- Test GET /api/products/ (che in realtà è /api/products/all nel codice)
    describe('GET /api/products/', () => { // Aggiornato per riflettere la rotta effettiva
        it('should return a list of all products (including deleted) when authenticated as Admin', async () => {
            // Assicurati che esista almeno un prodotto, magari uno creato in precedenza
            expect(createdProductIdByArtigiano).toBeDefined();
            const res = await request(app)
                .get('/api/products/') // Aggiornato alla rotta corretta
                .set('Authorization', `Bearer ${adminToken}`);

            expect(res.statusCode).toEqual(200);
            expect(Array.isArray(res.body)).toBe(true);
            // Verifica che il prodotto creato in precedenza sia presente, anche se fosse stato eliminato
            expect(res.body.some(p => p.idprodotto = createdProductIdByArtigiano)).toBe(true);
        });

        it('should return 403 if not authenticated as Admin', async () => {
            const res = await request(app)
                .get('/api/products/') // Aggiornato alla rotta corretta
                .set('Authorization', `Bearer ${artigianoToken}`); // Usa un token non Admin

            expect(res.statusCode).toEqual(403);
            expect(res.body.message).toMatch(/Accesso negato. Non hai i permessi necessari per questa risorsa./i);
        });
    });

    // --- Test GET /api/products/notdeleted ---
    describe('GET /api/products/notdeleted', () => {
        it('should return a list of non-deleted products', async () => {
            const res = await request(app).get('/api/products/notdeleted');
            expect(res.statusCode).toEqual(200);
            expect(Array.isArray(res.body)).toBe(true);
            // Check if products created in POST tests are present
            if (createdProductIdByArtigiano) {
                expect(res.body.some(p => p.idprodotto = createdProductIdByArtigiano)).toBe(true);
            }
            // createdProductIdByAdmin related check removed as Admins cannot create products.
        });
    });

    // --- Test GET /api/products/:id ---
    describe('GET /api/products/:id', () => {
        it('should return a specific product if ID exists and not deleted', async () => {
            expect(createdProductIdByArtigiano).toBeDefined(); // Ensure product was created
            const res = await request(app).get(`/api/products/${createdProductIdByArtigiano}`);
            expect(res.statusCode).toEqual(200);
            expect(res.body.idprodotto).toBe(createdProductIdByArtigiano);
        });

        it('should return 404 if product ID does not exist', async () => {
            const res = await request(app).get('/api/products/999999'); // Non-existent ID
            expect(res.statusCode).toEqual(404);
            expect(res.body).toHaveProperty('error', 'Prodotto non trovato o è stato rimosso.');
        });
    });

    // --- Test PUT /api/products/:id ---
    describe('PUT /api/products/:id', () => {
        it('should allow owning Artigiano to update their product', async () => {
            const updates = { nome: 'Updated Artisan Product Name', prezzounitario: 30.50 };
            const res = await request(app)
                .put(`/api/products/${createdProductIdByArtigiano}`)
                .set('Authorization', `Bearer ${artigianoToken}`)
                .send(updates);
            expect(res.statusCode).toEqual(200);
            console.log('Updated product response:', res.body);
            expect(res.body.product.nome).toBe(updates.nome);
            expect(res.body.product.prezzounitario).toBe(updates.prezzounitario);
        });

        it('should prevent Artigiano from updating idartigiano', async () => {
            const updates = { idartigiano: adminUser.idutente }; // Trying to change owner
            const res = await request(app)
                .put(`/api/products/${createdProductIdByArtigiano}`)
                .set('Authorization', `Bearer ${artigianoToken}`)
                .send(updates);
            expect(res.statusCode).toEqual(403);
            expect(res.body).toHaveProperty('error', "Vietato: gli artigiani non possono cambiare il proprietario del prodotto.");
        });

        it('should allow Admin to update any product, including idartigiano', async () => {
            const updates = { nome: 'Admin Overridden Product Name', idartigiano: otherArtigianoUser.idutente };
            const res = await request(app)
                .put(`/api/products/${createdProductIdByArtigiano}`) // Product originally by artigianoUser
                .set('Authorization', `Bearer ${adminToken}`)
                .send(updates);
            expect(res.statusCode).toEqual(200);
            expect(res.body.product.nome).toBe(updates.nome);
            expect(res.body.product.idartigiano).toBe(otherArtigianoUser.idutente);
        });

        it('should return 403 if Artigiano tries to update another Artigiano\'s product', async () => {
            // To ensure this test is isolated from state changes in `createdProductIdByArtigiano`
            // (which has its owner changed by the Admin update test),
            // we create a new product specifically for this scenario, owned by artigianoUser.
            const productToTestUpdateDetails = {
                nome: 'Product For Cross-Artisan Update Test',
                descrizione: 'Owned by artigianoUser',
                categoria: 'IsolationTest',
                prezzounitario: 11.11,
                quantitadisponibile: 1
            };
            const createProductRes = await request(app)
                .post('/api/products')
                .set('Authorization', `Bearer ${artigianoToken}`) // artigianoUser creates this product
                .send(productToTestUpdateDetails);
            expect(createProductRes.statusCode).toEqual(201);
            const productOwnedByArtigianoUserId = createProductRes.body.idprodotto;

            // `otherArtigianoUser` (with their token) will try to update it.
            const otherArtigianoLoginRes = await request(app)
                .post('/api/auth/login')
                .send({ username: otherArtigianoUser.username, password: 'password123' }); // Use username from the accessible otherArtigianoUser object
            const otherArtigianoToken = otherArtigianoLoginRes.body.token;
            const updates = { nome: "Attempted Update by Wrong Artisan" };
            const res = await request(app)
                .put(`/api/products/${productOwnedByArtigianoUserId}`) // Target the newly created product
                .set('Authorization', `Bearer ${otherArtigianoToken}`) // otherArtigiano attempts update
                .send(updates);

            expect(res.statusCode).toEqual(403);
        });

        it('should return 404 if product to update is not found', async () => {
            const updates = { nome: 'No Product Here' };
            const res = await request(app)
                .put('/api/products/999999')
                .set('Authorization', `Bearer ${adminToken}`)
                .send(updates);
            expect(res.statusCode).toEqual(404);
            expect(res.body).toHaveProperty('error', "Prodotto non trovato o è stato rimosso, impossibile aggiornare.");
        });
    });

    // --- Test DELETE /api/products/:id ---
    describe('DELETE /api/products/:id', () => {
        let productToDeleteId;

        beforeEach(async () => {
            // Create a fresh product for each delete test
            const productData = {
                nome: 'Product About To Be Deleted',
                descrizione: 'Delete me',
                categoria: 'Ephemeral',
                prezzounitario: 5,
                quantitadisponibile: 1,
                idartigiano: artigianoUser.idutente // Owned by the main artigianoUser
            };
            const dbRes = await pool.query(
                `INSERT INTO Prodotto (nome, descrizione, categoria, prezzounitario, quantitadisponibile, idartigiano, deleted)
                 VALUES ($1, $2, $3, $4, $5, $6, FALSE) RETURNING idprodotto`,
                [productData.nome, productData.descrizione, productData.categoria, productData.prezzounitario, productData.quantitadisponibile, productData.idartigiano]
            );
            productToDeleteId = dbRes.rows[0].idprodotto;
        });

        it('should allow owning Artigiano to soft-delete their product', async () => {
            const res = await request(app)
                .delete(`/api/products/${productToDeleteId}`)
                .set('Authorization', `Bearer ${artigianoToken}`);
            expect(res.statusCode).toEqual(200);
            expect(res.body.message).toBe('Prodotto rimosso (soft delete) con successo');

            const check = await pool.query('SELECT deleted FROM Prodotto WHERE idprodotto = $1', [productToDeleteId]);
            expect(check.rows[0].deleted).toBe(true);
        });

        it('should allow Admin to soft-delete any product', async () => {
            const res = await request(app)
                .delete(`/api/products/${productToDeleteId}`)
                .set('Authorization', `Bearer ${adminToken}`);
            expect(res.statusCode).toEqual(200);
            const check = await pool.query('SELECT deleted FROM Prodotto WHERE idprodotto = $1', [productToDeleteId]);
            expect(check.rows[0].deleted).toBe(true);
        });

        it('should prevent Artigiano from deleting another Artigiano\'s product', async () => {
            // productToDeleteId is owned by artigianoUser.
            // otherArtigianoUser will try to delete it.
            const otherArtigianoLoginRes = await request(app)
                .post('/api/auth/login')
                .send({ username: otherArtigianoUser.username, password: 'password123' }); // Use username from the accessible otherArtigianoUser object
            const otherArtigianoToken = otherArtigianoLoginRes.body.token;

            const res = await request(app)
                .delete(`/api/products/${productToDeleteId}`)
                .set('Authorization', `Bearer ${otherArtigianoToken}`);
            expect(res.statusCode).toEqual(403);
        });

        it('should return 404 if trying to delete a product that is already deleted', async () => {
            // First, delete it
            await request(app)
                .delete(`/api/products/${productToDeleteId}`)
                .set('Authorization', `Bearer ${adminToken}`);
            
            // Then, try to delete again
            const res = await request(app)
                .delete(`/api/products/${productToDeleteId}`)
                .set('Authorization', `Bearer ${adminToken}`);
            expect(res.statusCode).toEqual(404);
            expect(res.body).toHaveProperty('error', "Prodotto non trovato o già rimosso.");
        });

        it('deleted product should not appear in /api/products/notdeleted list', async () => {
            await request(app)
                .delete(`/api/products/${productToDeleteId}`)
                .set('Authorization', `Bearer ${adminToken}`);

            const res = await request(app).get('/api/products/notdeleted');
            expect(res.statusCode).toEqual(200);
            const productIds = res.body.map(p => p.idprodotto);
            expect(productIds).not.toContain(productToDeleteId);
        });

         it('should return 404 when trying to GET a soft-deleted product by ID', async () => {
            await request(app)
                .delete(`/api/products/${productToDeleteId}`)
                .set('Authorization', `Bearer ${adminToken}`);

            const res = await request(app).get(`/api/products/${productToDeleteId}`);
            expect(res.statusCode).toEqual(404);
            expect(res.body).toHaveProperty('error', 'Prodotto non trovato o è stato rimosso.');
        });
    });
});
