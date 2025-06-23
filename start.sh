#!/bin/bash

echo "--- Esecuzione dei test del Frontend ---"
# Vai nella directory del frontend
cd backend/

# Esegui i test
# `-- --ci` o `-- --watchAll=false` sono importanti per i runner come Jest/React Scripts
# Il '|| exit 1' fa sì che lo script si fermi se i test falliscono
npm run test -- --ci || { echo "I test del Frontend sono falliti. Interruzione."; exit 1; }

echo "--- Test del Frontend superati ---"

# Torna alla directory principale
cd ..

echo "--- Avvio dei servizi Docker Compose ---"

# Avvia i servizi, forzando la ricostruzione delle immagini
docker-compose up --build -d

echo "--- Applicazione avviata! ---"
echo "Frontend disponibile su http://localhost:3000"