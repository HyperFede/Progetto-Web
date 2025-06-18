function showProducts(result){
    let productsRes = ``;
        const products = result.data.items.map((product) => {
            productsRes += (
                `<div id="item-${product.idprodotto}" class="cart-item d-flex align-items-start py-3">
                        <img src="/api/products/${product.idprodotto}/image_content" alt="${product.nomeprodotto}" class="cart-item-image me-3">
                        <div class="cart-item-info flex-grow-1">
                            <h5 class="item-name mb-1">${product.nomeprodotto}</h5>
                            <div class="quantity-controls d-flex align-items-center mt-2">
                                <button class="btn btn-sm remove-item-btn" onclick="deleteCartProduct(${product.idprodotto})" title="Rimuovi articolo">
                                    <i class="bi bi-trash3"></i>
                                </button>
                                <button class="btn btn-sm quantity-btn quantity-minus ms-2" onclick="dimCartProductQta(${product.idprodotto})" title="Diminuisci quantità">
                                    <i class="bi bi-dash-lg"></i>
                                </button>
                                <input type="number" id="num-${product.idprodotto}" class="form-control form-control-sm quantity-input mx-1 text-center" value="${product.quantita}" min="1" aria-label="Quantità" disabled>
                                <button class="btn btn-sm quantity-btn quantity-plus" onclick="addCartProductQta(${product.idprodotto})" title="Aumenta quantità">
                                    <i class="bi bi-plus-lg"></i>
                                </button>
                            </div>
                        </div>
                        <div class="cart-item-price text-end ms-3">
                            <span id="price-${product.idprodotto}" class="item-price-value fw-bold">€${product.totaleparziale}</span>
                            <small id="unit-${product.idprodotto}" class="d-block text-muted">€${product.prezzounitario} cad.</small>
                        </div>
                    </div>`
            )
        });
        document.getElementById("cart-products").innerHTML = productsRes;
}


document.addEventListener("DOMContentLoaded", async function(){
    const cartProductsDiv = document.getElementById('cart-products'); // Used to potentially clear loading message or show errors
    const totalText = document.getElementById("total");

    try {
        const sessionInfoResponse = await fetchData("/api/auth/session-info", "GET");

        if (sessionInfoResponse.status !== 200 || !sessionInfoResponse.data || !sessionInfoResponse.data.idutente) {
            console.error("User not logged in or session error:", sessionInfoResponse);
            if (typeof updateCartView === 'function') {
                updateCartView(true); // Treat as empty cart if user not logged in
            }
            if (cartProductsDiv) cartProductsDiv.innerHTML = '<p class="text-center text-danger p-4">Devi essere loggato per visualizzare il carrello.</p>';
            if (totalText) totalText.textContent = '€0.00';
            // Ensure the proceed button is hidden if updateCartView is not available or did not hide the summary
            const proceedButton = document.getElementById("btn-procedi");
            if(proceedButton) proceedButton.style.display = "none";
            return;
        }

        const userId = sessionInfoResponse.data.idutente;
        const cartResult = await fetchData(`/api/cart/${userId}`, "GET");

        if (cartResult.status === 200 && cartResult.data && cartResult.data.items) {
            const items = cartResult.data.items;
            const isCartEmpty = items.length === 0;

            if (typeof updateCartView === 'function') {
                updateCartView(isCartEmpty);
            } else {
                console.warn("updateCartView function is not defined. Cart view might not update correctly for empty state.");
                // Fallback for hiding proceed button if function is missing and cart is empty
                const proceedButton = document.getElementById("btn-procedi");
                if (isCartEmpty && proceedButton) {
                    proceedButton.style.display = "none";
                }
            }

            if (totalText) { // Always set the total, updateCartView handles visibility of its container
                totalText.textContent = `€${parseFloat(cartResult.data.totaleCarrello || 0).toFixed(2)}`;
            }

            if (!isCartEmpty) {
                showProducts(cartResult); // Pass the whole cartResult
            }
            // If cart is empty, updateCartView has already hidden cart-products and shown the empty message.
        } else {
            console.error("Error loading cart products or cart data is malformed:", cartResult);
            if (typeof updateCartView === 'function') { updateCartView(true); }
            if (cartProductsDiv) cartProductsDiv.innerHTML = '<p class="text-center text-danger p-4">Errore nel caricamento del carrello.</p>';
            if (totalText) totalText.textContent = '€0.00';
        }
    } catch (error) {
        console.error("Exception during cart loading:", error);
        if (typeof updateCartView === 'function') { updateCartView(true); }
        if (cartProductsDiv) cartProductsDiv.innerHTML = '<p class="text-center text-danger p-4">Errore critico nel caricamento del carrello.</p>';
        if (totalText) totalText.textContent = '€0.00';
    }
})