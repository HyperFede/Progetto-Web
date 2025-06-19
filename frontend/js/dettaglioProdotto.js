function getProductIdFromURL() { // Renamed for clarity
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('id');
}

function dateFormatter(datestr) {
    const date = new Date(datestr);

    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');

    return `${day}/${month}/${year} ${hours}:${minutes}`;
}

function showReviews(result) { // Renamed from showProducts for clarity
    const reviewContainer = document.getElementById("review");
    if (!reviewContainer) return;

    let reviewsHtml = `<h3 class="customer-reviews-title mb-4">Recensioni dei clienti</h3>`;
    if (!result.data || result.data.length === 0) {
        reviewsHtml += '<p class="text-muted">Non ci sono ancora recensioni per questo prodotto.</p>';
    } else {
        result.data.forEach((rec) => { // Use forEach as we are building a string
        const reviewStarsHtml = getStarsHtml(rec.valutazione); // Use getStarsHtml for individual review ratings
        reviewsHtml += rec.immagine_url != undefined ? (
            `<div class="customer-review-box mb-3">
                    <div class="review-header d-flex justify-content-between align-items-center mb-1">
                        <span class="review-customer-name">${rec.username}</span>
                        <span class="review-date">${combineDateTime(rec.data, rec.ora)}</span>
                    </div>
                    <div class="review-rating-title d-flex align-items-center mb-2">
                        <span class="review-stars me-2">${reviewStarsHtml}</span>
                        ${rec.titolo ? `<strong class="review-object">${rec.titolo}</strong>` : ''}
                    </div>
                    <div class="review-body d-flex align-items-start">
                        <div class="review-image-container me-3">
                            <!-- Corrected image source to fetch review image -->
                            <img src="/api/reviews/${rec.idrecensione}/image_content" alt="Foto recensione di ${rec.username}" class="review-customer-photo">
                        </div>
                        <div class="review-text-content flex-grow-1">
                            <p class="review-text">
                                ${rec.testo}
                            </p>
                        </div>
                    </div>
                </div>`
        ) : (
            `<div class="customer-review-box mb-3">
                    <div class="review-header d-flex justify-content-between align-items-center mb-1">
                        <span class="review-customer-name">${rec.username}</span>
                        <span class="review-date">${combineDateTime(rec.data, rec.ora)}</span>
                    </div>
                    <div class="review-rating-title d-flex align-items-center mb-2">
                        <span class="review-stars me-2">${reviewStarsHtml}</span>
                        ${rec.titolo ? `<strong class="review-object">${rec.titolo}</strong>` : ''}
                    </div>
                    <div class="review-body">
                        <div class="review-text-content">
                            <p class="review-text">
                                ${rec.testo}
                            </p>
                        </div>
                    </div>
                </div>`
        )
    });
    }
    reviewContainer.innerHTML = reviewsHtml;
}


