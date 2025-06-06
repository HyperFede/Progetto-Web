const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') }); // Adjust path as needed

const request = require('supertest');
const express = require('express');
const bcryptjs = require('bcryptjs'); // For password hashing
const pool = require('../../../src/config/db-connect'); // REAL pool

// Assuming your main app instance or route modules
const subOrderRoutes = require('../../../src/routes/subOrderRoutes');
const authRoutes = require('../../../src/routes/authRoutes'); // Needed for login/tokens

const app = express();
app.use(express.json());
app.use('/api/suborders', subOrderRoutes);
app.use('/api/auth', authRoutes); // Mount auth routes for login

// --- Test Data Storage for Cleanup ---
let createdUserIds = [];
let createdProductIds = [];
let createdOrderIds = [];
let createdSubOrderKeys = []; // Store { orderId, artisanId }

describe('SubOrder API Integration Tests', () => {
    jest.setTimeout(30000); // Increase timeout for integration tests

    let adminUser;
    let artigianoUser;
    let clienteUser;
    let otherArtigianoUser; // For testing permissions
    let adminToken;
    let artigianoToken;
    let clienteToken;
    let otherArtigianoToken;

    let testProduct; // Product owned by artigianoUser
    let testOrder; // Order placed by clienteUser, containing testProduct
    let testSubOrder; // SubOrder for testOrder and artigianoUser

    beforeAll(async () => {
        // Generate unique suffix for test data
        // Note: Suffix is defined here, ensure it's accessible or re-defined in tests if needed for unique usernames.
        const suffix = `_subtest_${Date.now()}`;

        // --- Create Users Directly in DB ---
        const hashedPassword = await bcryptjs.hash('password123', 10);

        // Admin
        const adminRes = await pool.query(
            `INSERT INTO utente (username, nome, cognome, email, password, indirizzo, tipologia, admintimestampcreazione)
             VALUES ($1, 'Admin', 'SubTest', $2, $3, 'Admin Address', 'Admin', NOW()) RETURNING *`,
            [`admin${suffix}`, `admin${suffix}@example.com`, hashedPassword]
        );
        adminUser = adminRes.rows[0];
        createdUserIds.push(adminUser.idutente);

        // Artigiano (needs approval record)
        const artigianoRes = await pool.query(
            `INSERT INTO utente (username, nome, cognome, email, password, indirizzo, tipologia, piva, artigianodescrizione)
             VALUES ($1, 'Artigiano', 'SubTest', $2, $3, 'Artigiano Address', 'Artigiano', '12345678901', 'Makes test items') RETURNING *`,
            [`artigiano${suffix}`, `artigiano${suffix}@example.com`, hashedPassword]
        );
        artigianoUser = artigianoRes.rows[0];
        createdUserIds.push(artigianoUser.idutente);
        // Create and approve approval record for Artigiano
        await pool.query(
            `INSERT INTO StoricoApprovazioni (IDArtigiano, Esito, IDAdmin, DataEsito)
             VALUES ($1, 'Approvato', $2, NOW())`,
            [artigianoUser.idutente, adminUser.idutente]
        );

        // Cliente
        const clienteRes = await pool.query(
            `INSERT INTO utente (username, nome, cognome, email, password, indirizzo, tipologia)
             VALUES ($1, 'Cliente', 'SubTest', $2, $3, 'Cliente Address', 'Cliente') RETURNING *`,
            [`cliente${suffix}`, `cliente${suffix}@example.com`, hashedPassword]
        );
        clienteUser = clienteRes.rows[0];
        createdUserIds.push(clienteUser.idutente);

        // Other Artigiano (needs approval record)
        const otherArtigianoRes = await pool.query(
            `INSERT INTO utente (username, nome, cognome, email, password, indirizzo, tipologia, piva, artigianodescrizione)
             VALUES ($1, 'OtherArtigiano', 'SubTest', $2, $3, 'Other Artigiano Address', 'Artigiano', '09876543210', 'Makes other items') RETURNING *`,
            [`otherart${suffix}`, `otherart${suffix}@example.com`, hashedPassword]
        );
        otherArtigianoUser = otherArtigianoRes.rows[0];
        createdUserIds.push(otherArtigianoUser.idutente);
         // Create and approve approval record for Other Artigiano
        await pool.query(
            `INSERT INTO StoricoApprovazioni (IDArtigiano, Esito, IDAdmin, DataEsito)
             VALUES ($1, 'Approvato', $2, NOW())`,
            [otherArtigianoUser.idutente, adminUser.idutente]
        );

        // --- Get Tokens ---
        const adminLogin = await request(app).post('/api/auth/login').send({ username: adminUser.username, password: 'password123' });
        adminToken = adminLogin.body.token;
        const artigianoLogin = await request(app).post('/api/auth/login').send({ username: artigianoUser.username, password: 'password123' });
        artigianoToken = artigianoLogin.body.token;
        const clienteLogin = await request(app).post('/api/auth/login').send({ username: clienteUser.username, password: 'password123' });
        clienteToken = clienteLogin.body.token;
         const otherArtigianoLogin = await request(app).post('/api/auth/login').send({ username: otherArtigianoUser.username, password: 'password123' });
        otherArtigianoToken = otherArtigianoLogin.body.token;

        // --- Create Test Product ---
        const productRes = await pool.query(
            `INSERT INTO Prodotto (nome, descrizione, categoria, prezzounitario, quantitadisponibile, idartigiano, deleted)
             VALUES ($1, $2, $3, $4, $5, $6, FALSE) RETURNING *`,
            [`Test Product ${suffix}`, 'A product for testing suborders', 'Test Category', 10.50, 5, artigianoUser.idutente]
        );
        testProduct = productRes.rows[0];
        createdProductIds.push(testProduct.idprodotto);

        // --- Create Test Order ---
        const orderRes = await pool.query(
            `INSERT INTO Ordine (idutente, Data, Ora, ImportoTotale, Status, Deleted)
             VALUES ($1, CURRENT_DATE, CURRENT_TIME, $2, $3, FALSE) RETURNING *`,
            [clienteUser.idutente, testProduct.prezzounitario * 2, 'Da spedire'] // Status 'Da spedire' implies payment is done
        );
        testOrder = orderRes.rows[0];
        createdOrderIds.push(testOrder.idordine);

        // --- Create Test DettagliOrdine ---
        await pool.query(
            `INSERT INTO DettagliOrdine (idordine, idprodotto, quantita, prezzostoricounitario)
             VALUES ($1, $2, $3, $4)`,
            [testOrder.idordine, testProduct.idprodotto, 2, testProduct.prezzounitario]
        );

        // --- Create Test SubOrdine ---
        // This is typically created after payment verification, simulating that step here.
        const subOrderRes = await pool.query(
            `INSERT INTO SubOrdine (IDOrdine, IDArtigiano, SubOrdineStatus)
             VALUES ($1, $2, $3) RETURNING *`,
            [testOrder.idordine, artigianoUser.idutente, 'Da spedire']
        );
        testSubOrder = subOrderRes.rows[0];
        createdSubOrderKeys.push({ orderId: testSubOrder.idordine, artisanId: testSubOrder.idartigiano });

        console.log('Test setup complete.');
    });

    afterAll(async () => {
        // Clean up database in reverse order of creation
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            // Delete SubOrders
            if (createdSubOrderKeys.length > 0) {
                 // Need to delete by composite key (IDOrdine, IDArtigiano)
                 // This requires iterating or building a complex query.
                 // A simpler approach for cleanup is often to delete by the parent ID (IDOrdine)
                 // if DettagliOrdine and SubOrdine have ON DELETE CASCADE on IDOrdine.
                 // Assuming CASCADE is NOT set, we delete explicitly:
                 for (const key of createdSubOrderKeys) {
                     await client.query('DELETE FROM SubOrdine WHERE IDOrdine = $1 AND IDArtigiano = $2', [key.orderId, key.artisanId]);
                 }
                 console.log('Cleaned up test suborders.');
            }

            // Delete DettagliOrdine
            if (createdOrderIds.length > 0) {
                await client.query(`DELETE FROM DettagliOrdine WHERE idordine = ANY($1::int[])`, [createdOrderIds]);
                console.log('Cleaned up test order details.');
            }

            // Delete Ordine
            if (createdOrderIds.length > 0) {
                await client.query(`DELETE FROM Ordine WHERE idordine = ANY($1::int[])`, [createdOrderIds]);
                 console.log('Cleaned up test orders.');
            }

            // Delete Prodotto
            if (createdProductIds.length > 0) {
                await client.query(`DELETE FROM Prodotto WHERE idprodotto = ANY($1::int[])`, [createdProductIds]);
                 console.log('Cleaned up test products.');
            }

             // Delete StoricoApprovazioni for test artisans
            if (createdUserIds.length > 0) {
                // Find users who are artisans to delete their approval records
                const artisanUserIds = (await client.query('SELECT idutente FROM Utente WHERE idutente = ANY($1::int[]) AND tipologia = \'Artigiano\'', [createdUserIds])).rows.map(row => row.idutente);
                if (artisanUserIds.length > 0) {
                     await client.query(`DELETE FROM StoricoApprovazioni WHERE IDArtigiano = ANY($1::int[])`, [artisanUserIds]);
                     console.log('Cleaned up test approval records.');
                }
            }

            // Delete Utente
            if (createdUserIds.length > 0) {
                await client.query(`DELETE FROM Utente WHERE idutente = ANY($1::int[])`, [createdUserIds]);
                 console.log('Cleaned up test users.');
            }

            await client.query('COMMIT');
        } catch (err) {
            await client.query('ROLLBACK');
            console.error('Error during DB cleanup:', err);
        } finally {
            client.release();
        }
    // await pool.end(); // REMOVE THIS LINE or comment it out
    // console.log('Database pool closed by unitSubOrderRoutes.test.js - consider global teardown');
    });

    // --- GET /api/suborders/order/:orderId ---
    describe('GET /api/suborders/order/:orderId', () => {
        it('should allow Admin to get suborders for any order', async () => {
            const res = await request(app)
                .get(`/api/suborders/order/${testOrder.idordine}`)
                .set('Authorization', `Bearer ${adminToken}`);

            expect(res.statusCode).toBe(200);
            expect(res.body).toHaveProperty('IdOrdine', testOrder.idordine);
            expect(Array.isArray(res.body.Artigiani)).toBe(true);
            expect(res.body.Artigiani.length).toBeGreaterThan(0);
            const artisanSubOrder = res.body.Artigiani.find(a => a.IDArtigiano === artigianoUser.idutente);
            expect(artisanSubOrder).toBeDefined();
            expect(artisanSubOrder.SubOrdineStatus).toBe('Da spedire');
            expect(Array.isArray(artisanSubOrder.Prodotti)).toBe(true);
            expect(artisanSubOrder.Prodotti.length).toBeGreaterThan(0);
            expect(artisanSubOrder.Prodotti[0].IDProdotto).toBe(testProduct.idprodotto);
        });

        it('should allow Cliente to get suborders for their own order', async () => {
            const res = await request(app)
                .get(`/api/suborders/order/${testOrder.idordine}`)
                .set('Authorization', `Bearer ${clienteToken}`);

            expect(res.statusCode).toBe(200);
            expect(res.body).toHaveProperty('IdOrdine', testOrder.idordine);
            expect(res.body.IdUtenteOrdine).toBe(clienteUser.idutente);
            expect(Array.isArray(res.body.Artigiani)).toBe(true);
            expect(res.body.Artigiani.length).toBeGreaterThan(0);
        });

        it('should prevent Cliente from getting suborders for another user\'s order', async () => {
            const localSuffix = `_other_client_test_${Date.now()}`;
            const hashedPassword = await bcryptjs.hash('password123', 10);
            const otherClienteRes = await pool.query(
                `INSERT INTO utente (username, nome, cognome, email, password, indirizzo, tipologia)
                 VALUES ($1, 'TempCliente', 'OrderTest', $2, $3, 'Temp Address', 'Cliente') RETURNING *`,
                [`tempcliente${localSuffix}`, `tempcliente${localSuffix}@example.com`, hashedPassword]
            );
            const otherClienteUser = otherClienteRes.rows[0];
            createdUserIds.push(otherClienteUser.idutente);

            // Login for this otherClienteUser is not strictly needed for this test's assertion,
            // as the test uses the original clienteToken to attempt access.
            // If it were needed:
            // const otherClienteLoginRes = await request(app).post('/api/auth/login').send({ username: otherClienteUser.username, password: 'password123' });
            // const otherClienteToken = otherClienteLoginRes.body.token;


             // Create a product for otherArtigianoUser
            const otherProductRes = await pool.query(
                `INSERT INTO Prodotto (nome, descrizione, categoria, prezzounitario, quantitadisponibile, idartigiano, deleted)
                 VALUES ($1, $2, $3, $4, $5, $6, FALSE) RETURNING *`,
                [`Other Test Product`, 'Another product', 'Other Category', 5.00, 3, otherArtigianoUser.idutente]
            );
            const otherTestProduct = otherProductRes.rows[0];
            createdProductIds.push(otherTestProduct.idprodotto);

            // Create an order for otherClienteUser with otherTestProduct
            const otherOrderRes = await pool.query(
                `INSERT INTO Ordine (idutente, Data, Ora, ImportoTotale, Status, Deleted)
                 VALUES ($1, CURRENT_DATE, CURRENT_TIME, $2, $3, FALSE) RETURNING *`,
                [otherClienteUser.idutente, otherTestProduct.prezzounitario, 'Da spedire']
            );
            const otherTestOrder = otherOrderRes.rows[0];
            createdOrderIds.push(otherTestOrder.idordine);

             // Create DettagliOrdine for the other order
            await pool.query(
                `INSERT INTO DettagliOrdine (idordine, idprodotto, quantita, prezzostoricounitario)
                 VALUES ($1, $2, $3, $4)`,
                [otherTestOrder.idordine, otherTestProduct.idprodotto, 1, otherTestProduct.prezzounitario]
            );

             // Create SubOrdine for the other order and otherArtigianoUser
            const otherSubOrderRes = await pool.query(
                `INSERT INTO SubOrdine (IDOrdine, IDArtigiano, SubOrdineStatus)
                 VALUES ($1, $2, $3) RETURNING *`,
                [otherTestOrder.idordine, otherArtigianoUser.idutente, 'Da spedire']
            );
            createdSubOrderKeys.push({ orderId: otherSubOrderRes.rows[0].idordine, artisanId: otherSubOrderRes.rows[0].idartigiano });

            // Now, the original clienteUser tries to access otherTestOrder's suborders
            const res = await request(app)
                .get(`/api/suborders/order/${otherTestOrder.idordine}`)
                .set('Authorization', `Bearer ${clienteToken}`); // Using the original clienteToken

            expect(res.statusCode).toBe(403);
            expect(res.body).toHaveProperty('message', 'Access denied. You do not have permission to view suborders for this order.');
        });

        it('should prevent Artigiano from getting suborders for any order (requires Admin or Cliente role)', async () => {
             const res = await request(app)
                .get(`/api/suborders/order/${testOrder.idordine}`)
                .set('Authorization', `Bearer ${artigianoToken}`);

            expect(res.statusCode).toBe(403); // Assuming isAuthenticated allows Artigiano but the route logic denies
            expect(res.body).toHaveProperty('message', 'Access denied. You do not have permission to view suborders for this order.');
        });

        it('should return 404 if order ID does not exist', async () => {
            const nonExistentOrderId = 999999;
            const res = await request(app)
                .get(`/api/suborders/order/${nonExistentOrderId}`)
                .set('Authorization', `Bearer ${adminToken}`); // Use Admin token as they have permission to check existence

            expect(res.statusCode).toBe(404);
            expect(res.body).toHaveProperty('message', 'Order not found.');
        });
    });

    // --- GET /api/suborders/artisan/:artisanId ---
    describe('GET /api/suborders/artisan/:artisanId', () => {
        it('should allow Admin to get suborders for any artisan', async () => {
            const res = await request(app)
                .get(`/api/suborders/artisan/${artigianoUser.idutente}`)
                .set('Authorization', `Bearer ${adminToken}`);

            expect(res.statusCode).toBe(200);
            expect(Array.isArray(res.body)).toBe(true);
            expect(res.body.length).toBeGreaterThan(0);
            const subOrder = res.body.find(so => so.IDOrdine === testOrder.idordine && so.IDArtigiano === artigianoUser.idutente);
            expect(subOrder).toBeDefined();
            expect(subOrder.SubOrdineStatus).toBe('Da spedire');
            expect(Array.isArray(subOrder.Prodotti)).toBe(true);
            expect(subOrder.Prodotti.length).toBeGreaterThan(0);
            expect(subOrder.Prodotti[0].IDProdotto).toBe(testProduct.idprodotto);
        });

        it('should allow Artigiano to get their own suborders', async () => {
             const res = await request(app)
                .get(`/api/suborders/artisan/${artigianoUser.idutente}`)
                .set('Authorization', `Bearer ${artigianoToken}`);

            expect(res.statusCode).toBe(200);
            expect(Array.isArray(res.body)).toBe(true);
            expect(res.body.length).toBeGreaterThan(0);
            const subOrder = res.body.find(so => so.IDOrdine === testOrder.idordine && so.IDArtigiano === artigianoUser.idutente);
            expect(subOrder).toBeDefined();
        });

        it('should prevent Artigiano from getting another artisan\'s suborders', async () => {
             const res = await request(app)
                .get(`/api/suborders/artisan/${otherArtigianoUser.idutente}`) // Trying to get other artisan's suborders
                .set('Authorization', `Bearer ${artigianoToken}`); // Using the main artigiano's token

            expect(res.statusCode).toBe(403);
            expect(res.body).toHaveProperty('message', 'Access denied. You do not have permission to view these suborders.');
        });

        it('should prevent Cliente from getting any artisan\'s suborders', async () => {
             const res = await request(app)
                .get(`/api/suborders/artisan/${artigianoUser.idutente}`)
                .set('Authorization', `Bearer ${clienteToken}`);

            expect(res.statusCode).toBe(403);
            expect(res.body).toHaveProperty('message', 'Access denied. You do not have permission to view these suborders.');
        });

        it('should return 404 if artisan ID does not exist or has no suborders', async () => {
             // Create a user that is an artisan but has no suborders
            const localSuffix = `_nosubart_test_${Date.now()}`;
            const hashedPassword = await bcryptjs.hash('password123', 10);
            const noSubOrderArtisanRes = await pool.query(
                `INSERT INTO utente (username, nome, cognome, email, password, indirizzo, tipologia, piva, artigianodescrizione)
                 VALUES ($1, 'NoSub', 'Artisan', $2, $3, 'NoSub Address', 'Artigiano', '11223344556', 'No suborders here') RETURNING *`,
                [`artnosub${localSuffix}`, `artnosub${localSuffix}@example.com`, hashedPassword]
            );
            const noSubOrderArtisanUser = noSubOrderArtisanRes.rows[0];
            createdUserIds.push(noSubOrderArtisanUser.idutente);

             // Approve this artisan
            await pool.query(
                `INSERT INTO StoricoApprovazioni (IDArtigiano, Esito, IDAdmin, DataEsito)
                 VALUES ($1, 'Approvato', $2, NOW())`,
                [noSubOrderArtisanUser.idutente, adminUser.idutente]
            );

            const res = await request(app)
                .get(`/api/suborders/artisan/${noSubOrderArtisanUser.idutente}`)
                .set('Authorization', `Bearer ${adminToken}`); // Admin can check existence

            expect(res.statusCode).toBe(404);
            expect(res.body).toHaveProperty('message', 'No suborders found for this artisan ID.');
        });

         it('should return 400 for invalid artisan ID format', async () => {
             const res = await request(app)
                .get(`/api/suborders/artisan/abc`)
                .set('Authorization', `Bearer ${adminToken}`);

            expect(res.statusCode).toBe(400);
            expect(res.body).toHaveProperty('message', 'Invalid Artisan ID format.');
        });
    });

    // --- PUT /api/suborders/order/:orderId/artisan/:artisanId/status ---
    describe('PUT /api/suborders/order/:orderId/artisan/:artisanId/status', () => {
        it('should allow Admin to update suborder status', async () => {
            const newStatus = 'Spedito';
            const res = await request(app)
                .put(`/api/suborders/order/${testOrder.idordine}/artisan/${artigianoUser.idutente}/status`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ newStatus });

            expect(res.statusCode).toBe(200);
            expect(res.body).toHaveProperty('message', 'Suborder status updated successfully.');
            expect(res.body.subOrder.subordinestatus).toBe(newStatus);

            // Verify status in DB
            const dbCheck = await pool.query('SELECT SubOrdineStatus FROM SubOrdine WHERE IDOrdine = $1 AND IDArtigiano = $2', [testOrder.idordine, artigianoUser.idutente]);
            expect(dbCheck.rows[0].subordinestatus).toBe(newStatus); // pg returns lowercase

            // Verify main order status is still Spedito (since only one suborder exists and it's not 'Consegnato')
            const mainOrderCheck = await pool.query('SELECT Status FROM Ordine WHERE IDOrdine = $1', [testOrder.idordine]);
            expect(mainOrderCheck.rows[0].status).toBe('Spedito'); // pg returns lowercase
        });

        it('should allow Artigiano to update their own suborder status', async () => {
            // Reset status first if needed, or use a fresh suborder/order
            // For simplicity, let's update to 'Consegnato' from 'Spedito' (set in previous test)
            const newStatus = 'Consegnato';
            const res = await request(app)
                .put(`/api/suborders/order/${testOrder.idordine}/artisan/${artigianoUser.idutente}/status`)
                .set('Authorization', `Bearer ${artigianoToken}`)
                .send({ newStatus });

            expect(res.statusCode).toBe(200);
            expect(res.body.subOrder.subordinestatus).toBe(newStatus);

            // Verify status in DB
            const dbCheck = await pool.query('SELECT SubOrdineStatus FROM SubOrdine WHERE IDOrdine = $1 AND IDArtigiano = $2', [testOrder.idordine, artigianoUser.idutente]);
            expect(dbCheck.rows[0].subordinestatus).toBe(newStatus); // pg returns lowercase

            // Verify main order status is now 'Consegnato' (since this is the only suborder)
            const mainOrderCheck = await pool.query('SELECT Status FROM Ordine WHERE IDOrdine = $1', [testOrder.idordine]);
            expect(mainOrderCheck.rows[0].status).toBe('Consegnato'); // pg returns lowercase
        });

        it('should prevent Artigiano from updating another artisan\'s suborder status', async () => {
            // Need a suborder owned by otherArtigianoUser
            // Create a product for otherArtigianoUser
            const otherProductRes = await pool.query(
                `INSERT INTO Prodotto (nome, descrizione, categoria, prezzounitario, quantitadisponibile, idartigiano, deleted)
                 VALUES ($1, $2, $3, $4, $5, $6, FALSE) RETURNING *`,
                [`Other Art Product for PUT`, 'Another product for PUT', 'Other Category', 7.00, 2, otherArtigianoUser.idutente]
            );
            const otherTestProduct = otherProductRes.rows[0];
            createdProductIds.push(otherTestProduct.idprodotto);

            // Create an order for clienteUser with otherTestProduct
            const otherOrderRes = await pool.query(
                `INSERT INTO Ordine (idutente, Data, Ora, ImportoTotale, Status, Deleted)
                 VALUES ($1, CURRENT_DATE, CURRENT_TIME, $2, $3, FALSE) RETURNING *`,
                [clienteUser.idutente, otherTestProduct.prezzounitario, 'Da spedire']
            );
            const otherTestOrder = otherOrderRes.rows[0];
            createdOrderIds.push(otherTestOrder.idordine);

             // Create DettagliOrdine for the other order
            await pool.query(
                `INSERT INTO DettagliOrdine (idordine, idprodotto, quantita, prezzostoricounitario)
                 VALUES ($1, $2, $3, $4)`,
                [otherTestOrder.idordine, otherTestProduct.idprodotto, 1, otherTestProduct.prezzounitario]
            );

             // Create SubOrdine for the other order and otherArtigianoUser
            const otherSubOrderRes = await pool.query(
                `INSERT INTO SubOrdine (IDOrdine, IDArtigiano, SubOrdineStatus)
                 VALUES ($1, $2, $3) RETURNING *`,
                [otherTestOrder.idordine, otherArtigianoUser.idutente, 'Da spedire']
            );
            const otherTestSubOrder = otherSubOrderRes.rows[0];
            createdSubOrderKeys.push({ orderId: otherTestSubOrder.idordine, artisanId: otherTestSubOrder.idartigiano });

            // Main artigianoUser tries to update otherTestSubOrder
            const newStatus = 'Spedito';
            const res = await request(app)
                .put(`/api/suborders/order/${otherTestSubOrder.idordine}/artisan/${otherTestSubOrder.idartigiano}/status`)
                .set('Authorization', `Bearer ${artigianoToken}`) // Using the main artigiano's token
                .send({ newStatus });

            expect(res.statusCode).toBe(403);
            expect(res.body).toHaveProperty('message', 'Access denied. You do not have permission to update this suborder status.');

            // Verify status in DB is unchanged
            const dbCheck = await pool.query('SELECT SubOrdineStatus FROM SubOrdine WHERE IDOrdine = $1 AND IDArtigiano = $2', [otherTestSubOrder.idordine, otherTestSubOrder.idartigiano]);
            expect(dbCheck.rows[0].subordinestatus).toBe('Da spedire'); // Should still be original status
        });

        it('should prevent Cliente from updating suborder status', async () => {
             const newStatus = 'Spedito';
             const res = await request(app)
                .put(`/api/suborders/order/${testOrder.idordine}/artisan/${artigianoUser.idutente}/status`)
                .set('Authorization', `Bearer ${clienteToken}`)
                .send({ newStatus });

            expect(res.statusCode).toBe(403);
            expect(res.body).toHaveProperty('message', 'Access denied. You do not have permission to update this suborder status.');
        });

        it('should return 404 if suborder does not exist', async () => {
             const newStatus = 'Spedito';
             const nonExistentOrderId = 999998;
             const nonExistentArtisanId = 999997;
             const res = await request(app)
                .put(`/api/suborders/order/${nonExistentOrderId}/artisan/${nonExistentArtisanId}/status`)
                .set('Authorization', `Bearer ${adminToken}`) // Admin can check existence
                .send({ newStatus });

            expect(res.statusCode).toBe(404);
            expect(res.body).toHaveProperty('message', 'Suborder not found for the specified Order ID and Artisan ID.');
        });

        it('should return 400 for invalid status value', async () => {
             const invalidStatus = 'InvalidStatus';
             const res = await request(app)
                .put(`/api/suborders/order/${testOrder.idordine}/artisan/${artigianoUser.idutente}/status`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ newStatus: invalidStatus });

            expect(res.statusCode).toBe(400);
            expect(res.body).toHaveProperty('message', expect.stringContaining('Invalid status provided.'));
        });

         it('should return 400 for invalid ID format in params', async () => {
             const newStatus = 'Spedito';
             const res = await request(app)
                .put(`/api/suborders/order/abc/artisan/${artigianoUser.idutente}/status`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ newStatus });

            expect(res.statusCode).toBe(400);
            expect(res.body).toHaveProperty('message', 'Invalid Order ID or Artisan ID format.');

             const res2 = await request(app)
                .put(`/api/suborders/order/${testOrder.idordine}/artisan/xyz/status`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ newStatus });

            expect(res2.statusCode).toBe(400);
            expect(res2.body).toHaveProperty('message', 'Invalid Order ID or Artisan ID format.');
        });
    });
});