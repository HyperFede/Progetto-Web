document.addEventListener('DOMContentLoaded', function () {

    populateOrderDetails();
        // Setup event listener for the status save button
    const saveStatusButton = document.getElementById('saveStatusBtn');
    if (saveStatusButton) {
        saveStatusButton.addEventListener('click', handleStatusUpdate);
    }

});

function getOrderIdFromURL() {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('idordine');
}

function populateCustomerInfo(data) {
    const customerFirstNameEl = document.getElementById('customerFirstName');
    const customerLastNameEl = document.getElementById('customerLastName');
    const customerAddressEl = document.getElementById('customerAddress');

    if (customerFirstNameEl) customerFirstNameEl.textContent = data.nomeCliente || 'N/D';
    if (customerLastNameEl) customerLastNameEl.textContent = data.cognomeCliente || 'N/D';
    if (customerAddressEl) customerAddressEl.textContent = data.indirizzoCliente || 'N/D';
}

function populateOrderedProducts(data) {
    const orderedProductsContainerEl = document.getElementById("orderedProductsContainer");
    if (!orderedProductsContainerEl) {
        console.error("Element with ID 'orderedProductsContainer' not found.");
        return;
    }

    orderedProductsContainerEl.innerHTML = ''; // Clear previous products

    if (data.prodotti && data.prodotti.length > 0) {
        const ul = document.createElement('ul');
        ul.className = 'list-group list-group-flush';

        data.prodotti.forEach(prodotto => {
            const li = document.createElement('li');
            li.className = 'list-group-item d-flex align-items-start py-3'; // Use align-items-start for better layout with multi-line text
            // Construct the image URL directly
            const imageUrl = `api/products/${prodotto.idprodotto}/image_content`;

            // Note: No explicit check here if an image exists.
            // The <img> tag will show a broken image icon if the URL 404s.
            // If you need a placeholder, you'd add an onerror handler to the img tag.


            li.innerHTML = `
                <img src="${imageUrl}" alt="${prodotto.nomeProdotto || 'Immagine Prodotto'}" class="me-3 rounded" style="width: 60px; height: 60px; object-fit: cover;">
                <div class="flex-grow-1">
                    <div class="d-flex justify-content-between">
                        <h6 class="my-0">${prodotto.nomeProdotto || 'Prodotto Sconosciuto'}</h6>
                        <span class="text-muted fw-bold">€${prodotto.totaleParzialeProdotto || '0.00'}</span>
                    </div>
                    <small class="text-muted d-block">Quantità: ${prodotto.quantita || 0}</small>
                    <small class="text-muted d-block">Prezzo Unitario: €${prodotto.prezzoStoricoUnitario || '0.00'}</small>
                </div>
            `
            ul.appendChild(li);

        });
        orderedProductsContainerEl.appendChild(ul);
        const totalOrderPrice = document.getElementById('totalOrderPrice');
        totalOrderPrice.textContent = `Totale dovuto a te: €${data.prezzototalesubordine || '0.00'}`;

    } else {
        orderedProductsContainerEl.innerHTML = '<p class="text-muted">Nessun prodotto in questo sub-ordine.</p>';
    }
}

function populateSubOrderStatus(data) {
    const selectEl = document.getElementById('orderStatus');
    const badgeEl = document.getElementById('orderStatusBadge');

    if (!selectEl || !badgeEl) return;

    // 1) Set the dropdown to the incoming status (so the form control matches)
    selectEl.value = data.subOrdineStatus || 'In attesa';

    // 2) Reset badge and text
    badgeEl.textContent = data.subOrdineStatus || '—';
    badgeEl.className = 'badge'; // clear any old classes

    // 3) Add the proper Bootstrap color
    switch (data.subOrdineStatus) {
        case 'In attesa':
            badgeEl.classList.add('bg-warning', 'text-dark');
            break;
        case 'Da spedire':
            badgeEl.classList.add('bg-info', 'text-dark');
            break;
        case 'Spedito':
            badgeEl.classList.add('bg-primary');
            break;
        case 'Consegnato':
            badgeEl.classList.add('bg-success');
            break;
        case 'Scaduto':
            badgeEl.classList.add('bg-danger');
            break;
        default:
            badgeEl.classList.add('bg-secondary');
    }
}

    // Disable select and button if status is 'Consegnato' or 'Scaduto'
    if (data.subOrdineStatus === 'Consegnato' || data.subOrdineStatus === 'Scaduto') {
        selectEl.disabled = true;
        const saveBtn = document.getElementById('saveStatusButton');
        if (saveBtn) saveBtn.disabled = true;
    } else {
        selectEl.disabled = false;
        const saveBtn = document.getElementById('saveStatusButton');
        if (saveBtn) saveBtn.disabled = false;
    }



