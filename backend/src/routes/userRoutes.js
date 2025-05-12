const express = require('express');
const router = express.Router();
const pool = require('../config/db-connect'); // Importa il pool di connessioni


// --- Operazioni CRUD per Utente ---

// CREATE - POST /api/users
router.post('/', async (req, res) => {
    const { Username, Nome, Cognome, Email, Password, Tipologia, PIVA, ArtigianoDescrizione } = req.body;
    // In una vera applicazione, la password dovrebbe essere hashata prima di essere salvata.
    // Esempio: const hashedPassword = await bcrypt.hash(Password, 10);
    // Poi salveresti hashedPassword nel database.

    // Validazione di base (puoi espanderla con librerie come Joi o express-validator)
    if (!Username || !Email || !Password || !Tipologia) {
        return res.status(400).json({ message: 'Username, Email, Password e Tipologia sono campi obbligatori.' });
    }

    try {
        const newUser = await pool.query(
            'INSERT INTO Utente (Username, Nome, Cognome, Email, Password, Tipologia, PIVA, ArtigianoDescrizione) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *',
            [Username, Nome, Cognome, Email, Password, Tipologia, PIVA, ArtigianoDescrizione]
        );
        res.status(201).json(newUser.rows[0]);
    } catch (error) {
        console.error('Errore nella creazione dell utente:', error);
        if (error.code === '23505') { // Codice errore per violazione unique constraint
            return res.status(409).json({ message: 'Username o Email già esistente.' });
        }
        res.status(500).json({ message: 'Errore del server durante la creazione dell utente.' });
    }
});

// READ ALL - GET /api/users
router.get('/', async (req, res) => {
    try {
        const allUsers = await pool.query('SELECT IDUtente, Username, Nome, Cognome, Email, Tipologia, PIVA, ArtigianoDescrizione FROM Utente ORDER BY IDUtente ASC');
        res.status(200).json(allUsers.rows);
    } catch (error) {
        console.error('Errore nel recuperare gli utenti:', error);
        res.status(500).json({ message: 'Errore del server durante il recupero degli utenti.' });
    }
});

// READ ONE - GET /api/users/:id
router.get('/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const user = await pool.query('SELECT IDUtente, Username, Nome, Cognome, Email, Tipologia, PIVA, ArtigianoDescrizione FROM Utente WHERE IDUtente = $1', [id]);
        if (user.rows.length === 0) {
            return res.status(404).json({ message: 'Utente non trovato.' });
        }
        res.status(200).json(user.rows[0]);
    } catch (error) {
        console.error(`Errore nel recuperare l'utente con ID ${id}:`, error);
        res.status(500).json({ message: 'Errore del server durante il recupero dell utente.' });
    }
});

// UPDATE - PUT /api/users/:id
router.put('/:id', async (req, res) => {
    const { id } = req.params;
    const { Username, Nome, Cognome, Email, Tipologia, PIVA, ArtigianoDescrizione } = req.body;
    // Nota: non permettiamo l'aggiornamento della password qui per semplicità.
    // L'aggiornamento della password dovrebbe avere un endpoint dedicato e una logica più complessa.

    if (!Username || !Email || !Tipologia) { // Esempio di validazione minima
        return res.status(400).json({ message: 'Username, Email e Tipologia sono campi obbligatori per l aggiornamento.' });
    }

    try {
        const updatedUser = await pool.query(
            'UPDATE Utente SET Username = $1, Nome = $2, Cognome = $3, Email = $4, Tipologia = $5, PIVA = $6, ArtigianoDescrizione = $7 WHERE IDUtente = $8 RETURNING IDUtente, Username, Nome, Cognome, Email, Tipologia, PIVA, ArtigianoDescrizione',
            [Username, Nome, Cognome, Email, Tipologia, PIVA, ArtigianoDescrizione, id]
        );
        if (updatedUser.rows.length === 0) {
            return res.status(404).json({ message: 'Utente non trovato per l aggiornamento.' });
        }
        res.status(200).json(updatedUser.rows[0]);
    } catch (error) {
        console.error(`Errore nell'aggiornare l'utente con ID ${id}:`, error);
        if (error.code === '23505') {
            return res.status(409).json({ message: 'Username o Email già esistente per un altro utente.' });
        }
        res.status(500).json({ message: 'Errore del server durante l aggiornamento dell utente.' });
    }
});

// DELETE - DELETE /api/users/:id (SOFT DELETE)
router.delete('/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const deleteOp = await pool.query('UPDATE Utente WHERE IDUtente = $1 SET Deleted = true RETURNING IDUtente', [id]);
        if (deleteOp.rows.length === 0) {
            return res.status(404).json({ message: 'Utente non trovato per l eliminazione.' });
        }
        res.status(200).json({ message: `Utente con ID ${id} eliminato con successo.` });
    } catch (error) {
        console.error(`Errore nell'eliminare l'utente con ID ${id}:`, error);
        // Considera errori dovuti a foreign key constraints se l'utente è referenziato altrove
        res.status(500).json({ message: 'Errore del server durante l eliminazione dell utente.' });
    }
});

module.exports = router;
