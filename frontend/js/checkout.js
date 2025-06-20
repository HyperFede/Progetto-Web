document.addEventListener('DOMContentLoaded', function () {

    const buyNowButton = document.getElementById('buyNowButton');
    const cancelOrderButton = document.getElementById('cancelOrderButton');
    const nomeCognomeUtenteText= document.getElementById('nameSurnameText');
    const indirizzoUtenteText= document.getElementById('addressText');
    const orderReviewItemsList = document.querySelector('.order-review-items-list'); // Target for cart items
    const totalAmountCheckoutText = document.querySelector('.total-amount-checkout'); // Target for total amount
    const checkoutMessageDiv = document.getElementById('checkoutMessage'); // Target for general messages
    var numberOfClicksinBuyButton = 0;
    

    function clearCheckoutMessages() {
        if (checkoutMessageDiv) {
            checkoutMessageDiv.innerHTML = '';
            checkoutMessageDiv.className = 'message-placeholder my-3 text-center'; // Reset classes
            checkoutMessageDiv.style.display = 'none'; // Hide it initially or after clearing
        }
    }

    function displayCheckoutMessage(message, type = 'error') {
        if (checkoutMessageDiv) {
            checkoutMessageDiv.innerHTML = `<span class="${type}-text">${message}</span>`;
            checkoutMessageDiv.className = `message-placeholder my-3 text-center alert alert-${type === 'success' ? 'success' : 'danger'}`;
            checkoutMessageDiv.style.display = 'block';
        }
    }

    async function populateWithUserData() {
        let idutente;
        userdata= await fetchData("api/auth/session-info", "GET");

        if (userdata.status == 200) {
            const nomeCognomeValue = `${userdata.data.nome}, ${userdata.data.cognome}`;
            nomeCognomeUtenteText.textContent = nomeCognomeValue;
            indirizzoUtenteText.textContent = userdata.data.indirizzo;
            idutente=userdata.data.idutente;
        } else {
            console.warn("Utente non autorizzato errore", userdata.status)
        }

        const usercartResponse = await fetchData(`/api/cart/${idutente}`, "GET");

        if (usercartResponse && usercartResponse.data && usercartResponse.data.items) {
            const usercartItems = usercartResponse.data.items;
            const cartTotal = usercartResponse.data.totaleCarrello;

            if (orderReviewItemsList) {
                orderReviewItemsList.innerHTML = ''; // Clear any existing static items
                if (usercartItems.length === 0) {
                    orderReviewItemsList.innerHTML = '<p class="text-center">Il tuo carrello è vuoto.</p>';
                } else {
                    usercartItems.forEach(item => {
                        displayCartItem(item);
                    });
                }
            }

            if (totalAmountCheckoutText && cartTotal !== undefined) {
                totalAmountCheckoutText.textContent = `€${parseFloat(cartTotal).toFixed(2)}`;
            }

        } else {
            console.error("Errore nel recuperare i dati del carrello o carrello vuoto:", usercartResponse);
            if (orderReviewItemsList) orderReviewItemsList.innerHTML = '<p class="text-center">Impossibile caricare il riepilogo del carrello.</p>';
            if (totalAmountCheckoutText) totalAmountCheckoutText.textContent = '€0.00';
        }
    }

    function displayCartItem(item) {
        if (!orderReviewItemsList) return;

        const itemDiv = document.createElement('div');
        itemDiv.className = 'order-review-item d-flex align-items-start py-3';

        // Immagine prodotto (usa l'endpoint corretto per l'immagine)
        const itemImage = document.createElement('img');
        itemImage.src = `/api/products/${item.idprodotto}/image_content`; // Assumendo che questo endpoint restituisca l'immagine
        itemImage.alt = item.nomeprodotto;
        itemImage.className = 'order-review-item-image me-3';

        // Info prodotto
        const itemInfoDiv = document.createElement('div');
        itemInfoDiv.className = 'order-review-item-info flex-grow-1';
        itemInfoDiv.innerHTML = `
            <h6 class="item-name-checkout mb-1">${item.nomeprodotto}</h6>
            <p class="item-quantity-checkout mb-0">Q.tà: ${item.quantita}</p>
        `;

        // Prezzo prodotto
        const itemPriceDiv = document.createElement('div');
        itemPriceDiv.className = 'order-review-item-price text-end ms-3';
        itemPriceDiv.innerHTML = `
            <span class="item-price-value-checkout fw-bold">€${item.totaleparziale}</span>
        `;

        itemDiv.appendChild(itemImage);
        itemDiv.appendChild(itemInfoDiv);
        itemDiv.appendChild(itemPriceDiv);

        orderReviewItemsList.appendChild(itemDiv);
    }
    
    populateWithUserData();
    // Placeholder function for "ACQUISTA ORA"
    async function handleBuyNow() {
        numberOfClicksinBuyButton++;
        let errorMessage
        clearCheckoutMessages(); // Clear previous messages

        let response = await fetchData("api/orders/reserve-and-create-checkout-session", "POST");

        if (response.status==201){
            let redirectLink = response.data.stripeSessionUrl;
            window.location.href = redirectLink;
        }
        else if (response.status===409 && numberOfClicksinBuyButton == 1){
            let remindermessage = response.message;
            errorMessage = "Hai gia un ordine in attesa di pagamento, ID: " + response.body.orderId + ". Clicca ancora ACQUISTA ORA per andare alla pagina di pagamento oppure clicca ANNULLA ORDINE per annullare l'ordine in sospeso.";
            displayCheckoutMessage(errorMessage, 'error');

        }
        else if (response.status===409 && numberOfClicksinBuyButton > 1){
            let redirectLink = response.body.stripeSessionUrl;
            window.location.href = redirectLink;
        }
        else 
        {
            errorMessage = response.message || (response.body && response.body.error) || "Si è verificato un errore durante la creazione della sessione di checkout.";
            displayCheckoutMessage(errorMessage, 'error');
        }




        // Logica per l'acquisto da implementare qui
        // E.g., validazione, chiamata API per creare l'ordine, ecc.
    }


    // Placeholder function for "ANNULLA ORDINE"
    async function handleCancelOrder() {
        clearCheckoutMessages(); // Clear previous messages

        let response = await fetchData("api/orders/my-orders?status=In attesa", "GET");
        
        if (response.data.length>0){
            let idordine = response.data[0].idordine;

            let responseToCancel = await fetchData(`api/orders/${idordine}/cancel`, "POST");
            let errorMessage = "Ordine con ID: " + idordine + " annullato con successo.";
            displayCheckoutMessage(errorMessage, 'success');
            setTimeout(() => {
                window.location.href = 'carrelloUtente.html';
            }, 1000);
            
        }
        else{
            errorMessage = "Non hai nessun ordine in attesa di pagamento"
            displayCheckoutMessage(errorMessage, 'error');
        }
        
        // Logica per annullare l'ordine da implementare qui
        // E.g., svuotare il carrello, reindirizzare, ecc.
    }

    if (buyNowButton) {
        buyNowButton.addEventListener('click', handleBuyNow);
    } else {
        console.warn('Bottone "buyNowButton" NON trovato.');
    }

    if (cancelOrderButton) {
        cancelOrderButton.addEventListener('click', handleCancelOrder);
    } else {
        console.warn('Bottone "cancelOrderButton" NON trovato.');
    }
});