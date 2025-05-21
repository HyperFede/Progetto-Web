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
describe('User API Unit Tests', () => {

    // TEST POST 
    describe('POST /api/users', () => { 
        // Test per la creazione di un utente di tipo Cliente
        test('Crea utente Cliente correttamente', async () => {
            const res = await request(app)
                .post('/api/users')
                .send(baseUserCliente);
            // si aspetta che la risposta sia 201 (creato)
            expect(res.statusCode).toBe(201);
            // Verifica che la risposta contenga le proprietà corrette (quelle principali, posso metterle tutte volendo)
            expect(res.body).toMatchObject({
                idutente: expect.any(Number),
                username: baseUserCliente.username,
                tipologia: 'Cliente'
            });

            //La risposta   NON DEVE avere la password
            expect(res.body).not.toHaveProperty('password');

            // Verifica se l'utente esiste davvero nel DB
            const dbCheck = await testClient.query('SELECT * FROM utente WHERE idutente = $1', [res.body.idutente]);
            expect(dbCheck.rows.length).toBe(1);
            expect(dbCheck.rows[0].username).toBe(baseUserCliente.username);
        });

        
        // Test per la creazione di un utente di tipo Artigiano
        test('Crea utente Artigiano correttamente', async () => {
            const res = await request(app)
                .post('/api/users')
                .send(baseUserArtigiano);
            expect(res.statusCode).toBe(201);
            expect(res.body).toMatchObject({
                idutente: expect.any(Number),
                username: baseUserArtigiano.username,
                tipologia: 'Artigiano',
                piva: baseUserArtigiano.piva,
                artigianodescrizione: baseUserArtigiano.artigianodescrizione
            });
            expect(res.body).not.toHaveProperty('password');
            // Verifica se l'utente esiste davvero nel DB
            const dbCheck = await testClient.query('SELECT * FROM utente WHERE idutente = $1', [res.body.idutente]);
            expect(dbCheck.rows.length).toBe(1);
            expect(dbCheck.rows[0].username).toBe(baseUserArtigiano.username);
            expect(dbCheck.rows[0].piva).toBe(baseUserArtigiano.piva);
            expect(dbCheck.rows[0].artigianodescrizione).toBe(baseUserArtigiano.artigianodescrizione);
        });

        test('Errore 400 per tipologia non valida', async () => {
            // Prova a creare un utente con una tipologia non valida
            const res = await request(app)
                .post('/api/users')
                .send({ ...baseUserCliente, tipologia: 'InvalidType' });
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
            // 1. Crea il cliente di base tramite POST .
            await request(app)
                .post('/api/users')
                .send(baseUserCliente);

            // 2. Tenta di creare un altro utente con lo stesso username.
            // L'errore 23505 (violazione del vincolo UNIQUE, ha username uguali)
            const conflictingUser = { ...baseUserCliente, email: 'conflict@example.com', nome: 'Conflicting', cognome: 'User' };

            const res = await request(app)
                .post('/api/users')
                .send(conflictingUser);

            expect(res.statusCode).toBe(409);
            expect(res.body).toHaveProperty('message', 'Username o Email già esistente.');
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
        test('Recupera utente esistente', async () => {
            // 1. Crea un utente tramite API per ottenere un ID valido
            const createUserRes = await request(app)
                .post('/api/users')
                .send(baseUserCliente);
            const userId = createUserRes.body.idutente;

            // 2. Richiedi l'utente tramite il suo ID
            const res = await request(app).get(`/api/users/${userId}`);


            expect(res.statusCode).toBe(200);
            expect(res.body).toHaveProperty('idutente', userId);
            expect(res.body.username).toBe(baseUserCliente.username);
            expect(res.body).not.toHaveProperty('password');

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
            // Crea almeno un utente non cancellato per assicurarti che la lista non sia vuota
            const createUserRes = await request(app)
            .post('/api/users')
            .send(baseUserCliente);
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
            const userToDeleteData = { ...baseUserCliente, username: 'todelete', email: 'todelete@example.com' };
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
            else{
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

        // Dati utente per i test di PUT
        const clienteToCreate = { ...baseUserCliente, username: 'putcliente', email: 'putcliente@example.com' };
        const artigianoToCreate = { ...baseUserArtigiano, username: 'putartigiano', email: 'putartigiano@example.com' };

        beforeEach(async () => {
            // Crea utenti di test prima di ogni test PUT per avere ID validi
            const clienteRes = await request(app).post('/api/users').send(clienteToCreate);
            createdClienteId = clienteRes.body.idutente;

            const artigianoRes = await request(app).post('/api/users').send(artigianoToCreate);
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
            // `createdClienteId` ha username 'putcliente'
            // `createdArtigianoId` ha username 'putartigiano'
            // Tentiamo di aggiornare `createdClienteId` con username 'putartigiano'
            const res = await request(app)
                .put(`/api/users/${createdClienteId}`)
                .send({ username: artigianoToCreate.username }); // username di createdArtigianoId

            expect(res.statusCode).toBe(409);
            expect(res.body).toHaveProperty('message', 'Username o Email già esistente.');
        });

        test('Errore 409 se aggiornamento causa conflitto di email', async () => {
            // Tentiamo di aggiornare `createdClienteId` con email 'putartigiano@example.com'
            const res = await request(app)
                .put(`/api/users/${createdClienteId}`)
                .send({ email: artigianoToCreate.email }); // email di createdArtigianoId

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