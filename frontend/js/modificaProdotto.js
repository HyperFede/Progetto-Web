document.addEventListener('DOMContentLoaded', () => {
    // Form field elements
    const productCategoryInput = document.getElementById("productCategory");
    const productNameInput = document.getElementById("productName");
    const productDescriptionInput = document.getElementById("productDescription");
    const productPriceInput = document.getElementById("productPrice");
    const productImageInput = document.getElementById("productImageInput"); // Added for consistency
    const submitMessagePlaceholder = document.getElementById('submitMessagePlaceholder'); // Define the placeholder

    const editProductForm = document.getElementById('editProductForm'); // Assume this ID exists in your HTML
    
    let initialProductImageExists = false; // To track if an image was loaded initially


    /**
     * Displays a message in the submitMessagePlaceholder.
     * @param {string} message - The message to display.
     * @param {string} type - 'success' or 'danger'.
     */
    function displaySubmitMessage(message, type = 'success') {
        if (submitMessagePlaceholder) {
            submitMessagePlaceholder.innerHTML = `<div class="alert alert-${type === 'success' ? 'success' : 'danger'}" role="alert">${message}</div>`;
            submitMessagePlaceholder.style.display = 'block';
        }
    }

    /**
     * Clears any message from the submitMessagePlaceholder.
     */
    function clearSubmitMessage() {
        if (submitMessagePlaceholder) {
            submitMessagePlaceholder.innerHTML = '';
            submitMessagePlaceholder.style.display = 'none';
        }
    }


    /**
     * Retrieves the product ID from the URL query string.
     * E.g., if the URL is /modificaProdotto.html?id=4, it returns "4".
     * @returns {string|null} The product ID or null if not found.
     */
    function getProductIdFromURL() {
        const urlParams = new URLSearchParams(window.location.search);
        return urlParams.get('id');
    }

    // The updateImageUI function and its direct calls will be removed.
    // imagePreview.js will handle UI updates.

    function clearFormValidationStyles() {
        const inputs = [
            productCategoryInput,
            productNameInput,
            productDescriptionInput,
            productPriceInput
        ];
        inputs.forEach(input => {
            if (input) {
                input.classList.remove('is-valid', 'is-invalid');
            }
        });
        // Note: productImageInput (file input) is not typically styled with is-valid/is-invalid
    }

    async function populateProductData() {
        const productId = getProductIdFromURL();
        const currentImageDisplay = document.querySelector('.product-detail-image-container .current-image-display');
        if (!productId) {
            if (currentImageDisplay) currentImageDisplay.innerHTML = '<span class="text-muted">IMG</span>'; // Let imagePreview.js pick this up
            return;
        }

        try {
            let response = await fetchData("api/products/" + productId, "GET");
            if (response.status === 200 && response.data) {
                const product = response.data;

                if (productCategoryInput) productCategoryInput.value = product.categoria || '';
                if (productNameInput) productNameInput.value = product.nome || '';
                if (productDescriptionInput) productDescriptionInput.value = product.descrizione || '';
                if (productPriceInput) productPriceInput.value = product.prezzounitario || '';

                if (product.idprodotto) { // Check if product has an ID, implying an image might exist
                    initialProductImageExists = true;
                    if (currentImageDisplay) {
                        currentImageDisplay.innerHTML = `<img src="${product.immagine_url}" alt="${product.nome || 'Anteprima Prodotto'}" style="max-width: 100%; max-height: 100%; object-fit: contain;">`;
                        // imagePreview.js will detect this image and update its UI state
                    }
                } else {
                    initialProductImageExists = false;
                    if (currentImageDisplay) {
                        currentImageDisplay.innerHTML = '<span class="text-muted">IMG</span>'; // Let imagePreview.js show placeholder
                    }
                }
            } else {
                console.error("Failed to fetch product data:", response.message || response.statusText || `Status: ${response.status}`);
                if (currentImageDisplay) currentImageDisplay.innerHTML = '<span class="text-muted">IMG</span>';
            }
        } catch (error) {
            console.error("Exception during populateProductData:", error);
            if (currentImageDisplay) currentImageDisplay.innerHTML = '<span class="text-muted">IMG</span>';
        }
    }

    async function populateReviews() {
        const productId = getProductIdFromURL(); // Assuming you have this function
        if (!productId) {
            return;
        }

        const reviewsContainer = document.getElementById('reviewsContainer'); // Assuming you have a container with this ID in your HTML
        if (!reviewsContainer) {
            console.error("Reviews container not found!");
            return;
        }
        reviewsContainer.innerHTML = '<p>Caricamento recensioni...</p>'; // Placeholder

        try {
            // Assuming fetchData is your global function for API calls
            const response = await fetchData(`/api/reviews/product/${productId}`, "GET");

            if (response.status === 200 && response.data) {
                const reviews = response.data;
                if (reviews.length > 0) {
                    let allReviewsHtml = '';
                    reviews.forEach(review => {
                        allReviewsHtml += generateReviewHtml(review);
                    });
                    reviewsContainer.innerHTML = allReviewsHtml;
                } else {
                    reviewsContainer.innerHTML = '<p>Non ci sono ancora recensioni per questo prodotto.</p>';
                }
            } else {
                console.error("Failed to fetch reviews:", response.message || response.statusText || `Status: ${response.status}`);
                reviewsContainer.innerHTML = '<p>Impossibile caricare le recensioni.</p>';
            }
        } catch (error) {
            console.error("Exception during populateReviews:", error);
            reviewsContainer.innerHTML = '<p>Errore durante il caricamento delle recensioni.</p>';
        }
    }

    async function populateProductAverageRating() {
        const productId = getProductIdFromURL();
        if (!productId) {
            return;
        }

        const ratingContainer = document.querySelector('.product-rating-detail');
        if (!ratingContainer) {
            console.error("Element with class '.product-rating-detail' not found.");
            return;
        }
        ratingContainer.innerHTML = '<span>Caricamento valutazione...</span>';

        try {
            // fetchData will throw for non-2xx responses
            const response = await fetchData(`/api/products/${productId}/average-rating`, "GET");

            // This block is only executed if response.status is 2xx (typically 200)
            if (response.data && response.data.average_rating !== undefined) {
                const avgRatingValue = response.data.average_rating;

                if (avgRatingValue === null || (typeof avgRatingValue === 'number' && isNaN(avgRatingValue))) {
                    ratingContainer.innerHTML = `
                        <span class="stars-display me-2">${getReviewStarsHtml(0)}</span>
                        <span class="average-rating-text">(Nessuna valutazione)</span>
                    `;
                } else {
                    const numericAvgRating = parseFloat(avgRatingValue);
                    const starsHtml = getReviewStarsHtml(numericAvgRating); // Uses existing function
                    const averageRatingText = numericAvgRating.toFixed(1);

                    ratingContainer.innerHTML = `
                        <span class="stars-display me-2">${starsHtml}</span>
                        <span class="average-rating-text">(${averageRatingText} su 5)</span>
                    `;
                }
            } else {
                // This case handles 200 OK but average_rating is missing in response.data
                console.warn("Average rating data is missing in the response:", response.data);
                ratingContainer.innerHTML = `
                    <span class="stars-display me-2">${getReviewStarsHtml(0)}</span>
                    <span class="average-rating-text">(Valutazione non disponibile)</span>
                `;
            }
        } catch (error) {
            console.error("Error fetching average rating:", error);
            if (error.status === 404) {
                ratingContainer.innerHTML = `
                    <span class="stars-display me-2">${getReviewStarsHtml(0)}</span>
                    <span class="average-rating-text">(Nessuna valutazione)</span>
                `;
            } else {
                const errorMessage = error.message || "Errore caricamento valutazione";
                ratingContainer.innerHTML = `<span>${errorMessage}</span>`;
            }
        }
    }

    // Functions clearFormMessages and showFormMessage are removed as per rollback request.

    async function handleSubmit(event) {
        event.preventDefault();
        clearFormValidationStyles();
        clearSubmitMessage(); // Clear previous submit messages

        const productId = getProductIdFromURL();
        if (!productId) {
            console.error("ID Prodotto non trovato. Impossibile salvare le modifiche.");
            return;
        }

        // Basic client-side validation
        let isValid = true;
        if (!productCategoryInput || !productCategoryInput.value) { productCategoryInput.classList.add('is-invalid'); isValid = false; }
        if (!productNameInput || !productNameInput.value.trim()) { productNameInput.classList.add('is-invalid'); isValid = false; }
        if (!productDescriptionInput || !productDescriptionInput.value.trim()) { productDescriptionInput.classList.add('is-invalid'); isValid = false; }
        if (!productPriceInput || productPriceInput.value === '' || parseFloat(productPriceInput.value) < 0) { productPriceInput.classList.add('is-invalid'); isValid = false; }
        
        if (!isValid) {
                        displaySubmitMessage("Errore nell'aggiornamento del prodotto. Controlla i campi evidenziati.", 'danger');

            console.warn("Validazione fallita lato client.");
            return;
        }

        const updatePayload = {
            nome: productNameInput.value.trim(),
            descrizione: productDescriptionInput.value.trim(),
            prezzounitario: parseFloat(productPriceInput.value),
            categoria: productCategoryInput.value,
            // Nota: 'quantitadisponibile' non è gestito qui perché non è tra gli elementi del form definiti all'inizio del file.
            // Se necessario, aggiungere l'input HTML e includerlo qui.
        };

        try {
            // No "Saving..." message for simplified version
            const productUpdateResponse = await fetchData(`api/products/${productId}`, "PUT", updatePayload);

            if (productUpdateResponse.status === 200) {
                // Product text data updated successfully
                [productCategoryInput, productNameInput, productDescriptionInput, productPriceInput].forEach(input => {
                    if (input) input.classList.add('is-valid');
                });

                const productImageInput = document.getElementById("productImageInput");
                const currentImageDisplay = document.querySelector('.product-detail-image-container .current-image-display');

                const imageFile = productImageInput.files[0];
                const uiShowsImagePlaceholder = currentImageDisplay && currentImageDisplay.querySelector('span.text-muted') && currentImageDisplay.querySelector('span.text-muted').textContent === 'IMG';
                const imageInputIsEmpty = productImageInput.value === '';
                const imageWasExplicitlyRemovedByUI = !imageFile && uiShowsImagePlaceholder && imageInputIsEmpty && initialProductImageExists;
                
                if (imageFile) { 
                    const imageUploadResponse = await fetchData(
                        `/api/products/${productId}/image`,
                        "PUT",
                        imageFile,
                        { isRawBody: true, customContentType: imageFile.type }
                    );
                    console.log(imageUploadResponse);
                    if (imageUploadResponse.status !== 200) {
                        console.warn(`Errore aggiornamento immagine: ${imageUploadResponse.message || 'Dettaglio non disponibile.'}`);
                        // Optionally mark image input as invalid, though it's tricky for file inputs
                    }
                } else if (imageWasExplicitlyRemovedByUI) {
                    let responseDeltete = await fetchData(`/api/products/${productId}/image`, "DELETE");
                    if (responseDeltete.status !== 200 && responseDeltete.status !== 204) {
                        console.warn(`Errore rimozione immagine: ${responseDeltete.message || 'Dettaglio non disponibile.'}`);
                    }
                }

                // Success: clear 'is-valid' after a delay and reload data
                                displaySubmitMessage("Prodotto aggiornato con successo, ti stiamo portando ai tuoi prodotti.", 'success');
                // Redirect after a delay

                setTimeout(() => {
                window.location.href = "prodottiArtigiano.html"; // Redirect after success

                    clearFormValidationStyles();
                    populateProductData(); // Refresh all product data from server
                }, 2000); // User sees the ticks for 2 seconds

                // No automatic redirect to "prodottiArtigiano.html" in this version

            } else { // Error updating product text data
                                const backendErrorMessage = productUpdateResponse.message || (productUpdateResponse.body && productUpdateResponse.body.message);
                const displayErrorMessage = backendErrorMessage || "Errore nell'aggiornamento del prodotto.";
                displaySubmitMessage(displayErrorMessage, 'danger');
                console.error(`Errore durante l'aggiornamento del prodotto: ${displayErrorMessage}`);

                if (productUpdateResponse.body && productUpdateResponse.body.field) { // Highlight specific field if backend indicates

                    const field = productUpdateResponse.body.field;
                    if (field === 'nome' && productNameInput) productNameInput.classList.add('is-invalid');
                    else if (field === 'categoria' && productCategoryInput) productCategoryInput.classList.add('is-invalid');
                    else if (field === 'prezzounitario' && productPriceInput) productPriceInput.classList.add('is-invalid');
                    else if (field === 'descrizione' && productDescriptionInput) productDescriptionInput.classList.add('is-invalid');
                    else { // General error, mark all as invalid
                        [productCategoryInput, productNameInput, productDescriptionInput, productPriceInput].forEach(input => {
                            if (input) input.classList.add('is-invalid');
                        });
                    }
                } else { // No specific field from backend, mark all as invalid
                    [productCategoryInput, productNameInput, productDescriptionInput, productPriceInput].forEach(input => {
                        if (input) input.classList.add('is-invalid');
                    });
                }
            }
        } catch (error) {
                        const exceptionMessage = error.message || (error.body && (error.body.message || error.body.error)) || "Errore nell'aggiornamento del prodotto.";
            displaySubmitMessage(exceptionMessage, 'danger');

            console.error("Eccezione durante l'aggiornamento del prodotto:", error);
            [productCategoryInput, productNameInput, productDescriptionInput, productPriceInput].forEach(input => {
                if (input) input.classList.add('is-invalid');
            });
        }
    }



    // Call the function to start populating data or to get the ID
    populateProductData();
    populateReviews();
    populateProductAverageRating();
    // Attach form submission handler
    if (editProductForm) {
        editProductForm.addEventListener('submit', handleSubmit);
    } else {
        console.warn("Elemento form con ID 'editProductForm' non trovato. La funzionalità di salvataggio non sarà attiva.");

    }
});
/**
 * Helper function to format the review date.
 * @param {string} isoDateString - The ISO date string from the review data.
 * @returns {string} Formatted date string (e.g., "DD/MM/YYYY HH:MM").
 */
