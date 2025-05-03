-- ==================================================
-- 1. Tabella Utente
-- ==================================================
CREATE TABLE Utente (
    IDUtente SERIAL PRIMARY KEY,
    Username VARCHAR(255) NOT NULL UNIQUE,
    Nome VARCHAR(255) NOT NULL,
    Cognome VARCHAR(255) NOT NULL,
    Email VARCHAR(255) NOT NULL UNIQUE,
    Password VARCHAR(255) NOT NULL,
    Tipologia VARCHAR(20) NOT NULL CHECK (Tipologia IN ('Admin','Cliente','Artigiano')),
    PIVA VARCHAR(50),
    AdminTimeStampCreazione TIMESTAMP,
    CHECK (
        (Tipologia = 'Artigiano' AND PIVA IS NOT NULL) OR 
        (Tipologia <> 'Artigiano' AND PIVA IS NULL)
    ),
    CHECK (
        (Tipologia = 'Admin' AND AdminTimeStampCreazione IS NOT NULL) OR 
        (Tipologia <> 'Admin' AND AdminTimeStampCreazione IS NULL)
    )
);

-- ==================================================
-- 2. Tabella Carrello (CASCADE)
-- ==================================================
CREATE TABLE Carrello (
    IDCarrello SERIAL PRIMARY KEY,
    IDUtente INTEGER NOT NULL UNIQUE REFERENCES Utente(IDUtente) 
        ON DELETE CASCADE 
        ON UPDATE CASCADE
);

-- Trigger: Verifica che IDUtente sia un Cliente
CREATE OR REPLACE FUNCTION trg_carrello_check_cliente()
RETURNS TRIGGER AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM Utente 
    WHERE IDUtente = NEW.IDUtente AND Tipologia = 'Cliente'
  ) THEN
    RAISE EXCEPTION 'Solo i Clienti possono possedere un carrello';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER carrello_check_cliente
BEFORE INSERT OR UPDATE ON Carrello
FOR EACH ROW
EXECUTE FUNCTION trg_carrello_check_cliente();

-- ==================================================
-- 3. Tabella Prodotto (RESTRICT)
-- ==================================================
CREATE TABLE Prodotto (
    IDProdotto SERIAL PRIMARY KEY,
    Nome VARCHAR(255) NOT NULL,
    Descrizione TEXT NOT NULL,
    Categoria VARCHAR(100) NOT NULL,
    PrezzoUnitario NUMERIC(10,2) NOT NULL,
    QuantitaDisponibile INTEGER NOT NULL CHECK (QuantitaDisponibile >= 0),
    Immagine BYTEA,
    IDArtigiano INTEGER NOT NULL REFERENCES Utente(IDUtente)
        ON DELETE RESTRICT 
        ON UPDATE CASCADE
);

-- Trigger: Verifica che IDArtigiano sia un Artigiano
CREATE OR REPLACE FUNCTION trg_prod_check_artigiano()
RETURNS TRIGGER AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM Utente 
    WHERE IDUtente = NEW.IDArtigiano AND Tipologia = 'Artigiano'
  ) THEN
    RAISE EXCEPTION 'IDArtigiano non è un Artigiano valido';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER prod_check_artigiano
BEFORE INSERT OR UPDATE ON Prodotto
FOR EACH ROW
EXECUTE FUNCTION trg_prod_check_artigiano();

-- ==================================================
-- 4. Tabella Ordine (SET NULL)
-- ==================================================
CREATE TABLE Ordine (
    IDOrdine SERIAL PRIMARY KEY,
    IDUtente INTEGER REFERENCES Utente(IDUtente) -- Nullable
        ON DELETE SET NULL 
        ON UPDATE CASCADE,
    Data DATE NOT NULL,
    Ora TIME NOT NULL,
    ImportoTotale NUMERIC(10,2) NOT NULL
);

-- Trigger: Controlla che IDUtente sia un Cliente (se non NULL)
CREATE OR REPLACE FUNCTION trg_ordine_check_cliente()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.IDUtente IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM Utente 
    WHERE IDUtente = NEW.IDUtente AND Tipologia = 'Cliente'
  ) THEN
    RAISE EXCEPTION 'Solo i Clienti possono creare ordini';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ordine_check_cliente
BEFORE INSERT OR UPDATE ON Ordine
FOR EACH ROW
EXECUTE FUNCTION trg_ordine_check_cliente();

-- ==================================================
-- 5. Tabella DettagliOrdine (CASCADE)
-- ==================================================
CREATE TABLE DettagliOrdine (
    IDOrdine INTEGER REFERENCES Ordine(IDOrdine) ON DELETE CASCADE,
    IDProdotto INTEGER NOT NULL REFERENCES Prodotto(IDProdotto) ON DELETE CASCADE,
    Quantita INTEGER NOT NULL,
    PrezzoStoricoUnitario NUMERIC(10,2) NOT NULL,
    PRIMARY KEY (IDOrdine, IDProdotto)
);

-- ==================================================
-- 6. Tabella Recensione (SET NULL)
-- ==================================================
CREATE TABLE Recensione (
    IDRecensione SERIAL PRIMARY KEY,
    IDUtente INTEGER REFERENCES Utente(IDUtente) -- Nullable
        ON DELETE SET NULL 
        ON UPDATE CASCADE,
    IDProdotto INTEGER NOT NULL REFERENCES Prodotto(IDProdotto) ON DELETE CASCADE,
    Testo TEXT NOT NULL,
    Valutazione INTEGER CHECK (Valutazione BETWEEN 1 AND 5),
    Immagine BYTEA,
    Data DATE NOT NULL,
    Ora TIME NOT NULL
);

