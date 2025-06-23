const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });
const request = require('supertest');
const bcrypt = require('bcryptjs');
const express = require('express');
const authRoutes = require('../../../src/routes/authRoutes');

// Mock the database module
jest.mock('../../../src/config/db-connect', () => ({
  query: jest.fn(),
}));
const pool = require('../../../src/config/db-connect');

const app = express();
app.use(express.json());
app.use('/api/auth', authRoutes);

describe('POST /api/auth/login - Unit Tests', () => {
  const testUserCredentials = {
    nome: 'Test',
    cognome: 'UserLogin',
    email: 'testlogin@example.com',
    username: 'testloginuser',
    plainPassword: 'password123',
    hashedPassword: '',
    indirizzo: 'Test Indirizzo,43, Test Citta',
    tipologia: 'Cliente'
  };
  
  // Mock user data
  const mockUser = {
    idutente: 1,
    nome: testUserCredentials.nome,
    cognome: testUserCredentials.cognome,
    email: testUserCredentials.email,
    username: testUserCredentials.username,
    password: '',
    indirizzo: testUserCredentials.indirizzo,
    tipologia: testUserCredentials.tipologia,
    deleted: false
  };

  beforeAll(async () => {
    // Hash password for mock user
    testUserCredentials.hashedPassword = await bcrypt.hash(testUserCredentials.plainPassword, 10);
    mockUser.password = testUserCredentials.hashedPassword;
  });

  beforeEach(() => {
    // Reset mocks before each test
    jest.clearAllMocks();
  });

  it('should login successfully with valid credentials', async () => {
    // Mock database response
    pool.query.mockResolvedValueOnce({ rows: [mockUser] });

    const response = await request(app)
      .post('/api/auth/login')
      .send({
        username: testUserCredentials.username,
        password: testUserCredentials.plainPassword,
      });

    expect(response.statusCode).toBe(200);
    expect(response.body.message).toBe('Accesso effettuato con successo.');
    expect(response.body.user.username).toBe(testUserCredentials.username);
    expect(response.body.user.password).toBeUndefined();
  });

  it('should return 401 for invalid password', async () => {
    // Mock database response
    pool.query.mockResolvedValueOnce({ rows: [mockUser] });

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
    // Mock deleted user
    const deletedUser = { ...mockUser, deleted: true };
    pool.query.mockResolvedValueOnce({ rows: [] });

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
    expect(response.body.message).toBe('Username e password sono obbligatori.');
  });

  it('should return 400 if password is missing', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .send({
        username: testUserCredentials.username,
      });

    expect(response.statusCode).toBe(400);
    expect(response.body.message).toBe('Username e password sono obbligatori.');
  });
});