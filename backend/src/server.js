const path = require('path'); // Importa il modulo 'path'
require('dotenv').config({ path: path.resolve(__dirname, '../.env') }); // Specifica il percorso del file .env
// __dirname si riferisce alla directory corrente del file (cioè src)
// '../.env' sale di un livello per trovare il file .env nella cartella backend


// Controlla DB_USER subito dopo dotenv.config()
console.log('DB_USER in index.js dopo dotenv.config():', process.env.DB_USER);

const express = require('express');  // Importa il framework Express
const cors = require('cors'); // Importa il middleware CORS
const initDb = require('./config/init-db'); // Importa la funzione initDb per inizializzare il database
const userRoutes = require('./routes/userRoutes'); // Importeremo le route degli utenti
const productRoutes = require('./routes/productRoutes'); // Importa le route dei prodotti
const orderRoutes = require('./routes/orderRoutes'); // Importa le route degli ordini
const paymentRoutes = require('./routes/paymentRoutes'); // Importa le route dei pagamenti
const authRoutes = require('./routes/authRoutes'); // Importa le route di autenticazione
const cartRoutes = require('./routes/cartRoutes'); // Importa le route del carrello

const app = express();
const dbport = process.env.DB_PORT || 5432; // Usa la porta 5432 come default se non specificata
const serverport = process.env.PORT || 3000; // Usa la porta 3000 come default se non specificata

if (!dbport) {
    console.log("Variabile d'ambiente PORT non impostata, utilizzo la porta di default 5432");
}

// Middleware per il parsing di JSON request bodies
app.use(express.json());

// API Routes
app.use('/api/users', userRoutes); // Monta le route degli utenti sotto /api/users
app.use('/api/products', productRoutes); // Monta le route dei prodotti
app.use('/api/orders', orderRoutes); // Monta le route degli ordini
app.use('/api/payments', paymentRoutes); // Monta le route dei pagamenti
app.use('/api/auth', authRoutes); // Monta le route di autenticazione
app.use('/api/cart', cartRoutes); // Monta le route del carrello


// Endpoint di root per un semplice check
app.get('/', (req, res) => {
    res.send('Server is running. Database initialization attempted.');
});

async function startServer() {
    try {
        await initDb(); // Inizializza il database prima di avviare il server
        // Return the server instance for potential use (e.g., graceful shutdown)
        return app.listen(serverport, () => {
            console.log(`Server running on http://localhost:${serverport}`);



        });
    } catch (error) {
        console.error('Failed to initialize database or start server:', error);
        process.exit(1); // Esce se l'inizializzazione del DB fallisce
    }
}

// Start the server only if this script is executed directly (e.g., `node src/index.js`)
// and not when required by another module (like a test file). (e.g. `node src/server.js`)
if (require.main === module) {
    startServer();
}

module.exports = app; // Export the app instance for testing