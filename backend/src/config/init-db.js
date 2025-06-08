// Questo script inizializza il database eseguendo gli script SQL.
const path = require('path');
const fs = require('fs'); // Corretta importazione di fs
const pool = require('./db-connect'); // Importa il pool di connessioni

async function initDb() {
    let client; // Definisci client qui per accedervi nel blocco finally
    try {
        // Ottieni un client dal pool
        client = await pool.connect();
        console.log('Connecting to the database...');
        // La connessione è già stabilita da pool.connect()
        console.log('Database connected.');
        //cambiare script in base a cio che serve
        const scriptPath = path.join(__dirname, '..', '..', 'database', 'script.sql');
        const insertPath = path.join(__dirname, '..', '..', 'database', 'insertData.sql');
        const script = fs.readFileSync(scriptPath, 'utf8');
        const insert = fs.readFileSync(insertPath, 'utf8');
        await client.query(script);
        await client.query(insert);
        console.log('Database initialized');
    } catch (err) {
        console.error('Error initializing database', err);
    } finally {
        if (client) {
            client.release(); // Rilascia il client al pool invece di chiuderlo con client.end()
        }
    }
}

module.exports = initDb;
