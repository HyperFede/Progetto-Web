// Importa i moduli necessari.

const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const pool = require('../config/db-connect');
const { isAuthenticated, hasPermission, getUserFromToken} = require('../middleware/authMiddleWare'); // Importa i middleware e getUserFromToke
const{createQueryBuilderMiddleware}  =  require('../middleware/queryBuilderMiddleware'); // Importa il middleware per la query builder

// Recupera la chiave segreta per JWT dalle variabili d'ambiente.
// Anche se getUserFromToken la usa internamente, è buona prassi averla disponibile se necessario.
const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret) {
    console.error('FATAL ERROR: userRoutes.js - JWT_SECRET is not defined.');
    process.exit(1); // Termina l'applicazione se la chiave segreta non è configurata
}

// --- Operazioni CRUD per Utente ---

/**
 * @route POST /api/users
 * @description Crea un nuovo utente (Cliente o Artigiano).
 *              La creazione di utenti Admin non è permessa tramite questa API.
 * @access Public
 * 
 * Interazione Black-Box:
 *  Input: Oggetto JSON nel corpo della richiesta (req.body) con i seguenti campi:
 *      {
 *          "username": "String (obbligatorio)",
 *          "nome": "String (obbligatorio)",
 *          "cognome": "String (obbligatorio)",
 *          "email": "String (obbligatorio)",
 *          "password": "String (obbligatorio)",
 *          "indirizzo": "String (obbligatorio)",
 *          "tipologia": "String (obbligatorio, 'Cliente' o 'Artigiano')",
 *          "piva": "String (opzionale, obbligatorio se tipologia='Artigiano')",
 *          "artigianodescrizione": "String (opzionale, obbligatorio se tipologia='Artigiano')"
 *      }
 *  Output:
 *      - Successo (201 Created): Oggetto JSON con i dati dell'utente creato (esclusa la password).
 *        { "idutente": Number, "username": String, ..., "tipologia": String }
 *      - Errore (400 Bad Request): Se i campi obbligatori mancano o la tipologia non è valida,
 *                                 o se per 'Artigiano' mancano PIVA/descrizione.
 *        { "message": "Stringa di errore" }
 *      - Errore (403 Forbidden): Se si tenta di creare un utente 'Admin'.
 *        { "message": "La creazione di utenti Admin tramite API non è permessa." }
 *      - Errore (409 Conflict): Se username o email esistono già.
 *        { "message": "Username o Email già esistente." }
 *      - Errore (500 Internal Server Error): In caso di errore del server.
 *        { "message": "Errore del server durante la creazione dell utente." }
 */
