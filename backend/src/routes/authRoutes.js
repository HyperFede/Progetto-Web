require('dotenv').config();
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../config/db-connect'); // Assicurati che il percorso sia corretto
const { isAuthenticated } = require('../middleware/authMiddleWare'); // Importa isAuthenticated

// Assicurati che JWT_SECRET sia definito nelle variabili d'ambiente
const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret) {
    console.error('FATAL ERROR: JWT_SECRET is not defined.');
    process.exit(1); // Termina l'applicazione se la chiave segreta non è configurata
}

// Potresti voler usare una chiave diversa o un payload specifico per i token di reset password
// per distinguerli dai token di sessione. Per semplicità, useremo la stessa chiave
// ma con una scadenza molto più breve e un payload specifico.
const PASSWORD_RESET_TOKEN_EXPIRES_IN = '10m'; // Token per il reset password valido per 10 minuti



/**
 * @route POST /api/auth/login
 * @description Autentica un utente e restituisce un token JWT e i dati dell'utente.
 * @access Public
 *
 * Interazione Black-Box:
 *  Input: Oggetto JSON nel corpo della richiesta (req.body) con i seguenti campi:
 *      {
 *          "username": "String (obbligatorio)",
 *          "password": "String (obbligatorio)"
 *      }
 *  Output:
 *      - Successo (200 OK): Oggetto JSON contenente il token JWT e i dati dell'utente (senza password).
 *        { 
 *          "token": "aaaaa.bbbbbb.cccccc", 
 *          "user": { "idutente": Number, "username": String, ... }, 
 *          "message": "Stringa di successo" 
 *        }
 *      - Errore (400 Bad Request): Se username o password mancano nel corpo della richiesta.
 *        { "message": "Stringa di errore" }
 *      - Errore (401 Unauthorized): Se le credenziali (username o password) non sono valide
 *                                   o se l'utente è marcato come 'deleted'.
 *        { "message": "Stringa di errore" }
 *      - Errore (500 Internal Server Error): In caso di errore del server.
 *        { "message": "Stringa di errore" }
 */
// POST /api/auth/login - User Login
router.post('/login', async (req, res) => {
    const { username, password } = req.body;
    // Estrae username e password dal corpo della richiesta.

    // Valida l'input: username e password non devono essere null o stringhe vuote.
    if (username === null || password === null || username === '' || password === '' || !username || !password) {
        return res.status(400).json({ message: 'Username e password sono obbligatori.' });
    }

    try {
        // Cerca l'utente nel database tramite username.
        // Si assicura anche che l'utente non sia marcato come 'deleted'.
        const userQuery = await pool.query(
            'SELECT * FROM utente WHERE username = $1 AND deleted = false',
            [username]
        );

        // Se l'utente non viene trovato (o è marcato come 'deleted'), restituisce un errore 401.
        // Il messaggio è generico per motivi di sicurezza, per non rivelare se un username esiste o meno.
        if (userQuery.rows.length === 0) {
            return res.status(401).json({ message: 'Credenziali non valide.' });
        }

        const user = userQuery.rows[0];

        // Confronta la password fornita con quella hashata memorizzata nel database.
        const isMatch = await bcrypt.compare(password, user.password);

        // Se le password non corrispondono, restituisce un errore 401.
        if (!isMatch) {
            return res.status(401).json({ message: 'Credenziali non valide.' });
        }

        // Login successful
        // Genera il JWT
        const payload = {
            // Il payload del token contiene informazioni sull'utente, come l'ID.
            user: {
                id: user.idutente, // Includi l'ID utente nel payload
            }
        };

        // Firma il token JWT usando la chiave segreta (jwtSecret) e imposta una scadenza.
        // '24h' significa che il token scadrà tra 24 ore.
        const token = jwt.sign(payload, jwtSecret, { expiresIn: '24h' }); // '24h' è un formato valido per expiresIn

        // Prepara i dati dell'utente da inviare nella risposta.
        // È importante escludere la password per motivi di sicurezza.
        const userResponse = { ...user };
        delete userResponse.password;

        // Imposta il token JWT in un cookie HttpOnly
        res.cookie('accessToken', token, {
            httpOnly: true, // Il cookie non è accessibile tramite JavaScript del client
            secure: process.env.NODE_ENV === 'production', // Invia il cookie solo su HTTPS in produzione
            sameSite: 'Strict', // Mitiga attacchi CSRF. 'Lax' potrebbe essere un'alternativa se hai bisogno di navigazione cross-site GET.
            maxAge: 24 * 60 * 60 * 1000, // 24 ore, dovrebbe corrispondere alla scadenza del JWT
            path: '/' // Rende il cookie disponibile per tutte le route del dominio
        });

        // Invia una risposta di successo (200 OK) con il token JWT, i dati dell'utente e un messaggio.
        res.status(200).json({
            // Non è più strettamente necessario inviare il token nel corpo JSON se si usa solo il cookie,
            // ma può essere utile per client non-browser o per debug.
            token: token,
            user: userResponse, // Invia i dati utente (senza password)
            message: 'Accesso effettuato con successo.'
        });
    } catch (error) {
        console.error('Errore durante il login:', error); // Log dell'errore per debug lato server.
        res.status(500).json({ message: 'Errore del server durante il login.' });
    }
});

