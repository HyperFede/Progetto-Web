const express = require('express');
const router = express.Router();
const pool = require('../config/db-connect'); // Assicurati che il percorso sia corretto

// GET tutti i prodotti (con possibili filtri, paginazione, ecc.)
router.get('/', async (req, res) => {
    try {
        // Esempio: const { rows } = await pool.query('SELECT * FROM Prodotto');
        // res.json(rows);
        res.send('GET /api/products - Elenco di tutti i prodotti');
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// GET un singolo prodotto per ID
router.get('/:id', async (req, res) => {
    const { id } = req.params;
    try {
        // Esempio: const { rows } = await pool.query('SELECT * FROM Prodotto WHERE IDProdotto = $1', [id]);
        // if (rows.length === 0) {
        //     return res.status(404).json({ msg: 'Prodotto non trovato' });
        // }
        // res.json(rows[0]);
        res.send(`GET /api/products/${id} - Dettagli del prodotto ${id}`);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// POST per creare un nuovo prodotto (probabilmente accessibile solo agli artigiani)
router.post('/', (req, res) => {
    // Logica per creare un prodotto, validare i dati, ecc.
    res.send('POST /api/products - Crea un nuovo prodotto');
});

module.exports = router;