-- Inserimento Utenti
INSERT INTO Utente (Username, Nome, Cognome, Email, Password, Tipologia, PIVA, AdminTimeStampCreazione) VALUES
('admin1', 'Marco', 'Rossi', 'admin@example.com', 'adminpass', 'Admin', NULL, NOW()),
('cliente1', 'Luca', 'Bianchi', 'cliente1@mail.com', 'cliente1pass', 'Cliente', NULL, NULL),
('cliente2', 'Sofia', 'Verdi', 'cliente2@mail.com', 'cliente2pass', 'Cliente', NULL, NULL),
('cliente3', 'Giulia', 'Neri', 'cliente3@mail.com', 'cliente3pass', 'Cliente', NULL, NULL),
('artigiano1', 'Giovanni', 'Ferrari', 'artigiano1@mail.com', 'artpass1', 'Artigiano', 'IT12345678901', NULL),
('artigiano2', 'Maria', 'Russo', 'artigiano2@mail.com', 'artpass2', 'Artigiano', 'IT98765432109', NULL),
('artigiano3', 'Paolo', 'Esposito', 'artigiano3@mail.com', 'artpass3', 'Artigiano', 'IT11223344556', NULL);


-- Inserimento Carrelli
INSERT INTO Carrello (IDUtente) VALUES 
(2), (3), (4);


-- Inserimento Prodotti
INSERT INTO Prodotto (Nome, Descrizione, Categoria, PrezzoUnitario, QuantitaDisponibile, IDArtigiano) VALUES
('Vaso in Ceramica', 'Vaso artigianale dipinto a mano', 'Decorazioni', 45.00, 10, 5),
('Collana Argento', 'Collana con pendente in argento 925', 'Gioielli', 89.90, 5, 6),
('Scultura Legno', 'Scultura in noce massiccio', 'Arredamento', 150.00, 3, 7),
('Tazza Dipinta', 'Tazza in ceramica con decorazioni floreali', 'Cucina', 18.50, 20, 5),
('Portachiavi in Cuoio', 'Portachiavi artigianale in cuoio', 'Accessori', 12.00, 50, 6);

-- Inserimento Ordini
INSERT INTO Ordine (IDUtente, Data, Ora, ImportoTotale) VALUES
(2, '2023-10-01', '14:30', 133.50),
(3, '2023-10-02', '10:15', 267.80),
(4, '2023-10-03', '16:45', 89.90),
(2, '2023-10-04', '11:20', 60.00);



-- Inserimento DettagliOrdine
INSERT INTO DettagliOrdine (IDOrdine, IDProdotto, Quantita, PrezzoStoricoUnitario) VALUES
(1, 1, 1, 45.00), (1, 4, 2, 18.50), 
(2, 2, 1, 89.90), (2, 3, 1, 150.00),
(3, 2, 1, 89.90), (4, 5, 5, 12.00);



-- Inserimento Recensioni
INSERT INTO Recensione (IDUtente, IDProdotto, Testo, Valutazione, Data, Ora) VALUES
(2, 1, 'Vaso bellissimo!', 5, '2023-10-05', '09:00'),
(3, 2, 'Collana elegante', 4, '2023-10-06', '15:30'),
(4, 5, 'Qualità eccellente', 5, '2023-10-07', '11:15'),
(NULL, 3, 'Prodotto danneggiato', 2, '2023-10-08', '16:45');



-- Inserimento Problemi
INSERT INTO Problema (IDCliente, IDArtigiano, IDAdmin, IDOrdine, Descrizione, Status) VALUES
(2, NULL, 1, 1, 'Consegna in ritardo', 'Risolto'),
(NULL, 5, 1, 2, 'Prodotto non conforme', 'In lavorazione'),
(3, NULL, NULL, 3, 'Pagamento non registrato', 'Aperto');



-- Inserimento Approvazioni
INSERT INTO StoricoApprovazioni (IDArtigiano, IDAdmin, DataApprovazione) VALUES
(5, 1, '2023-09-01 10:00'), (6, 1, '2023-09-02 11:30');



-- Inserimento DettagliCarrello
INSERT INTO DettagliCarrello (IDCarrello, IDProdotto, Quantita, TotaleParziale) VALUES
(1, 1, 2, 90.00), (1, 4, 1, 18.50),
(2, 2, 1, 89.90), (3, 5, 3, 36.00);



-- Inserimento Pagamenti
INSERT INTO Pagamento (IDOrdine, StripePaymentIntentID, StripeStatus, Modalita, ImportoTotale, Timestamp) VALUES
(1, 'pi_1A2b3C4d', 'succeeded', 'Carta', 82.00, '2023-10-01 14:35:00'),
(2, 'pi_5E6f7G8h', 'succeeded', 'PayPal', 239.90, '2023-10-02 10:20:00'),
(3, 'pi_9I0j1K2l', 'pending', 'Bonifico', 89.90, '2023-10-03 16:50:00'),
(4, 'pi_3M4n5O6p', 'succeeded', 'Carta', 60.00, '2023-10-04 11:25:00');

