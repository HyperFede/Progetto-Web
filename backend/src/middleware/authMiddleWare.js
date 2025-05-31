// Importa il pool di connessioni al database PostgreSQL.
const pool = require('../config/db-connect');

// Importa la libreria jsonwebtoken per la gestione dei JWT.
const jwt = require('jsonwebtoken');

// Recupera la chiave segreta per JWT dalle variabili d'ambiente.
const jwtSecret = process.env.JWT_SECRET;

// Controllo critico: se JWT_SECRET non è definito, l'applicazione non può funzionare in modo sicuro.
// Stampa un errore fatale e termina il processo.
if (!jwtSecret) {
    console.error('FATAL ERROR: JWT_SECRET is not defined.');
    process.exit(1); // Termina l'applicazione se la chiave segreta non è configurata
}

/**
 * Funzione helper per recuperare un utente attivo basato su un token JWT.
 * Non invia risposte HTTP direttamente, ma restituisce l'utente o null/error.
 * @param {string} token - Il token JWT da verificare.
 * @returns {Promise<Object|null>} L'oggetto utente se il token è valido e l'utente è attivo,
 *                                  altrimenti null. Può lanciare errori JWT.
 * @throws {Error} Lancia errori specifici di JWT (JsonWebTokenError, TokenExpiredError) se la verifica fallisce.
 */
async function getUserFromToken(token) {
    if (!token) {
        return null;
    }
    try {
        const decoded = jwt.verify(token, jwtSecret);
        const userId = decoded.user.id;

        const userQuery = await pool.query(
            'SELECT idutente, username, nome, cognome, email, tipologia, deleted FROM utente WHERE idutente = $1 AND deleted = false',
            [userId]
        );

        if (userQuery.rows.length === 0) {
            return null; // Utente non trovato o non attivo
        }
        return userQuery.rows[0]; // Restituisce l'utente
    } catch (error) {
        // Se l'errore è un errore JWT (es. scaduto, malformato), lo rilanciamo
        // così il chiamante può gestirlo specificamente se necessario.
        if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError' || error.name === 'NotBeforeError') {
            throw error;
        }
        console.error('[getUserFromToken] Errore imprevisto durante la verifica del token o query DB:', error);
        throw error; // Rilancia altri errori (es. DB non raggiungibile, verranno gestiti dal chiamante)
    }
}


/**
 * Middleware per verificare l'autenticazione di un utente tramite JWT.
 * Questo middleware intercetta una richiesta HTTP.
 * Input:
 *  - Header 'Authorization': deve contenere un token JWT nel formato 'Bearer <token>'.
 * Output:
 *  - Se l'autenticazione ha successo:
 *    - Popola `req.user` con i dati dell'utente recuperati dal database.
 *    - Chiama `next()` per passare il controllo al middleware o al gestore della rotta successivo.
 *  - Se l'autenticazione fallisce:
 *    - Restituisce una risposta JSON con status HTTP 401 (Unauthorized) o 500 (Internal Server Error)
 *      e un messaggio di errore appropriato.
 *      Esempi di messaggi di errore:
 *      { message: 'Accesso non autorizzato. Token mancante o malformato.' }
 *      { message: 'Accesso non autorizzato. Token non valido.' }
 *      { message: 'Accesso non autorizzato. Token non valido o scaduto.' }
 *      { message: 'Accesso non autorizzato. Utente non più attivo.' }
 *      { message: 'Errore del server durante l'autenticazione.' }
 */
async function isAuthenticated(req, res, next) {
    let token = null;
    const authHeader = req.headers.authorization; // Estrae l'header Authorization dalla richiesta.

    // 1. Prova a ottenere il token dall'header Authorization
    if (authHeader && authHeader.startsWith('Bearer ')) {
        const parts = authHeader.split(' ');
        if (parts.length === 2 && parts[1]) {
            token = parts[1];
        }
    }

    // 2. Se non trovato nell'header, prova a ottenerlo dal cookie HttpOnly
    if (!token && req.cookies && req.cookies.accessToken) {
        token = req.cookies.accessToken;
    }

    // Se il token non è stato trovato né nell'header né nel cookie, o è malformato
    if (!token) {
        return res.status(401).json({ message: 'Accesso non autorizzato. Token mancante o malformato.' });
    }
    try {
        const user = await getUserFromToken(token);

        if (!user) {
            // getUserFromToken restituisce null se il token è invalido, l'utente non esiste o è inattivo.
            // Qui potremmo distinguere l'errore se getUserFromToken lanciasse errori specifici
            // e non li gestisse internamente con un return null.
            // Per ora, un errore generico di token/utente non valido.
            // Se getUserFromToken lancia un errore JWT, verrà catturato dal catch sottostante.
            return res.status(401).json({ message: 'Accesso non autorizzato. Utente non più attivo.' });
        }

        // Aggiunge l'oggetto utente (recuperato dal database) all'oggetto `req`.
        // Questo rende i dati dell'utente disponibili ai middleware successivi e ai gestori delle rotte.
        req.user = user;

        // Passa il controllo al middleware successivo nella catena o al gestore della rotta.
        next();
    } catch (error) {
        // --- DEBUGGING BLOCK FOR EXPIRED TOKEN TEST ---
        if (process.env.NODE_ENV === 'test') {
            console.log('[AUTH_MIDDLEWARE_DEBUG] Error during jwt.verify:', error.name, error.message);
        }
        // --- END DEBUGGING BLOCK ---

        // Gestisce gli errori che possono verificarsi durante la verifica del token o la query al database.
        if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError' || error.name === 'NotBeforeError') {
            // Gestisce errori specifici della libreria JWT (token malformato, scaduto, non ancora attivo).
            // console.error('Errore verifica JWT:', error.message); // Original log, can be noisy
            return res.status(401).json({ message: 'Accesso non autorizzato. Token non valido o scaduto.' });
        }
        // Per tutti gli altri errori (es. errori di database non gestiti specificamente)
        // console.error('Errore nel middleware di autenticazione (non JWT):', error); // Original log
        return res.status(500).json({ message: 'Errore del server durante l\'autenticazione.' });
    }
}

