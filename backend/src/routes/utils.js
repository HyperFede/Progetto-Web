require('dotenv').config();
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../config/db-connect'); // Assicurati che il percorso sia corretto
const { isAuthenticated, hasPermission } = require('../middleware/authMiddleWare'); // Importa isAuthenticated"

const{ sendEmail} = require ("../utils/emailSender");

router.post ('/send-email', async (req, res) => {
    try {
        const {
            destinatario: destinatario,
            oggetto: oggetto,
            testo: testo
        } = req.body;
        if (!destinatario || !oggetto || !testo){
            res.status(400).json({ message: "destinatario,oggetto,testo sono obbligatori" });
        }
        
        sendEmail(destinatario, oggetto, testo);

        res.status(200).json({ message: "Email inviata con successo" });
    }
    catch(error){
        console.error(error);
        res.status(500).json({ message: "Errore del server" });

    }
});

module.exports = router;