async function loadAndDisplayAverageRating(productId) {
    // Target the div with class 'product-rating-detail' as requested.
    const averageRatingContainer = document.getElementById('averageRating'); // Target by ID as in HTML

    if (!averageRatingContainer) {
        console.warn("Element with class '.product-rating-detail' not found. Cannot display average rating.");
        return;
    }
    if (typeof getHTMLforAverageRating !== 'function') {
        console.warn("'getHTMLforAverageRating' function is not defined. Make sure ratingUtils.js is loaded before dettaglioProdotto.js.");
        averageRatingContainer.innerHTML = '<small class="text-muted">Errore caricamento rating (funzione mancante)</small>';
        return;
    }

    try {
        averageRatingContainer.innerHTML = `<small class="text-muted">Caricamento valutazione...</small>`; // Initial loading message
        const ratingHtml = await getHTMLforAverageRating(productId);
        averageRatingContainer.innerHTML = ratingHtml;
    } catch (error) {
        console.error("Error in loadAndDisplayAverageRating:", error);
        averageRatingContainer.innerHTML = '<small class="text-muted">Errore nel caricare la valutazione.</small>';

    }
}

    document.addEventListener('DOMContentLoaded', async function () {
        const loadingPlaceholder = document.getElementById('product-loading-placeholder');
        const productDetailsContent = document.getElementById('product-details-content');
        const productActionBar = document.getElementById('product-action-bar'); // Get the action bar
        const reviewLoadingMessage = document.getElementById('loading-reviews'); // For reviews specifically

        // Check for all essential elements
        if (!loadingPlaceholder || !productDetailsContent || !productActionBar) {
            console.error("Elementi base per il caricamento (placeholder o content) non trovati.");
            document.body.innerHTML = "<p class='text-center text-danger p-5'>Errore critico: la pagina non può essere caricata correttamente.</p>";
            return;
        }

        const productId = getProductIdFromURL();
        if (!productId) {
            loadingPlaceholder.innerHTML = `
                <div class="text-center p-5 my-5">
                    <i class="bi bi-exclamation-triangle-fill fs-1 text-danger"></i>
                    <h2 class="mt-3 text-danger">ID Prodotto Mancante</h2>
                    <p class="text-muted">Impossibile caricare i dettagli del prodotto senza un ID.</p>
                    <a href="index.html" class="btn btn-primary">Torna alla Home</a>
                </div>`;
            return;
        }

        sessionStorage.setItem("id", productId);

        try {
            // --- 1. FETCH AND POPULATE PRODUCT DATA ---
            const productResult = await fetchData(`/api/products/${productId}`, "GET");

            if (!productResult.data) {
                throw new Error(productResult.message || "Dati prodotto non ricevuti dal server.");
            }
            const product = productResult.data;

            // Populate main product details
            document.getElementById("nomeProdotto").textContent = product.nome;
            document.getElementById("prezzoProdotto").textContent = `Prezzo: €${parseFloat(product.prezzounitario).toFixed(2)}`;
            document.getElementById("artigianoProdotto").textContent = product.nomeartigiano;
            if (product.nomeartigiano && document.getElementById("artigianoIconInitial")) {
                document.getElementById("artigianoIconInitial").textContent = product.nomeartigiano.charAt(0).toUpperCase();
            }
            document.getElementById("descProdotto").innerHTML = product.descrizione.replace(/\n/g, '<br>');
            const imgElement = document.getElementById("immagineProdotto");
            imgElement.src = product.immagine_url || `/api/products/${product.idprodotto}/image_content`;
            imgElement.alt = product.nome;
            document.getElementById("categoriaProdotto").textContent = product.categoria;

            const statoProdottoEl = document.getElementById("statoProdotto");
            const quantityInputEl = document.getElementById("quantityInput");
            const addToCartButton = document.querySelector('#product-details-content .add-to-cart-button');

            if (product.quantitadisponibile > 0) {
                statoProdottoEl.innerHTML = `<span class="status-available" style="color: green;">Disponibile</span>`;
                if(quantityInputEl) quantityInputEl.disabled = false;
                if(addToCartButton) addToCartButton.disabled = false;
            } else {
                statoProdottoEl.innerHTML = `<span class="status-unavailable" style="color: red;">Non disponibile</span>`;
                if(quantityInputEl) quantityInputEl.disabled = true;
                if(addToCartButton) addToCartButton.disabled = true;
            }

            document.getElementById("hrefArtigiano").href = `dettaglioArtigiano.html?id=${product.idartigiano}`;

            // Populate Add to Cart bar
            document.getElementById("nomeProdottoAddToCart").textContent = product.nome;
            document.getElementById("prezzoProdottoAddToCart").textContent = `Prezzo: €${parseFloat(product.prezzounitario).toFixed(2)}`;
            
            // Update add to cart button's onclick
            if (addToCartButton) {
                addToCartButton.setAttribute('onclick', `aggiungiAlCarrello('${product.idprodotto}', parseInt(document.getElementById('quantityInput').value), this)`);
            }

            // Load average rating
            await loadAndDisplayAverageRating(productId);

            // --- 2. SHOW PRODUCT CONTENT, HIDE PLACEHOLDER ---
            loadingPlaceholder.style.display = 'none';
            productDetailsContent.style.display = 'block';
            productActionBar.style.display = 'grid'; // Show the action bar (it uses d-grid)

        } catch (error) {
            console.error("Errore nel caricamento dei dettagli del prodotto:", error);
            loadingPlaceholder.innerHTML = `
                <div class="text-center p-5 my-5">
                    <i class="bi bi-emoji-frown fs-1 text-danger"></i>
                    <h2 class="mt-3 text-danger">Oops! Qualcosa è andato storto.</h2>
                    <p class="text-muted">Impossibile caricare i dettagli del prodotto: ${error.message}. Riprova più tardi.</p>
                    <a href="index.html" class="btn btn-primary">Torna alla Home</a>
                </div>`;
            productDetailsContent.style.display = 'none'; // Ensure content remains hidden
            productActionBar.style.display = 'none'; // Ensure action bar also remains hidden
        }

        // --- 3. LOAD REVIEWS (can run independently of product details success/failure after initial setup) ---
        try {
            const recensioniResult = await fetchData(`/api/reviews/product/${productId}`, "GET");
            if (reviewLoadingMessage) reviewLoadingMessage.style.display = 'none'; // Hide "Caricamento recensioni..."
            showReviews(recensioniResult); // showReviews handles empty or error states internally by updating #review
        } catch (error) {
            console.error("Errore caricamento recensioni:", error);
            const reviewContainer = document.getElementById("review");
            if (reviewContainer) reviewContainer.innerHTML = `<h3 class="customer-reviews-title mb-4">Recensioni dei clienti</h3><p class="text-danger">Impossibile caricare le recensioni: ${error.message}.</p>`;
        }
    });