router.post('/', async (req, res) => {
    // Estrae i dati dal corpo della richiesta.
    let { username, nome, cognome, email, password, indirizzo, tipologia, piva, artigianodescrizione } = req.body;
    // controllo campi vuoti
    if (!username || !email || !password || !tipologia || !indirizzo || !nome || !cognome) {
        return res.status(400).json({ message: 'Username, Nome,Cognome, Email, Password, Indirizzo,Tipologia, sono campi obbligatori.' });
    }

    // Impedisce la creazione di utenti Admin tramite API
    if (tipologia === 'Admin') {
        return res.status(403).json({ message: 'La creazione di utenti Admin tramite API non è permessa.' });
    }

    //Logica per separare una creazione di un utente "Artigiano" o "Cliente" coi suoi campi specifici
    let pivaValue = null;
    let artigianoDescrizioneValue = null;

    if (tipologia === 'Artigiano') {
        if (piva === null || artigianodescrizione === null || piva === '' || artigianodescrizione === '' || !piva || !artigianodescrizione || piva === undefined || artigianodescrizione === undefined) {
            return res.status(400).json({ message: 'Per la tipologia "Artigiano", PIVA e ArtigianoDescrizione sono obbligatori.' });
        }
        pivaValue = piva;
        artigianoDescrizioneValue = artigianodescrizione;
    } else if (tipologia === 'Cliente') {

        // Per la tipologia "Cliente", PIVA e ArtigianoDescrizione devono essere impostati a null come da vincolo DB
        pivaValue = null;
        artigianoDescrizioneValue = null;
    }
    else {
        // Se la tipologia non è valida, restituisci un errore
        return res.status(400).json({ message: 'Tipologia non valida. Deve essere "Cliente", "Artigiano" o "Admin".' });
    }

    try {
        // Hash della password prima di salvarla nel DB (non cambiare parametro che i dati di test sono hashati su questo peso )
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);
        //inserimento nel DB
        const newUser = await pool.query(
            'INSERT INTO utente (username, nome, cognome, email, password, indirizzo, tipologia, piva, artigianodescrizione) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *',
            [username, nome, cognome, email, hashedPassword, indirizzo, tipologia, pivaValue, artigianoDescrizioneValue]
        );
        //preparazione della risposta, escludendo la password importante per la sicurezza
        const userResponse = { ...newUser.rows[0] };
        delete userResponse.password;
        res.status(201).json(userResponse);

    } catch (error) {
       // console.error('Errore nella creazione dell utente:', error);
        // errore di postgres, che corrisponde a un conflitto di chiavi uniche
        if (error.code === '23505') {
            return res.status(409).json({ message: 'Username o Email già esistente.' });
        }
        res.status(500).json({ message: 'Errore del server durante la creazione dell utente.' });
    }
});


/**
 * @route GET /api/users
 * @description Recupera tutti gli utenti (inclusi quelli marcati come 'deleted').
 *              La password non viene restituita.
 * @access Tipicamente Admin
 * 
 * Interazione Black-Box:
 *  Input: Query parameters opzionali per filtri e ordinamento. Esempi:
 *      - `?tipologia=Cliente`
 *      - `?username_like=test`
 *      - `?deleted=true`
 *      - `?sort=email&order=desc`
 *  Output:
 *      - Successo (200 OK): Array JSON di oggetti utente.
 *        [ { "idutente": Number, "username": String, ..., "deleted": Boolean }, ... ]
 *      - Errore (500 Internal Server Error): In caso di errore del server.
 *        { "message": "Errore del server durante il recupero degli utenti." }
 */

const userQueryConfig = {
    allowedFilters: [
        { queryParam: 'tipologia', dbColumn: 'tipologia', type: 'exact', dataType: 'string' },
        { queryParam: 'username_like', dbColumn: 'username', type: 'like', dataType: 'string' },
        { queryParam: 'email_like', dbColumn: 'email', type: 'like', dataType: 'string' },
        { queryParam: 'deleted', dbColumn: 'deleted', type: 'boolean', dataType: 'boolean' }
    ],
    allowedSortFields: ['idutente', 'username', 'nome', 'cognome', 'email', 'tipologia', 'deleted'],
    defaultSortField: 'idutente',
    defaultSortOrder: 'ASC'
};

router.get('/', 
    isAuthenticated, 
    hasPermission(['Admin']), 
    createQueryBuilderMiddleware(userQueryConfig), // No baseWhereClause, Admin sees all by default
    async (req, res) => {
    try {
        const queryText = `SELECT idutente, username, nome, cognome, email,indirizzo, tipologia, piva, artigianodescrizione, admintimestampcreazione, deleted FROM utente ${req.sqlWhereClause} ${req.sqlOrderByClause}`;
        const allUsers = await pool.query(queryText, req.sqlQueryValues);
        res.status(200).json(allUsers.rows);
    } catch (error) {
       // console.error('Errore nel recuperare gli utenti:', error);
        res.status(500).json({ message: 'Errore del server durante il recupero degli utenti.' });
    }
});

