	DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM Utente LIMIT 1) THEN
        RAISE NOTICE 'Inserimento dati di test...';

        -- 1. Insert Users
        INSERT INTO Utente (Username, Nome, Cognome, Email, Password, Indirizzo, Tipologia, PIVA, AdminTimeStampCreazione, ArtigianoDescrizione)
        VALUES 
        ('admin', 'Admin', 'System', 'admin@artcraft.com', '$2a$10$Ra4mEmEsJu6lSBBvQN7qpejpFOyadkwCEieNAPcnP5rIXPHoFW51W', 'Piazza Admin 1, Milano', 'Admin', NULL, CURRENT_TIMESTAMP, NULL),
        ('art1', 'Mario', 'Rossi', 'm.rossi@artcraft.com', '$2a$10$9V1s3ki4UO/JuCpibVaC9el2PTNZ3fmY2o2t8EW0QMnzYKIU9PC/O', 'Via Artigiani 5, Roma', 'Artigiano', '12345678901', NULL, 'Ceramiche tradizionali'),
        ('art2', 'Luisa', 'Bianchi', 'l.bianchi@artcraft.com', '$2a$10$rv2sLBPKGPXMrtaa6NAcq.NIkkgqV6xJrvdkKaVzFw2gtjdzZwaeG', 'Corso Craft 12, Firenze', 'Artigiano', '23456789012', NULL, 'Gioielli artigianali'),
        ('art3', 'Paolo', 'Verdi', 'p.verdi@artcraft.com', '$2a$10$GpOgEpGHLh/XLJ6oAwuBjOUqH0J1/ywqgpBGjSlSes4OOQMqKKFVe', 'Largo Artista 3, Venezia', 'Artigiano', '34567890123', NULL, 'Sculture in legno'),
        ('cli1', 'Giulia', 'Russo', 'g.russo@mail.com', '$2a$10$McdphCxw7UfOYVneS8FhsO9oQHgx9UwyYZEZNk8E2WOPTASw.bvuG', 'Via Clienti 7, Napoli', 'Cliente', NULL, NULL, NULL),
        ('cli2', 'Marco', 'Ferrari', 'm.ferrari@mail.com', '$2a$10$EVMCrkSTymDRtJOb1/kKN.Q7H9YaF9PhZoDdKOpy4XavnBH8RTd8i', 'Viale Acquisti 22, Bologna', 'Cliente', NULL, NULL, NULL),
        ('cli3', 'Sara', 'Esposito', 's.esposito@mail.com', '$2a$10$tKBwSo.ZcDC/Rnrrb3bDbu/CZa6i.TF3iNf4EzcCF0AmkXdbRs.tq', 'Piazza Shopping 15, Palermo', 'Cliente', NULL, NULL, NULL);

        -- 2. Insert Products (3 per artisan)
        INSERT INTO Prodotto (Nome, Descrizione, Categoria, PrezzoUnitario, QuantitaDisponibile, IDArtigiano)
        VALUES
        -- Art1 products
        ('Vaso Etrusco', 'Vaso in terracotta dipinto a mano', 'Ceramica', 45.00, 10, 2),
        ('Piatto Decorato', 'Piatto da portata con motivi floreali', 'Ceramica', 30.00, 15, 2),
        ('Anfora Greca', 'Riproduzione anfora antica', 'Ceramica', 65.00, 8, 2),

        -- Art2 products
        ('Collana Argento', 'Collana in argento sterling con pietre', 'Gioielli', 89.00, 20, 3),
        ('Orecchini Turchesi', 'Orecchini con pietre naturali', 'Gioielli', 55.00, 25, 3),
        ('Bracciale Intrecciato', 'Bracciale in argento lavorato', 'Gioielli', 75.00, 18, 3),

        -- Art3 products
        ('Scultura Cavallo', 'Scultura in legno di noce', 'Arredo', 120.00, 5, 4),
        ('Bassorilievo', 'Decorazione muraria in legno di ciliegio', 'Arredo', 85.00, 7, 4),
        ('Porta Gioie', 'Scatola intarsiata con coperchio', 'Arredo', 95.00, 12, 4);

        -- 3. Insert Orders (10 orders across clients)
        INSERT INTO Ordine (IDUtente, Data, Ora, ImportoTotale, Status,StripeCheckOutSessionID)
        VALUES
        (5, '2025-01-10', '12:00:00', 0, 'In attesa', 'cs_1'),
        (6, '2025-01-20', '15:45:00', 0, 'Da spedire', 'cs_2'),
        (5, '2025-01-25', '10:00:00', 0, 'Scaduto', 'cs_3'),
        (7, '2025-02-05', '13:30:00', 0, 'Spedito', 'cs_4'),
        (6, '2025-02-15', '09:15:00', 0, 'Consegnato', 'cs_5'),
        (7, '2025-02-25', '11:50:00', 0, 'In attesa', 'cs_6'),
        (5, '2025-03-05', '14:05:00', 0, 'Da spedire', 'cs_7'),
        (7, '2025-03-20', '16:40:00', 0, 'Spedito', 'cs_8'),
        (6, '2025-04-01', '08:30:00', 0, 'Consegnato', 'cs_9'),
        (5, '2025-04-10', '17:55:00', 0, 'Spedito', 'cs_10');

        -- 4. Insert Order Details (3-4 items per order)
        INSERT INTO DettagliOrdine (IDOrdine, IDProdotto, Quantita, PrezzoStoricoUnitario)
        VALUES
        -- Order 1 (cli1)
        (1, 1, 2, 45.00),
        (1, 4, 1, 89.00),
        (1, 7, 1, 120.00),

        -- Order 2 (cli2)
        (2, 2, 3, 30.00),
        (2, 5, 2, 55.00),

        -- Order 3 (cli1)
        (3, 3, 1, 65.00),
        (3, 6, 1, 75.00),
        (3, 9, 2, 95.00),

        -- Order 4 (cli3)
        (4, 1, 1, 45.00),
        (4, 8, 1, 85.00),

        -- Order 5 (cli2)
        (5, 4, 1, 89.00),
        (5, 5, 1, 55.00),
        (5, 6, 1, 75.00),

        -- Order 6 (cli3)
        (6, 2, 2, 30.00),
        (6, 3, 1, 65.00),
        (6, 7, 1, 120.00),

        -- Order 7 (cli1)
        (7, 8, 3, 85.00),
        (7, 9, 1, 95.00),

        -- Order 8 (cli3)
        (8, 1, 1, 45.00),
        (8, 4, 2, 89.00),
        (8, 5, 1, 55.00),

        -- Order 9 (cli2)
        (9, 3, 2, 65.00),
        (9, 6, 1, 75.00),

        -- Order 10 (cli1)
        (10, 2, 1, 30.00),
        (10, 7, 1, 120.00),
        (10, 8, 1, 85.00);

        -- 5. Update Order Totals
        UPDATE Ordine SET ImportoTotale = (
        SELECT SUM(Quantita * PrezzoStoricoUnitario)
        FROM DettagliOrdine
        WHERE DettagliOrdine.IDOrdine = Ordine.IDOrdine
        );

        -- 6. Insert SubOrders (automatically per artisan)
        INSERT INTO SubOrdine (IDOrdine, IDArtigiano, SubOrdineStatus)
        SELECT DISTINCT 
        dor.IDOrdine, 
        p.IDArtigiano,
        CASE o.Status
            WHEN 'In attesa' THEN 'In attesa'
            WHEN 'Da spedire' THEN 'Da spedire'
            WHEN 'Scaduto' THEN 'Scaduto'
            WHEN 'Spedito' THEN 'Spedito'
            WHEN 'Consegnato' THEN 'Consegnato'
            ELSE 'In attesa' -- Default fallback, though all statuses should be covered by Ordine CHECK constraint
        END AS SubOrdineStatus
        FROM DettagliOrdine as dor
        JOIN Prodotto p ON dor.IDProdotto = p.IDProdotto
        JOIN Ordine o ON dor.IDOrdine = o.IDOrdine;

        -- 7. Insert Reviews
        INSERT INTO Recensione (IDUtente, IDProdotto, Testo, Valutazione, Data, Ora)
        VALUES
        (5, 1, 'Bellissimo vaso, qualità eccellente', 5, '2025-01-25', '14:00:00'),
        (6, 2, 'Buona fattura ma colori sbiaditi', 3, '2025-02-10', '11:30:00'),
        (5, 7, 'Scultura impressionante!', 5, '2025-03-05', '09:15:00'),
        (7, 8, 'Decora perfettamente il mio salotto', 4, '2025-03-10', '16:45:00');

        -- 8. Insert Approvals
        INSERT INTO StoricoApprovazioni (IDArtigiano, IDAdmin, Esito, DataEsito)
        VALUES
        (2, 1, 'Approvato', '2024-11-01 09:00:00'),
        (3, 1, 'Approvato', '2024-11-01 10:30:00'),
        (4, 1, 'Approvato', '2024-11-02 11:15:00');

        -- 9. Insert Cart Items
        INSERT INTO DettagliCarrello (IDCliente, IDProdotto, Quantita, TotaleParziale)
        VALUES
        (5, 3, 1, 65.00),
        (5, 6, 2, 150.00),
        (6, 1, 1, 45.00),
        (7, 9, 3, 285.00);

        -- 10. Insert Payments
        -- Note: TimestampCreazione will use DEFAULT CURRENT_TIMESTAMP if not explicitly provided and the column is defined with it.
        -- We are explicitly setting it here for consistent test data.
        INSERT INTO Pagamento (IDOrdine, StripePaymentIntentID, StripeStatus, Modalita, ImportoTotale, Valuta, TimestampCreazione)
        SELECT 
            o.IDOrdine,
            'pi_' || SUBSTRING(MD5(RANDOM()::TEXT) FOR 27), -- Generates a unique string for StripePaymentIntentID
            'succeeded',                                   -- StripeStatus
            'card',                                        -- Modalita (e.g., from Stripe payment_method_types)
            o.ImportoTotale,
            'EUR',                                         -- Valuta
            (o.Data || ' ' || o.Ora)::TIMESTAMP + INTERVAL '5 minutes' -- TimestampCreazione
        FROM Ordine o
        WHERE o.Status IN ('Consegnato', 'Spedito', 'Da spedire'); -- Only create payments for orders that are logically paid

        -- Insert problem reports with no joint issues and optional admin assignment
        -- Corrected problem reports with valid client-order and artisan-order relationships
        INSERT INTO Problema (
            IDCliente, 
            IDArtigiano, 
            IDAdmin, 
            IDOrdine, 
            Descrizione, 
            Status, 
            Immagine, 
            TimeStampSegnalazione
        ) VALUES
        -- Client-reported problems (must match Ordine.IDUtente)
        (5, NULL, NULL, 1, 'Prodotto danneggiato durante la consegna', 'Aperto', NULL, '2025-01-12 14:30:00'),
        (5, NULL, 1, 3, 'Prodotto diverso da quello ordinato', 'In lavorazione', NULL, '2025-01-27 15:10:00'),
        (5, NULL, NULL, 7, 'Mancano pezzi dalla confezione', 'Aperto', NULL, '2025-03-07 11:20:00'),
        (5, NULL, 1, 10, 'Difetti di fabbricazione visibili', 'Risolto', NULL, '2025-04-12 09:15:00'),
        (6, NULL, NULL, 2, 'Prodotto non funzionante', 'Aperto', NULL, '2025-01-22 16:45:00'),
        (6, NULL, 1, 5, 'Problemi di assemblaggio - istruzioni mancanti', 'Risolto', NULL, '2025-02-17 10:30:00'),
        (6, NULL, 1, 9, 'Materiali di qualità inferiore alle aspettative', 'In lavorazione', NULL, '2025-04-03 14:20:00'),
        (7, NULL, NULL, 4, 'Danno estetico sul prodotto', 'Aperto', NULL, '2025-02-07 09:40:00'),
        (7, NULL, 1, 6, 'Prodotto diverso dal campione mostrato', 'Risolto', NULL, '2025-02-27 13:25:00'),
        (7, NULL, NULL, 8, 'Ritardo nella consegna', 'Aperto', NULL, '2025-03-22 17:55:00'),

        -- Artisan-reported problems (must have SubOrdine for IDOrdine+IDArtigiano)
        (NULL, 2, NULL, 1, 'Pagamento non ricevuto', 'Aperto', NULL, '2025-01-13 10:15:00'),
        (NULL, 2, 1, 5, 'Materiali specificati non disponibili', 'In lavorazione', NULL, '2025-02-16 11:30:00'),
        (NULL, 2, NULL, 8, 'Ritardo nella spedizione dei materiali critici', 'Aperto', NULL, '2025-03-21 15:20:00'),
        (NULL, 2, 1, 10, 'Richiesta chiarimenti su specifiche prodotto', 'Risolto', NULL, '2025-04-11 12:45:00'),
        (NULL, 3, NULL, 1, 'Disaccordo sulla qualità dei materiali richiesti', 'Aperto', NULL, '2025-01-14 09:25:00'),
        (NULL, 3, 1, 4, 'Problemi con fornitore materiali', 'In lavorazione', NULL, '2025-02-06 14:50:00'),
        (NULL, 3, NULL, 7, 'Specifiche prodotto ambigue', 'Aperto', NULL, '2025-03-08 16:35:00'),
        (NULL, 3, 1, 9, 'Richiesta assistenza tecnica post-vendita', 'Risolto', NULL, '2025-04-04 10:10:00'),
        (NULL, 4, NULL, 2, 'Modifiche richieste dopo conferma ordine', 'Aperto', NULL, '2025-01-23 11:55:00'),
        (NULL, 4, 1, 6, 'Pagamento parziale non ricevuto', 'Risolto', NULL, '2025-02-28 15:45:00');


        RAISE NOTICE 'Dati di test inseriti con successo.';
    ELSE
        RAISE NOTICE 'La tabella Utente contiene già dati. Inserimento saltato.';
    END IF;
END $$;