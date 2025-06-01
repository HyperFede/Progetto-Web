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
        INSERT INTO Ordine (IDUtente, Data, Ora, ImportoTotale, Status)
        VALUES
        (5, '2025-01-15', '10:30:00', 0, 'Consegnato'),  -- cli1
        (6, '2025-02-03', '14:22:00', 0, 'Spedito'),     -- cli2
        (5, '2025-02-10', '09:45:00', 0, 'Da spedire'),  -- cli1
        (7, '2025-03-01', '16:15:00', 0, 'In attesa'),   -- cli3
        (6, '2025-03-18', '11:30:00', 0, 'Consegnato'),  -- cli2
        (7, '2025-04-05', '13:05:00', 0, 'Spedito'),     -- cli3
        (5, '2025-04-22', '15:40:00', 0, 'Consegnato'),  -- cli1
        (7, '2025-05-12', '10:10:00', 0, 'Da spedire'),  -- cli3
        (6, '2025-05-19', '17:20:00', 0, 'In attesa'),  -- cli2
        (5, '2025-05-28', '08:55:00', 0, 'Spedito');    -- cli1

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
        CASE 
            WHEN o.Status = 'In attesa' THEN 'In attesa'
            WHEN o.Status = 'Consegnato' THEN 'Consegnato'
            ELSE 'Da spedire'
        END
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
        INSERT INTO StoricoApprovazioni (IDArtigiano, IDAdmin, DataApprovazione)
        VALUES
        (2, 1, '2024-11-01 09:00:00'),
        (3, 1, '2024-11-01 10:30:00'),
        (4, 1, '2024-11-02 11:15:00');

        -- 9. Insert Cart Items
        INSERT INTO DettagliCarrello (IDCliente, IDProdotto, Quantita, TotaleParziale)
        VALUES
        (5, 3, 1, 65.00),
        (5, 6, 2, 150.00),
        (6, 1, 1, 45.00),
        (7, 9, 3, 285.00);

        -- 10. Insert Payments
        INSERT INTO Pagamento (IDOrdine, StripePaymentIntentID, StripeStatus, Modalita, ImportoTotale, Timestamp)
        SELECT 
        IDOrdine,
        'pi_' || MD5(RANDOM()::TEXT)::VARCHAR(27), 
        'succeeded', 
        'Carta', 
        ImportoTotale, 
        (Data || ' ' || Ora)::TIMESTAMP + INTERVAL '5 minutes'
        FROM Ordine;

        RAISE NOTICE 'Dati di test inseriti con successo.';
    ELSE
        RAISE NOTICE 'La tabella Utente contiene già dati. Inserimento saltato.';
    END IF;
END $$;