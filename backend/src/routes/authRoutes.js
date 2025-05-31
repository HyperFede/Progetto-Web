require('dotenv').config();
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../config/db-connect'); // Assicurati che il percorso sia corretto

// Assicurati che JWT_SECRET sia definito nelle variabili d'ambiente
const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret) {
    console.error('FATAL ERROR: JWT_SECRET is not defined.');
    process.exit(1); // Termina l'applicazione se la chiave segreta non è configurata
}

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

module.exports = router;