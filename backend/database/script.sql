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
    Indirizzo VARCHAR(255) NOT NULL,
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
-- x. Tabella DettagliCarrello 
-- ==================================================
CREATE TABLE IF NOT EXISTS DettagliCarrello (
    IDCliente INTEGER REFERENCES Utente(IDUtente)
        ON DELETE CASCADE 
        ON UPDATE CASCADE,
    IDProdotto INTEGER NOT NULL REFERENCES Prodotto(IDProdotto)
        ON DELETE CASCADE 
        ON UPDATE CASCADE,
    Quantita INTEGER NOT NULL CHECK (Quantita > 0),
    TotaleParziale NUMERIC(10,2) NOT NULL,
    PRIMARY KEY (IDCliente, IDProdotto)
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
    Status VARCHAR(50) NOT NULL CHECK (Status IN ('In attesa', 'Da spedire', 'Scaduto', 'Spedito', 'Consegnato')) DEFAULT 'In attesa',
    StripeCheckOutSessionID VARCHAR(255) UNIQUE, -- Added UNIQUE constraint
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
-- New table: SubOrdine (sub-order per Artigiano)
-- ==================================================
-- Questa tabella permette di gestire gli ordini suddivisi per Artigiano
-- e lo stato di avanzamento di ciascun Artigiano per un determinato Ordine.


CREATE TABLE IF NOT EXISTS SubOrdine (
    IDOrdine INTEGER NOT NULL REFERENCES Ordine(IDOrdine) ON DELETE CASCADE ON UPDATE CASCADE,
    IDArtigiano INTEGER NOT NULL REFERENCES Utente(IDUtente) ON DELETE CASCADE ON UPDATE CASCADE,
    SubOrdineStatus VARCHAR(50) NOT NULL CHECK (SubOrdineStatus IN ('In attesa', 'Da spedire', 'Scaduto', 'Spedito', 'Consegnato')) DEFAULT 'In attesa',
    PRIMARY KEY (IDOrdine, IDArtigiano) -- assicura che un Artigiano non possa avere più SubOrdini per lo stesso Ordine
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
    Immagine BYTEA,
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
    Esito VARCHAR(50) NOT NULL CHECK (Esito IN ('Approvato', 'Rifiutato','In lavorazione')),
    IDAdmin INTEGER REFERENCES Utente(IDUtente)
        ON DELETE RESTRICT  -- Blocca cancellazioni fisiche, gli admin non possono essere cancellati
        ON UPDATE CASCADE,
    DataEsito TIMESTAMP 
);



-- ==================================================
-- 10. Tabella Pagamento 
-- ==================================================
CREATE TABLE IF NOT EXISTS Pagamento (
    IDPagamento SERIAL PRIMARY KEY,
    IDOrdine INTEGER UNIQUE NOT NULL REFERENCES Ordine(IDOrdine)
        ON DELETE CASCADE
        ON UPDATE CASCADE,
    StripePaymentIntentID VARCHAR(255) NOT NULL UNIQUE, -- Added UNIQUE
    StripeStatus VARCHAR(50) NOT NULL,
    Modalita VARCHAR(255) NOT NULL, -- Removed CHECK constraint, increased length for flexibility
    ImportoTotale NUMERIC(10,2) NOT NULL,
    Valuta VARCHAR(3) NOT NULL, -- Necessary column for currency
    TimestampCreazione TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP -- Added DEFAULT
);