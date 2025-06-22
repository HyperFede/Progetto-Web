function showOrdini(result){
    let ordersRes = ``;
        const orders = result.data.map((order) => {
            if(order.status != "Scaduto"){
                let color = "order-status-shipped";
                let isConsegnato = false; // Flag to check if order is delivered
                if(order.status == "Consegnato"){
                    color = "order-status-delivered"
                    isConsegnato = true;
                }
                ordersRes += (
                    `<div class="order-box mb-4">
                            <div class="order-header-footer d-flex flex-wrap justify-content-between align-items-center p-3">
                                <span>Data Ordine: <strong>${combineDateTime(order.data, order.ora)}</strong></span>
                                <span>Stato: <span class="badge ${color}">${order.status}</span></span>
                                <span>ID Ordine: <strong>#${order.idordine}</strong></span>
                            </div>

                            <div class="order-items-list p-3">`)
                            const products = order.dettagli.map((product) => {
                                let reviewButtonClass = "btn btn-sm write-review-btn ms-auto";
                                // Modify onclick to check aria-disabled before navigating
                                let reviewButtonOnClick = `onclick="if (this.getAttribute('aria-disabled') !== 'true') { window.location.href='recensioneProdotto.html?idordine=${order.idordine}&idprodotto=${product.idprodotto}'; }"`;
                                let reviewButtonAriaDisabled = "false";
                                let reviewButtonTitle = "Scrivi recensione";
                                let reviewButtonText = "Scrivi recensione";
                                if (!isConsegnato) {
                                    reviewButtonClass += " is-disabled"; // Add the disabled class
                                    // For buttons, the 'disabled' attribute handles click prevention.
                                    // The onclick can remain, or be cleared, but 'disabled' is primary.
                                    reviewButtonAriaDisabled = "true";
                                    reviewButtonTitle = "Puoi scrivere una recensione solo per ordini consegnati.";
                                    reviewButtonDisabledAttribute = "disabled"; // Add the HTML disabled attribute
                                }

                                ordersRes += `<div class="order-item d-flex align-items-center py-3">
                                    <img src="/api/products/${product.idprodotto}/image_content" alt="${product.nomeprodotto}" class="order-item-image me-3">
                                    <div class="order-item-details flex-grow-1">
                                        <h6 class="item-name mb-1">${product.nomeprodotto}</h6>
                                        <p class="item-quantity mb-0">Q.tà: ${product.quantita}</p>
                                    </div>
                                    <button ${reviewButtonOnClick} class="${reviewButtonClass}" aria-disabled="${reviewButtonAriaDisabled}" title="${reviewButtonTitle}">${reviewButtonText}</button>
                                </div>`
                            });

                            ordersRes += `</div>

                            <div class="order-header-footer d-flex flex-wrap justify-content-between align-items-center p-3">
                                <span class="order-total    ">Importo Ordine: <strong>€${order.importototale}</strong></span>
                                <button onclick="window.location.href='nuovaSegnalazione.html?idordine=${order.idordine}'" class="btn btn-sm report-problem-btn">Segnala problema</button>
                            </div>
                        </div>`
            }
        });


        document.getElementById("orders").innerHTML = ordersRes;
}


document.addEventListener("DOMContentLoaded", async function(){

    let result = await fetchData(`/api/orders/my-orders`, "GET");
    if(result.status == 200){
        showOrdini(result);

    }else{
        ////console.log("Errore caricamento ordini!")
    }
})