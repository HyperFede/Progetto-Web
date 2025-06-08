const express = require('express');
const router = express.Router();
const pool = require('../config/db-connect.js');
const { isAuthenticated, hasPermission } = require('../middleware/authMiddleWare.js');
const { createQueryBuilderMiddleware } = require('../middleware/queryBuilderMiddleware.js');

const db = pool;

const getCurrentTimestamp = () => new Date().toISOString();

const transformApprovazioneForResponse = (approvazione) => {
    const transformed = { ...approvazione };
    // Ensure IDs are integers. pg driver might return them as strings depending on value size.
    // Using lowercase keys as pg driver typically returns them unless columns are quoted in query.
    if (transformed.idstorico !== undefined && transformed.idstorico !== null) {
        transformed.idstorico = parseInt(transformed.idstorico, 10);
    }
    if (transformed.idartigiano !== undefined && transformed.idartigiano !== null) {
        transformed.idartigiano = parseInt(transformed.idartigiano, 10);
    }
    if (transformed.idadmin !== undefined && transformed.idadmin !== null) {
        transformed.idadmin = parseInt(transformed.idadmin, 10);
    }
    // Dates are generally fine as ISO strings from the DB
    return transformed;
};

const artigianoApprovazioneQueryConfig = {
    allowedFilters: [
        { queryParam: 'idstorico', dbColumn: 'sa.IDStorico', type: 'exact', dataType: 'integer' },
        { queryParam: 'idartigiano', dbColumn: 'sa.IDArtigiano', type: 'exact', dataType: 'integer' },
        { queryParam: 'username_artigiano_like', dbColumn: 'u_art.username', type: 'like', dataType: 'string' },
        { queryParam: 'email_artigiano_like', dbColumn: 'u_art.email', type: 'like', dataType: 'string' },
        { queryParam: 'idadmin', dbColumn: 'sa.IDAdmin', type: 'exact', dataType: 'integer' },
        { queryParam: 'esito', dbColumn: 'sa.Esito', type: 'exact', dataType: 'string' }, // Changed from status to esito
        { queryParam: 'dataesito_gte', dbColumn: 'sa.DataEsito', type: 'gte', dataType: 'string' },
        { queryParam: 'dataesito_lte', dbColumn: 'sa.DataEsito', type: 'lte', dataType: 'string' },
    ],
    allowedSortFields: ['IDStorico', 'IDArtigiano', 'username_artigiano', 'Esito', 'DataEsito'], // Adjusted field names
    defaultSortField: 'DataEsito',
    defaultSortOrder: 'DESC',
};
//NOTA, questo endpoint è obsoleto, è gia incluso in POST users/ quanto c'è la tipologia artigiano

router.post('/', isAuthenticated, hasPermission(['Artigiano']), async (req, res) => {
    const { idutente: idartigiano } = req.user;

    try {
        // Check if an 'In attesa' request already exists for this artisan in StoricoApprovazioni
        const existingQuery = `
            SELECT IDStorico FROM StoricoApprovazioni
            WHERE IDArtigiano = $1 AND Esito = 'In attesa';
        `;
        const existingResult = await db.query(existingQuery, [idartigiano]);
        if (existingResult.rowCount > 0) {
            return res.status(409).json({ error: 'You already have a pending or approved application.' });
        }

        // Check if artisan user exists and is indeed an artisan (redundant if hasPermission is robust, but good safeguard)
        const artisanCheck = await db.query("SELECT tipologia FROM Utente WHERE idutente = $1 AND tipologia = 'Artigiano'", [idartigiano]);
        if (artisanCheck.rowCount === 0) {
            return res.status(403).json({ error: 'User is not an artisan or does not exist.' });
        }

        const dataesito = getCurrentTimestamp();
        const esitoIniziale = 'In attesa'; // Or 'In lavorazione' if you prefer

        const insertQuery = `
            INSERT INTO StoricoApprovazioni (IDArtigiano, Esito, DataEsito)
            VALUES ($1, $2, $3)
            RETURNING *;
        `;
        const result = await db.query(insertQuery, [idartigiano, esitoIniziale, dataesito]);
        res.status(201).json(transformApprovazioneForResponse(result.rows[0]));
    } catch (error) {
        console.error('Error creating artigiano approvazione request:', error);
        res.status(500).json({ error: 'Failed to create approvazione request.' });
    }
});

