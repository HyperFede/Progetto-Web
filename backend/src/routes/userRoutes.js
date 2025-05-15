const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const pool = require('../config/db-connect');

// --- Operazioni CRUD per Utente ---

// CREATE - POST /api/users
router.post('/', async (req, res) => {
    
    let { username, nome, cognome, email, password, tipologia, piva, artigianodescrizione } = req.body;
    // controllo campi vuoti
    if (!username || !email || !password || !tipologia) {
        return res.status(400).json({ message: 'Username, Email, Password e Tipologia sono campi obbligatori.' });
    }

    if (tipologia === 'Admin') {
        return res.status(403).json({ message: 'La creazione di utenti Admin tramite API non è permessa.' });
    }

    //Logica per separare una creazione di un utente "Artigiano" o "Cliente"
    let pivaValue = null;
    let artigianoDescrizioneValue = null;

    if (tipologia === 'Artigiano') {
        if (piva === null || artigianodescrizione === null || piva === '' || artigianodescrizione === '') {
            return res.status(400).json({ message: 'Per la tipologia "Artigiano", PIVA e ArtigianoDescrizione sono obbligatori.' });
        }
        pivaValue = piva;
        artigianoDescrizioneValue = artigianodescrizione;
    } else if (tipologia === 'Cliente') {

        // Per la tipologia "Cliente", PIVA e ArtigianoDescrizione devono essere null
        pivaValue = null;
        artigianoDescrizioneValue = null;
    }
    else {
        // Se la tipologia non è valida, restituisci un errore
        return res.status(400).json({ message: 'Tipologia non valida. Deve essere "Cliente", "Artigiano" o "Admin".' });
    }

    try {
        // Hash della password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const newUser = await pool.query(
            'INSERT INTO utente (username, nome, cognome, email, password, tipologia, piva, artigianodescrizione) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *',
            [username, nome, cognome, email, hashedPassword, tipologia, pivaValue, artigianoDescrizioneValue]
        );
        
        const userResponse = { ...newUser.rows[0] };
        // Rimuovi la password dalla risposta, importante per la sicurezza
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

// READ ALL - GET /api/users
router.get('/', async (req, res) => {

    try {
        //NB escludiamo la password dalla query
        const allUsers = await pool.query(
            'SELECT idutente, username, nome, cognome, email, tipologia, piva, artigianodescrizione, admintimestampcreazione, deleted FROM utente ORDER BY idutente ASC'
        );
        res.status(200).json(allUsers.rows);
    } catch (error) {
       // console.error('Errore nel recuperare gli utenti:', error);
        res.status(500).json({ message: 'Errore del server durante il recupero degli utenti.' });
    }
});

// READ ALL NOT DELETED - GET /api/users/notdeleted
router.get('/notdeleted', async (req, res) => {
    try {
        //NB escludiamo la password dalla query
        const allUsers = await pool.query(
            'SELECT idutente, username, nome, cognome, email, tipologia, piva, artigianodescrizione, admintimestampcreazione,deleted FROM utente WHERE deleted = false ORDER BY idutente ASC'
        );
        res.status(200).json(allUsers.rows);
    } catch (error) {
        //console.error('Errore nel recuperare gli utenti:', error);
        res.status(500).json({ message: 'Errore del server durante il recupero degli utenti.' });
    }
});

// READ ONE - GET /api/users/:id
router.get('/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const user = await pool.query(
            'SELECT idutente, username, nome, cognome, email, tipologia, piva, artigianodescrizione, admintimestampcreazione, deleted FROM utente WHERE idutente = $1', [id]
        );
        if (user.rows.length === 0) {
            return res.status(404).json({ message: 'Utente non trovato.' });
        }
        res.status(200).json(user.rows[0]);
    } catch (error) {
        //console.error(`Errore nel recuperare l'utente con ID ${id}:`, error);
        res.status(500).json({ message: 'Errore del server durante il recupero dell utente.' });
    }
});

// UPDATE - PUT /api/users/:id
router.put('/:id', async (req, res) => {
    const { id } = req.params;
    const { username, nome, cognome, email, piva, artigianodescrizione } = req.body;

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
        const finalTipologia = currentUser.tipologia; //la tipologia non può essere cambiata

        if (username === '' || email === '') {
            return res.status(400).json({ message: 'Username ed Email non possono essere vuoti.' });
        }
        if (finalTipologia === 'Admin') {
            res.status(403).json({ message: 'Non puoi modificare un utente Admin.' });
            
        }
        if (finalTipologia === 'Artigiano') {
            console.log('Artigiano', piva, artigianodescrizione);

            if (piva !== null) {
                finalPiva = piva;
            } else {
                finalPiva = currentUser.piva;
            }

            if (artigianodescrizione !== null) {
                finalArtigianoDescrizione = artigianodescrizione;
            } else {
                finalArtigianoDescrizione = currentUser.artigianodescrizione;
            }

            if (finalPiva === '' || finalArtigianoDescrizione === '') {
                return res.status(400).json({ message: 'Per la tipologia "Artigiano", PIVA e ArtigianoDescrizione sono obbligatori.' });
            }
        } else if (finalTipologia === 'Cliente') {
            finalPiva = null;
            finalArtigianoDescrizione = null;
        }

        const updatedUser = await pool.query(
            'UPDATE utente SET username = $1, nome = $2, cognome = $3, email = $4, piva = $5, artigianodescrizione = $6 WHERE idutente = $7 RETURNING idutente, username, nome, cognome, email, tipologia, piva, artigianodescrizione',
            [finalUsername, finalNome, finalCognome, finalEmail, finalPiva, finalArtigianoDescrizione, id]
        );

        res.status(200).json(updatedUser.rows[0]);
    } catch (error) {
        console.error(`Errore nell'aggiornare l'utente con ID ${id}:`, error);
        if (error.code === '23505') {
            return res.status(409).json({ message: 'Username o Email già esistente.' });
        }
        res.status(500).json({ message: 'Errore del server durante l aggiornamento dell utente.' });
    }
});

// DELETE - DELETE /api/users/:id (SOFT DELETE)
router.delete('/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const userQuery = await pool.query('SELECT tipologia FROM utente WHERE idutente = $1', [id]);
        if (userQuery.rows.length === 0) {
            return res.status(404).json({ message: 'Utente non trovato per l eliminazione.' });
        }
        if (userQuery.rows[0].tipologia === 'Admin') {
            return res.status(403).json({ message: 'Non puoi eliminare un utente Admin.' });
        }

        await pool.query('UPDATE utente SET deleted = true WHERE idutente = $1', [id]);
        res.status(200).json({ message: `Utente con ID ${id} eliminato.` });
    } catch (error) {
        //console.error(`Errore nell'eliminare l'utente con ID ${id}:`, error);
        res.status(500).json({ message: 'Errore del server durante l eliminazione dell utente.' });
    }
});

module.exports = router;