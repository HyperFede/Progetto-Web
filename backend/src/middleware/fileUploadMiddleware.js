const express = require('express');

/**
 * Middleware per passare da richieste di tipo JSON a richieste di tipo "raw" 
 * specificamente per l'upload di immagini.
 * Accetta solo tipi di contenuto immagine (image/*) e gestisce gli errori di tipo non supportato
 * e di dimensione del payload.
 * @param {string} limit - The size limit for the raw body (default = 10mb).
 * @returns {Function} Express middleware function.
 */
function rawImageParser(limit = '10mb') {
    return express.raw({
        type: 'image/*', // Accetta solo tipi di contenuto immagine
        limit: limit,
        // Gestore di errori personalizzato per errori di parsing (tipo o dimensione)
        onerror: (err, req, res, next) => {
            if (err instanceof Error) {
                if (err.type === 'entity.too.large') {
                    return res.status(413).json({ error: `Immagine troppo grande. Limite: ${limit}.` });
                }
                if (err.type === 'media.type.unsupported') {
                     return res.status(415).json({ error: "Tipo di media non supportato. Caricare un file immagine (es. image/jpeg, image/png)." });
                }
            }
            // Passa altri errori alla catena successiva
            next(err);
        }
    });
}

module.exports = {
    rawImageParser // Esporta con un nome più specifico
};