/**
 * @route POST /api/auth/logout
 * @description Effettua il logout dell'utente.
 *              Con i JWT stateless, questa operazione è principalmente una responsabilità del client,
 *              che deve eliminare il token memorizzato. Questo endpoint serve come conferma.
 * @access Public (o Authenticated se si implementasse una denylist server-side)
 *
 * Interazione Black-Box:
 *  Input: Nessuno (il client dovrebbe già avere il token da scartare).
 *  Output:
 *      - Successo (200 OK): Messaggio di conferma.
 *        { "message": "Logout effettuato con successo. Il client dovrebbe ora eliminare il token." }
 */
router.post('/logout', (req, res) => {
    // Per i JWT stateless, il logout è principalmente una responsabilità del client:
    // il client deve eliminare il token memorizzato (es. da localStorage, sessionStorage, o cookie).
    //
    // Opzioni server-side più complesse (non implementate qui per semplicità):
    // 1. Denylist/Blocklist: Il server memorizza i token "revocati" fino alla loro scadenza naturale.
    //    Ciò richiederebbe una modifica al middleware `isAuthenticated` per controllare questa lista.
    // 2. Refresh Tokens: Usare token di accesso a breve scadenza e token di refresh a lunga scadenza.
    //    Il logout invaliderebbe il refresh token sul server.

    // Cancella il cookie accessToken
    res.cookie('accessToken', '', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'Strict',
        expires: new Date(0), // Imposta la data di scadenza al passato per eliminare il cookie
        path: '/'
    });

    res.status(200).json({ message: 'Logout effettuato con successo. Il client dovrebbe ora eliminare il token.' });
});

/**
 * @route POST /api/auth/recover-password/verify-identity
 * @description Verifica l'identità dell'utente tramite username ed email per il recupero password.
 *              Se l'identità è verificata, restituisce un token a breve scadenza per il reset.
 * @access Public
 *
 * Interazione Black-Box:
 *  Input: Oggetto JSON nel corpo della richiesta (req.body) con:
 *      {
 *          "username": "String (obbligatorio)",
 *          "email": "String (obbligatorio se l'utente è 'Cliente')",
 *          "piva": "String (obbligatorio se l'utente è 'Artigiano')"
 *      }
 *  Output:
 *      - Successo (200 OK): Oggetto JSON con messaggio e token di reset.
 *        { "message": "Identità verificata. Usa questo token per resettare la password.", "resetToken": "jwt_reset_token" }
 *      - Errore (400 Bad Request): Se username manca, o se manca email/piva a seconda della tipologia utente.
 *        { "message": "Stringa di errore specifica" }
 *      - Errore (403 Forbidden): Se si tenta di recuperare la password per un utente 'Admin'.
 *        { "message": "Il recupero password non è abilitato per gli account Admin." }
 *      - Errore (404 Not Found): Se nessuna corrispondenza utente viene trovata o l'utente è disattivato.
 *        { "message": "Nessun utente trovato con queste credenziali o utente non attivo." }
 *      - Errore (500 Internal Server Error): In caso di errore del server.
 *        { "message": "Errore del server durante la verifica dell'identità." }
 */
