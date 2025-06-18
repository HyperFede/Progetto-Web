function getOrderIdFromURL() {
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
    let productsRes = `<h3 class="customer-reviews-title mb-4">Recensioni dei clienti</h3>`;
    const infos = result.data.map((rec) => {
        const reviewStarsHtml = getStarsHtml(rec.valutazione); // Use getStarsHtml for individual review ratings

        productsRes += rec.immagine_url != undefined ? (
            `<div class="customer-review-box mb-3">
                    <div class="review-header d-flex justify-content-between align-items-center mb-1">
                        <span class="review-customer-name">${rec.username}</span>
                        <span class="review-date">${dateFormatter(rec.data)}</span>
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
                        <span class="review-date">${dateFormatter(rec.data)}</span>
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
    console.log(productsRes);

    document.getElementById("review").innerHTML = productsRes;
}


async function loadAndDisplayAverageRating(productId) {
    // Target the div with class 'product-rating-detail' as requested.
    const averageRatingContainer = document.querySelector('.product-rating-detail');

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

        const averageRatingContainer = document.getElementById('averageRating');
        averageRatingContainer.innerHTML = `<small class="text-muted">Caricamento valutazione media...</small>`;
        const ratingHtml = await getHTMLforAverageRating(productId);
        averageRatingContainer.innerHTML = ratingHtml;
    } catch (error) {
        console.error("Error in loadAndDisplayAverageRating:", error);
        averageRatingContainer.innerHTML = '<small class="text-muted">Errore nel caricare la valutazione.</small>';

    }
}

    document.addEventListener('DOMContentLoaded', async function () {
        const id = getOrderIdFromURL(); // Use the existing function
        sessionStorage.setItem("id", id); // Moved from the other DOMContentLoaded listener

        let result = await fetchData(`/api/products/${id}`, "GET");
        const nomeProdotto = document.querySelectorAll("#nomeProdotto");
        nomeProdotto.forEach((n) => {
            n.textContent = result.data.nome;
        })
        const prezzoProdotto = document.querySelectorAll("#prezzoProdotto");
        prezzoProdotto.forEach((n) => {
            n.textContent = `€${result.data.prezzounitario}`;
        })

        const artigianoProdotto = document.getElementById("artigianoProdotto");
        artigianoProdotto.textContent = result.data.nomeartigiano
        const descProdotto = document.getElementById("descProdotto");
        descProdotto.textContent = result.data.descrizione
        const immagineProdotto = document.getElementById("immagineProdotto");
        immagineProdotto.src = result.data.immagine_url
        const categoriaProdotto = document.getElementById("categoriaProdotto");
        categoriaProdotto.textContent = result.data.categoria
        const statoProdotto = document.getElementById("statoProdotto");

        if (result.data.quantitadisponibile > 0) {
            statoProdotto.textContent = "Disponibile"
        } else {
            statoProdotto.textContent = "Non disponibile";
            statoProdotto.style.color = "red";
            const adder = document.getElementById("quantityInput");
            adder.disabled = true;
        }

        const hrefArtigiano = document.getElementById("hrefArtigiano");
        hrefArtigiano.href = `dettaglioArtigiano.html?id=${result.data.idartigiano}`;

        // LOAD AVERAGE PRODUCT RATING
        await loadAndDisplayAverageRating(id);

        //CARICO RECENSIONI
        let recensioni = await fetchData(`/api/reviews/product/${id}`, "GET");
        if (recensioni.status == 200) { // Check recensioni.status, not result.status
            showReviews(recensioni); // Use the renamed function
        } else {
            const reviewContainer = document.getElementById("review");
            if (reviewContainer) reviewContainer.innerHTML = "<p>Impossibile caricare le recensioni al momento.</p>";
            console.log("Errore caricamento recensioni!");
        }
    })