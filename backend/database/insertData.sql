DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM Utente LIMIT 1) THEN
        RAISE NOTICE 'Inserimento dati di test...';

        -- 1. Utenti con hash bcrypt generato con salt round 10
        INSERT INTO Utente (IDUtente, Username, Nome, Cognome, Email, Password, Indirizzo, Tipologia, PIVA, AdminTimeStampCreazione, ArtigianoDescrizione) 
        VALUES
        -- Admin (password: admin)
        (1, 'admin', 'Admin', 'System', 'admin@artigiani.it', 
        '$2a$10$Ra4mEmEsJu6lSBBvQN7qpejpFOyadkwCEieNAPcnP5rIXPHoFW51W', -- Sostituisci con hash reale
        'Piazza del Duomo 1, Milano', 'Admin', NULL, CURRENT_TIMESTAMP, NULL),

        -- Artigiani (password: art1, art2, art3)
        (2, 'art1', 'Marco', 'Legno', 'art1@artigiani.it', 
        '$2a$10$9V1s3ki4UO/JuCpibVaC9el2PTNZ3fmY2o2t8EW0QMnzYKIU9PC/O', 
        'Via Falegnami 5, Firenze', 'Artigiano', 'IT12345678901', NULL, 'Falegname specializzato'),
        
        (3, 'art2', 'Laura', 'Ceramica', 'art2@artigiani.it', 
        '$2a$10$rv2sLBPKGPXMrtaa6NAcq.NIkkgqV6xJrvdkKaVzFw2gtjdzZwaeG', 
        'Via della Ceramica 12, Faenza', 'Artigiano', 'IT98765432109', NULL, 'Ceramista tradizionale'),
        
        (4, 'art3', 'Giovanni', 'Vetro', 'art3@artigiani.it', 
        '$2a$10$GpOgEpGHLh/XLJ6oAwuBjOUqH0J1/ywqgpBGjSlSes4OOQMqKKFVe', 
        'Corso Vetrai 33, Murano', 'Artigiano', 'IT45678912345', NULL, 'Maestro vetraio'),

        -- Clienti (password: cli1, cli2, cli3)
        (5, 'cli1', 'Mario', 'Rossi', 'cli1@clienti.it', 
        '$2a$10$McdphCxw7UfOYVneS8FhsO9oQHgx9UwyYZEZNk8E2WOPTASw.bvuG', 
        'Via Roma 123, Milano', 'Cliente', NULL, NULL, NULL),
        
        (6, 'cli2', 'Giulia', 'Bianchi', 'cli2@clienti.it', 
        '$2a$10$EVMCrkSTymDRtJOb1/kKN.Q7H9YaF9PhZoDdKOpy4XavnBH8RTd8i', 
        'Corso Italia 45, Torino', 'Cliente', NULL, NULL, NULL),
        
        (7, 'cli3', 'Paolo', 'Verdi', 'cli3@clienti.it', 
        '$2a$10$tKBwSo.ZcDC/Rnrrb3bDbu/CZa6i.TF3iNf4EzcCF0AmkXdbRs.tq', 
        'Piazza Maggiore 2, Bologna', 'Cliente', NULL, NULL, NULL);

        -- 2. Approvazioni Artigiani
        INSERT INTO StoricoApprovazioni (IDArtigiano, IDAdmin, DataApprovazione) 
        VALUES
        (2, 1, '2024-01-10 09:00:00'),
        (3, 1, '2024-01-11 10:30:00'),
        (4, 1, '2024-01-12 11:45:00');

        -- 3. Prodotti
        INSERT INTO Prodotto (IDProdotto, Nome, Descrizione, Categoria, PrezzoUnitario, QuantitaDisponibile, IDArtigiano) VALUES
        (101, 'Tavolo in Rovere', 'Tavolo massello artigianale', 'Arredamento', 450.00, 3, 2),
        (102, 'Set Tazze Ceramica', 'Set 6 tazze dipinte a mano', 'Cucina', 120.00, 10, 3),
        (103, 'Vaso Murano', 'Vetro soffiato multicolore', 'Decorazione', 250.00, 5, 4);

        -- 4. Ordini
        INSERT INTO Ordine (IDOrdine, IDUtente, Data, Ora, ImportoTotale, Status) VALUES
        (1001, 5, '2024-03-01', '10:00:00', 450.00, 'Consegnato'),
        (1002, 6, '2024-03-05', '14:30:00', 240.00, 'Spedito'),
        (1003, 7, '2024-03-10', '09:15:00', 500.00, 'In attesa');

        -- 5. Dettagli Ordine
        INSERT INTO DettagliOrdine (IDOrdine, IDProdotto, Quantita, PrezzoStoricoUnitario) VALUES
        (1001, 101, 1, 450.00),
        (1002, 102, 2, 120.00),
        (1003, 103, 2, 250.00);

        -- 6. Pagamenti
        INSERT INTO Pagamento (IDOrdine, StripePaymentIntentID, StripeStatus, Modalita, ImportoTotale, Timestamp) VALUES
        (1001, 'pi_3OjExMLwdHq123', 'succeeded', 'Carta', 450.00, '2024-03-01 10:05:00'),
        (1002, 'pi_3OjFyNMxeIr456', 'succeeded', 'PayPal', 240.00, '2024-03-05 14:35:00');

        -- 7. Recensioni
        INSERT INTO Recensione (IDUtente, IDProdotto, Testo, Valutazione, Data, Ora) VALUES
        (5, 101, 'Ottima qualità, prodotto come descritto', 5, '2024-03-02', '11:00:00'),
        (6, 102, 'Belle ma un po delicate', 4, '2024-03-06', '15:30:00');

        -- 8. Dettagli Carrello (5 elementi)
        INSERT INTO DettagliCarrello (IDCliente, IDProdotto, Quantita, TotaleParziale) VALUES
        (5, 101, 2, 900.00),   -- Cli1: 2x Tavolo (450€ cad)
        (5, 102, 1, 120.00),   -- Cli1: 1x Set Tazze
        (6, 103, 3, 750.00),   -- Cli2: 3x Vaso (250€ cad)
        (7, 101, 1, 450.00),   -- Cli3: 1x Tavolo
        (7, 102, 2, 240.00);   -- Cli3: 2x Set Tazze

        -- 9. Problemi (3 casi reali)
        INSERT INTO Problema (IDCliente, IDArtigiano, IDAdmin, IDOrdine, Descrizione, Status, TimeStampSegnalazione) VALUES
        -- Problema cliente 1
        (5, 2, 1, 1001, 'Tavolo arrivato con un angolo scheggiato', 'Risolto', '2024-03-02 14:30:00'),
        -- Problema cliente 2
        (6, NULL, 1, 1002, 'Consegna in ritardo di 7 giorni', 'In lavorazione', '2024-03-06 09:15:00'),
        -- Problema artigiano
        (NULL, 3, 1, 1002, 'Difficoltà nel contattare il cliente per la consegna', 'Aperto', '2024-03-05 16:45:00');

        RAISE NOTICE 'Dati di test inseriti con successo.';
    ELSE
        RAISE NOTICE 'La tabella Utente contiene già dati. Inserimento saltato.';
    END IF;
END $$;