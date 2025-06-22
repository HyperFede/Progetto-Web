function showProducts(result){
    let productsRes = ``;
        const products = result.data.map((product) => {
            productsRes += (
                `<div class="col">
                    <div class="card h-100" style="border-color: var(--secondary-color);">
                        <a href="dettaglioProdotto.html?id=${product.idprodotto}" class="text-decoration-none text-dark">
                        <img src="http://localhost:3000/api/products/${product.idprodotto}/image_content" class="card-img-top" alt="Immagine Prodotto ${product.idprodotto}" style="height: 200px; object-fit: cover; width: 100%;">
                        </a>
                        <div class="card-body d-flex flex-column p-3">
                            <h5 class="card-title" style="color: var(--primary-color);">${product.nome}</h5>
                            <ul class="list-unstyled mt-2 mb-3 flex-grow-1">
                                <li><small class="text-muted">Valutazioni: 
                                    <span id="rating-placeholder-${product.idprodotto}"><small class="text-muted">Caricamento...</small></span>
                                </small></li>
                                <li><small class="text-muted">Artigiano: ${product.nomeartigiano}</small></li>
                                <li><strong style="color: var(--primary-color);">Prezzo: €${parseFloat(product.prezzounitario).toFixed(2)}</strong></li>
                            </ul>
                            <!-- LOGGED (aggiunge il prodotto al carrello)-->
                            <button class="btn mt-auto invisible add-to-cart-button" onclick="aggiungiAlCarrello(${product.idprodotto}, 1, this)" style="background-color: var(--primary-color); color: white;"><span class="button-text">Aggiungi al carrello</span></button>
                            <!-- UNLOGGED -->
                            <button class="btn mt-auto unlogged" onclick="window.location.replace('/login.html')" style="background-color: var(--primary-color); color: white;"><span class="button-text">Aggiungi al carrello</span></button>

                        </div>
                    </div>
                </div>`
            )
        });


        document.getElementById("products").innerHTML = productsRes;
}

/**
 * Fetches and displays the average rating for each product listed.
 * This should be called after showProducts has rendered the product cards.
 * @param {Array} productsData - Array of product objects from the API.
 */
async function loadAndDisplayProductRatings(productsData) {
    if (!productsData || productsData.length === 0) {
        return;
    }

    for (const product of productsData) {
        const ratingPlaceholder = document.getElementById(`rating-placeholder-${product.idprodotto}`);
        if (ratingPlaceholder) {
            // Assuming getHTMLforAverageRating is available globally (e.g., from ratingUtils.js)
            const ratingHtml = await getHTMLforAverageRating(product.idprodotto);
            ratingPlaceholder.innerHTML = ratingHtml;
        }
    }
}


document.addEventListener("DOMContentLoaded", async function(){
    let result = await fetchData("/api/products/notdeleted", "GET");
    if(result.status == 200){
        showProducts(result); // Render product cards first
        await loadAndDisplayProductRatings(result.data); // Then load and display their ratings
    }else{
        ////console.log("Errore caricamento prodotti!")
    }

    
    document.getElementById('searchForm').addEventListener('submit', async function(event) {
        event.preventDefault();

        //prende tutti i dati e li converti in un oggetto facile per inviare all'endpoint
        const formData = new FormData(this);

        const formObj = Object.fromEntries(formData.entries());

        let opt = "?";
        if(formObj.name != ""){
            opt += `nome_like=${formObj.name}&`
        }
        if(formObj.categoria != ""){
            opt += `categoria=${formObj.categoria}&`
        }
        if(formObj.checkStock == ""){
            opt += `quantitadisponibile_gte=1&`
        }
        if(formObj.priceMin != ""){
            opt += `prezzounitario_gte=${formObj.priceMin}&`
        }
        if(formObj.priceMax != ""){
            opt += `prezzounitario_lte=${formObj.priceMax}`
        }

        let resultSearch = await fetchData("/api/products/notdeleted" + opt, "GET");
        showProducts(resultSearch);
        await loadAndDisplayProductRatings(resultSearch.data); // Also load ratings for search results
    })
})