router.post('/recover-password/verify-identity', async (req, res) => {
    const { username, email, piva } = req.body;

    if (!username) {
        return res.status(400).json({ message: 'Username è obbligatorio.' });
    }

    try {
        // Prima, trova l'utente e la sua tipologia basandosi sull'username
        const userQuery = await pool.query(
            'SELECT idutente, email AS db_email, piva AS db_piva, tipologia FROM utente WHERE username = $1 AND deleted = false',
            [username]
        );

        if (userQuery.rows.length === 0) {
            return res.status(404).json({ message: 'Nessun utente trovato con queste credenziali o utente non attivo.' });
        }

        const foundUser = userQuery.rows[0];

        // Impedisci il recupero password per gli Admin
        if (foundUser.tipologia === 'Admin') {
            return res.status(403).json({ message: 'Il recupero password non è abilitato per gli account Admin.' });
        }

        // Ora verifica il secondo identificatore basato sulla tipologia
        if (foundUser.tipologia === 'Artigiano') {
            if (!piva) {
                return res.status(400).json({ message: 'PIVA è obbligatoria per la verifica di un utente Artigiano.' });
            }
            if (piva !== foundUser.db_piva) {
                return res.status(404).json({ message: 'Nessun utente trovato con queste credenziali o utente non attivo.' });
            }
        } else if (foundUser.tipologia === 'Cliente') {
            if (!email) {
                return res.status(400).json({ message: 'Email è obbligatoria per la verifica di un utente Cliente.' });
            }
            if (email !== foundUser.db_email) {
                return res.status(404).json({ message: 'Nessun utente trovato con queste credenziali o utente non attivo.' });
            }
        } else {
            // Caso imprevisto di tipologia utente, per sicurezza neghiamo
            return res.status(403).json({ message: 'Tipologia utente non supportata per il recupero password.' });
        }

        // Genera un token specifico per il reset della password
        const payload = {
            user: {
                id: foundUser.idutente,
                purpose: 'password-reset' // Aggiungi uno scopo per distinguere questo token
            }
        };
        const resetToken = jwt.sign(payload, jwtSecret, { expiresIn: PASSWORD_RESET_TOKEN_EXPIRES_IN });

        res.status(200).json({
            message: 'Identità verificata. Usa questo token per resettare la password.',
            resetToken: resetToken
        });

    } catch (error) {
        console.error('Errore durante la verifica dell\'identità per recupero password:', error);
        res.status(500).json({ message: 'Errore del server durante la verifica dell\'identità.' });
    }
});

/**
 * @route POST /api/auth/recover-password/reset
 * @description Resetta la password dell'utente usando un token di reset valido e una nuova password.
 * @access Public (ma richiede un token di reset valido)
 *
 * Interazione Black-Box:
 *  Input: Oggetto JSON nel corpo della richiesta (req.body) con:
 *      {
 *          "token": "String (obbligatorio, il token di reset ottenuto dal passo di verifica)",
 *          "nuovapassword": "String (obbligatoria, la nuova password)"
 *      }
 *  Output:
 *      - Successo (200 OK): Messaggio di conferma.
 *        { "message": "Password resettata con successo." }
 *      - Errore (400 Bad Request): Se token o nuovapassword mancano.
 *        { "message": "token e nuovapassword sono obbligatori." }
 *      - Errore (401 Unauthorized): Se il resetToken è invalido, scaduto o non per lo scopo di reset.
 *      - Errore (500 Internal Server Error): In caso di errore del server.
 */
