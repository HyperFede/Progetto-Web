function showProducts(result){
    let productsRes = ``;
        const products = result.data.map((product) => {
            productsRes += (
                `<div class="col">
                    <div class="card h-100" style="border-color: var(--secondary-color);">
                        <a href="dettaglioProdotto.html?id=${product.idprodotto}" class="text-decoration-none text-dark">
                        <img src="${product.immagine_url}" class="card-img-top" alt="Immagine Prodotto ${product.idprodotto}" style="height: 200px; object-fit: cover; width: 100%;">
                        </a>
                        <div class="card-body d-flex flex-column p-3">
                            <h5 class="card-title" style="color: var(--primary-color);">${product.nome}</h5>
                            <ul class="list-unstyled mt-2 mb-3 flex-grow-1">
                                <li><small class="text-muted">Valutazioni: <i class="bi bi-star-fill" style="color: var(--primary-color);"></i><i class="bi bi-star-fill" style="color: var(--primary-color);"></i><i class="bi bi-star-fill" style="color: var(--primary-color);"></i><i class="bi bi-star-half" style="color: var(--primary-color);"></i><i class="bi bi-star" style="color: var(--primary-color);"></i></small></li>
                                <li><small class="text-muted">Artigiano: ${product.nomeartigiano}</small></li>
                                <li><strong style="color: var(--primary-color);">Prezzo: €${product.prezzounitario}</strong></li>
                            </ul>
                            <!-- UNLOGGED -->
                            <button class="btn mt-auto unlogged" onclick="window.location.replace('/login.html')" style="background-color: var(--primary-color); color: white;">Aggiungi al carrello</button>

                            <!-- LOGGED (aggiunge il prodotto al carrello)-->
                            <button class="btn mt-auto invisible" onclick="aggiungiAlCarrello(${product.idprodotto})" style="background-color: var(--primary-color); color: white;">Aggiungi al carrello</button>
                        </div>
                    </div>
                </div>`
            )
        });


        document.getElementById("products").innerHTML = productsRes;
}

/**
 * Generates HTML for star rating icons based on a given rating value,
 * rounding up to the nearest half star.
 * E.g., 1.0 -> 1 full; 1.1 -> 1.5 (1 full, 1 half); 1.6 -> 2.0 (2 full)
 * @param {number|string} rating - The rating value (e.g., 3, 3.2, "4.7").
 * @param {number} maxStars - The maximum number of stars to display (default is 5).
 * @returns {string} HTML string representing the star icons.
 */
function getStarsHtml(rating, maxStars = 5){
    let html = '';
    // Ensure rating is a number, default to 0 if null/undefined or not a number
    let numericRating = parseFloat(rating);
    numericRating = isNaN(numericRating) ? 0 : numericRating;

    // Cap rating between 0 and maxStars
    numericRating = Math.max(0, Math.min(numericRating, maxStars));

    // Round up to the nearest 0.5
    // Example: 1.0 -> 1.0; 1.1 -> 1.5; 1.5 -> 1.5; 1.6 -> 2.0
    const displayRating = Math.ceil(numericRating * 2) / 2;

    const fullStars = Math.floor(displayRating);
    const hasHalfStar = (displayRating - fullStars) === 0.5;

    for (let i = 0; i < fullStars; i++) {
        html += '<i class="bi bi-star-fill" style="color: var(--primary-color);"></i>';
    }
    if (hasHalfStar) {
        html += '<i class="bi bi-star-half" style="color: var(--primary-color);"></i>';
    }
    const emptyStars = maxStars - fullStars - (hasHalfStar ? 1 : 0);
    for (let i = 0; i < emptyStars; i++) {
        html += '<i class="bi bi-star" style="color: var(--primary-color);"></i>';
    }
    return html;
}

document.addEventListener("DOMContentLoaded", async function(){
    let result = await fetchData("/api/products/notdeleted", "GET");
    if(result.status == 200){
        showProducts(result);

    }else{
        //console.log("Errore caricamento prodotti!")
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
    })
})