/**
 * Middleware Factory per creare un middleware di autorizzazione basato sulla tipologia dell'utente oppure sull'ID della risorsa..
 * Questo factory restituisce una funzione middleware.
 * Input (per il factory):
 *  - `requiredPermissions`: Un array di stringhe che rappresentano i permessi richiesti. Possono essere tipologie di utente ('Admin', 'Cliente', 'Artigiano') o la parola chiave speciale 'Self'.
 *    La parola chiave 'Self' concede l'accesso se l'ID dell'utente autenticato (`req.user.idutente`)
 *    corrisponde all'ID specificato nel parametro di rotta `:id` (`req.params.id`).
 *
 *
 *
 * Comportamento del middleware generato:
 *  - Presuppone che il middleware `isAuthenticated` sia stato eseguito prima e che `req.user`
 *    e `req.user.tipologia` siano popolati.
 *   - L'accesso è consentito se l'utente soddisfa *almeno uno* dei permessi richiesti
 *  - Input (per il middleware generato):
 *    - `req.user`: L'oggetto utente autenticato (popolato da `isAuthenticated`).
 *    - `req.params.id`: Il parametro 'id' dalla rotta (se presente).
 * 
 *  - Output (del middleware generato):
 *      - Se l'utente soddisfa almeno uno dei permessi richiesti:
 *      - Chiama `next()` per passare il controllo.
 *    - Altrimenti (l'utente non soddisfa nessuno dei permessi richiesti):
 *      - Restituisce una risposta JSON con status HTTP 403 (Forbidden) e messaggio:
 *        { message: 'Accesso negato. Non hai i permessi necessari per questa risorsa.' }
 *    - Se `req.user` o `req.user.tipologia` non sono definiti (errore di configurazione):
 *      - Restituisce una risposta JSON con status HTTP 500 (Internal Server Error) e messaggio:
 *        { message: 'Errore: utente non definito nella richiesta dopo autenticazione.' }
 */
function hasPermission(requiredPermissions) {
    return (req, res, next) => {
        // Controlla se l'oggetto utente e la sua tipologia sono stati correttamente impostati da un middleware precedente (es. isAuthenticated).
        if (!req.user || !req.user.tipologia) {
            // Questo errore indica un problema nella catena dei middleware, probabilmente isAuthenticated non ha funzionato come previsto.
            return res.status(500).json({ message: 'Errore: utente non definito nella richiesta dopo autenticazione.' });
        }

        const authenticatedUserId = req.user.idutente; // ID dell'utente autenticato.
        const userTipologia = req.user.tipologia; // Tipologia dell'utente autenticato.
        const targetResourceId = parseInt(req.params.id, 10); // ID della risorsa dalla rotta, parseInt gestisce undefined/null/non-numerici restituendo NaN.

        const isAuthorized = requiredPermissions.some(permission => {
            // Controllo per ruoli specifici
            if (['Admin', 'Cliente', 'Artigiano'].includes(permission)) {
                return permission === userTipologia;
            }
            // Controllo per 'Self' generico
            if (permission === 'Self') {
                return !isNaN(targetResourceId) && authenticatedUserId === targetResourceId;
            }
            // Se il permesso non è riconosciuto, ritorna false per questo permesso.
            return false;
        });

        if (isAuthorized) {
            // L'utente soddisfa almeno uno dei permessi richiesti.
            next();
        } else {
            // L'utente non ha il permesso, restituisce un errore 403 Forbidden.
            res.status(403).json({ message: 'Accesso negato. Non hai i permessi necessari per questa risorsa.' });
        }
    };
}

// Esporta i middleware per renderli utilizzabili in altre parti dell'applicazione.
module.exports = {
    isAuthenticated,
    hasPermission,
    getUserFromToken, // Esporta la nuova funzione
};