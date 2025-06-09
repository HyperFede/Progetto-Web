# Progetto-Web - Bazart

## 🚀 Come Avviare l'Applicazione

### Prerequisiti

Assicurati di avere installato:

  * **Docker Desktop** (include Docker Engine e Docker Compose)
      * [Scarica per Windows](https://docs.docker.com/desktop/install/windows-install/)
      * [Scarica per Mac](https://docs.docker.com/desktop/install/mac-install/)
      * [Installa Docker Engine per Linux](https://docs.docker.com/engine/install/) e [Docker Compose](https://docs.docker.com/compose/install/linux/)

### 1\. Clona il Repository

```bash
git clone https://github.com/tuo-utente/nome-repository.git
cd nome-repository
```

### 2\. Configura le Variabili d'Ambiente

Il progetto utilizza un file `.env` per gestire le configurazioni.

Crea un file chiamato `.env` nella **directory principale** del progetto (accanto a `docker-compose.yml`). Incolla il seguente contenuto al suo interno:

```dotenv
# .env (nella root del progetto)

# Configurazione Database PostgreSQL
DB_HOST=db
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=postgres
DB_NAME=postgres

# Chiavi Segrete (Generale e Stripe)
JWT_SECRET=f87e58e1e8d91d53486cef03e59ab0f39cfe8f88087a3cd95b56b4ab0694e2d7fbea4e561db33158eff99aba57997a39cbf2e2df915ff05aad7253
STRIPE_SECRET_KEY=sk_test_51RVYfSRaX6Yy2asGDhNBcOCqgcIAKYNEztALLiz0IDrUvOeZrgDdWWdLH30GRWGCAnHFgUKiyhoK6pNjpe4Ehzlj00JKU0c7sK
STRIPE_PUBLISHABLE_KEY=pk_test_51RVYfSRaX6Yy2asG7D3nJVTn5xJt1boMLN8fh5ERiGDymbquFvdOVgn89nGzl1MUQ868ZNIyoW1TK6SltOJIZVF005zZcLgNQ
STRIPE_WEBHOOK_SECRET=whsec_temp

# URL del Frontend (usato dal backend per certi callback, es. Stripe)
FRONTEND_URL=http://localhost:3000

# Porta interna del servizio Backend (non modificare se non strettamente necessario)
PORT=5000
```

### 3\. Avvia i Servizi Docker

Dalla directory principale del progetto (dove si trova `docker-compose.yml`), esegui questo comando nel tuo terminale:

```bash
docker-compose build --no-cache
docker-compose up -d
```

Questo comando avvierà tutti i servizi: il database PostgreSQL, il backend Node.js e il frontend

-----

## 🌐 Accedere all'Applicazione

Una volta che tutti i servizi sono stati avviati con successo:

  * **Frontend:** Apri il tuo browser web e naviga all'indirizzo:
    [http://localhost:3000](http://localhost:3000)

  * **Backend API (per test diretti):** Per necessità di accedere direttamente agli endpoint è possibile con l'indirizzo:
    [http://localhost:5000/api/...](http://localhost:5000/api/)