/**
 * @route GET /api/users/notdeleted
 * @description Recupera tutti gli utenti attivi (non marcati come 'deleted').
 *              La password non viene restituita.
 * @access Tipicamente Admin o per scopi specifici di frontend.
 *         (Attualmente limitato ad Admin, come la rotta GET /)
 * 
 * Interazione Black-Box:
 *  Input: Query parameters opzionali per filtri e ordinamento (esclusi filtri su 'deleted').
 *  Output:
 *      - Successo (200 OK): Array JSON di oggetti utente attivi.
 *        [ { "idutente": Number, "username": String, ..., "deleted": false }, ... ]
 *      - Errore (500 Internal Server Error): In caso di errore del server.
 *        { "message": "Errore del server durante il recupero degli utenti." }
 */
router.get('/notdeleted', 
    isAuthenticated, 
    hasPermission(['Admin']), 
    createQueryBuilderMiddleware({ 
        ...userQueryConfig, 
        allowedFilters: userQueryConfig.allowedFilters.filter(f => f.queryParam !== 'deleted'), // Rimuovi il filtro 'deleted'
        baseWhereClause: 'deleted = FALSE' 
    }),
    async (req, res) => {
    try {
        const queryText = `SELECT idutente, username, nome, cognome, email, indirizzo, tipologia, piva, artigianodescrizione, admintimestampcreazione,deleted FROM utente ${req.sqlWhereClause} ${req.sqlOrderByClause}`;
        const allUsers = await pool.query(queryText, req.sqlQueryValues);
        res.status(200).json(allUsers.rows);
    } catch (error) {
        //console.error('Errore nel recuperare gli utenti:', error);
        res.status(500).json({ message: 'Errore del server durante il recupero degli utenti.' });
    }
});

/** ROTTA SOLO PER TEST
 * api/users/test-protected-route
 * @description Rotta di test per verificare il middleware di autenticazione e autorizzazione.
 *             Richiede che l'utente sia autenticato e abbia i permessi 'Admin' o 'Artigiano'.
 *            Restituisce un messaggio di successo.
 * @access Protetta (richiede autenticazione e permessi).
 * 
 * Interazione Black-Box:
 * Input:
 *      - Header HTTP `Authorization`: Stringa nel formato "Bearer <token_jwt>" (necessario per il middleware `isAuthenticated`).
 *        Esempio: `Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`
 * Output:
 *      - Successo (200 OK): Oggetto JSON con messaggio di successo e dati dell'utente.
 *       { "message": "Accesso consentito alla rotta protetta, <username>!", "user": { "idutente": Number, "tipologia": String } }
 *      - Errore (401 Unauthorized): Se il token JWT è mancante, malformato, invalido o scaduto (gestito da `isAuthenticated`).
 *        { "message": "Stringa di errore relativa all'autenticazione" }
 *      - Errore (403 Forbidden): Se l'utente autenticato non ha la tipologia 'Admin' o 'Artigiano' (gestito da `hasPermission`).
 *        { "message": "Accesso negato. Non hai i permessi necessari per questa risorsa." }
 */


/**
 * @route GET /api/users/:id
 * @description Recupera un singolo utente tramite il suo ID.
 *              La logica di accesso è complessa e dipende dalla tipologia dell'utente target
 *              e dalla tipologia (e autenticazione) dell'utente che effettua la richiesta.
 *              La password non viene mai restituita.
 * @access Condizionale (vedi regole sotto)
 * 
 * Interazione Black-Box:
 *  Input: Parametro di rotta `id`: ID numerico dell'utente.
 *  Output:
 *      - Successo (200 OK): Oggetto JSON con i dati dell'utente (campi variano in base ai permessi).
 *      - Errore (400 Bad Request): ID utente non valido.
 *      - Errore (401 Unauthorized): Token mancante/invalido quando richiesto per accedere a profili non-Artigiano.
 *      - Errore (403 Forbidden): Accesso negato per la combinazione utente/risorsa.
 *      - Errore (404 Not Found): Utente non trovato o eliminato (a meno che il visualizzatore non sia Admin).
 *      - Errore (500 Internal Server Error): Errore generico del server.
 */
