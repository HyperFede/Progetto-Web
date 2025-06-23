@echo off
echo --- Esecuzione dei test del Frontend ---
REM Vai nella directory del frontend
cd backend\

REM Esegui i test
REM `-- --ci` o `-- --watchAll=false` sono importanti per i runner come Jest/React Scripts
npm run test -- --ci
IF %ERRORLEVEL% NEQ 0 (
    echo I test del Frontend sono falliti. Interruzione.
    exit /b 1
)
echo --- Test del Frontend superati ---

REM Torna alla directory principale
cd ..

echo --- Avvio dei servizi Docker Compose ---

REM Avvia i servizi, forzando la ricostruzione delle immagini
docker-compose up --build -d

echo --- Applicazione avviata! ---
echo Frontend disponibile su http://localhost:3000