
#User Story - Cliente

###-Navigazione Catalogo:
**Come** cliente, 
**voglio** navigare nel catalogo dei prodotti filtrandoli per categoria, prezzo e disponibilità, 
**in modo da** trovare facilmente ciò che cerco.

####Criteri di accettazione:
-  La pagina "Catalogo" carica dinamicamente i prodotti dal database.
-  I filtri (nome, categoria, disponibilità) aggiornano la lista dei prodotti in tempo reale.
-  Ogni prodotto elencato mostra le informazioni necessarie: nome, descrizione, immagine, prezzo e disponibilità.


###-Acquisto Prodotti:
**Come** cliente, 
**voglio** aggiungere prodotti al carrello e completare l'acquisto tramite un processo di checkout.

####Criteri di accettazione:
-  Il carrello consente di aggiungere, rimuovere o modificare la quantità dei prodotti selezionati.
-  Il sistema calcola il totale del carrello in base ai prodotti selezionati.
-  Il checkout richiede i dati di pagamento e conferma l'ordine e lo notifica all'utente.


###-Gestione Account:
**Come** cliente, 
**voglio** registrarmi e gestire il mio account, 
**per** poter salvare i miei dati personali e visualizzare lo storico degli ordini.

####Criteri di accettazione:
 - La registrazione richiede i campi obbligatori: nome, cognome, email, indirizzo, username e password.
 - L’utente autenticato può modificare i dati personali dal proprio profilo.
 - Lo storico degli ordini mostra la lista degli ordini con dettagli: ID ordine, data, importo e stato.


###-Scrivere Recensioni:
**Come** cliente, 
**voglio** scrivere recensioni sui prodotti acquistati, 
**in modo da** condividere la mia opinione con altri utenti.

####Criteri di accettazione:
- La recensione può essere inviata solo per prodotti effettivamente acquistati e consegnati.
- Ogni recensione include testo, valutazione numerica (1-5), data della recensione e immagini opzionali.
- Le recensioni sono visibili nella pagina del prodotto.

###-Segnalare Problemi:
**Come** cliente, 
**voglio** poter avviare una richiesta di assistenza quando ho un problema con un mio ordine 
**così che** verrà gestito da un admin

####Criteri di accettazione:
- le segnalazioni e il loro stato può essere visto dall'area appostita nella propria area personale.
- Ogni segnalazione contiene descrizione del problema, 


[========]


#User Story - Artigiano

###-Creazione Profilo:
**Come** artigiano, 
**voglio** creare e gestire il mio profilo, 
**per** presentarmi ai clienti.

####Criteri di accettazione:
- La registrazione richiede i campi obbligatori: nome, cognome, email, indirizzo, username, password, e partita IVA.
- L’artigiano autenticato può aggiornare le informazioni del profilo dal pannello di controllo.
- Le informazioni del profilo sono visibili nella pagina dei dettagli dell’artigiano.


###-Gestione Prodotti:
**Come** artigiano, 
**voglio** caricare nuovi prodotti, aggiornarne i dettagli e gestire l’inventario, 
**in modo da** garantire la disponibilità dei prodotti per i clienti.

####Criteri di accettazione:
- Il sistema consente di caricare un nuovo prodotto con: nome, descrizione, prezzo, categoria, quantità e immagine.
- È possibile modificare o eliminare prodotti esistenti dal pannello di controllo.
- Il sistema evidenzia l’artigiano se la quantità di un prodotto scende sotto una soglia preimpostata.


###-Monitoraggio Ordini:
**Come** artigiano, 
**voglio** visualizzare e gestire gli ordini ricevuti

####Criteri di accettazione:
- Gli ordini sono visualizzati con ID ordine, data, cliente, (stato ?) e importo totale.
- L’artigiano può aggiornare lo stato di un ordine (es. “In lavorazione”, “Spedito”).
- Il sistema invia una notifica al cliente in caso di aggiornamento dello stato dell’ordine.


###-Analisi Vendite:
**Come** artigiano, 
**voglio** accedere a una dashboard con statistiche sulle vendite, 
**per** monitorare le performance dei miei prodotti.

####Criteri di accettazione:
Da definire


[========]


#User Story - Amministratore

###-Gestione Segnalazioni:
**Come** amministratore, 
**voglio** visualizzare e risolvere eventuali segnalazioni fatte dai clienti 
**per** garantire il corretto funzionamento della piattaforma.(resi/sostituzioni)

####Criteri di accettazione:
- La dashboard delle segnalazioni mostra l’elenco delle segnalazioni con: ID segnalazione, descrizione, data e stato.
- L’amministratore può cambiare lo stato di una segnalazione (es. “In lavorazione”, “Risolto”).


###-Approvazione Artigiani:
**Come** amministratore, 
**voglio** approvare i profili degli artigiani, 
**in modo da** assicurarmi che siano conformi agli standard della piattaforma.

####Criteri di accettazione:
- I nuovi profili di artigiani sono contrassegnati con lo stato “In attesa di approvazione”.
- L’amministratore può approvare o rifiutare un profilo dalla dashboard di gestione utenti.
- Il sistema notifica l’artigiano in caso di approvazione o rifiuto del profilo.


###-Monitoraggio Attività:
**Come** amministratore, 
**voglio** monitorare le attività sulla piattaforma, 
**per** garantire che tutto funzioni correttamente.

####Criteri di accettazione:
Da definire
