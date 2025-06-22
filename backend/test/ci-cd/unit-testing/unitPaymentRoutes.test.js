const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });
const request = require('supertest');

// Ensure Stripe environment variables are defined for tests to prevent process.exit(1) in paymentRoutes.js
process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || 'sk_test_mock_key_for_tests';
process.env.STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || 'whsec_mock_key_for_tests';
const express = require('express');

// Mock database connection
jest.mock('../../../src/config/db-connect', () => ({
    query: jest.fn(),
    connect: jest.fn(),
}));
const pool = require('../../../src/config/db-connect');

// Mock Stripe (must be defined before paymentRoutes is required)
const mockStripeInstance = { // Renamed for clarity to distinguish from the mock function itself
    checkout: {
        sessions: {
            retrieve: jest.fn(),
        },
    },
    paymentIntents: {
        retrieve: jest.fn(),
    }
};
jest.mock('stripe', () => jest.fn(() => mockStripeInstance)); // This mock function will be called when `Stripe(...)` is invoked

// Now require the module under test after all its dependencies are mocked
const paymentRoutes = require('../../../src/routes/paymentRoutes');
// Mock auth middleware
jest.mock('../../../src/middleware/authMiddleWare', () => ({
    isAuthenticated: (req, res, next) => {
        req.user = { idutente: 1, tipologia: 'Cliente' }; // Simulate an authenticated client
        next();
    },
    hasPermission: () => (req, res, next) => {
        next(); // Skip permission checks for simplicity in this example
    },
}));

const app = express();
app.use(express.json());
app.use('/api/payments', paymentRoutes);

