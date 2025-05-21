//PER ORA TESTIAMO SU DB NORMALE, (tanto facciamo pulizia) NECESSARIO DB DI TESTING IDENTICO
const path = require('path'); // Importa il modulo 'path'
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') }); // Specifica il percorso del file .env
// __dirname si riferisce alla directory corrente del file (cioè src)
// '../.env' sale di un livello per trovare il file .env nella cartella backend
// Controlla DB_USER subito dopo dotenv.config()

const request = require('supertest');
const express = require('express');
const userRoutes = require('../../../src/routes/userRoutes');
const pool = require('../../../src/config/db-connect');


const app = express();
app.use(express.json());
app.use('/api/users', userRoutes);


// Mock del database
jest.mock('../../../src/config/db-connect', () => ({
    query: jest.fn()
}));

// Mock authentication and permission middleware
// This ensures that if userRoutes applies these middlewares, they are bypassed for logic tests.
jest.mock('../../../src/middleware/authMiddleWare', () => ({
    isAuthenticated: jest.fn((req, res, next) => {
        // Populate req.user as some routes might depend on it (e.g., for 'Self' permission or audit)
        // You can customize this mock user as needed for specific test scenarios if necessary.
        req.user = { idutente: 1, username: 'mockLogicUser', tipologia: 'Admin' };
        next(); // Proceed to the next middleware or route handler
    }),
    hasPermission: jest.fn((permissions) => (req, res, next) => {
        next(); // Assume permission is always granted for these logic tests
    }),
}));
// Pulizia del mock prima di ogni test
beforeEach(() => {
    pool.query.mockClear();
});


