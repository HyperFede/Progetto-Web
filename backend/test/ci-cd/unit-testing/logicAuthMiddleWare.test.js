// Definisce e imposta il mock JWT_SECRET all'inizio del file, PRIMA che qualsiasi modulo dell'applicazione venga importato.
// Questo è cruciale perché il middleware authMiddleWare legge process.env.JWT_SECRET al momento del caricamento.
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });

const mockJwtSecret = 'test_secret';
process.env.JWT_SECRET = mockJwtSecret; // Imposta la variabile d'ambiente per il middleware PRIMA che venga caricato.
// Mock delle dipendenze esterne.
// 'jsonwebtoken' viene mockato per controllare il comportamento della verifica e della firma dei token.
jest.mock('jsonwebtoken');
// '../../../src/config/db-connect' viene mockato per simulare le interazioni con il database senza effettuare query reali.
// Mock database connection
jest.mock('../../../src/config/db-connect', () => ({
    query: jest.fn(),
    connect: jest.fn(() => ({ // Mock connect to return an object
        query: jest.fn(),    // This mock client also needs a query method if it's used
        release: jest.fn(),  // Add the release method
    })),
    end: jest.fn(),
}));
const pool = require('../../../src/config/db-connect');

// Importa i moduli necessari per i test.
const jwt = require('jsonwebtoken');
const { isAuthenticated, hasPermission } = require('../../../src/middleware/authMiddleWare');


