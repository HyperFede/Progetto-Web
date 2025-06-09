const path = require('path'); // Importa il modulo 'path'
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') }); // Specifica il percorso del file .env
// __dirname si riferisce alla directory corrente del file (cioè src)
// '../.env' sale di un livello per trovare il file .env nella cartella backend
const request = require('supertest');
const bcrypt = require('bcryptjs'); // bcrypt è usato per hashare password nei dati di base
const express = require('express');
const userRoutes = require('../../../src/routes/userRoutes');
const pool = require('../../../src/config/db-connect');


// Mocking the authentication and authorization middleware
// This should be done before any modules that use it (like userRoutes) are required.
const mockAuthenticatedUser = {
    idutente: 1, // Default mock user ID
    username: 'mocktestuser',
    nome: 'Mock',
    cognome: 'User',
    email: 'mock@example.com',
    tipologia: 'Admin', // Default to Admin to pass most permission checks easily
    deleted: false
};

jest.mock('../../../src/middleware/authMiddleWare', () => ({
    isAuthenticated: jest.fn((req, res, next) => {
        req.user = mockAuthenticatedUser; // Attach a mock user to the request
        next();
    }),
    hasPermission: jest.fn(permissions => (req, res, next) => {
        next(); // Assume permission is granted for route unit tests
    }),
    getUserFromToken: jest.fn() // Add mock for getUserFromToken
}));

