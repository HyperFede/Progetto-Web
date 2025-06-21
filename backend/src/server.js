const path = require('path'); // Importa il modulo 'path'
require('dotenv').config({ path: path.resolve(__dirname, '../.env') }); // Specifica il percorso del file .env
// __dirname si riferisce alla directory corrente del file (cioè src)
// '../.env' sale di un livello per trovare il file .env nella cartella backend


// Controlla DB_USER subito dopo dotenv.config()
console.log('DB_USER in index.js dopo dotenv.config():', process.env.DB_USER);

const express = require('express');  // Importa il framework Express
const cookieParser = require('cookie-parser'); // Importa il middleware per il parsing dei cookie

const cors = require('cors'); // Importa il middleware CORS
const initDb = require('./config/init-db'); // Importa la funzione initDb per inizializzare il database
const userRoutes = require('./routes/userRoutes'); // Importeremo le route degli utenti
const productRoutes = require('./routes/productRoutes'); // Importa le route dei prodotti
const orderRoutes = require('./routes/orderRoutes'); // Importa le route degli ordini
const paymentRoutes = require('./routes/paymentRoutes'); // Importa le route dei pagamenti
const authRoutes = require('./routes/authRoutes'); // Importa le route di autenticazione
const cartRoutes = require('./routes/cartRoutes'); // Importa le route del carrello
const subOrderRoutes = require('./routes/subOrderRoutes'); // Importa le route degli ordini secondaris
const reviewRoutes = require('./routes/reviewRoutes'); // Importa le route delle recensioni
const problemRoutes = require('./routes/problemRoutes'); // Importa le route dei problemi
const approvalsRoutes = require('./routes/artigianoApproveRoutes'); // Importa le route delle approvazioni
const utilRoutes = require('./routes/utils.js');

const app = express();
app.use(cors()); // Abilita CORS per tutte le richieste
app.use(cookieParser()); // Usa il middleware per il parsing dei cookie

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
app.use('/api/suborders', subOrderRoutes); // Monta le route degli ordini secondari
app.use('/api/reviews', reviewRoutes); // Monta le route delle recensioni
app.use('/api/problems', problemRoutes); // Monta le route dei problemi
app.use('/api/approvals', approvalsRoutes); // Monta le route delle approvazioni
app.use('/api/utils', utilRoutes);

// Endpoint di root per un semplice check
app.get('/test', (req, res) => {
    res.send('Server is running. Database initialization attempted.');
});

app.use(express.static('../frontend/'));

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

// Start the server only if this script is executed directly (e.g., node src/index.js)
// and not when required by another module (like a test file). (e.g. node src/server.js)
if (require.main === module) {
    startServer();
}

module.exports = app; // Export the app instance for testing