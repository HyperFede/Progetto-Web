-- ==================================================
-- 1. Tabella Utente (con soft delete)
-- ==================================================
CREATE TABLE IF NOT EXISTS Utente (
    IDUtente SERIAL PRIMARY KEY,
    Username VARCHAR(255) NOT NULL UNIQUE,
    Nome VARCHAR(255) NOT NULL,
    Cognome VARCHAR(255) NOT NULL,
    Email VARCHAR(255) NOT NULL UNIQUE,
    Password VARCHAR(255) NOT NULL,
    Tipologia VARCHAR(20) NOT NULL CHECK (Tipologia IN ('Admin','Cliente','Artigiano')),
    PIVA VARCHAR(50),
    AdminTimeStampCreazione TIMESTAMP,
	ArtigianoDescrizione VARCHAR(255),
    Deleted BOOLEAN NOT NULL DEFAULT FALSE, -- Soft delete
    
    CHECK (
        (Tipologia = 'Admin' AND AdminTimeStampCreazione IS NOT NULL) OR 
        (Tipologia <> 'Admin' AND AdminTimeStampCreazione IS NULL)
    ),

	CHECK (
		(Tipologia = 'Artigiano' AND ArtigianoDescrizione IS NOT NULL) OR
		(Tipologia <> 'Artigiano' AND ArtigianoDescrizione IS NULL)
	)
);


-- ==================================================
-- 2. Tabella Carrello 
-- ==================================================
CREATE TABLE IF NOT EXISTS Carrello (
    IDCarrello SERIAL PRIMARY KEY,
    IDUtente INTEGER NOT NULL UNIQUE REFERENCES Utente(IDUtente) 
        ON DELETE CASCADE 
        ON UPDATE CASCADE
);

-- ==================================================
-- 3. Tabella Prodotto (con soft delete)
-- ==================================================
CREATE TABLE IF NOT EXISTS Prodotto (
    IDProdotto SERIAL PRIMARY KEY,
    Nome VARCHAR(255) NOT NULL,
    Descrizione TEXT NOT NULL,
    Categoria VARCHAR(100) NOT NULL,
    PrezzoUnitario NUMERIC(10,2) NOT NULL,
    QuantitaDisponibile INTEGER NOT NULL CHECK (QuantitaDisponibile >= 0),
    Immagine BYTEA,
    IDArtigiano INTEGER NOT NULL REFERENCES Utente(IDUtente)
        ON DELETE CASCADE 
        ON UPDATE CASCADE,
    Deleted BOOLEAN NOT NULL DEFAULT FALSE -- Soft delete
);

-- ==================================================
-- 4. Tabella Ordine (con soft delete)
-- ==================================================
CREATE TABLE IF NOT EXISTS Ordine (
    IDOrdine SERIAL PRIMARY KEY,
    IDUtente INTEGER REFERENCES Utente(IDUtente)
        ON DELETE CASCADE  -- Blocca cancellazioni fisiche
        ON UPDATE CASCADE,
    Data DATE NOT NULL,
    Ora TIME NOT NULL,
    ImportoTotale NUMERIC(10,2) NOT NULL,
    Deleted BOOLEAN NOT NULL DEFAULT FALSE -- Soft delete
);

-- ==================================================
-- 5. Tabella DettagliOrdine 
-- ==================================================
CREATE TABLE IF NOT EXISTS DettagliOrdine (
    IDOrdine INTEGER REFERENCES Ordine(IDOrdine) ON DELETE CASCADE,
    IDProdotto INTEGER NOT NULL REFERENCES Prodotto(IDProdotto) ON DELETE CASCADE,
    Quantita INTEGER NOT NULL,
    PrezzoStoricoUnitario NUMERIC(10,2) NOT NULL,
    PRIMARY KEY (IDOrdine, IDProdotto)
);

