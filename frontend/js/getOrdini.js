function showOrdini(result){
    let ordersRes = ``;
        const orders = result.data.map((order) => {
            if(order.status != "Scaduto"){
                let color = "order-status-shipped";
                let dis = true;
                if(order.status == "Consegnato"){
                    color = "order-status-delivered"
                    dis = false;
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
                                let styleAdding = ""
                                if(dis){
                                    styleAdding = "style='pointer-events: none;'"
                                }
                                ordersRes += `<div class="order-item d-flex align-items-center py-3">
                                    <img src="/api/products/${product.idprodotto}" alt="${product.nomeprodotto}" class="order-item-image me-3">
                                    <div class="order-item-details flex-grow-1">
                                        <h6 class="item-name mb-1">${product.nomeprodotto}</h6>
                                        <p class="item-quantity mb-0">Q.tà: ${product.quantita}</p>
                                    </div>
                                    <a ${styleAdding} href="recensioneProdotto.html?idordine=${order.idordine}&idprodotto=${product.idprodotto}" class="btn btn-sm write-review-btn ms-auto">Scrivi recensione</a>
                                </div>`
                            });

                            ordersRes += `</div>

                            <div class="order-header-footer d-flex flex-wrap justify-content-between align-items-center p-3">
                                <span class="order-total">Importo Ordine: <strong>€${order.importototale}</strong></span>
                                <a href="nuovaSegnalazione.html?idordine=${order.idordine}" class="btn btn-sm report-problem-btn">Segnala problema</a>
                            </div>
                        </div>`
            }
        });


        document.getElementById("orders").innerHTML = ordersRes;
}


document.addEventListener("DOMContentLoaded", async function(){

    let result = await fetchData(`/api/orders/my-orders`, "GET");
    console.log(result);
    if(result.status == 200){
        showOrdini(result);

    }else{
        console.log("Errore caricamento ordini!")
    }
})