// GET /api/approvals - Admin lists all approval requests
router.get('/', isAuthenticated, hasPermission(['Admin']), createQueryBuilderMiddleware(artigianoApprovazioneQueryConfig), async (req, res) => {
    try {
        const baseQuery = `
            SELECT sa.*,
                   u_art.username AS username_artigiano,
                   u_art.email AS email_artigiano,
                   u_adm.username AS username_admin,
                   u_art.artigianodescrizione as artigianodescrizione,
                   u_art.piva AS piva
            FROM StoricoApprovazioni sa
            JOIN Utente u_art ON sa.IDArtigiano = u_art.idutente
            LEFT JOIN Utente u_adm ON sa.IDAdmin = u_adm.idutente
        `;
        const query = `${baseQuery} ${req.sqlWhereClause} ${req.sqlOrderByClause};`;
        
        const result = await db.query(query, req.sqlQueryValues);
        res.status(200).json(result.rows.map(transformApprovazioneForResponse));
    } catch (error) {
        console.error('Error fetching artigiano approvazione requests:', error);
        res.status(500).json({ error: 'Failed to fetch approvazione requests.' });
    }
});

// GET /api/approvals/me - Artisan checks their own approval status //TODO CAMBIA PERMESSI
//Non ha il permesso Artigiano perchè il permesso Artigiano è solo per approvati
router.get('/me', isAuthenticated, async (req, res) => {
    const { idutente: idartigiano } = req.user;

    // Check if the user is an artisan
    const artisanCheck = await db.query("SELECT tipologia FROM Utente WHERE idutente = $1 AND tipologia = 'Artigiano'", [idartigiano]);
    if (artisanCheck.rowCount === 0) {
        return res.status(403).json({ error: 'User is not Artigiano'});
    }

    try {
        const query = `
            SELECT sa.*, u_adm.username AS username_admin
            FROM StoricoApprovazioni sa
            LEFT JOIN Utente u_adm ON sa.IDAdmin = u_adm.idutente
            WHERE sa.IDArtigiano = $1
            ORDER BY sa.DataEsito DESC;
        `;
        const result = await db.query(query, [idartigiano]);
        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'No approval requests found for you.' });
        }
        res.status(200).json(result.rows.map(transformApprovazioneForResponse));
    } catch (error) {
        console.error(`Error fetching approvazione requests for user ${idartigiano}:`, error);
        res.status(500).json({ error: 'Failed to fetch your approvazione requests.' });
    }
});

// GET /api/approvals/:idstorico - Admin views a specific approval request
router.get('/:idstorico', isAuthenticated, hasPermission(['Admin']), async (req, res) => {
    const { idstorico } = req.params;
    try {
        const query = `
            SELECT sa.*,
                   u_art.username AS username_artigiano,
                   u_art.email AS email_artigiano,
                   u_art.nome AS nome_artigiano,
                   u_art.cognome AS cognome_artigiano,
                   u_adm.username AS username_admin
            FROM StoricoApprovazioni sa
            JOIN Utente u_art ON sa.IDArtigiano = u_art.idutente
            LEFT JOIN Utente u_adm ON sa.IDAdmin = u_adm.idutente
            WHERE sa.IDStorico = $1;
        `;
        const result = await db.query(query, [idstorico]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Approvazione request not found.' });
        }
        res.status(200).json(transformApprovazioneForResponse(result.rows[0]));
    } catch (error)
 {
        console.error(`Error fetching approvazione request ${idstorico}:`, error);
        res.status(500).json({ error: 'Failed to fetch approvazione request.' });
    }
});