// Suite di test per i middleware di autenticazione e autorizzazione.
describe('Auth Middleware: Logic test', () => {
    let mockRequest; // Oggetto mock per la richiesta HTTP (req).
    let mockResponse; // Oggetto mock per la risposta HTTP (res).
    let nextFunction; // Funzione mock per passare al middleware successivo (next).

    // Funzione eseguita prima di ogni test (it o test).
    beforeEach(() => {
        // Inizializza mockRequest con una struttura base.
        mockRequest = {
            headers: {}, // Header della richiesta, qui verrà inserito il token di autorizzazione.
            user: null, // Campo che verrà popolato da isAuthenticated con i dati dell'utente.
            params: {}, // Inizializza params per i test di hasPermission
        };
        // Inizializza mockResponse con funzioni mock per status, json e send.
        mockResponse = {
            status: jest.fn().mockReturnThis(), // .mockReturnThis() permette di concatenare chiamate (es. res.status(400).json(...)).
            json: jest.fn(), // Mock per il metodo json della risposta.
            send: jest.fn(), // Mock per il metodo send, utile per risposte non JSON o versioni più vecchie di Express.
        };
        nextFunction = jest.fn(); // Mock per la funzione next.
        jest.spyOn(console, 'error').mockImplementation(() => {}); // Sopprime console.error durante i test per mantenere pulito l'output.
    });

    afterEach(() => {
        jest.clearAllMocks();
        console.error.mockRestore();
    });

    // Suite di test specifici per il middleware isAuthenticated.
    describe('isAuthenticated', () => {
        // Test per il caso di successo: token valido e utente esistente.
        test('should call next() and set req.user if token is valid and user exists', async () => {
            // Dati mock dell'utente che ci aspettiamo di recuperare dal database.
            const mockUser = { idutente: 1, username: 'testuser', tipologia: 'Cliente', deleted: false };
            // Imposta l'header Authorization con un token fittizio.
            mockRequest.headers.authorization = 'Bearer validtoken';
            // Configura jwt.verify per restituire un payload decodificato quando chiamato con 'validtoken'.
            jwt.verify.mockReturnValue({ user: { id: mockUser.idutente } });
            // Configura pool.query per simulare una risposta di successo dal database.
            pool.query.mockResolvedValue({ rows: [mockUser] });

            // Esegue il middleware isAuthenticated.
            await isAuthenticated(mockRequest, mockResponse, nextFunction);

            // Verifica che jwt.verify sia stato chiamato con il token e la secret corretti.
            expect(jwt.verify).toHaveBeenCalledWith('validtoken', mockJwtSecret);
            // Verifica che req.user sia stato popolato con i dati dell'utente.
            expect(mockRequest.user).toEqual(mockUser);
            // Verifica che next() sia stata chiamata una volta, indicando che il middleware ha passato il controllo.
            expect(nextFunction).toHaveBeenCalledTimes(1);
            // Verifica che res.status() non sia stata chiamata, poiché non ci sono stati errori.
            expect(mockResponse.status).not.toHaveBeenCalled();
        });

        // Test per il caso in cui l'header Authorization sia assente.
        test('should return 401 if no Authorization header is present', async () => {
            await isAuthenticated(mockRequest, mockResponse, nextFunction);
            // Verifica che la risposta abbia status 401.
            expect(mockResponse.status).toHaveBeenCalledWith(401);
            // Verifica che il corpo della risposta JSON sia corretto.
            expect(mockResponse.json).toHaveBeenCalledWith({ message: 'Accesso non autorizzato. Token mancante o malformato.' });
            // Verifica che next() non sia stata chiamata.
            expect(nextFunction).not.toHaveBeenCalled();
        });

        // Test per il caso in cui l'header Authorization non inizi con "Bearer ".
        test('should return 401 if Authorization header does not start with "Bearer "', async () => {
            mockRequest.headers.authorization = 'Invalid token';
            await isAuthenticated(mockRequest, mockResponse, nextFunction);
            expect(mockResponse.status).toHaveBeenCalledWith(401);
            expect(mockResponse.json).toHaveBeenCalledWith({ message: 'Accesso non autorizzato. Token mancante o malformato.' });
            expect(nextFunction).not.toHaveBeenCalled();
        });

        // Test per il caso in cui il token sia mancante dopo "Bearer ".
        test('should return 401 if token is missing after "Bearer "', async () => {
            mockRequest.headers.authorization = 'Bearer ';
            await isAuthenticated(mockRequest, mockResponse, nextFunction);
            expect(mockResponse.status).toHaveBeenCalledWith(401);
            // Il messaggio di errore specifico per questo caso nel middleware reale è 'Accesso non autorizzato. Token non valido.'
            expect(mockResponse.json).toHaveBeenCalledWith({ message: 'Accesso non autorizzato. Token mancante o malformato.' });
            expect(nextFunction).not.toHaveBeenCalled();
        });

        // Test per il caso in cui jwt.verify lanci un errore (es. token invalido, scaduto).
        test('should return 401 if jwt.verify throws an error (e.g., invalid token, expired)', async () => {
            mockRequest.headers.authorization = 'Bearer invalidtoken';
            // Configura jwt.verify per lanciare un errore simulato.
            jwt.verify.mockImplementation(() => {
                const err = new Error('Simulated JWT Error'); // Il messaggio può essere qualsiasi cosa.
                err.name = 'JsonWebTokenError'; // Imposta la proprietà 'name' per simulare un errore JWT specifico.
                throw err;
            });
            await isAuthenticated(mockRequest, mockResponse, nextFunction);
            expect(mockResponse.status).toHaveBeenCalledWith(401);
            // Il messaggio di errore specifico per token JWT invalidi o scaduti.
            expect(mockResponse.json).toHaveBeenCalledWith({ message: 'Accesso non autorizzato. Token non valido o scaduto.' });
            expect(nextFunction).not.toHaveBeenCalled();
        });

        // Test per il caso in cui l'utente non venga trovato nel database.
        test('should return 401 if user is not found in database', async () => {
            mockRequest.headers.authorization = 'Bearer validtoken_nouser';
            // jwt.verify restituisce un ID utente valido.
            jwt.verify.mockReturnValue({ user: { id: 999 } });
            // pool.query simula che nessun utente sia stato trovato.
            pool.query.mockResolvedValue({ rows: [] }); // No user found

            await isAuthenticated(mockRequest, mockResponse, nextFunction);

            expect(mockResponse.status).toHaveBeenCalledWith(401);
            // Messaggio per utente non trovato o non più attivo.
            expect(mockResponse.json).toHaveBeenCalledWith({ message: 'Accesso non autorizzato. Utente non più attivo.' });
            expect(nextFunction).not.toHaveBeenCalled();
        });

        // Test per il caso in cui l'utente sia trovato ma marcato come 'deleted'.
        // La query `WHERE idutente = $1 AND deleted = false` gestisce questo caso.
        // Quindi, dal punto di vista del middleware, è simile a "utente non trovato".
        test('should return 401 if user is found but marked as deleted (simulated by query returning no rows)', async () => {
            mockRequest.headers.authorization = 'Bearer validtoken_deleteduser';
            jwt.verify.mockReturnValue({ user: { id: 1 } });
            // Simula che l'utente sia 'deleted' facendo restituire zero righe dalla query.
            pool.query.mockResolvedValue({ rows: [] }); // Simulates user being deleted

            await isAuthenticated(mockRequest, mockResponse, nextFunction);

            expect(mockResponse.status).toHaveBeenCalledWith(401);
            expect(mockResponse.json).toHaveBeenCalledWith({ message: 'Accesso non autorizzato. Utente non più attivo.' });
            expect(nextFunction).not.toHaveBeenCalled();
        });

        // Test per il caso in cui la query al database fallisca.
        test('should return 500 if database query fails', async () => {
            mockRequest.headers.authorization = 'Bearer validtoken_dberror';
            jwt.verify.mockReturnValue({ user: { id: 1 } });
            // Configura pool.query per simulare un errore del database.
            pool.query.mockRejectedValue(new Error('DB error'));

            await isAuthenticated(mockRequest, mockResponse, nextFunction);

            expect(mockResponse.status).toHaveBeenCalledWith(500);
            // Messaggio di errore generico del server.
            expect(mockResponse.json).toHaveBeenCalledWith({ message: 'Errore del server durante l\'autenticazione.' });
            expect(nextFunction).not.toHaveBeenCalled();
        });
    });

    // Suite di test specifici per il middleware factory hasPermission.
    describe('hasPermission', () => {
        // Test per il caso in cui la tipologia utente sia tra quelle permesse.
        test('should call next() if user tipologia is in allowedTipologie', () => {
            // Imposta un utente mock nella richiesta.
            mockRequest.user = { idutente: 1, tipologia: 'Admin' };
            mockRequest.params = {}; // Assicura che params sia un oggetto, anche se vuoto

            // Crea il middleware di permesso specificando le tipologie consentite.
            const checkAdminPermission = hasPermission(['Admin', 'Artigiano']);
            // Esegue il middleware di permesso.
            checkAdminPermission(mockRequest, mockResponse, nextFunction);

            // Verifica che next() sia stata chiamata.
            expect(nextFunction).toHaveBeenCalledTimes(1);
            // Verifica che res.status() non sia stata chiamata.
            expect(mockResponse.status).not.toHaveBeenCalled();
        });

        // Test per il caso in cui la tipologia utente NON sia tra quelle permesse.
        test('should return 403 if user tipologia is not in allowedTipologie', () => {
            mockRequest.user = { idutente: 1, tipologia: 'Cliente' };
            const checkAdminPermission = hasPermission(['Admin', 'Artigiano']);
            checkAdminPermission(mockRequest, mockResponse, nextFunction);

            // Verifica che la risposta abbia status 403 (Forbidden).
            expect(mockResponse.status).toHaveBeenCalledWith(403);
            // Verifica il messaggio di errore.
            expect(mockResponse.json).toHaveBeenCalledWith({ message: 'Accesso negato. Non hai i permessi necessari per questa risorsa.' });
            expect(nextFunction).not.toHaveBeenCalled();
        });

        test('should return 500 if req.user is not defined', () => {
            mockRequest.user = undefined; // Simulate req.user not being set
            const checkPermission = hasPermission(['Admin']);
            checkPermission(mockRequest, mockResponse, nextFunction);

            // Verifica che la risposta abbia status 500 (Internal Server Error).
            expect(mockResponse.status).toHaveBeenCalledWith(500);
            // Verifica il messaggio di errore.
            expect(mockResponse.json).toHaveBeenCalledWith({ message: 'Errore: utente non definito nella richiesta dopo autenticazione.' });
            expect(nextFunction).not.toHaveBeenCalled();
        });

        // Test per il caso in cui req.user.tipologia non sia definita.
        test('should return 500 if req.user.tipologia is not defined', () => {
            mockRequest.user = { idutente: 1 }; // Manca la proprietà 'tipologia'.
            const checkPermission = hasPermission(['Admin']);
            checkPermission(mockRequest, mockResponse, nextFunction);

            expect(mockResponse.status).toHaveBeenCalledWith(500);
            // Il messaggio di errore è lo stesso del caso precedente, poiché la condizione nel middleware è `!req.user || !req.user.tipologia`.
            expect(mockResponse.json).toHaveBeenCalledWith({ message: 'Errore: utente non definito nella richiesta dopo autenticazione.' });
            expect(nextFunction).not.toHaveBeenCalled();
        });

        // Test per il caso in cui l'array allowedTipologie sia vuoto (nessuno è autorizzato).
        test('should handle empty allowedTipologie array correctly (no one is allowed)', () => {
            mockRequest.user = { idutente: 1, tipologia: 'Admin' };
            // Nessuna tipologia è permessa.
            const checkNoOnePermission = hasPermission([]);
            checkNoOnePermission(mockRequest, mockResponse, nextFunction);

            expect(mockResponse.status).toHaveBeenCalledWith(403);
            expect(mockResponse.json).toHaveBeenCalledWith({ message: 'Accesso negato. Non hai i permessi necessari per questa risorsa.' });
            expect(nextFunction).not.toHaveBeenCalled();
        });

        // Test per verificare la sensibilità al maiuscolo/minuscolo nel confronto delle tipologie.
        test('should be case-sensitive for tipologia matching', () => {
            mockRequest.user = { idutente: 1, tipologia: 'admin' }; // Tipologia in minuscolo.
            const checkCaseSensitivePermission = hasPermission(['Admin']); // Tipologia permessa in maiuscolo.
            checkCaseSensitivePermission(mockRequest, mockResponse, nextFunction);

            expect(mockResponse.status).toHaveBeenCalledWith(403);
            expect(mockResponse.json).toHaveBeenCalledWith({ message: 'Accesso negato. Non hai i permessi necessari per questa risorsa.' });
            expect(nextFunction).not.toHaveBeenCalled();
        });

        // Test per 'Self' permission
        describe("Self permission", () => {
            test('should call next() if "Self" is allowed and req.user.idutente matches req.params.id', () => {
                mockRequest.user = { idutente: 1, tipologia: 'Cliente' };
                mockRequest.params = { id: '1' }; // req.params.id is a string, like from Express
                const checkSelfPermission = hasPermission(['Self']);
                checkSelfPermission(mockRequest, mockResponse, nextFunction);

                expect(nextFunction).toHaveBeenCalledTimes(1);
                expect(mockResponse.status).not.toHaveBeenCalled();
            });

            test('should return 403 if "Self" is allowed but req.user.idutente does not match req.params.id', () => {
                mockRequest.user = { idutente: 1, tipologia: 'Cliente' };
                mockRequest.params = { id: '2' };
                const checkSelfPermission = hasPermission(['Self']);
                checkSelfPermission(mockRequest, mockResponse, nextFunction);

                expect(mockResponse.status).toHaveBeenCalledWith(403);
                expect(mockResponse.json).toHaveBeenCalledWith({ message: 'Accesso negato. Non hai i permessi necessari per questa risorsa.' });
                expect(nextFunction).not.toHaveBeenCalled();
            });

            test('should return 403 if "Self" is allowed but req.params.id is not a number string', () => {
                mockRequest.user = { idutente: 1, tipologia: 'Cliente' };
                mockRequest.params = { id: 'abc' }; // Not a number string
                const checkSelfPermission = hasPermission(['Self']);
                checkSelfPermission(mockRequest, mockResponse, nextFunction);

                expect(mockResponse.status).toHaveBeenCalledWith(403);
                expect(mockResponse.json).toHaveBeenCalledWith({ message: 'Accesso negato. Non hai i permessi necessari per questa risorsa.' });
                expect(nextFunction).not.toHaveBeenCalled();
            });

            test('should return 403 if "Self" is allowed but req.params.id is missing', () => {
                mockRequest.user = { idutente: 1, tipologia: 'Cliente' };
                mockRequest.params = {}; // id is missing
                const checkSelfPermission = hasPermission(['Self']);
                checkSelfPermission(mockRequest, mockResponse, nextFunction);

                expect(mockResponse.status).toHaveBeenCalledWith(403);
                expect(mockResponse.json).toHaveBeenCalledWith({ message: 'Accesso negato. Non hai i permessi necessari per questa risorsa.' });
                expect(nextFunction).not.toHaveBeenCalled();
            });
        });
    });
});
