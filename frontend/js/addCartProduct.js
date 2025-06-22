const actionMessageEl = document.getElementById('actionMessage'); // Needs to exist in HTML on pages using this script
let messageTimeout;

function displayActionMessage(message, type = 'success') {
    if (!actionMessageEl) return;

    clearTimeout(messageTimeout); // Clear any existing timeout

    actionMessageEl.textContent = message;
    actionMessageEl.className = 'alert'; // Reset classes
    actionMessageEl.classList.add(type === 'success' ? 'alert-success' : 'alert-danger');
    
    actionMessageEl.style.display = 'block';
    actionMessageEl.style.opacity = '1';

    messageTimeout = setTimeout(() => {
        actionMessageEl.style.opacity = '0';
        // Wait for fade out transition to complete before hiding
        setTimeout(() => {
            actionMessageEl.style.display = 'none';
        }, 500); // Matches the CSS transition duration
    }, 3000); // Message visible for 3 seconds
}



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
        // //console.log("Aggiunto al carrello (quantità aggiornata)!")
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
            // //console.log("Aggiunto al carrello (nuovo prodotto)!")
            if (typeof fetchAndUpdateCartCounter === 'function') {
                await fetchAndUpdateCartCounter(true); // Passa true per animare
            }
            // Rimuoviamo la chiamata a animateItemToCart
            // if (buttonElement && typeof animateItemToCart === 'function') {
            //     animateItemToCart(buttonElement);
            // }
        } else {
            // //console.log("Errore nella aggiunta (POST)!", postResult)
            // Qui si potrebbe mostrare un messaggio di errore all'utente
                        let userMessage = "Si è verificato un errore durante l'aggiunta del prodotto.";

            if (postResult.message) {
                // alert(`Errore: ${postResult.message}`);
                                userMessage = postResult.message;

                console.warn("Messaggio dal backend (POST):", postResult.message);
                                // Check for stock-related keywords or specific status codes
                const stockErrorKeywords = ["disponibile", "disponibilità", "stock", "esaurito", "quantità", "insufficiente"];
                const isStockError = stockErrorKeywords.some(keyword => 
                    postResult.message.toLowerCase().includes(keyword.toLowerCase())
                );
                if (isStockError || postResult.status === 409 || postResult.status === 400 || postResult.status === 422) {
                    displayActionMessage(`Attenzione: ${postResult.message}`, 'danger'); // Use fading message for stock issues
                } else {
                    // For other errors, you might choose a less intrusive notification or just log it
                    // displayActionMessage(`Errore: ${postResult.message}`, 'danger'); 
                }

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
        // //console.log("Errore nell'aggiunta (PUT) o stock terminato!", result)
        // Qui si potrebbe mostrare un messaggio di errore all'utente (es. stock non disponibile)
                let userMessage = "Si è verificato un errore durante l'aggiornamento del carrello.";

        if (result.message) {
            // alert(`Errore: ${result.message}`);
                        userMessage = result.message;

            console.warn("Messaggio dal backend (PUT):", result.message);
                        // Check for stock-related keywords or specific status codes
            const stockErrorKeywords = ["disponibile", "disponibilità", "stock", "esaurito", "quantità", "insufficiente"];
            const isStockError = stockErrorKeywords.some(keyword => 
                result.message.toLowerCase().includes(keyword.toLowerCase())
            );
            if (isStockError) {
                displayActionMessage(`Attenzione: stai tentando di aggiungere al carrello più prodotti di quelli disponibili.`, 'danger'); // Use fading message for stock issues
            } else {
                // displayActionMessage(`Errore: ${result.message}`, 'danger');
            }

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