router.get('/:id', async (req, res) => {
    const targetId = parseInt(req.params.id, 10); // ID dell'utente il cui profilo si vuole visualizzare

    if (isNaN(targetId)) {
        return res.status(400).json({ message: 'ID utente non valido.' });
    }

    try {
        // Fetch target user - recuperiamo sempre l'utente, anche se 'deleted',
        // la logica successiva deciderà se mostrarlo.
        const targetUserQuery = await pool.query(
            'SELECT idutente, username, nome, cognome, email, indirizzo, tipologia, piva, artigianodescrizione, admintimestampcreazione, deleted FROM utente WHERE idutente = $1',
            [targetId]
        );

        if (targetUserQuery.rows.length === 0) {
            return res.status(404).json({ message: 'Utente non trovato.' });
        }
        const targetUser = targetUserQuery.rows[0];

        // Tenta di identificare l'utente autenticato (se presente) usando il nostro helper
        let authenticatedUser = null;
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            const token = authHeader.split(' ')[1];
            if (token) {
                try {
                    authenticatedUser = await getUserFromToken(token);
                    // getUserFromToken già gestisce il caso di utente 'deleted = true' restituendo null
                } catch (jwtError) {
                    // Se getUserFromToken lancia un errore JWT (es. scaduto),
                    // authenticatedUser rimarrà null. La logica successiva gestirà questo.
                    // Se l'accesso richiede autenticazione e il token è scaduto,
                    // la condizione !authenticatedUser più avanti restituirà 401.
                    // console.warn('[userRoutes GET /:id] JWT verification error:', jwtError.name); // Opzionale per debug
                }
            }
        }

        // Regola: Admin può accedere a ogni ID possibile, anche se 'deleted'
        if (authenticatedUser && authenticatedUser.tipologia === 'Admin') {
            const { password, ...userToSend } = targetUser; // Escludi password
            return res.status(200).json(userToSend); //NOSONAR
        }

        // Se non è un Admin a guardare, e l'utente target è 'deleted', allora è 404
        if (targetUser.deleted) {
            return res.status(404).json({ message: 'Utente non trovato.' });
        }

        // Regola: Artigiano, Cliente, e non loggato possono accedere a ogni Artigiano (non eliminato)
        if (targetUser.tipologia === 'Artigiano') {
            // Per ora, restituiamo tutti i campi tranne la password per semplicità.
            // Si potrebbe definire un set di campi "pubblici" per l'Artigiano qui.
            const { password, ...userToSend } = targetUser;
            return res.status(200).json(userToSend); //NOSONAR
        }

        // A questo punto, targetUser NON è Artigiano (quindi è Cliente o Admin)
        // E il visualizzatore NON è Admin.
        // L'autenticazione è OBBLIGATORIA.
        if (!authenticatedUser) {
            // Questo cattura sia il caso di token non fornito, sia token invalido/scaduto
            // (perché authenticatedUser sarebbe null), sia utente del token non attivo.
            return res.status(401).json({ message: 'Autenticazione richiesta per visualizzare questo profilo.' });
        }

        // Regola: Cliente può accedere a se stesso
        if (authenticatedUser.tipologia === 'Cliente' && authenticatedUser.idutente === targetUser.idutente) {
            const { password, ...userToSend } = targetUser;
            return res.status(200).json(userToSend); //NOSONAR
        }

        // Tutti gli altri casi sono proibiti
        // (es. Cliente che cerca di vedere un altro Cliente o un Admin; Artigiano che cerca di vedere un Cliente o un Admin)
        return res.status(403).json({ message: 'Accesso negato. Non hai i permessi necessari per visualizzare questo utente.' });

    } catch (error) {
        console.error(`Errore nel recuperare l'utente con ID ${targetId}:`, error);
        // Se l'errore è un errore JWT che è stato rilanciato da getUserFromToken
        // (anche se getUserFromToken ora gestisce la maggior parte dei casi restituendo null)
        if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
             return res.status(401).json({ message: 'Accesso non autorizzato. Token fornito non valido o scaduto.' });
        }
        return res.status(500).json({ message: 'Errore del server durante il recupero dell utente.' });
    }
});

