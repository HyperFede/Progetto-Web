document.addEventListener('DOMContentLoaded', () => {
    const productImageInput = document.getElementById("productImageInput"); // Already in the previous version, seems like a merge artifact
    const productCategory = document.getElementById("productCategory");
    const productName = document.getElementById("productName");
    const productDescription = document.getElementById("productDescription");
    const productPrice = document.getElementById("productPrice");
    const btnRemoveImageWithId= document.getElementById('removeImageBtn');

    const editProductForm = document.getElementById('editProductForm'); // Assume this ID exists in your HTML
    const formMessagePlaceholder = document.getElementById('formMessagePlaceholder'); // Assume this ID exists for messages

    let initialProductImageExists = false; // To track if an image was loaded initially

    // Moved image container and related elements query higher
    const imageContainer = document.querySelector('.product-detail-image-container');
    let currentImageDisplay, imageActionOverlay, btnRemoveImage, addImageTrigger;



    /**
     * Retrieves the product ID from the URL query string.
     * E.g., if the URL is /modificaProdotto.html?id=4, it returns "4".
     * @returns {string|null} The product ID or null if not found.
     */
    function getProductIdFromURL() {
        const urlParams = new URLSearchParams(window.location.search);
        return urlParams.get('id');
    }

    // Define updateImageUI here so it's available for populateProductData and event listeners
    function updateImageUI(hasImage) {
        if (!imageContainer) return; // Guard if imageContainer itself is not found

        // Query these dynamically within the function or ensure they are set before calling
        const displayElement = imageContainer.querySelector('.current-image-display');
        const triggerElement = imageContainer.querySelector('.add-image-trigger');
        const overlayElement = imageContainer.querySelector('.image-action-overlay');
        if (hasImage) {
            if (displayElement) displayElement.style.display = 'flex';
            if (triggerElement) triggerElement.style.display = 'none';
            imageContainer.classList.remove('state-add-image');
            if (overlayElement) {
                overlayElement.classList.add('can-delete');
                overlayElement.style.display = 'flex';
                overlayElement.style.opacity = '1';
            }
        } else {
            if (displayElement) displayElement.style.display = 'none';
            if (triggerElement) triggerElement.style.display = 'flex';
            imageContainer.classList.add('state-add-image');
            if (overlayElement) {
                overlayElement.classList.remove('can-delete');
                overlayElement.style.display = 'none';
                overlayElement.style.opacity = '0';
            }
        }
    }

    async function populateProductData() {
        const productId = getProductIdFromURL();
        // Get a reference to currentImageDisplay, which might be used by updateImageUI
        currentImageDisplay = imageContainer ? imageContainer.querySelector('.current-image-display') : null;

        if (!productId) {
            alert("prodotto non trovato, invalid format")
            console.log("Product ID not found in URL.");
            if (currentImageDisplay) currentImageDisplay.innerHTML = '<span>IMG</span>';
            updateImageUI(false); // Set to default no-image state
            // Future: Handle cases where ID is missing (e.g., redirect or show error message to user)
            return;
        }

        console.log("Populating data for Product ID:", productId);
        try {
            let response = await fetchData("api/products/" + productId, "GET");

            if (response.status === 200 && response.data) {
                const product = response.data;
                console.log("Product data received:", product);

                if (productCategory) productCategory.value = product.categoria;
                if (productName) productName.value = product.nome;
                if (productDescription) productDescription.value = product.descrizione;
                if (productPrice) productPrice.value = product.prezzounitario;

                // Now, correctly display the image using imageLink (product.immagine_url)
                if (product.immagine_url) {
                    initialProductImageExists = true;
                } else {
                    initialProductImageExists = false;
                }
                // The rest of the image display logic using currentImageDisplay and updateImageUI
                // will handle showing the image or placeholder based on product.immagine_url


                if (currentImageDisplay) {
                    if (product.immagine_url) {
                        currentImageDisplay.innerHTML = `<img src="${product.immagine_url}" alt="${product.nome || 'Anteprima Prodotto'}" style="max-width: 100%; max-height: 100%; object-fit: contain;">`;
                        updateImageUI(true);
                    } else {
                        currentImageDisplay.innerHTML = '<span>IMG</span>'; // Placeholder if no image
                        updateImageUI(false);
                    }
                } else if (imageContainer) { // currentImageDisplay not found but container exists
                    console.warn("'.current-image-display' element not found inside '.product-detail-image-container'. Cannot display image.");
                    updateImageUI(false); // Default to no image state for the container
                }



            } else {
                console.error("Failed to fetch product data:", response.message || response.statusText || `Status: ${response.status}`);
                if (currentImageDisplay) currentImageDisplay.innerHTML = '<span>IMG</span>'; // Fallback UI
                updateImageUI(false);
                // Future: Display an error message to the user
            }
        } catch (error) {
            console.error("Exception during populateProductData:", error);
            if (currentImageDisplay) currentImageDisplay.innerHTML = '<span>IMG</span>'; // Fallback UI
            updateImageUI(false);
            // Future: Display an error message to the user
        }
    }

    async function populateReviews() {
        const productId = getProductIdFromURL(); // Assuming you have this function
        if (!productId) {
            console.log("Product ID not found in URL for reviews.");
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
            console.log("Product ID not found in URL for average rating.");
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
                console.log(`No average rating found for product ${productId} (404).`);
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

    function clearFormMessages() {
        if (formMessagePlaceholder) {
            formMessagePlaceholder.innerHTML = '';
            formMessagePlaceholder.style.display = 'none';
            formMessagePlaceholder.className = 'my-3'; // Reset classes
        }
    }

    function showFormMessage(message, type = 'success') {
        if (formMessagePlaceholder) {
            formMessagePlaceholder.innerHTML = `<div class="alert alert-${type === 'success' ? 'success' : (type === 'warning' ? 'warning' : 'danger')}" role="alert">${message}</div>`;
            formMessagePlaceholder.style.display = 'block';
        } else {
            alert(message); // Fallback
        }
    }

    async function handleProductUpdate(event) {
        event.preventDefault();
        clearFormMessages();

        const productId = getProductIdFromURL();
        if (!productId) {
            showFormMessage("ID Prodotto non trovato. Impossibile salvare le modifiche.", "error");
            return;
        }

        // Basic client-side validation
        if (!productCategory || !productCategory.value) { showFormMessage('Seleziona una categoria.', 'error'); return; }
        if (!productName || !productName.value.trim()) { showFormMessage('Il nome del prodotto è obbligatorio.', 'error'); return; }
        if (!productDescription || !productDescription.value.trim()) { showFormMessage('La descrizione è obbligatoria.', 'error'); return; }
        if (!productPrice || productPrice.value === '' || parseFloat(productPrice.value) < 0) { showFormMessage('Prezzo non valido.', 'error'); return; }

        const updatePayload = {
            nome: productName.value.trim(),
            descrizione: productDescription.value.trim(),
            prezzounitario: parseFloat(productPrice.value),
            categoria: productCategory.value,
            // Nota: 'quantitadisponibile' non è gestito qui perché non è tra gli elementi del form definiti all'inizio del file.
            // Se necessario, aggiungere l'input HTML e includerlo qui.
        };

        try {
            showFormMessage("Salvataggio modifiche prodotto...", "info");
            const productUpdateResponse = await fetchData(`api/products/${productId}`, "PUT", updatePayload);

            if (productUpdateResponse.status === 200) {
                let overallMessage = "Prodotto aggiornato con successo.";
                let messageType = 'success';

                const imageFile = productImageInput.files[0];
                const uiShowsImagePlaceholder = currentImageDisplay && currentImageDisplay.querySelector('span') && currentImageDisplay.querySelector('span').textContent === 'IMG';
                const imageInputIsEmpty = productImageInput.value === '';
                const imageWasExplicitlyRemovedByUI = !imageFile && uiShowsImagePlaceholder && imageInputIsEmpty && initialProductImageExists;
                
                if (imageFile) { // New image selected for upload
                    const imageUploadResponse = await fetchData(
                        `/api/products/${productId}/image`,
                        "PUT",
                        imageFile,
                        { isRawBody: true, customContentType: imageFile.type }
                    );
                    if (imageUploadResponse.status === 200) {
                        overallMessage += " Immagine aggiornata.";
                        productImageInput.value = ''; // Clear file input after successful upload
                    } else {
                        overallMessage += ` Errore aggiornamento immagine: ${imageUploadResponse.message || 'Dettaglio non disponibile.'}`;
                        messageType = 'warning';
                    }
                } else if (imageWasExplicitlyRemovedByUI) {
                    let responseDeltete = await fetchData(`/api/products/${productId}/image`, "DELETE");

                    if (responseDeltete.status === 200 || responseDeltete.status === 204) {
                        overallMessage += " Immagine rimossa.";
                    }
                    // The UI for "no image" is already set by the "Rimuovi Immagine" button logic.
                }

                showFormMessage(overallMessage, messageType);
                await populateProductData(); // Refresh all product data from server, including image

            } else {
                showFormMessage(`Errore durante l'aggiornamento del prodotto: ${productUpdateResponse.message || 'Dettaglio non disponibile.'}`, "error");
            }
        } catch (error) {
            console.error("Eccezione durante l'aggiornamento del prodotto:", error);
            showFormMessage(`Errore: ${error.message || "Si è verificato un errore imprevisto."}`, "error");
        }
    }



    // Call the function to start populating data or to get the ID
    populateProductData();
    populateReviews();
    populateProductAverageRating();



    // Setup event listeners for image interactions if the container exists
    if (imageContainer) {
        // Ensure these are fresh or correctly scoped if used by listeners
        // currentImageDisplay was already assigned if imageContainer exists
        imageActionOverlay = imageContainer.querySelector('.image-action-overlay');
        btnRemoveImage = imageContainer.querySelector('removeImageBtn');
        addImageTrigger = imageContainer.querySelector('.add-image-trigger');
        



        if (currentImageDisplay && addImageTrigger && imageActionOverlay) { // Ensure elements exist
            let initialImageElement = currentImageDisplay.querySelector('img');
            let hasInitialImage = initialImageElement && initialImageElement.getAttribute('src') && initialImageElement.getAttribute('src') !== '' && initialImageElement.getAttribute('src') !== '#';

            if (!initialImageElement && currentImageDisplay.querySelector('span').textContent === 'IMG') {
                hasInitialImage = false;
            }
            // populateProductData should have already set the correct UI state via updateImageUI.
            // Calling it again here might be redundant.
            // updateImageUI(hasInitialImage); 
        }

        if (btnRemoveImageWithId){
            btnRemoveImageWithId.addEventListener('click', () => {
                if (currentImageDisplay) currentImageDisplay.innerHTML = '<span>IMG</span>';
                if (productImageInput) productImageInput.value = '';
                updateImageUI(false); //no image
            });
        }

        if (addImageTrigger) {
            addImageTrigger.addEventListener('click', () => {
                if (productImageInput) productImageInput.click();
            });
        }

        if (productImageInput) {
            productImageInput.addEventListener('change', function (event) {
                const file = event.target.files[0];
                if (file) {
                    const reader = new FileReader();
                    reader.onload = (e) => {
                        if (currentImageDisplay) currentImageDisplay.innerHTML = `<img src="${e.target.result}" alt="Anteprima Prodotto">`;
                        updateImageUI(true);
                    }
                    reader.readAsDataURL(file);
                } else {
                    if (currentImageDisplay && !currentImageDisplay.querySelector('img[src], img[data-existing-src]')) {
                        currentImageDisplay.innerHTML = '<span>IMG</span>';
                        updateImageUI(false);
                    }
                }
            });
        }
    }
    // Attach form submission handler
    if (editProductForm) {
        editProductForm.addEventListener('submit', handleProductUpdate);
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

