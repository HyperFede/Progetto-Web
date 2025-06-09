document.addEventListener('DOMContentLoaded', function () {
    const productReviewForm = document.getElementById('productReviewForm');
    const ratingValueInput = document.getElementById('ratingValue');
    const reviewTextInput = document.getElementById('reviewTextInput');
    const reviewTitleInput = document.getElementById('reviewTitleInput'); // Title is in the form
    const stars = document.querySelectorAll('.star-rating .bi-star, .star-rating .bi-star-fill');
    const photoUploadInput = document.getElementById('photoUploadInput');
    
    const successMessageDiv = document.getElementById('successMessage'); // Assuming you have this div
    const errorMessageDiv = document.getElementById('formErrorMessage'); // Assuming you add a div for general form errors

    // Function to get idprodotto from URL query parameters
    function getIdProdottoFromUrl() {
        const urlParams = new URLSearchParams(window.location.search);
        return urlParams.get('idprodotto');
    }

    // Star Rating Logic
    stars.forEach(star => {
        star.addEventListener('mouseover', function () {
            resetStarsVisual();
            const currentValue = parseInt(this.dataset.value);
            for (let i = 0; i < currentValue; i++) {
                stars[i].classList.remove('bi-star');
                stars[i].classList.add('bi-star-fill', 'hovered');
            }
        });

        star.addEventListener('mouseout', function () {
            const currentRating = ratingValueInput.value ? parseInt(ratingValueInput.value) : 0;
            resetStarsVisual();
            if (currentRating > 0) {
                for (let i = 0; i < currentRating; i++) {
                    stars[i].classList.remove('bi-star');
                    stars[i].classList.add('bi-star-fill', 'selected');
                }
            }
        });

        star.addEventListener('click', function () {
            const clickedValue = parseInt(this.dataset.value);
            ratingValueInput.value = clickedValue; // Set the hidden input value
            resetStarsVisual();
            for (let i = 0; i < clickedValue; i++) {
                stars[i].classList.remove('bi-star');
                stars[i].classList.add('bi-star-fill', 'selected');
            }
            if (document.getElementById('ratingError')) {
                document.getElementById('ratingError').textContent = ''; // Clear rating error
            }
        });
    });

    function resetStarsVisual() {
        stars.forEach(s => {
            s.classList.remove('bi-star-fill', 'selected', 'hovered');
            s.classList.add('bi-star');
        });
    }
    
    function clearFormMessages() {
        if (successMessageDiv) successMessageDiv.style.display = 'none';
        if (errorMessageDiv) errorMessageDiv.innerHTML = '';
        if (document.getElementById('ratingError')) document.getElementById('ratingError').textContent = '';
    }

    // Function to load product details
    async function loadProductDetails() {
        const idprodotto = getIdProdottoFromUrl();
        if (!idprodotto) {
            console.error('ID Prodotto non trovato nella URL per caricare i dettagli.');
            if (errorMessageDiv) errorMessageDiv.innerHTML = '<span class="error-text">Impossibile caricare i dettagli del prodotto. ID mancante.</span>';
            return;
        }

        try {
            const productResult = await fetchData(`/api/products/${idprodotto}`, "GET");
            if (productResult.status === 200 && productResult.data) {
                const product = productResult.data;
                const productNameEl = document.getElementById('productNamePlaceholder');
                const productImageEl = document.getElementById('productReviewImage');

                if (productNameEl) productNameEl.textContent = product.nome;
                if (productImageEl && product.immagine_url) productImageEl.src = product.immagine_url;
                else if (productImageEl) productImageEl.src = 'https://via.placeholder.com/80'; // Fallback
            } else {
                console.error('Errore nel caricare i dettagli del prodotto:', productResult);
                if (errorMessageDiv) errorMessageDiv.innerHTML = `<span class="error-text">${productResult.message || 'Dettagli prodotto non trovati.'}</span>`;
            }
        } catch (error) {
            console.error('Eccezione nel caricare i dettagli del prodotto:', error);
            if (errorMessageDiv) errorMessageDiv.innerHTML = `<span class="error-text">${error.message || 'Errore di comunicazione nel caricare i dettagli del prodotto.'}</span>`;
        }
    }


    // Form Submission
    if (productReviewForm) {
        productReviewForm.addEventListener('submit', async function(event) {
            event.preventDefault();
            clearFormMessages();

            const idprodotto = getIdProdottoFromUrl();
            // const idordine = getIdOrdineFromUrl(); // Available if needed for other logic

            const valutazione = parseInt(ratingValueInput.value, 10);
            const testo = reviewTextInput.value.trim();
            const titolo = reviewTitleInput.value.trim(); // Get title value

            // Client-side validation
            let isValid = true;
            if (!idprodotto) {
                if (errorMessageDiv) errorMessageDiv.innerHTML = '<span class="error-text">ID Prodotto mancante. Impossibile inviare la recensione.</span>';
                console.error('ID Prodotto non trovato nella URL.');
                isValid = false;
            }
            if (!valutazione || valutazione < 1 || valutazione > 5) {
                if (document.getElementById('ratingError')) {
                    document.getElementById('ratingError').textContent = 'Per favore, seleziona una valutazione.';
                } else if (errorMessageDiv) {
                    errorMessageDiv.innerHTML += '<br><span class="error-text">Per favore, seleziona una valutazione.</span>';
                }
                isValid = false;
            }
            if (!titolo) { // Title is required in the form
                if (errorMessageDiv) errorMessageDiv.innerHTML += '<br><span class="error-text">Il titolo della recensione è obbligatorio.</span>';
                isValid = false;
            }
            if (!testo) {
                if (errorMessageDiv) errorMessageDiv.innerHTML += '<br><span class="error-text">Il testo della recensione è obbligatorio.</span>';
                isValid = false;
            }

            if (!isValid) {
                return;
            }

            let requestBody = {
                "idprodotto": parseInt(idprodotto, 10),
                "testo": testo,
                "valutazione": valutazione
            };

            try {
                // Step 1: Create the review (text, rating)
                const reviewResponse = await fetchData("/api/reviews", "POST", requestBody);

                if (reviewResponse.status === 201 || reviewResponse.status === 200) { 
                    const createdReview = reviewResponse.data;
                    let imageUploadMessage = '';

                    // Step 2: If review created and image selected, upload image
                    const imageFile = photoUploadInput.files[0]; // Assuming single file upload for now
                    if (imageFile && createdReview && createdReview.idrecensione) {
                        try {
                            const imageUploadResponse = await fetchData(
                                `/api/reviews/${createdReview.idrecensione}/image`, 
                                "PUT", 
                                imageFile, 
                                { 
                                    isRawBody: true, 
                                    customContentType: imageFile.type // e.g., 'image/jpeg', 'image/png'
                                }
                            );
                            if (imageUploadResponse.status === 200) {
                                imageUploadMessage = ' Immagine caricata con successo.';
                            } else {
                                imageUploadMessage = ` Errore nel caricamento dell'immagine: ${imageUploadResponse.message || (imageUploadResponse.data && imageUploadResponse.data.message) || 'Errore sconosciuto'}.`;
                                console.error('Image upload failed:', imageUploadResponse);
                            }
                        } catch (imgError) {
                            imageUploadMessage = ` Eccezione nel caricamento dell'immagine: ${imgError.message || (imgError.body && imgError.body.message) || 'Errore imprevisto'}.`;
                            console.error('Exception during image upload:', imgError);
                        }
                    }

                    if (successMessageDiv && reviewResponse.data) {
                        successMessageDiv.textContent = (reviewResponse.data.message || 'Grazie per la tua recensione! Sarà pubblicata dopo la revisione.') + imageUploadMessage;
                        successMessageDiv.style.display = 'block';
                    } else {
                        alert(((reviewResponse.data && reviewResponse.data.message) || 'Grazie per la tua recensione! Sarà pubblicata dopo la revisione.') + imageUploadMessage);
                    }

                    productReviewForm.reset();
                    ratingValueInput.value = '';
                    resetStarsVisual();
                    const photoPreviewContainer = document.getElementById('photoPreview');
                    if (photoPreviewContainer) photoPreviewContainer.innerHTML = '';
                } else {
                    const errorMsg = reviewResponse.body.error;
                    if (errorMessageDiv) {
                        errorMessageDiv.innerHTML = `<span class="error-text">${errorMsg}</span>`;
                    } else {
                        alert(errorMsg);
                    }
                }
            } catch (reviewError) {
                console.error('Errore invio recensione (testo/valutazione):', reviewError);
                const errorMsg = reviewError.message || (reviewError.body && reviewError.body.message) || 'Errore di comunicazione con il server. Riprova più tardi.';
                if (errorMessageDiv) {
                    errorMessageDiv.innerHTML = `<span class="error-text">${errorMsg}</span>`;
                } else {
                    alert(errorMsg);
                }
            }
        });
    }
    // Load product details when the page is ready
    loadProductDetails();
});