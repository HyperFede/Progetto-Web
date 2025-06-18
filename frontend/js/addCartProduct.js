async function aggiungiAlCarrello(id = null, quantita = 1, buttonElement = null){
    let originalButtonContent = '';
    let feedbackIconElement;
    const animationDuration = 1500; // Durata totale dell'animazione del check (in ms)
    const checkVisibleDuration = 1200; // Quanto tempo il check rimane visibile
    const transitionIconOutDuration = 300; // Durata transizione per far scomparire l'icona

    if(id == null){
        const urlParams = new URLSearchParams(window.location.search);
        id = urlParams.get('id');
    }
    let obj = { // Dichiarata con let
        "quantita": quantita
    };

    if (buttonElement) {
        const buttonTextSpan = buttonElement.querySelector('.button-text');
        if (buttonTextSpan) {
            originalButtonContent = buttonTextSpan.innerHTML; // Salva solo il testo
        } else {
            originalButtonContent = buttonElement.innerHTML; // Fallback
        }

        buttonElement.disabled = true;
        buttonElement.classList.add('loading'); // Nasconde il testo e prepara per l'icona

        // Aggiungi l'icona di check
        feedbackIconElement = document.createElement('span');
        feedbackIconElement.classList.add('cart-feedback-icon');
        feedbackIconElement.innerHTML = '<i class="bi bi-check-lg"></i>'; // Icona Bootstrap
        buttonElement.appendChild(feedbackIconElement);

        // Forza reflow e mostra l'icona
        void feedbackIconElement.offsetWidth;
        setTimeout(() => {
            if (feedbackIconElement) feedbackIconElement.classList.add('show');
        }, 20); // Piccolo ritardo per permettere al CSS di applicare lo stato iniziale
    }

    let result = await fetchData(`api/cart/items/${id}/add`, "PUT", obj);
    if (result.status == 200) {
        // console.log("Aggiunto al carrello (quantità aggiornata)!")
        if (typeof fetchAndUpdateCartCounter === 'function') {
            await fetchAndUpdateCartCounter(true); // Passa true per animare
        }
        // Rimuoviamo la chiamata a animateItemToCart
        // if (buttonElement && typeof animateItemToCart === 'function') {
        //     animateItemToCart(buttonElement);
        // }
    } else if (result.status == 404) { // Prodotto non ancora nel carrello, proviamo ad aggiungerlo come nuovo item
        obj = { // Riassegna obj
            "idprodotto": id,
            "quantita": quantita
        };
        
        let postResult = await fetchData("/api/cart/items", "POST", obj); // Rinominato result per evitare confusione
        if (postResult.status == 201) {
            // console.log("Aggiunto al carrello (nuovo prodotto)!")
            if (typeof fetchAndUpdateCartCounter === 'function') {
                await fetchAndUpdateCartCounter(true); // Passa true per animare
            }
            // Rimuoviamo la chiamata a animateItemToCart
            // if (buttonElement && typeof animateItemToCart === 'function') {
            //     animateItemToCart(buttonElement);
            // }
        } else {
            // console.log("Errore nella aggiunta (POST)!", postResult)
            // Qui si potrebbe mostrare un messaggio di errore all'utente
            if (postResult.message) {
                // alert(`Errore: ${postResult.message}`);
                console.warn("Messaggio dal backend (POST):", postResult.message);
            }
            // Ripristina il pulsante in caso di errore POST
            if (buttonElement) {
                buttonElement.classList.remove('loading');
                if (feedbackIconElement && buttonElement.contains(feedbackIconElement)) {
                    buttonElement.removeChild(feedbackIconElement);
                }
                // Non è necessario ripristinare .button-text.innerHTML perché non l'abbiamo svuotato
                buttonElement.disabled = false;
            }
            return; // Esce per non eseguire la logica di successo del pulsante
        }
    } else {
        // console.log("Errore nell'aggiunta (PUT) o stock terminato!", result)
        // Qui si potrebbe mostrare un messaggio di errore all'utente (es. stock non disponibile)
        if (result.message) {
            // alert(`Errore: ${result.message}`);
            console.warn("Messaggio dal backend (PUT):", result.message);
        }
        // Ripristina il pulsante in caso di errore PUT
        if (buttonElement) {
            buttonElement.classList.remove('loading');
            if (feedbackIconElement && buttonElement.contains(feedbackIconElement)) {
                buttonElement.removeChild(feedbackIconElement);
            }
            buttonElement.disabled = false;
        }
        return; // Esce per non eseguire la logica di successo del pulsante
    }

    // Logica di ripristino del pulsante DOPO che l'aggiunta al carrello (PUT o POST) è andata a buon fine
    if (buttonElement) {
        setTimeout(() => { // Fa scomparire il check
            if (feedbackIconElement) feedbackIconElement.classList.remove('show');

            setTimeout(() => { // Rimuove l'icona e ripristina il pulsante
                buttonElement.classList.remove('loading');
                if (feedbackIconElement && buttonElement.contains(feedbackIconElement)) {
                    buttonElement.removeChild(feedbackIconElement);
                }
                // Il testo originale (.button-text) dovrebbe riapparire grazie alla rimozione di 'loading'
                buttonElement.disabled = false;
            }, transitionIconOutDuration); // Attende la fine della transizione dell'icona
        }, checkVisibleDuration); // Tempo in cui il check rimane visibile
    }
    }