/**
 * @route PUT /api/users/:id
 * @description Aggiorna i dati di un utente esistente.
 *              Non permette la modifica della password o della tipologia.
 *              Non permette la modifica di utenti Admin.
 * @access Tipicamente Admin o l'utente stesso.
 * 
 * Interazione Black-Box:
 *  Input:
 *      - Parametro di rotta `id`: ID numerico dell'utente da aggiornare.
 *      - Corpo della richiesta (req.body): Oggetto JSON con i campi da aggiornare.
 *        {
 *          "username": "String (opzionale)",
 *          "nome": "String (opzionale)",
 *          "cognome": "String (opzionale)",
 *          "email": "String (opzionale)",
 *          "indirizzo": "String (opzionale)",
 *          "piva": "String (opzionale, rilevante per Artigiano)",
 *          "artigianodescrizione": "String (opzionale, rilevante per Artigiano)"
 *        }
 *  Output:
 *      - Successo (200 OK): Oggetto JSON con i dati dell'utente aggiornato.
 *        { "idutente": Number, "username": String, ... }
 *      - Errore (400 Bad Request): Se username/email sono vuoti, o se PIVA/descrizione sono vuoti per un Artigiano.
 *        { "message": "Stringa di errore" }
 *      - Errore (403 Forbidden): Se si tenta di modificare un utente Admin.
 *        { "message": "Non puoi modificare un utente Admin." }
 *      - Errore (404 Not Found): Se l'utente da aggiornare non esiste.
 *        { "message": "Utente non trovato per l aggiornamento." }
 *      - Errore (409 Conflict): Se l'aggiornamento causa un conflitto di username o email.
 *        { "message": "Username o Email già esistente." }
 *      - Errore (500 Internal Server Error): In caso di errore del server.
 *        { "message": "Errore del server durante l aggiornamento dell utente." }
 */
router.put('/:id', isAuthenticated, hasPermission(['Admin', 'Self']), async (req, res) => {
    //Id dell'utente da aggiornare
    const { id } = req.params;
    //Dati dell'utente da aggiornare (non includiamo password e tipologia)
    const { username, nome, cognome, email, indirizzo, piva, artigianodescrizione } = req.body;
    const actor = req.user; // utente che effettua la richiesta
    try {
        const currentUserQuery = await pool.query('SELECT * FROM utente WHERE idutente = $1', [id]);
        if (currentUserQuery.rows.length === 0) {
            return res.status(404).json({ message: 'Utente non trovato per l aggiornamento.' });
        }
        const currentUser = currentUserQuery.rows[0];

        const finalUsername = username || currentUser.username;
        const finalNome = nome || currentUser.nome;
        const finalCognome = cognome || currentUser.cognome;
        const finalEmail = email || currentUser.email;
        const finalIndirizzo = indirizzo || currentUser.indirizzo;
        const finalTipologia = currentUser.tipologia; //la tipologia non può essere cambiata

        //NOTA BENE, anche se questa route ha il permesso di tipo: Self, per assunzione non possiamo modificare altri admin (per ora)
        if (currentUser.tipologia === 'Admin') {
            return res.status(403).json({ message: 'Non puoi modificare un utente Admin.' });
        }

        if (username === '' || email === '' || username === null || email === null) {
            return res.status(400).json({ message: 'Username ed Email non possono essere vuoti.' });
        }
        // Dichiarare finalPiva e finalArtigianoDescrizione qui per renderli disponibili alla query SQL
        let finalPiva;
        let finalArtigianoDescrizione;

        // Se artigiano, controlla i campi specifici
        // Verranno sovrascritti solo se i campi corrispondenti sono presenti nel corpo della richiesta.
        

        if (finalTipologia === 'Artigiano') {
            // Se piva è fornito nel corpo della richiesta (req.body), usa quel valore.
            // Altrimenti (piva === undefined), usa il valore corrente dal database.
            if (piva !== undefined) {
                finalPiva = piva;
            } else {
                finalPiva = currentUser.piva;
            }

            // Se artigianodescrizione è fornito nel corpo della richiesta (req.body), usa quel valore.
            // Altrimenti (artigianodescrizione === undefined), usa il valore corrente dal database.
            if (artigianodescrizione !== undefined) {
                finalArtigianoDescrizione = artigianodescrizione;
            } else {
                finalArtigianoDescrizione = currentUser.artigianodescrizione;
            }

            // Validazione: PIVA e ArtigianoDescrizione non possono essere stringhe vuote o null per un Artigiano.
            if (finalPiva === '' || finalPiva === null || finalArtigianoDescrizione === '' || finalArtigianoDescrizione === null) {
                return res.status(400).json({ message: 'Per la tipologia "Artigiano", PIVA e ArtigianoDescrizione sono obbligatori.' });
            }
        } else if (finalTipologia === 'Cliente') {
            // Per i Clienti, PIVA e descrizione sono sempre null.
            finalPiva = null;
            finalArtigianoDescrizione = null;
        }
        // Esegue l'aggiornamento nel database.
        const updatedUser = await pool.query(
            'UPDATE utente SET username = $1, nome = $2, cognome = $3, email = $4, indirizzo = $5, piva = $6, artigianodescrizione = $7 WHERE idutente = $8 RETURNING idutente, username, nome, cognome, email, indirizzo, tipologia, piva, artigianodescrizione',
            [finalUsername, finalNome, finalCognome, finalEmail, finalIndirizzo, finalPiva, finalArtigianoDescrizione, id]
        );
        // Restituisce i dati dell'utente aggiornato.
        res.status(200).json(updatedUser.rows[0]);
    } catch (error) {
        console.error(`Errore nell'aggiornare l'utente con ID ${id}:`, error);
        if (error.code === '23505') {
            return res.status(409).json({ message: 'Username o Email già esistente.' });
        }
        res.status(500).json({ message: 'Errore del server durante l aggiornamento dell utente.' });
    }
});