const app = express();
app.use(express.json());
app.use('/api/users', userRoutes);


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
beforeEach(() => {
    // Reset mocks before each test
    require('../../../src/middleware/authMiddleWare').getUserFromToken.mockReset();
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

afterAll(async () => {
    // Chiude tutte le connessioni nel pool al termine di tutti i test.
    await pool.end();
});

const baseUserCliente = {
    username: 'testuser',
    nome: 'Test',
    cognome: 'User',
    email: 'test@example.com',
    password: 'password123',
    indirizzo: 'Test Indirizzo,43, Test Citta',
    tipologia: 'Cliente'
};

const baseUserArtigiano = {
    username: 'artigianotest',
    nome: 'Artigiano',
    cognome: 'Di Prova',
    email: 'artigiano@example.com',
    password: 'passwordArt123',
    tipologia: 'Artigiano',
    indirizzo: 'Test Indirizzo,43, Test Citta',
    piva: '12345678901',
    artigianodescrizione: 'Descrizione artigiano di prova'
};

// Helper function to generate unique user data
const generateUniqueUserData = (baseData, customSuffix = '') => {
    const suffix = customSuffix || Date.now().toString() + Math.random().toString(36).substring(2, 7);
    return {
        ...baseData,
        username: `${baseData.username}${suffix}`,
        email: `${baseData.email}${suffix}`
    };
};

describe('User API Unit Tests', () => {

    // TEST POST 
    describe('POST /api/users', () => {
        // Test per la creazione di un utente di tipo Cliente
        test('Crea utente Cliente correttamente', async () => {
            const uniqueClienteData = generateUniqueUserData(baseUserCliente);
            const res = await request(app)
                .post('/api/users')
                .send(uniqueClienteData);
            // si aspetta che la risposta sia 201 (creato)
            expect(res.statusCode).toBe(201);
            // Verifica che la risposta contenga le proprietà corrette (quelle principali, posso metterle tutte volendo)
            expect(res.body).toMatchObject({
                idutente: expect.any(Number),
                username: uniqueClienteData.username,
                tipologia: 'Cliente'
            });

            //La risposta   NON DEVE avere la password
            expect(res.body).not.toHaveProperty('password');

            // Verifica se l'utente esiste davvero nel DB
            const dbCheck = await testClient.query('SELECT * FROM utente WHERE idutente = $1', [res.body.idutente]);
            expect(dbCheck.rows.length).toBe(1);
            expect(dbCheck.rows[0].username).toBe(uniqueClienteData.username);
        });


        // Test per la creazione di un utente di tipo Artigiano
        test('Crea utente Artigiano correttamente', async () => {
            const uniqueArtigianoData = generateUniqueUserData(baseUserArtigiano);
            const res = await request(app)
                .post('/api/users')
                .send(uniqueArtigianoData);

            expect(res.statusCode).toBe(201);
            expect(res.body).toMatchObject({
                idutente: expect.any(Number),
                username: uniqueArtigianoData.username,
                tipologia: 'Artigiano',
                piva: baseUserArtigiano.piva,
                artigianodescrizione: baseUserArtigiano.artigianodescrizione
            });
            expect(res.body).not.toHaveProperty('password');
            // Verifica se l'utente esiste davvero nel DB
            const dbCheck = await testClient.query('SELECT * FROM utente WHERE idutente = $1', [res.body.idutente]);
            expect(dbCheck.rows.length).toBe(1);
            expect(dbCheck.rows[0].username).toBe(uniqueArtigianoData.username);
            expect(dbCheck.rows[0].piva).toBe(baseUserArtigiano.piva);
            expect(dbCheck.rows[0].artigianodescrizione).toBe(baseUserArtigiano.artigianodescrizione);
        });

        test('Errore 400 per tipologia non valida', async () => {
            // Prova a creare un utente con una tipologia non valida
            const res = await request(app)
                .post('/api/users')
                .send({ ...generateUniqueUserData(baseUserCliente), tipologia: 'InvalidType' });
            expect(res.statusCode).toBe(400);
            expect(res.body).toHaveProperty('message', 'Tipologia non valida. Deve essere "Cliente", "Artigiano" o "Admin".');
        });


        test('Errore 400 per campi mancanti', async () => {
            // Prova a creare un utente senza i campi obbligatori
            const res = await request(app)
                .post('/api/users')
                .send({ username: 'incomplete' });

            expect(res.statusCode).toBe(400);
            expect(res.body).toHaveProperty('message', 'Username, Nome,Cognome, Email, Password, Indirizzo,Tipologia, sono campi obbligatori.');
        });



        test('Errore 403 per tentativo di creazione Admin', async () => {
            // Prova a creare un utente con tipologia Admin (il resto è uguale a baseUserCliente)
            const res = await request(app)
                .post('/api/users')
                .send({ ...baseUserCliente, tipologia: 'Admin' });

            expect(res.statusCode).toBe(403);
            expect(res.body).toHaveProperty('message', 'La creazione di utenti Admin tramite API non è permessa.');
        }
        );

        test('Errore 409 per username o email già esistente', async () => {
            // Generate unique base data for this specific test run
            const uniqueInitialUserData = generateUniqueUserData(baseUserCliente, `initial_${Date.now()}`);

            // 1. Crea il primo utente con dati unici per questo test.
            const createRes = await request(app)
                .post('/api/users')
                .send(uniqueInitialUserData);
            expect(createRes.statusCode).toBe(201);

            // 2. Tenta di creare un altro utente con lo STESSO username del primo utente, ma email diversa.
            const conflictingUsernameAttempt = {
                ...baseUserCliente, // Start with base structure
                username: uniqueInitialUserData.username, // Crucial: use the username just created
                email: `conflict_email_${Date.now()}${Math.random()}@example.com`, // Ensure this email is different and unique for this attempt
                nome: 'ConflictingUser',
                cognome: 'Name'
            };

            const resUsernameConflict = await request(app)
                .post('/api/users')
                .send(conflictingUsernameAttempt);

            expect(resUsernameConflict.statusCode).toBe(409);
            // 3. Tenta di creare un altro utente con la STESSA email del primo utente, ma username diverso.
            const conflictingEmailAttempt = {
                ...baseUserCliente, // Start with base structure
                username: `conflict_user_${Date.now()}${Math.random()}`, // Ensure this username is different and unique for this attempt
                email: uniqueInitialUserData.email, // Crucial: use the email just created
                nome: 'ConflictingUser',
                cognome: 'Email'
            };
            const resEmailConflict = await request(app)
                .post('/api/users')
                .send(conflictingEmailAttempt);

            expect(resEmailConflict.statusCode).toBe(409);
        }
        );
    });

    // TEST GET
    describe('GET /api/users', () => {
        //NB, se non ci sono utenti nel DB, la risposta sarà un array vuoto, non passa il test
        test('Recupera lista utenti', async () => {
            const res = await request(app).get('/api/users');

            expect(res.statusCode).toBe(200);
            expect(Array.isArray(res.body)).toBe(true);
            expect(res.body).toEqual(expect.arrayContaining([ // Verifica che la lista contenga idutente (lista corretta)
                expect.objectContaining({ idutente: expect.any(Number) }),
            ]));
        });
    });

    // TEST GET SINGOLO
    describe('GET /api/users/:id', () => {
        test('Recupera utente esistente (Admin visualizza Cliente)', async () => {
            const uniqueClienteForGet = generateUniqueUserData(baseUserCliente, `get_${Date.now()}`);

            // 1. Crea un utente tramite API per ottenere un ID valido
            const createUserRes = await request(app)
                .post('/api/users')
                .send(uniqueClienteForGet);
            const userId = createUserRes.body.idutente;
            expect(createUserRes.statusCode).toBe(201); // Ensure user was created

            // Mock getUserFromToken to return the Admin user
            const { getUserFromToken } = require('../../../src/middleware/authMiddleWare');
            getUserFromToken.mockResolvedValue(mockAuthenticatedUser);

            // 2. Richiedi l'utente tramite il suo ID
            const res = await request(app)
                .get(`/api/users/${userId}`)
                .set('Authorization', 'Bearer faketoken'); // Send auth header

            expect(res.statusCode).toBe(200);
            expect(res.body).toHaveProperty('idutente', userId);
            expect(res.body.username).toBe(uniqueClienteForGet.username);
            expect(res.body.tipologia).toBe('Cliente');
            expect(res.body).not.toHaveProperty('password');

        });

        test('Unauthenticated user fetches Artigiano profile successfully', async () => {
            // 1. Create an Artigiano user
            const uniqueArtigiano = generateUniqueUserData(baseUserArtigiano, `getart_${Date.now()}`);
            const artigianoRes = await request(app).post('/api/users').send(uniqueArtigiano);
            expect(artigianoRes.statusCode).toBe(201);
            const artigianoId = artigianoRes.body.idutente;

            // Mock getUserFromToken to return null (simulating unauthenticated)
            const { getUserFromToken } = require('../../../src/middleware/authMiddleWare');
            getUserFromToken.mockResolvedValue(null);

            // 2. Request the Artigiano's profile without an Authorization header
            const res = await request(app).get(`/api/users/${artigianoId}`);

            expect(res.statusCode).toBe(200);
            expect(res.body.idutente).toBe(artigianoId);
            expect(res.body.tipologia).toBe('Artigiano');

        });

        test('Unauthenticated user gets 401 for Cliente profile', async () => {
            // 1. Create a Cliente user
            const uniqueCliente = generateUniqueUserData(baseUserCliente, `getcli_auth_${Date.now()}`);
            const clienteRes = await request(app).post('/api/users').send(uniqueCliente);

            expect(clienteRes.statusCode).toBe(201);
            const clienteId = clienteRes.body.idutente;

            // Mock getUserFromToken to return null
            const { getUserFromToken } = require('../../../src/middleware/authMiddleWare');
            getUserFromToken.mockResolvedValue(null);

            // 2. Request the Cliente's profile without an Authorization header
            const res = await request(app).get(`/api/users/${clienteId}`);

            expect(res.statusCode).toBe(401);
            expect(res.body.message).toBe('Autenticazione richiesta per visualizzare questo profilo.');
        });

        test('Cliente fetches their own profile successfully', async () => {
            const clienteDetails = generateUniqueUserData(baseUserCliente, `selfcli_${Date.now()}`);

            // 1. Create a Cliente user
            const createRes = await request(app).post('/api/users').send(clienteDetails);
            expect(createRes.statusCode).toBe(201);
            const clienteId = createRes.body.idutente;

            // Mock getUserFromToken to return this specific Cliente user
            const mockSelfCliente = { ...createRes.body, tipologia: 'Cliente', idutente: clienteId };
            const { getUserFromToken } = require('../../../src/middleware/authMiddleWare');
            getUserFromToken.mockResolvedValue(mockSelfCliente);

            // 2. Request their own profile
            const res = await request(app)
                .get(`/api/users/${clienteId}`)
                .set('Authorization', 'Bearer faketokenforcliente');

            expect(res.statusCode).toBe(200);
            expect(res.body.idutente).toBe(clienteId);
            expect(res.body.username).toBe(clienteDetails.username);
        });

        test('Cliente gets 403 trying to fetch another Cliente profile', async () => {
            // 1. Create two Cliente users
            const cliente1Details = generateUniqueUserData(baseUserCliente, `cli1_${Date.now()}`);
            const cliente2Details = generateUniqueUserData(baseUserCliente, `cli2_${Date.now()}`);

            const create1Res = await request(app).post('/api/users').send(cliente1Details);
            expect(create1Res.statusCode).toBe(201);
            const cliente1Id = create1Res.body.idutente;
            const mockCliente1User = { ...create1Res.body, tipologia: 'Cliente', idutente: cliente1Id };

            const create2Res = await request(app).post('/api/users').send(cliente2Details);
            expect(create2Res.statusCode).toBe(201);
            const cliente2Id = create2Res.body.idutente;

            // Mock getUserFromToken to return cliente1
            const { getUserFromToken } = require('../../../src/middleware/authMiddleWare');
            getUserFromToken.mockResolvedValue(mockCliente1User);

            // 2. Cliente1 tries to fetch Cliente2's profile
            const res = await request(app)
                .get(`/api/users/${cliente2Id}`)
                .set('Authorization', 'Bearer faketokenforcliente1');

            expect(res.statusCode).toBe(403);
            expect(res.body.message).toBe('Accesso negato. Non hai i permessi necessari per visualizzare questo utente.');
        });

        test('Admin fetches a deleted user profile successfully', async () => {
            // 1. Create a user and then soft-delete them directly in DB for this test
            const userToCreate = generateUniqueUserData(baseUserCliente, `del_admin_${Date.now()}`);
            const createRes = await request(app).post('/api/users').send(userToCreate);
            expect(createRes.statusCode).toBe(201);
            const userId = createRes.body.idutente;

            // Soft delete the user directly (this will be rolled back)
            await testClient.query('UPDATE utente SET deleted = true WHERE idutente = $1', [userId]);

            // Mock getUserFromToken to return the Admin user
            const { getUserFromToken } = require('../../../src/middleware/authMiddleWare');
            getUserFromToken.mockResolvedValue(mockAuthenticatedUser); // mockAuthenticatedUser is an Admin

            // 2. Admin requests the deleted user's profile
            const res = await request(app)
                .get(`/api/users/${userId}`)
                .set('Authorization', 'Bearer faketokenforadmin');

            expect(res.statusCode).toBe(200);
            expect(res.body.idutente).toBe(userId);
            expect(res.body.deleted).toBe(true); // Admin should see the 'deleted' status
        });

        test('Non-Admin user gets 404 for a deleted user profile', async () => {
            const userToCreate = generateUniqueUserData(baseUserCliente, `del_nonadmin_${Date.now()}`);
            const createRes = await request(app).post('/api/users').send(userToCreate);
            expect(createRes.statusCode).toBe(201);
            const userId = createRes.body.idutente;
            await testClient.query('UPDATE utente SET deleted = true WHERE idutente = $1', [userId]);

            const { getUserFromToken } = require('../../../src/middleware/authMiddleWare');
            getUserFromToken.mockResolvedValue(null); // Simulate unauthenticated or non-Admin

            const res = await request(app).get(`/api/users/${userId}`);
            expect(res.statusCode).toBe(404);
            expect(res.body.message).toBe('Utente non trovato.');
        });

        test('Errore 404 per utente inesistente', async () => {
            const fakeId = 99999; // ID non esistente
            const res = await request(app).get(`/api/users/${fakeId}`);
            expect(res.statusCode).toBe(404);
            expect(res.body).toHaveProperty('message', 'Utente non trovato.');


        });
    });

    //TEST GET ALL NOT DELETED
    describe('GET /api/users/notdeleted', () => {
        test('Recupera lista utenti non cancellati', async () => {

            const uniqueUserForNotDeleted = generateUniqueUserData(baseUserCliente, `notdel_${Date.now()}`);

            // Crea almeno un utente non cancellato per assicurarti che la lista non sia vuota
            const createUserRes = await request(app)
                .post('/api/users')
                .send(uniqueUserForNotDeleted);
            expect(createUserRes.statusCode).toBe(201);

            const res = await request(app).get('/api/users/notdeleted');

            expect(res.statusCode).toBe(200);
            expect(Array.isArray(res.body)).toBe(true);
            expect(res.body).toEqual(expect.arrayContaining([
                expect.objectContaining({ idutente: expect.any(Number), deleted: false })
            ]));
            res.body.forEach(user => {
                expect(user.deleted).toBe(false);
            });
        });
    });

    // TEST DELETE
    describe('DELETE /api/users/:id', () => {
        test('Elimina utente correttamente', async () => {

            // 1. Crea un utente da eliminare (di base ha il cliente, cambio solo username e email)
            const userToDeleteData = generateUniqueUserData(baseUserCliente, `del_${Date.now()}`);
            const createUserRes = await request(app)
                .post('/api/users')
                .send(userToDeleteData);
            const userIdToDelete = createUserRes.body.idutente;
            expect(createUserRes.statusCode).toBe(201); // Assicurati che l'utente sia stato creato

            // 2. Elimina l'utente tramite API
            const res = await request(app).delete(`/api/users/${userIdToDelete}`);


            expect(res.statusCode).toBe(200);
            expect(res.body).toHaveProperty('message', `Utente con ID ${userIdToDelete} eliminato.`);

            // Verifica che l'utente sia stato effettivamente (soft) eliminato nel DB, controlliamo il suo valore
            const dbCheck = await testClient.query('SELECT deleted FROM utente WHERE idutente = $1', [userIdToDelete]);

            expect(dbCheck.rows.length).toBe(1); // La riga dovrebbe esistere per un soft delete
            if (dbCheck.rows.length > 0) {
                expect(dbCheck.rows[0].deleted).toBe(true);
            }
        });

        test('Errore 404 per utente inesistente', async () => {
            const fakeId = 99999; // ID non esistente
            const res = await request(app).delete(`/api/users/${fakeId}`);
            expect(res.statusCode).toBe(404);
            expect(res.body).toHaveProperty('message', 'Utente non trovato per l eliminazione.');
        }
        );

        test('Errore 403 per tentativo di eliminazione di un Admin', async () => {
            // 1. Cerca un utente di tipo Admin nel DB (non posso crearlo tramite API)
            const adminUserQuery = await testClient.query('SELECT idutente FROM utente WHERE tipologia = $1', ['Admin']);
            let adminUserId;
            if (adminUserQuery.rows.length === 0) {
                // Se non esiste un Admin, creane uno per il test (NON SUCCEDE, ASSUNZIONE CHE CI SIA SEMPRE UN ADMIN)
            }
            else {
                // Se esiste, prendi il suo ID
                adminUserId = adminUserQuery.rows[0].idutente;
                //console.log('Admin ID:', adminUserId);
            }

            const res = await request(app).delete(`/api/users/${adminUserId}`);
            expect(res.statusCode).toBe(403);
            expect(res.body).toHaveProperty('message', 'Non puoi eliminare un utente Admin.');
        }
        );

    });

    // TEST PUT
    describe('PUT /api/users/:id', () => {
        let createdClienteId;
        let createdArtigianoId;
        let uniqueArtigianoUsernameForPut; // To store the unique username of the artigiano for conflict tests
        let uniqueArtigianoEmailForPut;    // To store the unique email of the artigiano for conflict tests

        // Dati utente per i test di PUT
        const baseClienteForPut = { ...baseUserCliente, username: 'putcliente', email: 'putcliente@example.com' };
        const baseArtigianoForPut = { ...baseUserArtigiano, username: 'putartigiano', email: 'putartigiano@example.com' };

        beforeEach(async () => {
            const uniqueSuffix = Date.now().toString() + Math.random().toString(36).substring(2, 7);

            const clienteToCreate = generateUniqueUserData(baseClienteForPut, `cli_${uniqueSuffix}`);
            const artigianoToCreate = generateUniqueUserData(baseArtigianoForPut, `art_${uniqueSuffix}`);

            uniqueArtigianoUsernameForPut = artigianoToCreate.username; // Store for conflict tests
            uniqueArtigianoEmailForPut = artigianoToCreate.email;       // Store for conflict tests


            // Crea utenti di test prima di ogni test PUT per avere ID validi
            const clienteRes = await request(app).post('/api/users').send(clienteToCreate);
            expect(clienteRes.statusCode).toBe(201); // Ensure creation

            createdClienteId = clienteRes.body.idutente;

            const artigianoRes = await request(app).post('/api/users').send(artigianoToCreate);
            expect(artigianoRes.statusCode).toBe(201); // Ensure creation

            createdArtigianoId = artigianoRes.body.idutente;
        });

        test('Aggiorna utente Cliente correttamente', async () => {
            const updateData = {
                username: 'updatedcliente',
                nome: 'UpdatedNome',
                email: 'updatedcliente@example.com'
            };

            const res = await request(app)
                .put(`/api/users/${createdClienteId}`)
                .send(updateData);

            expect(res.statusCode).toBe(200);
            expect(res.body).toMatchObject({
                idutente: createdClienteId,
                username: updateData.username,
                nome: updateData.nome,
                email: updateData.email,
                tipologia: 'Cliente' // La tipologia non dovrebbe cambiare
            });
            expect(res.body).not.toHaveProperty('password');

            // Verifica nel DB
            const dbCheck = await testClient.query('SELECT * FROM utente WHERE idutente = $1', [createdClienteId]);
            expect(dbCheck.rows[0].username).toBe(updateData.username);
            expect(dbCheck.rows[0].nome).toBe(updateData.nome);
            expect(dbCheck.rows[0].email).toBe(updateData.email);
        });

        test('Aggiorna utente Artigiano correttamente con solo PIVA e descrizione', async () => {
            const updateData = {
                piva: '09876543210',
                artigianodescrizione: 'Nuova descrizione artigiano'
            };

            const res = await request(app)
                .put(`/api/users/${createdArtigianoId}`)
                .send(updateData);

            expect(res.statusCode).toBe(200);
            expect(res.body).toMatchObject({
                idutente: createdArtigianoId,
                tipologia: 'Artigiano',
                piva: updateData.piva,
                artigianodescrizione: updateData.artigianodescrizione
            });

            // Verifica nel DB
            const dbCheck = await testClient.query('SELECT * FROM utente WHERE idutente = $1', [createdArtigianoId]);
            expect(dbCheck.rows[0].piva).toBe(updateData.piva);
            expect(dbCheck.rows[0].artigianodescrizione).toBe(updateData.artigianodescrizione);
        });

        test('Errore 404 se utente da aggiornare non esiste', async () => {
            const nonExistentId = 99999;
            const res = await request(app)
                .put(`/api/users/${nonExistentId}`)
                .send({ username: 'anyupdate' });

            expect(res.statusCode).toBe(404);
            expect(res.body).toHaveProperty('message', 'Utente non trovato per l aggiornamento.');
        });

        test('Errore 400 per username vuoto', async () => {
            const res = await request(app)
                .put(`/api/users/${createdClienteId}`)
                .send({ username: '' });

            expect(res.statusCode).toBe(400);
            expect(res.body).toHaveProperty('message', 'Username ed Email non possono essere vuoti.');
        });

        test('Errore 400 per Artigiano con PIVA vuota durante aggiornamento', async () => {
            const res = await request(app)
                .put(`/api/users/${createdArtigianoId}`)
                .send({ piva: '' }); // Tentativo di svuotare PIVA

            expect(res.statusCode).toBe(400);
            expect(res.body).toHaveProperty('message', 'Per la tipologia "Artigiano", PIVA e ArtigianoDescrizione sono obbligatori.');
        });

        test('Errore 409 se aggiornamento causa conflitto di username', async () => {
            const res = await request(app)
                .put(`/api/users/${createdClienteId}`)
                .send({ username: uniqueArtigianoUsernameForPut }); // Use the unique username of the artigiano created in beforeEach


            expect(res.statusCode).toBe(409);
            expect(res.body).toHaveProperty('message', 'Username o Email già esistente.');
        });

        test('Errore 409 se aggiornamento causa conflitto di email', async () => {
            const res = await request(app)
                .put(`/api/users/${createdClienteId}`)
                .send({ email: uniqueArtigianoEmailForPut }); // Use the unique email of the artigiano created in beforeEach

            expect(res.statusCode).toBe(409);
            expect(res.body).toHaveProperty('message', 'Username o Email già esistente.');
        });

        test('Tipologia non viene modificata durante aggiornamento', async () => {
            const res = await request(app)
                .put(`/api/users/${createdClienteId}`)
                .send({ tipologia: 'Admin', nome: 'NomeCambiato' }); // Tentativo di cambiare tipologia

            expect(res.statusCode).toBe(200);
            expect(res.body.tipologia).toBe('Cliente'); // La tipologia non deve cambiare
            const dbCheck = await testClient.query('SELECT tipologia FROM utente WHERE idutente = $1', [createdClienteId]);
            expect(dbCheck.rows[0].tipologia).toBe('Cliente');
        });

    });
});