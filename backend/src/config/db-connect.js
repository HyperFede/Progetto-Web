const { Pool } = require('pg');
const dotenv = require('dotenv');
const path = require('path');

// Load environment-specific .env file
// process.cwd() will be the 'backend' directory when running npm scripts from there.
if (process.env.NODE_ENV === 'test') {
    dotenv.config();
} else {
    dotenv.config(); // Or just dotenv.config() if .env is always at root
}

let dbConfig;

if (process.env.NODE_ENV === 'test') {
    console.log("INFO: Running in TEST environment. Using TEST_DB_* variables for database connection.");
    // Configuration for the test database
    if (!process.env.TEST_DB_USER || !process.env.TEST_DB_HOST || !process.env.TEST_DB_NAME || !process.env.TEST_DB_PASSWORD || !process.env.TEST_DB_PORT) {
        throw new Error("FATAL ERROR: Test database connection parameters (TEST_DB_*) are not fully defined. Check your .env.test file or environment variables.");
    }
    dbConfig = {
        user: process.env.TEST_DB_USER,
        host: process.env.TEST_DB_HOST,
        database: process.env.TEST_DB_NAME,
        password: process.env.TEST_DB_PASSWORD,
        port: parseInt(process.env.TEST_DB_PORT, 10), // Ensure port is an integer
    };
} else {
    console.log("INFO: Running in Development/Production environment. Using DB_* variables for database connection.");
    // Configuration for development or production database
    if (!process.env.DB_USER || !process.env.DB_HOST || !process.env.DB_NAME || !process.env.DB_PASSWORD || !process.env.DB_PORT) {
        throw new Error("FATAL ERROR: Database connection parameters (DB_*) are not fully defined in .env file or environment variables.");
    }
    dbConfig = {
        user: process.env.DB_USER,
        host: process.env.DB_HOST,
        database: process.env.DB_NAME,
        password: process.env.DB_PASSWORD,
        port: parseInt(process.env.DB_PORT, 10), // Ensure port is an integer
    };
}

const pool = new Pool(dbConfig); // Use the determined dbConfig object

pool.on('connect', () => {
    console.log(`INFO: Successfully connected to PostgreSQL database: ${dbConfig.database} on host ${dbConfig.host}:${dbConfig.port}`);
});

pool.on('error', (err, client) => { //NOSONAR
    console.error('FATAL ERROR: Unexpected error on idle client', err);
    process.exit(-1); // Exit if we can't connect to the DB or encounter a major pool error
});

console.log(`INFO: Database connection pool configured for: ${dbConfig.database}`);
module.exports = pool;