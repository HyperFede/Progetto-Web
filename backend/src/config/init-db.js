// Questo script inizializza il database eseguendo gli script SQL.

//METTI LE IMMAGINI IN image_db ( sono in download)
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

        await client.query('BEGIN'); // Start transaction for all operations

        //cambiare script in base a cio che serve
        const scriptPath = path.join(__dirname, '..', '..', 'database', 'script.sql');
        const insertPath = path.join(__dirname, '..', '..', 'database', 'insertData.sql');
        const script = fs.readFileSync(scriptPath, 'utf8');
        const insert = fs.readFileSync(insertPath, 'utf8');

        await client.query(script);
        console.log('Schema script (script.sql) executed.');
        await client.query(insert);
        console.log('Data insertion script (insertData.sql) executed.');

        // Pass the client to updateImages and await its completion
        await updateImages(client); 

        await client.query('COMMIT'); // Commit transaction if all previous steps succeeded
        console.log('Database initialized and images updated successfully.');
    } catch (err) {
        console.error('Error initializing database', err);
        if (client) await client.query('ROLLBACK'); // Rollback on any error
    } finally {
        if (client) {
            client.release(); // Rilascia il client al pool invece di chiuderlo con client.end()
        }
    }
}

// Main function to orchestrate image updates for all configured tables
async function updateImages(client) { 
    try {
        const imageBaseFolder = path.join(__dirname, '..', '..', '..', '..', 'Progetto-Web', 'backend', 'database', 'db_images');
        console.log(`Image base folder: ${imageBaseFolder}`);

        if (!fs.existsSync(imageBaseFolder)) {
            console.warn(`⚠️ Image base folder not found: ${imageBaseFolder}. Skipping all image updates.`);
            return;
        }

        // Configuration for each table that needs image updates
        // Ensure tableName, idColumn, and imageColumn match your script.sql (case-insensitively for unquoted identifiers)
        const tableConfigs = [
            {
                filePrefix: 'Prodotto',      // Prefix in the filename (e.g., "Prodotto_ID_1.png")
                tableName: 'Prodotto',       // Actual DB table name
                idColumn: 'IDProdotto',      // Actual ID column name in the DB table
                imageColumn: 'Immagine',     // Actual image data column name
                directory: imageBaseFolder
            },
            {
                filePrefix: 'Recensione',
                tableName: 'Recensione',
                idColumn: 'IDRecensione',
                imageColumn: 'Immagine',
                directory: imageBaseFolder
            },
            {
                filePrefix: 'Segnalazione',  // Assuming "Segnalazione" files map to the "Problema" table
                tableName: 'Problema',       // The table for issues/reports is "Problema" in script.sql
                idColumn: 'IDProblema',
                imageColumn: 'Immagine',
                directory: imageBaseFolder
            }
        ];

        for (const config of tableConfigs) {
            await processImagesForTable(client, config);
        }

        console.log('✅ All configured image update processes completed within the transaction.');
    } catch (err) {
        console.error('❌ Failed during image update orchestration:', err);
        // Re-throw the error so that initDb's catch block can handle the ROLLBACK
        throw err; 
    }
}

// Helper function to process images for a single table configuration
async function processImagesForTable(client, config) {
    console.log(`\nProcessing images for table: ${config.tableName} (files starting with ${config.filePrefix}_ID_...)`);

    let filesInDirectory;
    try {
        if (!fs.existsSync(config.directory)) {
            console.warn(`  ⚠️ Directory not found for ${config.tableName}: ${config.directory}. Skipping.`);
            return;
        }
        filesInDirectory = fs.readdirSync(config.directory);
    } catch (ioError) {
        console.error(`  ❌ Error reading directory ${config.directory} for ${config.tableName}:`, ioError);
        throw ioError; // Propagate to roll back transaction
    }

    // Regex to match filenames like: Prodotto_ID_123.jpg (TableName_ID_Number.Extension)
    // Captures: 1=ID, 2=extension
    const imageFileRegex = new RegExp(`^${config.filePrefix}_ID_(\\d+)\\.(png|jpe?g|gif|webp)$`, 'i');
    let updatedCount = 0;

    for (const fileName of filesInDirectory) {
        const match = fileName.match(imageFileRegex);
        if (match) {
            const id = match[1];
            const filePath = path.join(config.directory, fileName);

            // This check is a safeguard, though readdirSync should mean it exists.
            if (!fs.existsSync(filePath)) {
                console.warn(`  ⚠️ File listed by readdirSync but not found (race condition?): ${filePath}`);
                continue;
            }

            try {
                const imgBuf = fs.readFileSync(filePath);
                // Table and column names come from trusted config, not user input.
                // Using them directly in the template string is acceptable here.
                // PostgreSQL folds unquoted identifiers to lowercase, so 'Prodotto' becomes 'prodotto'.
                const query = `
                    UPDATE ${config.tableName}
                    SET ${config.imageColumn} = $1
                    WHERE ${config.idColumn} = $2
                      AND ${config.imageColumn} IS NULL`; // Safety: only fill if currently empty
                
                const result = await client.query(query, [imgBuf, id]);
                if (result.rowCount > 0) {
                    console.log(`  ✅ Updated image in ${config.tableName} for ID ${id} using ${fileName}`);
                    updatedCount++;
                } else {
                    // Could add a check here to see if the ID exists but the image was already set or ID doesn't exist
                    // For brevity, we'll assume if rowCount is 0, it's either already set or ID not found for this update.
                    console.log(`  ℹ️ Image for ${config.tableName} ID ${id} (file: ${fileName}) not updated (possibly already set or ID not found for initial data).`);
                }
            } catch (fileOrDbError) {
                console.error(`  ❌ Error processing file ${fileName} for ${config.tableName} ID ${id}:`, fileOrDbError);
                throw fileOrDbError; // Propagate to roll back transaction
            }
        }
    }
    console.log(`  Finished processing for ${config.tableName}. ${updatedCount} images newly updated.`);
}

// REMOVE THIS LINE: This call was problematic as it ran independently and too early.
// updateImages().catch(err => {
//     console.error(err);
//     process.exit(1);
// });

module.exports = initDb;