/**
 * @route DELETE /api/users/:id
 * @description Esegue una "soft delete" di un utente, impostando il campo 'deleted' a true.
 *              Non permette l'eliminazione di utenti Admin.
 * @access Tipicamente Admin, e Self.
 * 
 * Interazione Black-Box:
 *  Input:
 *      - Parametro di rotta `id`: ID numerico dell'utente da eliminare.
 *  Output:
 *      - Successo (200 OK): Messaggio di conferma.
 *        { "message": "Utente con ID X eliminato." }
 *      - Errore (403 Forbidden): Se si tenta di eliminare un utente Admin.
 *        { "message": "Non puoi eliminare un utente Admin." }
 *      - Errore (404 Not Found): Se l'utente da eliminare non esiste.
 *        { "message": "Utente non trovato per l eliminazione." }
 *      - Errore (500 Internal Server Error): In caso di errore del server.
 *        { "message": "Errore del server durante l eliminazione dell utente." }
 */
router.delete('/:id', isAuthenticated,hasPermission (["Admin", "Self"]), async (req, res) => {
    const { id } = req.params;
    try {
        const userQuery = await pool.query('SELECT tipologia FROM utente WHERE idutente = $1', [id]);
        
        if (userQuery.rows.length === 0) {
            return res.status(404).json({ message: 'Utente non trovato per l eliminazione.' });
        }
        //Ulteriore controllo per evitare di eliminare un admin, anche se il permesso è Self
        if (userQuery.rows[0].tipologia === 'Admin') {
            return res.status(403).json({ message: 'Non puoi eliminare un utente Admin.' });
        }

        await pool.query('UPDATE utente SET deleted = true WHERE idutente = $1', [id]);
        res.status(200).json({ message: `Utente con ID ${id} eliminato.` });
    } catch (error) {
        console.error(`Errore nell'eliminare l'utente con ID ${id}:`, error);
        res.status(500).json({ message: 'Errore del server durante l eliminazione dell utente.' });
    }
});

module.exports = router;