router.post('/recover-password/reset', async (req, res) => {
    const { token, nuovapassword } = req.body;
    const resetToken = token; // Per chiarezza, rinominato in resetToken

    if (!resetToken || !nuovapassword) {
        return res.status(400).json({ message: 'token e nuovapassword sono obbligatori.' });
    }

    try {
        const decoded = jwt.verify(resetToken, jwtSecret);
        // Verifica che il token sia effettivamente per il reset password e non un token di sessione
        if (!decoded.user || !decoded.user.id || decoded.user.purpose !== 'password-reset') {
            return res.status(401).json({ message: 'Token di reset non valido o malformato.' });
        }
        const userId = decoded.user.id;
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(nuovapassword, salt);
        await pool.query('UPDATE utente SET password = $1 WHERE idutente = $2 AND deleted = false', [hashedPassword, userId]);
        res.status(200).json({ message: 'Password resettata con successo.' });
    } catch (error) {
        if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
            return res.status(401).json({ message: 'Token di reset non valido o scaduto.' });
        }
        console.error('Errore durante il reset della password:', error);
        res.status(500).json({ message: 'Errore del server durante il reset della password.' });
    }
});

/**
 * @route GET /api/auth/session-info
 * @description Verifica se l'utente ha una sessione valida (JWT valido nel cookie HttpOnly)
 *              e restituisce la tipologia dell'utente.
 * @access Authenticated (implicitamente, tramite il middleware isAuthenticated)
 *
 * Interazione Black-Box:
 *  Input: Cookie HttpOnly 'accessToken' inviato dal browser.
 *  Output:
 *      - Successo (200 OK): Se il token è valido.
 *        { "isAuthenticated": true, "tipologia": "String" } (es. "Cliente", "Artigiano", "Admin")
 *      - Errore (401 Unauthorized): Se il token è mancante, invalido o scaduto (gestito da `isAuthenticated`).
 *        { "message": "Stringa di errore relativa all'autenticazione" }
 */

router.get('/session-info', isAuthenticated, async (req, res) => { // Added async
    // Se il middleware isAuthenticated passa, significa che req.user è popolato
    // e il token JWT è valido.
    if (req.user && req.user.tipologia) {
        const responsePayload = {
            isAuthenticated: true,
            tipologia: req.user.tipologia,
            username: req.user.username,
            nome: req.user.nome,
            cognome: req.user.cognome,
            indirizzo: req.user.indirizzo,
            email: req.user.email,
            idutente: req.user.idutente,


        };
        //console.log(responsePayload);
        // Check the user's actual tipologia from req.user, case-insensitively.
        // Crucially, ensure that 'piva' and 'artigianodescrizione' are being selected
        // and populated into req.user by your isAuthenticated middleware for artisan users.
        if (req.user.tipologia && req.user.tipologia.toLowerCase() === 'artigiano') {
            try {
                const artigianoDetailsQuery = await pool.query(
                    'SELECT piva, artigianodescrizione FROM utente WHERE idutente = $1',
                    [req.user.idutente] // or responsePayload.idutente
                );
                if (artigianoDetailsQuery.rows.length > 0) {
                    responsePayload.piva = artigianoDetailsQuery.rows[0].piva;
                    responsePayload.artigianodescrizione = artigianoDetailsQuery.rows[0].artigianodescrizione;
                }
            } catch (dbError) {
                console.error('[session-info] Error fetching artigiano details from DB:', dbError);
                // Decide if you want to fail the request or send partial data
                // For now, we'll send the data without piva/descrizione if DB query fails
            }
        }

        res.status(200).json(responsePayload);
    } else {
        // Questo caso non dovrebbe verificarsi se isAuthenticated funziona correttamente
        // e popola sempre req.user con tipologia per utenti validi.
        res.status(500).json({ message: "Errore: tipologia utente non trovata dopo l'autenticazione." });
    }
});


module.exports = router;