function formatReviewDate(isoDateString) {
    if (!isoDateString) return 'Data non disponibile';
    const date = new Date(isoDateString);

    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0'); // Month is 0-indexed
    const year = date.getFullYear();
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');

    return `${day}/${month}/${year} ${hours}:${minutes}`;
}

/**
 * Helper function to generate HTML for star ratings.
 * @param {number|string} rating - The rating value (e.g., 3, 3.5, "4.7").
 * @param {number} maxStars - The maximum number of stars to display (default is 5).
 * @returns {string} HTML string representing the star icons.
 */
function getReviewStarsHtml(rating, maxStars = 5) {
    let html = '';
    let numericRating = parseFloat(rating);

    // Default to 0 if rating is invalid or not provided
    numericRating = isNaN(numericRating) ? 0 : numericRating;

    // Cap rating between 0 and maxStars
    numericRating = Math.max(0, Math.min(numericRating, maxStars));

    // Round to the nearest 0.5 for display logic (e.g., 3.2 becomes 3.5, 3.8 becomes 4.0)
    const displayRating = Math.ceil(numericRating * 2) / 2;

    const fullStars = Math.floor(displayRating);
    const hasHalfStar = (displayRating - fullStars) >= 0.5;
    let emptyStars = maxStars - fullStars - (hasHalfStar ? 1 : 0);
    emptyStars = Math.max(0, emptyStars); // Ensure emptyStars isn't negative

    for (let i = 0; i < fullStars; i++) {
        html += '<i class="bi bi-star-fill"></i>'; // Assumes Bootstrap Icons
    }
    if (hasHalfStar) {
        html += '<i class="bi bi-star-half"></i>';
    }
    for (let i = 0; i < emptyStars; i++) {
        html += '<i class="bi bi-star"></i>';
    }
    return html;
}

