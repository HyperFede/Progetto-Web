const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });

const request = require('supertest');
import express from 'express';

// Mock authentication middleware
// This variable will hold the user object that isAuthenticated will inject into req.user
var mockCurrentMockUser = {
    idutente: 1,
    username: 'mockuser',
    tipologia: 'Cliente', // Default type for tests
};

jest.mock('../../../src/middleware/authMiddleWare', () => ({
    isAuthenticated: jest.fn((req, res, next) => {
        // Simulate successful authentication by setting req.user
        req.user = mockCurrentMockUser;
        next();
    }),
    hasPermission: jest.fn(permissions => (req, res, next) => {
        // Simulate permission check.
        // This mock is simplified for unit testing. In real tests, you might check specific permissions.
        if (!req.user || !permissions.includes(req.user.tipologia)) {
            // Special handling for PUT /status route where Artigiano can update their own
            // The route handler itself performs the ID check, so hasPermission just needs to allow 'Artigiano'
            // if the user is an Artigiano.
            if (req.user.tipologia === 'Artigiano' && permissions.includes('Artigiano')) {
                next();
                return;
            }
            return res.status(403).json({ message: 'Access denied. You do not have permission to view/update this resource.' });
        }
        next();
    }),
    getUserFromToken: jest.fn(), // Mock this as well if it's called internally by isAuthenticated or other parts
}));

// Mock database connection
jest.mock('../../../src/config/db-connect', () => ({
    query: jest.fn(),
    connect: jest.fn(),
}));
const pool = require('../../../src/config/db-connect');

// Now require the module under test after all its dependencies are mocked
const subOrderRoutes = require('../../../src/routes/subOrderRoutes');

const app = express();
app.use(express.json());
app.use('/api/suborders', subOrderRoutes);

