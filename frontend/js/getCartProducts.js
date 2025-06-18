function showProducts(result){
    let productsRes = ``;
        const products = result.data.items.map((product) => {
            productsRes += (
                `<div id="item-${product.idprodotto}" class="cart-item d-flex flex-column flex-sm-row align-items-center align-items-sm-start py-3">
                        <img src="/api/products/${product.idprodotto}/image_content" alt="${product.nomeprodotto}" class="cart-item-image mb-2 mb-sm-0 me-sm-3">
                        <div class="cart-item-info flex-grow-1">
                            <h5 class="item-name mb-1">${product.nomeprodotto}</h5>
                            <div class="quantity-controls d-flex align-items-center mt-2">
                                <button class="btn btn-sm remove-item-btn" onclick="deleteCartProduct(${product.idprodotto})" title="Rimuovi articolo">
                                    <i class="bi bi-trash3"></i>
                                </button>
                                <button class="btn btn-sm quantity-btn quantity-minus ms-2" onclick="dimCartProductQta(${product.idprodotto})" title="Diminuisci quantità">
                                    <i class="bi bi-dash-lg"></i>
                                </button>
                                <input type="number" id="num-${product.idprodotto}" class="form-control form-control-sm quantity-input mx-1 text-center" value="${product.quantita}" min="1" aria-label="Quantità" readonly style="max-width: 60px;">
                                <button class="btn btn-sm quantity-btn quantity-plus" onclick="addCartProductQta(${product.idprodotto})" title="Aumenta quantità">
                                    <i class="bi bi-plus-lg"></i>
                                </button>
                            </div>
                        </div>
                        <div class="cart-item-price text-center text-sm-end mt-2 mt-sm-0 ms-sm-3">
                            <span id="price-${product.idprodotto}" class="item-price-value fw-bold">€${product.totaleparziale}</span>
                            <small id="unit-${product.idprodotto}" class="d-block text-muted">€${product.prezzounitario} cad.</small>
                        </div>
                    </div>`
            )
        });


        document.getElementById("cart-products").innerHTML = productsRes;
        // Assicura che gli input per la quantità siano readonly.
        // Nota: l'attributo 'readonly' è già stato aggiunto direttamente nella stringa HTML dell'input.
        // Questo blocco JS è una doppia sicurezza.
        document.querySelectorAll('.quantity-input').forEach(input => {
            input.setAttribute('readonly', true);
        });
}


document.addEventListener("DOMContentLoaded", async function(){

    let id = (await fetchData("/api/auth/session-info", "GET")).data.idutente;
    

    let result = await fetchData(`/api/cart/${id}`, "GET");
    if(result.data.items.length == 0){
        document.getElementById("btn-procedi").style.display = "none";
    }
    const totalText = document.getElementById("total");
    totalText.textContent = `€${result.data.totaleCarrello}`;
    if(result.status == 200){
        showProducts(result);

    }else{
        //console.log("Errore caricamento prodotti!")
    }
})