/**
 * Generates HTML for a single review.
 * @param {object} review - The review object.
 * @param {string} review.data - ISO date string of the review.
 * @param {string} review.username - Username of the reviewer.
 * @param {string} review.testo - Text content of the review.
 * @param {string} [review.immagine_url] - Optional URL of the review image.
 * @param {number|string} review.valutazione - Rating given by the reviewer.
 * @returns {string} HTML string for the review.
 */
function generateReviewHtml(review) {
    if (!review) return ''; // Handle null or undefined review object

    const formattedDate = formatReviewDate(review.data);
    const starsHtml = getReviewStarsHtml(review.valutazione);
    const username = review.username || 'Utente Anonimo';
    const reviewText = review.testo || 'Nessun testo fornito.';

    let imageSection = '';
    if (review.immagine_url) {
        imageSection = `
            <div class="review-image-container me-3">
                <img src="${review.immagine_url}" alt="Foto recensione di ${username}" class="review-customer-photo">
            </div>
        `;
    }

    // Conditional classes for review-body and review-text-content based on image presence
    const reviewBodyClass = review.immagine_url ? "d-flex align-items-start" : "";
    const textContentClass = review.immagine_url ? "flex-grow-1" : "";

    return `
        <div class="customer-review-box mb-3">
            <div class="review-header d-flex justify-content-between align-items-center mb-1">
                <span class="review-customer-name">${username}</span>
                <span class="review-date">${formattedDate}</span>
            </div>
            <div class="review-rating-title d-flex align-items-center mb-2">
                <span class="review-stars me-2">
                    ${starsHtml}
                </span>
                <!-- Review title (e.g., <strong class="review-object">...</strong>) is omitted as it's not in the input 'review' object -->
            </div>
            <div class="review-body ${reviewBodyClass}">
                ${imageSection}
                <div class="review-text-content ${textContentClass}">
                    <p class="review-text">
                        ${reviewText}
                    </p>
                </div>
            </div>
        </div>
    `;
}