-- ==================================================
-- 6. Tabella Recensione 
-- ==================================================
CREATE TABLE IF NOT EXISTS Recensione (
    IDRecensione SERIAL PRIMARY KEY,
    IDUtente INTEGER REFERENCES Utente(IDUtente) 
        ON DELETE CASCADE  
        ON UPDATE CASCADE,
    IDProdotto INTEGER NOT NULL REFERENCES Prodotto(IDProdotto) ON DELETE CASCADE,
    Testo TEXT NOT NULL,
    Valutazione INTEGER CHECK (Valutazione BETWEEN 1 AND 5),
    Immagine BYTEA,
    Data DATE NOT NULL,
    Ora TIME NOT NULL
);

-- ==================================================
-- 7. Tabella Problema 
-- ==================================================
CREATE TABLE IF NOT EXISTS Problema (
    IDProblema SERIAL PRIMARY KEY,
    IDCliente INTEGER REFERENCES Utente(IDUtente)
        ON DELETE CASCADE 
        ON UPDATE CASCADE,
    IDArtigiano INTEGER REFERENCES Utente(IDUtente)
        ON DELETE CASCADE
        ON UPDATE CASCADE,
    IDAdmin INTEGER REFERENCES Utente(IDUtente)
        ON DELETE RESTRICT  -- Blocca cancellazioni fisiche, gli admin non possono essere cancellati
        ON UPDATE CASCADE,
    IDOrdine INTEGER NOT NULL REFERENCES Ordine(IDOrdine) 
        ON DELETE CASCADE
        ON UPDATE CASCADE,
    Descrizione TEXT NOT NULL,
    Status VARCHAR(50) NOT NULL CHECK (Status IN ('Aperto', 'Risolto', 'In lavorazione')),
	TimeStampSegnalazione TIMESTAMP NOT NULL,
	
    CHECK (IDCliente IS NOT NULL OR IDArtigiano IS NOT NULL)
);

-- ==================================================
-- 8. Tabella StoricoApprovazioni 
-- ==================================================
CREATE TABLE IF NOT EXISTS StoricoApprovazioni (
    IDStorico SERIAL PRIMARY KEY,
    IDArtigiano INTEGER NOT NULL REFERENCES Utente(IDUtente)
        ON DELETE CASCADE 
        ON UPDATE CASCADE,
    IDAdmin INTEGER REFERENCES Utente(IDUtente)
        ON DELETE RESTRICT  -- Blocca cancellazioni fisiche, gli admin non possono essere cancellati
        ON UPDATE CASCADE,
    DataApprovazione TIMESTAMP 
);

-- ==================================================
-- 9. Tabella DettagliCarrello 
-- ==================================================
CREATE TABLE IF NOT EXISTS DettagliCarrello (
    IDCarrello INTEGER REFERENCES Carrello(IDCarrello)
        ON DELETE CASCADE 
        ON UPDATE CASCADE,
    IDProdotto INTEGER NOT NULL REFERENCES Prodotto(IDProdotto)
        ON DELETE CASCADE 
        ON UPDATE CASCADE,
    Quantita INTEGER NOT NULL CHECK (Quantita > 0),
    TotaleParziale NUMERIC(10,2) NOT NULL,
    PRIMARY KEY (IDCarrello, IDProdotto)
);

-- ==================================================
-- 10. Tabella Pagamento 
-- ==================================================
CREATE TABLE IF NOT EXISTS Pagamento (
    IDPagamento SERIAL PRIMARY KEY,
    IDOrdine INTEGER UNIQUE NOT NULL REFERENCES Ordine(IDOrdine)
        ON DELETE CASCADE 
        ON UPDATE CASCADE,
    StripePaymentIntentID VARCHAR(255) NOT NULL,
    StripeStatus VARCHAR(50) NOT NULL,
    Modalita VARCHAR(50) NOT NULL CHECK (Modalita IN ('Carta', 'PayPal', 'Bonifico')), --Da cambiare vedendo Stripe integration
    ImportoTotale NUMERIC(10,2) NOT NULL,
    Timestamp TIMESTAMP NOT NULL
);