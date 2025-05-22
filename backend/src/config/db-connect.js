const { Pool } = require('pg');

// Controlla che tutte le variabili d'ambiente necessarie per la connessione al DB siano definite
if (!process.env.DB_USER || !process.env.DB_HOST || !process.env.DB_NAME || !process.env.DB_PASSWORD || !process.env.DB_PORT) {   
    throw new Error("FATAL ERROR: Database connection parameters are not fully defined in .env file.");
}

const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
});

console.log('Database connection pool created.');

module.exports = pool;