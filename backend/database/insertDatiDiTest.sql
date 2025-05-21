
DO $$
BEGIN
    -- Controlla se la tabella Utente contiene già dei record.
    -- Se è vuota, procedi con l'inserimento di tutti i dati di test.
    IF NOT EXISTS (SELECT 1 FROM Utente LIMIT 1) THEN
        RAISE NOTICE 'La tabella Utente è vuota. Inserimento dei dati di test in corso...';

        -- Inserimento Utenti
        INSERT INTO Utente (Username, Nome, Cognome, Email, Password,Indirizzo, Tipologia, PIVA, AdminTimeStampCreazione, ArtigianoDescrizione) 
        VALUES
        -- Admin
        ('admin1', 'Mario', 'Rossi', 'admin@example.com', 'adminpass', 'Via Roma,43,Busto Arsizio','Admin', NULL, CURRENT_TIMESTAMP, NULL),
        -- Artigiani
        ('artigiano1', 'Luca', 'Bianchi', 'luca@example.com', 'artpass1', 'Via Roma,43,Busto Arsizio', 'Artigiano', 'IT12345678901', NULL, 'Artigiano del legno'),
        ('artigiano2', 'Sofia', 'Verdi', 'sofia@example.com', 'artpass2', 'Viale XX Settembre,23,Gallarate', 'Artigiano', 'IT98765432109', NULL, 'Ceramista'),
        -- Clienti
        ('cliente1', 'Giovanni', 'Neri', 'giovanni@example.com', 'cliente1pass', 'Piazza Garibaldi,3, Milano', 'Cliente', NULL, NULL, NULL),
        ('cliente2', 'Maria', 'Gialli', 'maria@example.com',  'cliente2pass', 'Viale Cadorna ,43, Varese', 'Cliente', NULL, NULL, NULL),
        ('cliente3', 'Anna', 'Blu', 'anna@example.com',  'cliente3pass', 'Via Milano,43, Roma', 'Cliente', NULL, NULL, NULL);

        -- Inserimento Carrelli (1 per utente)
        INSERT INTO Carrello (IDUtente)
        SELECT IDUtente FROM Utente;

        -- Inserimento Prodotti
        INSERT INTO Prodotto (Nome, Descrizione, Categoria, PrezzoUnitario, QuantitaDisponibile, IDArtigiano) 
        VALUES
        -- Prodotti Artigiano1 (ID 2)
        ('Tavolo in legno', 'Tavolo artigianale in rovere', 'Arredamento', 250.00, 5, 2),
        ('Sedia in legno', 'Sedia intagliata a mano', 'Arredamento', 120.00, 10, 2),
        ('Scultura in legno', 'Scultura moderna in legno di ulivo', 'Decorazione', 180.00, 3, 2),
        -- Prodotti Artigiano2 (ID 3)
        ('Vaso in ceramica', 'Vaso dipinto a mano', 'Decorazione', 45.00, 15, 3),
        ('Set tazze', 'Set di 4 tazze in ceramica', 'Cucina', 60.00, 8, 3),
        ('Piatto decorativo', 'Piatto in ceramica con motivi geometrici', 'Cucina', 35.00, 20, 3);

        -- Inserimento Ordini
        INSERT INTO Ordine (IDUtente, Data, Ora, ImportoTotale) 
        VALUES
        (4, '2023-10-01', '10:00:00', 545.00),
        (4, '2023-10-05', '15:30:00', 240.00),
        (5, '2023-10-10', '12:15:00', 105.00),
        (6, '2023-10-15', '09:45:00', 180.00);

        -- Dettagli Ordini
        INSERT INTO DettagliOrdine (IDOrdine, IDProdotto, Quantita, PrezzoStoricoUnitario) 
        VALUES
        (1, 1, 2, 250.00), (1, 4, 1, 45.00),   -- Ordine 1
        (2, 2, 1, 120.00), (2, 5, 2, 60.00),   -- Ordine 2
        (3, 6, 3, 35.00),                      -- Ordine 3
        (4, 3, 1, 180.00);                     -- Ordine 4

        -- Pagamenti
        INSERT INTO Pagamento (IDOrdine, StripePaymentIntentID, StripeStatus, Modalita, ImportoTotale, Timestamp) 
        VALUES
        (1, 'pi_1A1b2c3d', 'succeeded', 'Carta', 545.00, '2023-10-01 10:00:00'),
        (2, 'pi_4D5e6f7g', 'succeeded', 'PayPal', 240.00, '2023-10-05 15:30:00'),
        (3, 'pi_7H8i9j0k', 'succeeded', 'Carta', 105.00, '2023-10-10 12:15:00'),
        (4, 'pi_0L1m2n3o', 'succeeded', 'Bonifico', 180.00, '2023-10-15 09:45:00');

        -- Recensioni
        INSERT INTO Recensione (IDUtente, IDProdotto, Testo, Valutazione, Data, Ora) 
        VALUES
        (4, 1, 'Ottimo tavolo, molto robusto!', 5, '2023-10-02', '14:00:00'),
        (5, 4, 'Bello, ma un po fragile.', 4, '2023-10-11', '10:30:00'),
        (6, 3, 'Scultura unica, grazie!', 5, '2023-10-16', '11:20:00');

        -- Problemi
        INSERT INTO Problema (IDCliente, IDArtigiano, IDAdmin, IDOrdine, Descrizione, Status, TimeStampSegnalazione) 
        VALUES
        (4, 2, 1, 1, 'Tavolo arrivato con un graffio.', 'In lavorazione', '2023-10-02 16:00:00');

        -- Approvazioni Artigiani
        INSERT INTO StoricoApprovazioni (IDArtigiano, IDAdmin, DataApprovazione) 
        VALUES
        (2, 1, '2023-09-01 10:00:00'),
        (3, 1, '2023-09-02 11:00:00');

        -- Carrelli con prodotti
        INSERT INTO DettagliCarrello (IDCarrello, IDProdotto, Quantita, TotaleParziale) 
        VALUES
        (4, 2, 1, 120.00),  -- Carrello Cliente1
        (4, 5, 2, 120.00),
        (5, 4, 3, 135.00),  -- Carrello Cliente2
        (6, 3, 1, 180.00);  -- Carrello Cliente3

        RAISE NOTICE 'Dati di test inseriti con successo.';
    ELSE
        RAISE NOTICE 'La tabella Utente contiene già dati. L''inserimento dei dati di test è stato saltato.';
    END IF;
END $$;