describe('Payment Routes - Unit Tests', () => {
    let mockClient;

    beforeEach(() => {
        jest.clearAllMocks();
        // Mock the transaction client for each test
        mockClient = {
            query: jest.fn(),
            release: jest.fn(),
        };
        pool.connect.mockResolvedValue(mockClient);
    });

    describe('POST /api/payments/verify-session', () => {
        it('should successfully verify a paid session and update the database', async () => {
            const mockSessionId = 'cs_test_123';
            const mockOrderId = 101; // This will be the order ID in Stripe session
            const mockUserId = 1; // This must match req.user.idutente from isAuthenticated mock

            // Mock Stripe responses
            mockStripeInstance.checkout.sessions.retrieve.mockResolvedValue({
                // Add missing properties that paymentRoutes.js expects from stripeSession
                amount_total: 5000, // Example: 50.00 EUR in cents
                currency: 'eur',
                id: mockSessionId,
                client_reference_id: mockOrderId.toString(),
                payment_status: 'paid',
            });

            // Mock DB responses
            mockClient.query
                .mockResolvedValueOnce({}) // BEGIN transaction
                .mockResolvedValueOnce({ rowCount: 1 }) // UPDATE Ordine
                .mockResolvedValueOnce({}) // INSERT Pagamento
                .mockResolvedValueOnce({}) // INSERT SubOrdine
                .mockResolvedValueOnce({ rowCount: 1 }) // DELETE dettaglicarrello
                .mockResolvedValueOnce({}); // COMMIT transaction

            // Mock order lookup
            // The `idutente` must match the one in the mocked `isAuthenticated` middleware.
            pool.query.mockResolvedValue({rows: [{
                idutente: mockUserId, // This must match the mocked user's ID
                stripecheckoutsessionid: 'cs_test_old_session_id', // Can be null or any string
                status: 'In attesa' // Must be a status that allows the update to proceed
            }]});

            // Make the request
            const res = await request(app)
                .post('/api/payments/verify-session')
                .send({ sessionid: mockSessionId });

            // Assertions
            expect(res.statusCode).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.message).toContain('Payment verified');

            // Assert that Stripe session retrieve was called
            expect(mockStripeInstance.checkout.sessions.retrieve).toHaveBeenCalledWith(mockSessionId);

            // Assert that database queries were called with the correct parameters
            expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
            expect(mockClient.query).toHaveBeenCalledWith(
                expect.stringContaining('UPDATE Ordine SET Status = $1 WHERE idordine = $2'),
                ['Da spedire', mockOrderId]
            );
            expect(mockClient.query).toHaveBeenCalledWith(
                expect.stringContaining('INSERT INTO Pagamento'),
                expect.any(Array)
            );
            expect(mockClient.query).toHaveBeenCalledWith(
                expect.stringContaining('INSERT INTO SubOrdine'),
                expect.any(Array)
            );
            expect(mockClient.query).toHaveBeenCalledWith(
                expect.stringContaining('DELETE FROM dettaglicarrello'),
                expect.any(Array)
            );
            expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
            expect(mockClient.release).toHaveBeenCalled();
        });

        it('should return 400 if session ID is missing', async () => {
            const res = await request(app)
                .post('/api/payments/verify-session')
                .send({}); // Empty body

            expect(res.statusCode).toBe(400);
            expect(res.body.error).toBe('Session ID is required.');
        });

        it('should return 404 if Stripe session is not found', async () => {
            const mockSessionId = 'cs_test_nonexistent';
            const stripeError = new Error('No such checkout.session');
            stripeError.type = 'StripeInvalidRequestError';
            stripeError.code = 'resource_missing';

            mockStripeInstance.checkout.sessions.retrieve.mockRejectedValue(stripeError);

            const res = await request(app)
                .post('/api/payments/verify-session')
                .send({ sessionid: mockSessionId });

            expect(res.statusCode).toBe(404);
            expect(res.body.error).toBe('Checkout Session not found on Stripe.');
        });

        it('should return 400 if order ID from Stripe session is invalid', async () => {
            const mockSessionId = 'cs_test_invalid_order_id';
            mockStripeInstance.checkout.sessions.retrieve.mockResolvedValue({
                id: mockSessionId,
                client_reference_id: 'not-a-number', // Invalid order ID
                payment_status: 'paid',
                amount_total: 5000,
                currency: 'eur',
            });

            const res = await request(app)
                .post('/api/payments/verify-session')
                .send({ sessionid: mockSessionId });

            expect(res.statusCode).toBe(400);
            expect(res.body.error).toBe('Invalid orderId in paid Stripe session data.');
        });

        it('should return 404 if order is not found in DB', async () => {
            const mockSessionId = 'cs_test_order_not_found';
            const mockOrderId = 999; // Non-existent order ID

            mockStripeInstance.checkout.sessions.retrieve.mockResolvedValue({
                id: mockSessionId,
                client_reference_id: mockOrderId.toString(),
                payment_status: 'paid',
                amount_total: 5000,
                currency: 'eur',
            });

            pool.query.mockResolvedValue({ rows: [] }); // Order not found in DB

            const res = await request(app)
                .post('/api/payments/verify-session')
                .send({ sessionid: mockSessionId });

            expect(res.statusCode).toBe(404);
            expect(res.body.error).toContain(`Order ${mockOrderId} associated with the payment was not found in our system.`);
        });

        it('should return 403 if authenticated user does not own the order', async () => {
            const mockSessionId = 'cs_test_unauthorized';
            const mockOrderId = 102;
            const authenticatedUserId = 1; // From isAuthenticated mock
            const orderOwnerId = 999; // Different from authenticated user

            mockStripeInstance.checkout.sessions.retrieve.mockResolvedValue({
                id: mockSessionId,
                client_reference_id: mockOrderId.toString(),
                payment_status: 'paid',
                amount_total: 5000,
                currency: 'eur',
            });

            pool.query.mockResolvedValue({
                rows: [{ idutente: orderOwnerId, stripecheckoutsessionid: mockSessionId, status: 'In attesa' }]
            });

            const res = await request(app)
                .post('/api/payments/verify-session')
                .send({ sessionid: mockSessionId });

            expect(res.statusCode).toBe(403);
            expect(res.body.error).toBe('Access denied. You do not have permission to verify this payment session.');
        });

        it('should handle unpaid Stripe sessions and update order status to Scaduto if In attesa', async () => {
            const mockSessionId = 'cs_test_unpaid';
            const mockOrderId = 103;
            const mockUserId = 1;

            mockStripeInstance.checkout.sessions.retrieve.mockResolvedValue({
                id: mockSessionId,
                client_reference_id: mockOrderId.toString(),
                payment_status: 'unpaid', // Key difference: unpaid
                status: 'complete', // Session status is complete
                amount_total: 5000,
                currency: 'eur',
            });

            pool.query.mockResolvedValueOnce({ rows: [{ idutente: mockUserId, stripecheckoutsessionid: mockSessionId, status: 'In attesa' }] });
            mockClient.query.mockResolvedValueOnce({}).mockResolvedValueOnce({}); // BEGIN and UPDATE/COMMIT for 'Scaduto'

            const res = await request(app).post('/api/payments/verify-session').send({ sessionid: mockSessionId });

            expect(res.statusCode).toBe(200);
            expect(res.body.success).toBe(false);
            expect(res.body.message).toContain("Payment status for session cs_test_unpaid is 'unpaid'. Order status: Scaduto.");
            expect(mockClient.query).toHaveBeenCalledWith(expect.stringContaining("UPDATE Ordine SET Status = 'Scaduto'"), [mockOrderId]);
        });

        it('should return 500 on database transaction error', async () => {
            const mockSessionId = 'cs_test_db_error';
            const mockOrderId = 104;
            const mockUserId = 1;

            mockStripeInstance.checkout.sessions.retrieve.mockResolvedValue({
                id: mockSessionId,
                client_reference_id: mockOrderId.toString(),
                payment_status: 'paid',
                amount_total: 5000,
                currency: 'eur',
            });

            pool.query.mockResolvedValueOnce({ rows: [{ idutente: mockUserId, stripecheckoutsessionid: mockSessionId, status: 'In attesa' }] });
            mockClient.query.mockResolvedValueOnce({}).mockRejectedValueOnce(new Error('Simulated DB Transaction Error')); // Simulate error during transaction

            const res = await request(app)
                .post('/api/payments/verify-session')
                .send({ sessionid: mockSessionId });

            expect(res.statusCode).toBe(500);
            expect(res.body.error).toBe('Database processing error.');
            expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK'); // Ensure rollback is called
        });
    });
});
