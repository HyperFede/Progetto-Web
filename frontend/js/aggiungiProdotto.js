    document.addEventListener('DOMContentLoaded', function () {
        console.log('document.js caricato e DOM pronto.');
        let addProductForm = document.getElementById("addProductForm");
        let productCategory = document.getElementById("productCategory");


        let photoUploadInput = document.getElementById("photoUploadInput");
        let productName = document.getElementById("productName");
        let productDescription = document.getElementById("productDescription");
        let productPrice = document.getElementById("productPrice");
        let productQuantity = document.getElementById("productQuantity");

        let image = document.getElementById("photoUploadInput");
        let messagePlaceholder = document.getElementById("messagePlaceholder");

        function clearMessages() {
            if (messagePlaceholder) {
                messagePlaceholder.innerHTML = '';
                messagePlaceholder.style.display = 'none';
                messagePlaceholder.className = 'mb-3'; // Reset to default classes if any
            }
        }

        function showMessage(message, type = 'success') {
            if (messagePlaceholder) {
                messagePlaceholder.innerHTML = `<div class="alert alert-${type === 'success' ? 'success' : (type === 'warning' ? 'warning' : 'danger')}" role="alert">${message}</div>`;
                messagePlaceholder.style.display = 'block';
            } else {
                alert(message); // Fallback
            }
        }

        if (addProductForm) {
            addProductForm.addEventListener('submit', async function (event) {
                event.preventDefault();

                if (productCategory && productName && productDescription && productPrice && productQuantity) {
                    // Basic client-side validation (can be expanded)
                    if (!productCategory.value) { showMessage('Per favore, seleziona una categoria.', 'error'); return; }
                    if (!productName.value.trim()) { showMessage('Il nome del prodotto è obbligatorio.', 'error'); return; }
                    if (!productDescription.value.trim()) { showMessage('La descrizione del prodotto è obbligatoria.', 'error'); return; }
                    if (productPrice.value === '' || parseFloat(productPrice.value) < 0) { showMessage('Il prezzo del prodotto non è valido.', 'error'); return; }
                    if (productQuantity.value === '' || parseInt(productQuantity.value) < 0) { showMessage('La quantità disponibile non è valida.', 'error'); return; }

                    let bodyreq = {
                        nome: productName.value,
                        descrizione: productDescription.value,
                        prezzounitario: parseFloat(productPrice.value),
                        quantitadisponibile: parseInt(productQuantity.value),
                        categoria: productCategory.value
                    }

                    try {
                        let response = await fetchData("/api/products", "POST", bodyreq);
                        console.log('Product creation response:', response);

                        if (response.status === 201 && response.data && response.data.idprodotto) { // Check for 201 Created
                            let successMsg = `Prodotto "${response.data.nome}" aggiunto con successo!`;
                            let messageType = 'success'; // Default message type

                            const productId = response.data.idprodotto;
                            const imageFile = image.files[0]; // Get the first selected file

                            if (imageFile) { // Only attempt to upload if an image file is present
                                console.log("Tentativo di caricamento immagine per prodotto ID:", productId);
                                let putResponse = await fetchData(
                                    `/api/products/${productId}/image`,
                                    "PUT",
                                    imageFile, // Pass the actual file, not the input element
                                    {
                                        isRawBody: true,
                                        customContentType: imageFile.type // Use the file's type
                                    }
                                );

                                if (putResponse.status === 200) {
                                    successMsg += ' Immagine caricata con successo.';
                                    console.log("Immagine caricata con successo.");
                                } else {
                                    const imageErrorMessage = putResponse.message || (putResponse.body && (putResponse.body.message || putResponse.body.error)) || "Dettagli non disponibili.";
                                    successMsg += ` Errore nel caricamento dell'immagine: ${imageErrorMessage}`;
                                    console.error("Errore nel caricamento dell'immagine:", imageErrorMessage);
                                    messageType = 'warning'; // Product created, but image upload failed
                                    showMessage(successMsg, messageType);
                                    return; // Stop further processing if image upload failed but product was created
                                }
                                // If no imageFile, or if imageFile was provided and uploaded successfully,
                                // or if image upload failed and we returned, this part is skipped for the failure case.

                                showMessage(successMsg, messageType);
                                addProductForm.reset(); // Reset the form
                                const photoPreviewContainer = document.getElementById('photoPreview');
                                if (photoPreviewContainer) photoPreviewContainer.innerHTML = ''; // Clear image preview

                            } else { // Product creation itself failed
                                // No imageFile was provided, but product creation was successful.
                                // successMsg already contains the product creation success message.
                                // messageType is already 'success'.
                                showMessage(successMsg, messageType);
                                addProductForm.reset(); // Reset the form
                                // No image preview to clear as no image was selected.
                            }
                        }
                    }
                    catch (error) {
                        console.error("Eccezione durante l'aggiunta del prodotto:", error);
                        const exceptionMessage = error.message || (error.body && (error.body.message || error.body.error)) || "Si è verificato un errore imprevisto. Riprova.";
                        showMessage(exceptionMessage, 'error');
                    }

                }

            });
        }
    }); 