// PUT /api/approvals/:idstorico/decide - Admin approves or rejects a request
router.put('/:idstorico/decide', isAuthenticated, hasPermission(['Admin']), async (req, res) => {
    const { idstorico } = req.params;
    const { esito} = req.body; 
    const { idutente: idadmin } = req.user;

    if (!esito || !['Approvato', 'Rifiutato'].includes(esito)) {
        return res.status(400).json({ error: "Invalid status. Must be 'Approvato' or 'Rifiutato'." });
    }

    const client = await db.connect();
    try {
        await client.query('BEGIN');

        // Fetch the request from StoricoApprovazioni to get IDArtigiano and ensure it's 'In attesa'
        const currentRequestQuery = await client.query(
            "SELECT IDArtigiano, Esito FROM StoricoApprovazioni WHERE IDStorico = $1",
            [idstorico]
        );

        if (currentRequestQuery.rowCount === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Approval history record not found.' });
        }

        const currentRequest = currentRequestQuery.rows[0];
        // Use lowercase 'esito' as pg returns unquoted column names in lowercase
        if (currentRequest.esito !== 'In lavorazione') {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: `Request is already '${currentRequest.esito}' and cannot be changed.` });
        }

        const dataesito = getCurrentTimestamp();

        const updateApprovazioneQuery = `
            UPDATE StoricoApprovazioni
            SET Esito = $1, IDAdmin = $2, dataesito = $3
            WHERE IDStorico = $4
            RETURNING *;
        `;
        const approvazioneResult = await client.query(updateApprovazioneQuery, [
            esito,
            idadmin,
            dataesito,
            idstorico
        ]);

        const updatedApprovazione = approvazioneResult.rows[0];

        await client.query('COMMIT');
        res.status(200).json(transformApprovazioneForResponse(updatedApprovazione));

    } catch (error) {
        await client.query('ROLLBACK');
        console.error(`Error processing decision for approvazione request ${idstorico}:`, error);
        res.status(500).json({ error: 'Failed to process approvazione decision.' });
    } finally {
        client.release();
    }
});

// Note: A DELETE route for ArtigianoApprovazione might not be common.
// Usually, these records are kept for auditing. If an artisan re-applies,
// a new record is created. If deletion is needed, it would typically be an Admin-only action.

module.exports = router;

/*
Database Table Schema (Assumed):
CREATE TABLE StoricoApprovazioni (
    IDStorico SERIAL PRIMARY KEY,
    IDArtigiano INTEGER NOT NULL REFERENCES Utente(idutente) 
        ON DELETE CASCADE 
        ON UPDATE CASCADE,
    IDAdmin INTEGER REFERENCES Utente(idutente) 
        ON DELETE RESTRICT
        ON UPDATE CASCADE,
    DataEsito TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    Esito VARCHAR(50) NOT NULL, -- e.g., 'In attesa', 'Approvato', 'Rifiutato'

);

-- Make sure Utente table has:
-- idutente SERIAL PRIMARY KEY
-- username VARCHAR(255) UNIQUE NOT NULL
-- email VARCHAR(255) UNIQUE NOT NULL
-- password_hash VARCHAR(255) NOT NULL
-- tipologia VARCHAR(50) NOT NULL CHECK (tipologia IN ('Cliente', 'Artigiano', 'Admin'))
-- nome VARCHAR(100)
-- cognome VARCHAR(100)
-- status_account VARCHAR(50) DEFAULT 'In attesa di approvazione' -- or 'Attivo', 'Sospeso', 'Rifiutato' etc.
-- is_approved_artisan BOOLEAN DEFAULT FALSE -- Alternative or complementary to status_account
-- created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
-- updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP

-- Index for performance
CREATE INDEX idx_storicoapprovazioni_idartigiano ON StoricoApprovazioni(IDArtigiano);
CREATE INDEX idx_storicoapprovazioni_esito ON StoricoApprovazioni(Esito);
*/