describe('SubOrder API Unit Tests', () => {
    let mockClient; // To hold the mock client returned by pool.connect()

    // Mock data for consistent testing
    const mockAdminUser = { idutente: 100, tipologia: 'Admin' };
    const mockArtigianoUser = { idutente: 200, tipologia: 'Artigiano' };
    const mockClienteUser = { idutente: 300, tipologia: 'Cliente' };
    const mockOtherArtigianoUser = { idutente: 400, tipologia: 'Artigiano' };
    const mockOtherClienteUser = { idutente: 500, tipologia: 'Cliente' };

    const mockOrderId = 1;
    const mockArtisanId = mockArtigianoUser.idutente;
    const mockProductId = 10;

    beforeEach(() => {
        jest.clearAllMocks();

        // Reset mockAuthenticatedUser for each test to a default Cliente
        mockCurrentMockUser = { ...mockClienteUser };

        // Setup mock client for transaction-based routes
        mockClient = {
            query: jest.fn(),
            release: jest.fn(),
        };
        pool.connect.mockResolvedValue(mockClient);

        // Default mock for pool.query (used for initial order/suborder checks outside of transactions)
        // This is less common in subOrderRoutes but good to have a default.
        pool.query.mockResolvedValue({ rows: [] });
    });

    // Helper to set the authenticated user for a test
    const setAuthenticatedUser = (user) => {
        mockCurrentMockUser = { ...user };
    };

    // --- GET /api/suborders/order/:orderId ---
    describe('GET /api/suborders/order/:orderId', () => {
        it('should allow Admin to get suborders for any order', async () => {
            setAuthenticatedUser(mockAdminUser);

            // Mock main order details query
            mockClient.query.mockResolvedValueOnce({
                rows: [{
                    idordine: mockOrderId,
                    ordinestatus: 'Da spedire',
                    dataordine: '2023-01-01',
                    oraordine: '12:00:00',
                    importototaleordine: '100.00',
                    idutenteordine: mockClienteUser.idutente, // Order owned by Cliente
                }]
            });

            // Mock suborder items query
            mockClient.query.mockResolvedValueOnce({
                rows: [{
                    idartigiano: mockArtigianoUser.idutente,
                    nomeartigiano: 'Test Artisan',
                    emailartigiano: 'artisan@example.com',
                    subordinestatus: 'Da spedire',
                    idprodotto: mockProductId,
                    nomeprodotto: 'Test Product',
                    descrizioneprodotto: 'Desc',
                    prezzostoricounitario: '50.00',
                    quantita: 2,
                    subtotaleprodotto: '100.00',
                }]
            });

            const res = await request(app)
                .get(`/api/suborders/order/${mockOrderId}`);

            expect(res.statusCode).toBe(200);
            expect(res.body).toHaveProperty('IdOrdine', mockOrderId);
            expect(res.body.Artigiani).toHaveLength(1);
            expect(res.body.Artigiani[0].IDArtigiano).toBe(mockArtigianoUser.idutente);
        });

        it('should allow Cliente to get suborders for their own order', async () => {
            setAuthenticatedUser(mockClienteUser);

            // Mock main order details query
            mockClient.query.mockResolvedValueOnce({
                rows: [{
                    idordine: mockOrderId,
                    ordinestatus: 'Da spedire',
                    dataordine: '2023-01-01',
                    oraordine: '12:00:00',
                    importototaleordine: '100.00',
                    idutenteordine: mockClienteUser.idutente, // Order owned by current Cliente
                }]
            });

            // Mock suborder items query
            mockClient.query.mockResolvedValueOnce({
                rows: [{
                    idartigiano: mockArtigianoUser.idutente,
                    nomeartigiano: 'Test Artisan',
                    emailartigiano: 'artisan@example.com',
                    subordinestatus: 'Da spedire',
                    idprodotto: mockProductId,
                    nomeprodotto: 'Test Product',
                    descrizioneprodotto: 'Desc',
                    prezzostoricounitario: '50.00',
                    quantita: 2,
                    subtotaleprodotto: '100.00',
                }]
            });

            const res = await request(app)
                .get(`/api/suborders/order/${mockOrderId}`);

            expect(res.statusCode).toBe(200);
            expect(res.body).toHaveProperty('IdOrdine', mockOrderId);
            expect(res.body.IdUtenteOrdine).toBe(mockClienteUser.idutente);
        });

        it('should prevent Cliente from getting suborders for another user\'s order', async () => {
            setAuthenticatedUser(mockClienteUser); // Authenticated as mockClienteUser

            // Mock main order details query for an order owned by mockOtherClienteUser
            mockClient.query.mockResolvedValueOnce({
                rows: [{
                    idordine: mockOrderId,
                    ordinestatus: 'Da spedire',
                    dataordine: '2023-01-01',
                    oraordine: '12:00:00',
                    importototaleordine: '100.00',
                    idutenteordine: mockOtherClienteUser.idutente, // Order owned by someone else
                }]
            });

            const res = await request(app)
                .get(`/api/suborders/order/${mockOrderId}`);

            expect(res.statusCode).toBe(403);
            expect(res.body).toHaveProperty('message', 'Access denied. You do not have permission to view suborders for this order.');
        });

        it('should prevent Artigiano from getting suborders for any order', async () => {
            setAuthenticatedUser(mockArtigianoUser);

            // Mock main order details query (content doesn't matter as permission check will fail first)
            mockClient.query.mockResolvedValueOnce({
                rows: [{
                    idordine: mockOrderId,
                    ordinestatus: 'Da spedire',
                    dataordine: '2023-01-01',
                    oraordine: '12:00:00',
                    importototaleordine: '100.00',
                    idutenteordine: mockClienteUser.idutente,
                }]
            });

            const res = await request(app)
                .get(`/api/suborders/order/${mockOrderId}`);

            expect(res.statusCode).toBe(403);
            expect(res.body).toHaveProperty('message', 'Access denied. You do not have permission to view suborders for this order.');
        });

        it('should return 404 if order ID does not exist', async () => {
            setAuthenticatedUser(mockAdminUser); // Admin has permission to check non-existent orders

            mockClient.query.mockResolvedValueOnce({ rows: [] }); // Order not found

            const res = await request(app)
                .get(`/api/suborders/order/${mockOrderId}`);

            expect(res.statusCode).toBe(404);
            expect(res.body).toHaveProperty('message', 'Order not found.');
        });

        it('should return 500 on database error', async () => {
            setAuthenticatedUser(mockAdminUser);

            mockClient.query.mockRejectedValueOnce(new Error('Simulated DB error'));

            const res = await request(app)
                .get(`/api/suborders/order/${mockOrderId}`);

            expect(res.statusCode).toBe(500);
            expect(res.body).toHaveProperty('message', 'Error fetching suborder details.');
        });
    });

    // --- GET /api/suborders/artisan/:artisanId ---
    describe('GET /api/suborders/artisan/:artisanId', () => {
        it('should allow Admin to get suborders for any artisan', async () => {
            setAuthenticatedUser(mockAdminUser);

            mockClient.query.mockResolvedValueOnce({
                rows: [{
                    idordine: mockOrderId,
                    idartigiano: mockArtisanId,
                    subordinestatus: 'Da spedire',
                    nomeartigiano: 'Test Artisan',
                    dataordine: '2023-01-01',
                    usernamecliente: 'Test Cliente',
                    prezzototalesubordine: '100.00',
                    idprodotto: mockProductId,
                    nomeprodotto: 'Test Product',
                    descrizioneprodotto: 'Desc',
                    prezzostoricounitario: '50.00',
                    quantita: 2,
                    subtotaleprodotto: '100.00',
                }]
            });

            const res = await request(app)
                .get(`/api/suborders/artisan/${mockArtisanId}`);

            expect(res.statusCode).toBe(200);
            expect(Array.isArray(res.body)).toBe(true);
            expect(res.body).toHaveLength(1);
            expect(res.body[0].IDArtigiano).toBe(mockArtisanId);
        });

        it('should allow Artigiano to get their own suborders', async () => {
            setAuthenticatedUser(mockArtigianoUser);

            mockClient.query.mockResolvedValueOnce({
                rows: [{
                    idordine: mockOrderId,
                    idartigiano: mockArtisanId,
                    subordinestatus: 'Da spedire',
                    nomeartigiano: 'Test Artisan',
                    dataordine: '2023-01-01',
                    usernamecliente: 'Test Cliente',
                    prezzototalesubordine: '100.00',
                    idprodotto: mockProductId,
                    nomeprodotto: 'Test Product',
                    descrizioneprodotto: 'Desc',
                    prezzostoricounitario: '50.00',
                    quantita: 2,
                    subtotaleprodotto: '100.00',
                }]
            });

            const res = await request(app)
                .get(`/api/suborders/artisan/${mockArtisanId}`);

            expect(res.statusCode).toBe(200);
            expect(Array.isArray(res.body)).toBe(true);
            expect(res.body).toHaveLength(1);
            expect(res.body[0].IDArtigiano).toBe(mockArtisanId);
        });

        it('should prevent Artigiano from getting another artisan\'s suborders', async () => {
            setAuthenticatedUser(mockArtigianoUser); // Authenticated as mockArtigianoUser

            const res = await request(app)
                .get(`/api/suborders/artisan/${mockOtherArtigianoUser.idutente}`); // Requesting other artisan's suborders

            expect(res.statusCode).toBe(403);
            expect(res.body).toHaveProperty('message', 'Access denied. You do not have permission to view these suborders.');
        });

        it('should prevent Cliente from getting any artisan\'s suborders', async () => {
            setAuthenticatedUser(mockClienteUser);

            const res = await request(app)
                .get(`/api/suborders/artisan/${mockArtisanId}`);

            expect(res.statusCode).toBe(403);
            expect(res.body).toHaveProperty('message', 'Access denied. You do not have permission to view these suborders.');
        });

        it('should return 404 if no suborders found for this artisan ID', async () => {
            setAuthenticatedUser(mockAdminUser); // Admin has permission to check

            mockClient.query.mockResolvedValueOnce({ rows: [] }); // No suborders found

            const res = await request(app)
                .get(`/api/suborders/artisan/${mockArtisanId}`);

            expect(res.statusCode).toBe(404);
            expect(res.body).toHaveProperty('message', 'No suborders found for this artisan ID.');
        });

        it('should return 400 for invalid artisan ID format', async () => {
            setAuthenticatedUser(mockAdminUser);

            const res = await request(app)
                .get('/api/suborders/artisan/abc');

            expect(res.statusCode).toBe(400);
            expect(res.body).toHaveProperty('message', 'Invalid Artisan ID format.');
        });

        it('should return 500 on database error', async () => {
            setAuthenticatedUser(mockAdminUser);

            mockClient.query.mockRejectedValueOnce(new Error('Simulated DB error'));

            const res = await request(app)
                .get(`/api/suborders/artisan/${mockArtisanId}`);

            expect(res.statusCode).toBe(500);
            expect(res.body).toHaveProperty('message', 'Error fetching artisan suborder details.');
        });
    });

    // --- PUT /api/suborders/order/:orderId/artisan/:artisanId/status ---
    describe('PUT /api/suborders/order/:orderId/artisan/:artisanId/status', () => {
        const mockSubOrder = {
            idordine: mockOrderId,
            idartigiano: mockArtisanId,
            subordinestatus: 'Da spedire',
        };

        it('should allow Admin to update suborder status', async () => {
            setAuthenticatedUser(mockAdminUser);
            const newStatus = 'Spedito';

            // Mock suborder check query
            mockClient.query.mockResolvedValueOnce({ rows: [{ idartigiano: mockArtisanId }] }); // Suborder exists

            // Mock transaction queries
            mockClient.query.mockResolvedValueOnce({}); // BEGIN
            mockClient.query.mockResolvedValueOnce({ rows: [{ ...mockSubOrder, subordinestatus: newStatus }] }); // UPDATE SubOrdine
            mockClient.query.mockResolvedValueOnce({ rows: [{ subordinestatus: newStatus }] }); // SELECT SubOrdineStatus (for updateMainOrderStatusBasedOnSubOrders)
            mockClient.query.mockResolvedValueOnce({ rows: [{ status: 'Da spedire' }] }); // SELECT Status (for updateMainOrderStatusBasedOnSubOrders)
            mockClient.query.mockResolvedValueOnce({}); // UPDATE Ordine (for updateMainOrderStatusBasedOnSubOrders)
            mockClient.query.mockResolvedValueOnce({}); // COMMIT

            const res = await request(app)
                .put(`/api/suborders/order/${mockOrderId}/artisan/${mockArtisanId}/status`)
                .send({ newStatus });

            expect(res.statusCode).toBe(200);
            expect(res.body).toHaveProperty('message', 'Suborder status updated successfully.');
            expect(res.body.subOrder.subordinestatus).toBe(newStatus);
        });

        it('should allow Artigiano to update their own suborder status', async () => {
            setAuthenticatedUser(mockArtigianoUser);
            const newStatus = 'Consegnato';

            // Mock suborder check query
            mockClient.query.mockResolvedValueOnce({ rows: [{ idartigiano: mockArtisanId }] }); // Suborder exists and belongs to current artisan

            // Mock transaction queries
            mockClient.query.mockResolvedValueOnce({}); // BEGIN
            mockClient.query.mockResolvedValueOnce({ rows: [{ ...mockSubOrder, subordinestatus: newStatus }] }); // UPDATE SubOrdine
            mockClient.query.mockResolvedValueOnce({ rows: [{ subordinestatus: newStatus }] }); // SELECT SubOrdineStatus (for updateMainOrderStatusBasedOnSubOrders)
            mockClient.query.mockResolvedValueOnce({ rows: [{ status: 'Spedito' }] }); // SELECT Status (for updateMainOrderStatusBasedOnSubOrders)
            mockClient.query.mockResolvedValueOnce({}); // UPDATE Ordine (for updateMainOrderStatusBasedOnSubOrders)
            mockClient.query.mockResolvedValueOnce({}); // COMMIT

            const res = await request(app)
                .put(`/api/suborders/order/${mockOrderId}/artisan/${mockArtisanId}/status`)
                .send({ newStatus });

            expect(res.statusCode).toBe(200);
            expect(res.body.subOrder.subordinestatus).toBe(newStatus);
        });

        it('should prevent Artigiano from updating another artisan\'s suborder status', async () => {
            setAuthenticatedUser(mockArtigianoUser); // Authenticated as mockArtigianoUser
            const newStatus = 'Spedito';

            // Mock suborder check query for a suborder owned by mockOtherArtigianoUser
            mockClient.query.mockResolvedValueOnce({ rows: [{ idartigiano: mockOtherArtigianoUser.idutente }] });

            const res = await request(app)
                .put(`/api/suborders/order/${mockOrderId}/artisan/${mockOtherArtigianoUser.idutente}/status`)
                .send({ newStatus });

            expect(res.statusCode).toBe(403);
            expect(res.body).toHaveProperty('message', 'Access denied. You do not have permission to update this suborder status.');
        });

        it('should prevent Cliente from updating suborder status', async () => {
            setAuthenticatedUser(mockClienteUser);
            const newStatus = 'Spedito';

            // Mock suborder check query (content doesn't matter as permission check will fail first)
            mockClient.query.mockResolvedValueOnce({ rows: [{ idartigiano: mockArtisanId }] });

            const res = await request(app)
                .put(`/api/suborders/order/${mockOrderId}/artisan/${mockArtisanId}/status`)
                .send({ newStatus });

            expect(res.statusCode).toBe(403);
            expect(res.body).toHaveProperty('message', 'Access denied. You do not have permission to update this suborder status.');
        });

        it('should return 400 for invalid status value', async () => {
            setAuthenticatedUser(mockAdminUser);
            const invalidStatus = 'InvalidStatus';

            const res = await request(app)
                .put(`/api/suborders/order/${mockOrderId}/artisan/${mockArtisanId}/status`)
                .send({ newStatus: invalidStatus });

            expect(res.statusCode).toBe(400);
            expect(res.body).toHaveProperty('message', expect.stringContaining('Invalid status provided.'));
        });

        it('should return 404 if suborder does not exist', async () => {
            setAuthenticatedUser(mockAdminUser);
            const newStatus = 'Spedito';

            mockClient.query.mockResolvedValueOnce({ rows: [] }); // Suborder not found

            const res = await request(app)
                .put(`/api/suborders/order/${mockOrderId}/artisan/${mockArtisanId}/status`)
                .send({ newStatus });

            expect(res.statusCode).toBe(404);
            expect(res.body).toHaveProperty('message', 'Suborder not found for the specified Order ID and Artisan ID.');
        });

        it('should return 400 for invalid ID format in params', async () => {
            setAuthenticatedUser(mockAdminUser);
            const newStatus = 'Spedito';

            const res = await request(app)
                .put('/api/suborders/order/abc/artisan/xyz/status')
                .send({ newStatus });

            expect(res.statusCode).toBe(400);
            expect(res.body).toHaveProperty('message', 'Invalid Order ID or Artisan ID format.');
        });

        it('should return 500 on database transaction error', async () => {
            setAuthenticatedUser(mockAdminUser);
            const newStatus = 'Spedito';

            // Mock suborder check query
            mockClient.query.mockResolvedValueOnce({ rows: [{ idartigiano: mockArtisanId }] });

            // Mock transaction queries - simulate error after BEGIN
            mockClient.query.mockResolvedValueOnce({}); // BEGIN
            mockClient.query.mockRejectedValueOnce(new Error('Simulated DB transaction error')); // Error on UPDATE SubOrdine

            const res = await request(app)
                .put(`/api/suborders/order/${mockOrderId}/artisan/${mockArtisanId}/status`)
                .send({ newStatus });

            expect(res.statusCode).toBe(500);
            expect(res.body).toHaveProperty('message', 'Error updating suborder status.');
            expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK'); // Ensure rollback is called
        });
    });
});
