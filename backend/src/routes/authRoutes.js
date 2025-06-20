require('dotenv').config();
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../config/db-connect'); // Assicurati che il percorso sia corretto
const { isAuthenticated, hasPermission } = require('../middleware/authMiddleWare'); // Importa isAuthenticated"

const{ sendEmail} = require ("../utils/emailSender");

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
const PASSWORD_RESET_VERIFY_TOKEN_EXPIRES_IN = '10m'; // Token per il reset password (dopo verifica identità) valido per 10 minuti
const PASSWORD_RECOVERY_LINK_TOKEN_EXPIRES_IN = '15m'; // Token per il link di recupero password inviato via email




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
            responsePayload.piva = req.user.piva;
            responsePayload.artigianodescrizione = req.user.artigianodescrizione;
                    responsePayload.piva = req.user.piva;
                    responsePayload.artigianodescrizione = req.user.artigianodescrizione;

                    queryResult = await pool.query(
                        'SELECT Esito from Storicoapprovazioni where idartigiano = $1',
                        [req.user.idutente]
                    );

                    if (queryResult.rows.length > 0) {
                        responsePayload.esitoapprovazione = queryResult.rows[0].esito;
                    }
                    else{
                        responsePayload.esitoapprovazione = null;
                    }
        }

        res.status(200).json(responsePayload);
    } else {
        // Questo caso non dovrebbe verificarsi se isAuthenticated funziona correttamente
        // e popola sempre req.user con tipologia per utenti validi.
        res.status(500).json({ message: "Errore: tipologia utente non trovata dopo l'autenticazione." });
    }
});


router.get ("/send-recovery-email", async (req, res) => {
    const {email : emailInput} = req.body;

    queryResult = await pool.query("SELECT username FROM UTENTE WHERE email = $1" ,[emailInput]);

    let usernameDb;
    if (queryResult.rows.length > 0){

        usernameDb = queryResult.rows[0].username;
    }

    emailDestinatario = emailInput;

    try{
        // Genera il JWT per il link di recupero
        const payload = {
            username: usernameDb,
            purpose: 'password-recovery-via-email-link' // Scopo specifico per questo token
        };
        const recoveryLinkToken = jwt.sign(payload, jwtSecret, { expiresIn: PASSWORD_RECOVERY_LINK_TOKEN_EXPIRES_IN });

        // Assicurati che il frontend (recuperoPassword.html) possa gestire un parametro 'token' nell'URL.
        const link = `${process.env.FRONTEND_URL}/recuperoPassword.html?token=${recoveryLinkToken}`;
        const emailSubject = 'Recupero Password BazArt';

                // HTML content for the email
        const emailText = `
        <html>
          <head>
            <style>
              body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; line-height: 1.6; color: #333333; background-color: #f4f4f4; margin: 0; padding: 0; }
              .email-container { max-width: 600px; margin: 20px auto; padding: 30px; background-color: #ffffff; border: 1px solid #dddddd; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
              .email-header { text-align: center; margin-bottom: 25px; }
              .email-header h2 { color: #dda15e; margin-top:0; }
              .email-body p { margin-bottom: 15px; font-size: 16px; }
              .button-container { text-align: center; margin: 30px 0; }
              .button { display: inline-block; padding: 12px 25px; background-color: #dda15e; color: #ffffff; text-decoration: none; border-radius: 5px; font-size: 16px; font-weight: bold; }
              .link-fallback { margin-top: 15px; font-size: 14px; text-align: center; }
              .link-fallback a { color: #dda15e; text-decoration: underline; }
              .footer { margin-top: 30px; font-size: 14px; color: #777777; text-align: center; border-top: 1px solid #eeeeee; padding-top: 20px; }
            </style>
          </head>
          <body>
            <div class="email-container">
              <div class="email-header">
                <h2>Recupero Password BazArt</h2>
              </div>
              <div class="email-body">
                <p>Ciao ${usernameDb},</p>
                <p>Hai richiesto di resettare la tua password. Clicca sul seguente pulsante per procedere:</p>
                <div class="button-container">
                  <a href="${link}" class="button">Resetta Password</a>
                </div>
                <div class="link-fallback">
                  <p>Se il pulsante non funziona, copia e incolla il seguente link nel tuo browser:</p>
                  <p><a href="${link}">${link}</a></p>
                </div>
                <p>Se non hai richiesto tu il reset, per favore ignora questa email.</p>
                <p>Il link di recupero scadrà tra 15 minuti.</p>
              </div>
              <div class="footer">
                <p>Grazie,<br>Il Team di BazArt</p>
              </div>
            </div>
          </body>
        </html>
        `;




        sendEmail(emailDestinatario, emailSubject, emailText);

        res.status(200).json({ message: "Se l'utente esiste, un'email di recupero è stata inviata con le istruzioni." });
    } catch (error) {

        console.error('Errore durante la procedura di invio email di recupero:', error);
        res.status(500).json({ message: 'Errore del server durante la procedura di recupero password.' });
    
    }
});


module.exports = router;