async function populateOrderDetails() {

    try {
        let idordine = getOrderIdFromURL();
        const orderNumberValue = document.getElementById('orderNumberValue');
        if(orderNumberValue) orderNumberValue.textContent = `#${idordine || 'N/D'}`;

        if (!idordine) {
    console.error("ID Ordine non trovato nella URL.");
    document.body.innerHTML = '<p class="text-center text-danger">ID Ordine mancante. Impossibile caricare i dettagli.</p>';
    return;
}

        let infosession = await fetchData("api/auth/session-info", "GET");

        let idartigiano = infosession.data ? infosession.data.idutente : null;
        if (!idartigiano) {
            console.error("ID Artigiano non trovato nella sessione.");
            document.body.innerHTML = '<p class="text-center text-danger">Errore di sessione utente. Impossibile caricare i dettagli.</p>'; return; }



        let response = await fetchData(`api/suborders/order/${idordine}/artisan/${idartigiano}`, "GET",)
        orderData = response.data;
        console.log(response);

        populateCustomerInfo(orderData);
        populateOrderedProducts(orderData);
        populateSubOrderStatus(orderData);
    }
    catch (error) {
        console.log(errore);
        console.error(error);
    }
}

async function handleStatusUpdate() {
    const orderId = getOrderIdFromURL();
    const statusSelectEl = document.getElementById('orderStatus'); // This is the <select>
    const statusUpdateMessageEl = document.getElementById('statusUpdateMessage');

    if (statusUpdateMessageEl) statusUpdateMessageEl.innerHTML = ''; // Clear previous messages

    if (!orderId || !statusSelectEl) {
        console.error("ID Ordine o select dello stato non trovati.");
        if (statusUpdateMessageEl) statusUpdateMessageEl.innerHTML = '<div class="alert alert-danger">Errore: Impossibile aggiornare lo stato. Ricarica la pagina.</div>';
        return;
    }

    const newStatus = statusSelectEl.value;
    if (!newStatus) {
        if (statusUpdateMessageEl) statusUpdateMessageEl.innerHTML = '<div class="alert alert-warning">Seleziona un nuovo stato.</div>';
        return;
    }

    try {
        const infosession = await fetchData("api/auth/session-info", "GET");
        const artisanId = infosession.data ? infosession.data.idutente : null;

        if (!artisanId) {
            if (statusUpdateMessageEl) statusUpdateMessageEl.innerHTML = '<div class="alert alert-danger">Errore: Utente non identificato. Effettua nuovamente il login.</div>';
            return;
        }

        const response = await fetchData(
            `/api/suborders/order/${orderId}/artisan/${artisanId}/status`,
            "PUT",
            { newStatus: newStatus } // Body of the request
        );

        if (response.status === 200 && response.data && response.data.subOrder) {
            if (statusUpdateMessageEl) statusUpdateMessageEl.innerHTML = `<div class="alert alert-success"> 'Stato aggiornato con successo!'</div>`;
            populateSubOrderStatus(response.data.subOrder); // Update the displayed status badge and select element
        } else {
            if (statusUpdateMessageEl) statusUpdateMessageEl.innerHTML = `<div class="alert alert-danger">${response.message || (response.data && response.data.message) || 'Errore durante l\'aggiornamento dello stato.'}</div>`;
        }
    } catch (error) {
        console.error("Errore durante l'aggiornamento dello stato:", error);
        if (statusUpdateMessageEl) statusUpdateMessageEl.innerHTML = `<div class="alert alert-danger">Errore di comunicazione: ${error.message || 'Dettagli non disponibili.'}</div>`;
    }
}