describe('User API Logic Tests', () => {

    // TEST POST
    
    describe('POST /api/users', () => {
        const baseUser = {
            username: 'testuser',
            nome: 'Test',
            cognome: 'User',
            email: 'test@example.com',
            password: 'password123',
            indirizzo: 'Test Indirizzo,43, Test Citta',
            tipologia: 'Cliente'
        };
        const newUserArtigiano = {
            username: 'artigianotest',
            nome: 'Artigiano',
            cognome: 'Di Prova',
            email: 'artigiano@example.com',
            password: 'passwordArt123',
            indirizzo: 'Test Indirizzo,43, Test Citta',
            tipologia: 'Artigiano',
            piva: '12345678901',
            artigianodescrizione: 'Descrizione artigiano di prova'
        };

        test('Crea utente Cliente correttamente', async () => {
            pool.query.mockResolvedValue({ rows: [{ idutente: 1, ...baseUser }] });

            const res = await request(app)
                .post('/api/users')
                .send(baseUser);

            expect(res.statusCode).toBe(201);
            expect(res.body).toMatchObject({
                idutente: expect.any(Number),
                username: baseUser.username,
                tipologia: 'Cliente'
            });
        });

        test('Crea utente Artigiano correttamente', async () => {
            pool.query.mockResolvedValue({ rows: [{ idutente: 2, ...newUserArtigiano }] });

            const res = await request(app)
                .post('/api/users')
                .send(newUserArtigiano);

            expect(res.statusCode).toBe(201);
            expect(res.body).toMatchObject({
                idutente: expect.any(Number),
                username: newUserArtigiano.username,
                tipologia: 'Artigiano',
                piva: newUserArtigiano.piva,
                artigianodescrizione: newUserArtigiano.artigianodescrizione
            });
            expect(res.body).not.toHaveProperty('password');
        });

        test('Errore 403 per tentativo di creazione Admin', async () => {
            const res = await request(app)
                .post('/api/users')
                .send({ ...baseUser, tipologia: 'Admin' });

            expect(res.statusCode).toBe(403);
            expect(res.body).toHaveProperty('message', 'La creazione di utenti Admin tramite API non è permessa.');
        }
        );
       
        test('Errore 409 per username o email già esistente', async () => {
            //siccome non ho la connessione al DB di test, simulo l'errore
            pool.query.mockImplementationOnce(() => {
                throw { code: '23505' }; // Simula un errore di violazione della chiave unica
            }
            );


            const res = await request(app)
                .post('/api/users')
                .send(baseUser);

            expect(res.statusCode).toBe(409);
            expect(res.body).toHaveProperty('message', 'Username o Email già esistente.');
        }
        );
    });

    // TEST GET
    describe('GET /api/users', () => {
        test('Recupera lista utenti', async () => {
            //simulo una lista di utenti esistenti

            pool.query.mockResolvedValue({ rows: [{ idutente: 1, username: 'user1' },{ idutente: 2, username: 'user2' }] });

            const res = await request(app).get('/api/users');

            expect(res.statusCode).toBe(200);
            expect(res.body).toEqual(expect.arrayContaining([
                expect.objectContaining({ idutente: expect.any(Number) })
            ]));
        });
    });

    // TEST GET SINGOLO
    describe('GET /api/users/:id', () => {
        test('Recupera utente esistente', async () => {
            //simulo un utente esistente
            pool.query.mockResolvedValue({ rows: [{ idutente: 1, username: 'user1' }] });

            const res = await request(app).get('/api/users/1');

            expect(res.statusCode).toBe(200);
            expect(res.body).toHaveProperty('idutente', 1);
        });

        test('Errore 404 per utente inesistente', async () => {
            
            pool.query.mockResolvedValue({ rows: [] });
            const fakeId = 99999; // ID non esistente
            const res = await request(app).get(`/api/users/${fakeId}`);
            expect(res.statusCode).toBe(404);
            expect(res.body).toHaveProperty('message', 'Utente non trovato.');


        });

    });

    //TEST GET ALL NOT DELETED
    describe('GET /api/users/notdeleted', () => {
        test('Recupera lista utenti non cancellati', async () => {
            //simulo una lista di utenti esistenti
            pool.query.mockResolvedValue({ rows: [{ idutente: 1, username: 'user1', deleted: false },{ idutente: 2, username: 'user2', deleted: false }] });
            const res = await request(app).get('/api/users/notdeleted');
            expect(res.statusCode).toBe(200);
            expect(res.body).toEqual(expect.arrayContaining([
                expect.objectContaining({ idutente: expect.any(Number)})
            ]));
            res.body.forEach(user => {
                expect(user.deleted).toBe(false);
            });            
        });
        test('Errore 500 se si verifica un errore del server', async () => {
            // Simula un errore del server
            pool.query.mockImplementationOnce(() => {
                throw new Error('Errore del server');
            });

            const res = await request(app).get('/api/users/notdeleted');

            expect(res.statusCode).toBe(500);
            expect(res.body).toHaveProperty('message', 'Errore del server durante il recupero degli utenti.');
        }
        );
    });

    
    // TEST PUT
    describe('PUT /api/users/:id', () => {
        const clienteBase = {
            idutente: 1,
            username: 'clienteoriginale',
            nome: 'Cliente',
            cognome: 'Originale',
            email: 'cliente@example.com',
            tipologia: 'Cliente',
            piva: null,
            artigianodescrizione: null
        };

        const artigianoBase = {
            idutente: 2,
            username: 'artigianooriginale',
            nome: 'Artigiano',
            cognome: 'Originale',
            email: 'artigiano@example.com',
            tipologia: 'Artigiano',
            piva: '12345678901',
            artigianodescrizione: 'Descrizione artigiano originale'
        };

        const adminBase = {
            idutente: 3,
            username: 'adminoriginale',
            nome: 'Admin',
            cognome: 'Originale',
            email: 'admin@example.com',
            tipologia: 'Admin',
            piva: null,
            artigianodescrizione: null
        };
        
        test('Aggiorna utente Cliente correttamente con campi forniti', async () => {
            const updateData = {
                username: 'clienteaggiornato',
                nome: 'Nome Cliente Aggiornato',
                email: 'clienteaggiornato@example.com'
            };
            const expectedUpdatedUser = { ...clienteBase, ...updateData };

            pool.query.mockResolvedValueOnce({ rows: [clienteBase] }); // Mock per SELECT
            pool.query.mockResolvedValueOnce({ rows: [expectedUpdatedUser] }); // Mock per UPDATE

            const res = await request(app)
                .put(`/api/users/${clienteBase.idutente}`)
                .send(updateData);

            expect(res.statusCode).toBe(200);
            expect(res.body).toMatchObject({
                idutente: clienteBase.idutente,
                username: updateData.username,
                nome: updateData.nome,
                email: updateData.email,
                tipologia: clienteBase.tipologia // La tipologia non deve cambiare
            });
            expect(res.body).not.toHaveProperty('password');
        });

        test('Aggiorna utente Artigiano correttamente con campi forniti', async () => {
            const updateData = {
                username: 'artigianoaggiornato',
                nome: 'Nome Artigiano Aggiornato',
                piva: '11122233344',
                artigianodescrizione: 'Descrizione artigiano aggiornata'
            };
            const expectedUpdatedUser = { ...artigianoBase, ...updateData };

            pool.query.mockResolvedValueOnce({ rows: [artigianoBase] }); // Mock per SELECT
            pool.query.mockResolvedValueOnce({ rows: [expectedUpdatedUser] }); // Mock per UPDATE

            const res = await request(app)
                .put(`/api/users/${artigianoBase.idutente}`)
                .send(updateData);

            expect(res.statusCode).toBe(200);
            expect(res.body).toMatchObject({
                idutente: artigianoBase.idutente,
                username: updateData.username,
                nome: updateData.nome,
                piva: updateData.piva,
                artigianodescrizione: updateData.artigianodescrizione,
                tipologia: artigianoBase.tipologia
            });
            expect(res.body).not.toHaveProperty('password');
        });

        test('Aggiorna utente Cliente parzialmente, mantenendo i valori esistenti per campi non forniti', async () => {
            const updateData = { nome: 'Nuovo Nome Cliente' };
            // username, email, etc., dovrebbero rimanere quelli di clienteBase
            const expectedUpdatedUser = { ...clienteBase, nome: updateData.nome };

            pool.query.mockResolvedValueOnce({ rows: [clienteBase] });
            pool.query.mockResolvedValueOnce({ rows: [expectedUpdatedUser] });

            const res = await request(app)
                .put(`/api/users/${clienteBase.idutente}`)
                .send(updateData);

            expect(res.statusCode).toBe(200);
            expect(res.body).toMatchObject({
                idutente: clienteBase.idutente,
                username: clienteBase.username, // Mantenuto
                nome: updateData.nome,         // Aggiornato
                email: clienteBase.email,       // Mantenuto
                tipologia: clienteBase.tipologia
            });
        });

        test('Aggiorna utente Artigiano parzialmente, mantenendo i valori esistenti per campi non forniti', async () => {
            const updateData = { nome: 'Nuovo Nome Artigiano' };
            // piva e artigianodescrizione dovrebbero rimanere quelli di artigianoBase
            // ATTENZIONE: questo test potrebbe fallire con la logica attuale di userRoutes.js se non corretta (vedi suggerimento)
            const expectedUpdatedUser = {
                ...artigianoBase,
                nome: updateData.nome
            };

            pool.query.mockResolvedValueOnce({ rows: [artigianoBase] });
            pool.query.mockResolvedValueOnce({ rows: [expectedUpdatedUser] });

            const res = await request(app)
                .put(`/api/users/${artigianoBase.idutente}`)
                .send(updateData);

            expect(res.statusCode).toBe(200);
            expect(res.body).toMatchObject({
                idutente: artigianoBase.idutente,
                username: artigianoBase.username, // Mantenuto
                nome: updateData.nome,           // Aggiornato
                piva: artigianoBase.piva,         // Mantenuto
                artigianodescrizione: artigianoBase.artigianodescrizione, // Mantenuto
                tipologia: artigianoBase.tipologia
            });
        });

        test('Non modifica la tipologia utente anche se fornita nel payload, ma aggiorna gli altri campi', async () => {
            const updateData = {
                nome: 'Nome Cambiato Tentando Tipologia',
                tipologia: 'Admin' // Tentativo di cambiare tipologia
            };
            // La tipologia deve rimanere 'Cliente'
            const expectedUpdatedUser = { ...clienteBase, nome: updateData.nome };


            pool.query.mockResolvedValueOnce({ rows: [clienteBase] });
            pool.query.mockResolvedValueOnce({ rows: [expectedUpdatedUser] });

            const res = await request(app)
                .put(`/api/users/${clienteBase.idutente}`)
                .send(updateData);

            expect(res.statusCode).toBe(200);
            expect(res.body.nome).toBe(updateData.nome);
            expect(res.body.tipologia).toBe(clienteBase.tipologia); // Cruciale: la tipologia non è cambiata
        });

        test('Errore 403 se si tenta di aggiornare un utente Admin', async () => {
            // Questo test presuppone che l'aggiornamento degli admin sia vietato.
            // Se la logica attuale permette l'aggiornamento, questo test fallirà,
            // indicando una discrepanza con il comportamento desiderato.
            const updateData = { nome: 'Nuovo Nome Admin' };

            pool.query.mockResolvedValueOnce({ rows: [adminBase] }); // Simula il fetch dell'admin

            const res = await request(app)
                .put(`/api/users/${adminBase.idutente}`)
                .send(updateData);

            expect(res.statusCode).toBe(403);
            // Il messaggio potrebbe variare a seconda dell'implementazione effettiva del blocco 403
            expect(res.body).toHaveProperty('message', 'Non puoi modificare un utente Admin.');
        });


        test('Errore 404 se utente da aggiornare non esiste', async () => {
            pool.query.mockResolvedValueOnce({ rows: [] }); // Utente non trovato

            const res = await request(app)
                .put(`/api/users/999999`) // ID non esistente
                .send({ username: 'anyupdate' });

            expect(res.statusCode).toBe(404);
            expect(res.body).toHaveProperty('message', 'Utente non trovato per l aggiornamento.');
        });

        test('Errore 400 se username o email sono forniti come stringhe vuote durante l aggiornamento', async () => {
            pool.query.mockResolvedValueOnce({ rows: [clienteBase] }); // Utente esiste

            const res = await request(app)
                .put(`/api/users/${clienteBase.idutente}`)
                .send({ username: '' }); // Username vuoto

            expect(res.statusCode).toBe(400);
            expect(res.body).toHaveProperty('message', 'Username ed Email non possono essere vuoti.');
        });
        
        test('Errore 400 se PIVA o ArtigianoDescrizione sono resi vuoti per un Artigiano durante l aggiornamento', async () => {
            pool.query.mockResolvedValueOnce({ rows: [artigianoBase] }); // Artigiano esiste

            const resPivaVuota = await request(app)
                .put(`/api/users/${artigianoBase.idutente}`)
                .send({ piva: '' });

            expect(resPivaVuota.statusCode).toBe(400);
            expect(resPivaVuota.body).toHaveProperty('message', 'Per la tipologia "Artigiano", PIVA e ArtigianoDescrizione sono obbligatori.');

            pool.query.mockResolvedValueOnce({ rows: [artigianoBase] }); // Mock di nuovo per il prossimo caso
            const resDescrizioneNulla = await request(app)
                .put(`/api/users/${artigianoBase.idutente}`)
                .send({ artigianodescrizione: '' });

            expect(resDescrizioneNulla.statusCode).toBe(400);
            expect(resDescrizioneNulla.body).toHaveProperty('message', 'Per la tipologia "Artigiano", PIVA e ArtigianoDescrizione sono obbligatori.');
        });
        
        
        test('Errore 409 se l aggiornamento causa un conflitto di username/email', async () => {
            pool.query.mockResolvedValueOnce({ rows: [clienteBase] }); // Utente da aggiornare esiste
            // Mock per l'operazione di UPDATE che fallisce per unique constraint
            pool.query.mockImplementationOnce(() => {
                throw { code: '23505' };
            });

            const res = await request(app)
                .put(`/api/users/${clienteBase.idutente}`)
                .send({ username: 'existinguser' }); // Username che si assume esista già

            expect(res.statusCode).toBe(409);
            expect(res.body).toHaveProperty('message', 'Username o Email già esistente.');
        });
        
    });

    // TEST DELETE
    describe('DELETE /api/users/:id', () => {
        
        test('Elimina utente correttamente', async () => {
            pool.query.mockResolvedValueOnce({ rows: [{ tipologia: 'Cliente' }] })
                .mockResolvedValueOnce({ rows: [{}] }); // Mock per l'operazione di delete

            const res = await request(app).delete('/api/users/1');

            expect(res.statusCode).toBe(200);
            expect(res.body).toHaveProperty('message', 'Utente con ID 1 eliminato.');
        });
        
        test('Errore 404 se utente da eliminare non esiste', async () => {
            pool.query.mockResolvedValueOnce({ rows: [] }); // Utente non trovato

            const res = await request(app).delete('/api/users/99999'); // ID non esistente

            expect(res.statusCode).toBe(404);
            expect(res.body).toHaveProperty('message', 'Utente non trovato per l eliminazione.');
        });
        
        test('Errore 403 se tentativo di eliminare un Admin', async () => {
            pool.query.mockResolvedValueOnce({ rows: [{ tipologia: 'Admin' }] }); // Simula fetch di un admin

            const res = await request(app).delete('/api/users/1');

            expect(res.statusCode).toBe(403);
            expect(res.body).toHaveProperty('message', 'Non puoi eliminare un utente Admin.');
        });
        
    });
});