-- Trigger: Controlla che IDUtente sia un Cliente (se non NULL)
CREATE OR REPLACE FUNCTION trg_recensione_check_cliente()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.IDUtente IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM Utente 
    WHERE IDUtente = NEW.IDUtente AND Tipologia = 'Cliente'
  ) THEN
    RAISE EXCEPTION 'Solo i Clienti possono lasciare recensioni';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER recensione_check_cliente
BEFORE INSERT OR UPDATE ON Recensione
FOR EACH ROW
EXECUTE FUNCTION trg_recensione_check_cliente();

-- ==================================================
-- 7. Tabella Problema (SET NULL)
-- ==================================================
CREATE TABLE Problema (
    IDProblema SERIAL PRIMARY KEY,
    IDCliente INTEGER REFERENCES Utente(IDUtente)
        ON DELETE CASCADE 
        ON UPDATE CASCADE,
    IDArtigiano INTEGER REFERENCES Utente(IDUtente)
        ON DELETE CASCADE
        ON UPDATE CASCADE,
    IDAdmin INTEGER REFERENCES Utente(IDUtente)
        ON DELETE SET NULL 
        ON UPDATE CASCADE,
    IDOrdine INTEGER NOT NULL REFERENCES Ordine(IDOrdine) 
        ON DELETE CASCADE
        ON UPDATE CASCADE,
    Descrizione TEXT NOT NULL,
    Status VARCHAR(50) NOT NULL CHECK (Status IN ('Aperto', 'Risolto', 'In lavorazione')),
    CHECK (IDCliente IS NOT NULL OR IDArtigiano IS NOT NULL)
);

--NB.Ogni tanto andrebbe aggiornata e cancelliamo le istanze di problemi risolti

-- Trigger: Verifica ruoli (se i campi non sono NULL)
CREATE OR REPLACE FUNCTION trg_problema_check_ruoli()

RETURNS TRIGGER AS $$BEGIN
  IF NEW.IDCliente IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM Utente WHERE IDUtente = NEW.IDCliente AND Tipologia = 'Cliente'
  ) THEN
    RAISE EXCEPTION 'IDCliente non è un Cliente';
  END IF;
  
  IF NEW.IDArtigiano IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM Utente WHERE IDUtente = NEW.IDArtigiano AND Tipologia = 'Artigiano'
  ) THEN
    RAISE EXCEPTION 'IDArtigiano non è un Artigiano';
  END IF;
  
  IF NEW.IDAdmin IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM Utente WHERE IDUtente = NEW.IDAdmin AND Tipologia = 'Admin'
  ) THEN
    RAISE EXCEPTION 'IDAdmin non è un Admin';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER problema_check_ruoli
BEFORE INSERT OR UPDATE ON Problema
FOR EACH ROW
EXECUTE FUNCTION trg_problema_check_ruoli();

-- ==================================================
-- 8. Tabella StoricoApprovazioni (SET NULL)
-- ==================================================
CREATE TABLE StoricoApprovazioni (
    IDStorico SERIAL PRIMARY KEY,
    IDArtigiano INTEGER NOT NULL REFERENCES Utente(IDUtente)
        ON DELETE CASCADE 
        ON UPDATE CASCADE,
    IDAdmin INTEGER REFERENCES Utente(IDUtente) -- Nullable
        ON DELETE SET NULL 
        ON UPDATE CASCADE,
    DataApprovazione TIMESTAMP 
);

--Nota bene, può succedere che l'admin è nullo perché stato cancellato, il CONTROLLO DELLA APPROVAZIONE VA FATTO SUL TIMESTAMP

-- Trigger: Verifica che IDAdmin sia un Admin (se non NULL)
CREATE OR REPLACE FUNCTION trg_storico_check_admin()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.IDAdmin IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM Utente 
    WHERE IDUtente = NEW.IDAdmin AND Tipologia = 'Admin'
  ) THEN
    RAISE EXCEPTION 'Solo gli Admin possono approvare artigiani';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER storico_check_admin
BEFORE INSERT OR UPDATE ON StoricoApprovazioni
FOR EACH ROW
EXECUTE FUNCTION trg_storico_check_admin();

-- ==================================================
-- 9. Tabella DettagliCarrello (M:N tra Carrello e Prodotto)
-- ==================================================
CREATE TABLE DettagliCarrello (
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
-- 10. Tabella Pagamento (1:1 con Ordine)
-- ==================================================
CREATE TABLE Pagamento (
    IDPagamento SERIAL PRIMARY KEY,
    IDOrdine INTEGER UNIQUE NOT NULL REFERENCES Ordine(IDOrdine)
        ON DELETE CASCADE 
        ON UPDATE CASCADE,
    StripePaymentIntentID VARCHAR(255) NOT NULL,
    StripeStatus VARCHAR(50) NOT NULL,
    Modalita VARCHAR(50) NOT NULL CHECK (Modalita IN ('Carta', 'PayPal', 'Bonifico')),
    ImportoTotale NUMERIC(10,2) NOT NULL,
    Timestamp TIMESTAMP NOT NULL
);