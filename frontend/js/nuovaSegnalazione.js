document.addEventListener('DOMContentLoaded', function () {

    const segnalazioneForm = document.getElementById('problemForm');
    const idOrdineInput = document.getElementById('orderIdInput'); // Assuming you have an input for Order ID
    const descrizioneInput = document.getElementById('problemDescriptionInput'); // Assuming a textarea for description
    const immagineInput = document.getElementById('photoUploadInput'); // Assuming a file input for an image
    const submitButton = document.getElementById('btnSubmit'); // Assuming a submit button

    const successMessage = document.getElementById('successMessage'); // For displaying success/error messages

    const orderIdFromUrl = getIdOrdineFromUrl();

    if (idOrdineInput && orderIdFromUrl) {
        idOrdineInput.value = orderIdFromUrl;
        idOrdineInput.readOnly = true; // Make the input field non-modifiable
    }

    // Function to get idordine from URL query parameters
    function getIdOrdineFromUrl() {
        const urlParams = new URLSearchParams(window.location.search);
        return urlParams.get('idordine');
    }

    function clearFormMessages() {
        if (successMessage) {
            successMessage.innerHTML = '';
            successMessage.className = 'message-placeholder my-3'; // Reset classes
            successMessage.style.display = 'none';
        }
    }

    function displayMessage(message, type = 'error') {
        if (successMessage) {
            successMessage.innerHTML = `<span class="${type}-text">${message}</span>`;
            successMessage.className = `message-placeholder my-3 alert alert-${type === 'success' ? 'success' : 'danger'}`;
            successMessage.style.display = 'block';
        } else {
            alert(message); // Fallback if the message div isn't found
        }
    }

    if (segnalazioneForm) {
        segnalazioneForm.addEventListener('submit', async function (event) {
            event.preventDefault();
            clearFormMessages();

            // Use the new function to get orderId from URL
            // If idOrdineInput is still used for display or manual override, keep it, otherwise it can be removed.


            const orderId = orderIdFromUrl || idOrdineInput.value; // Prioritize URL, fallback to input
            const description = descrizioneInput.value;
            const image = immagineInput.files[0];

            const bodyreq = {
                idordine: orderId,
                descrizione: description,
            };

            try {
                let response = await fetchData("/api/problems/", "POST", bodyreq);

                if (response.error || response.status >= 400) {
                    // Error from fetchData (e.g., network error) or non-OK HTTP status from backend
                    const errorMessage = response.message || (response.body && (response.body.message || response.body.error)) || "Errore durante l'invio della segnalazione.";
                    displayMessage(errorMessage, 'error');
                    return;
                }

                // First POST successful
                let mainSuccessMessage = response.data.message || "Segnalazione inviata con successo.";
                const idproblema = response.data.idproblema;

                if (image && idproblema) {
                    let putResponse = await fetchData(
                        `/api/problems/${idproblema}/image`, // Ensure endpoint is correct
                        "PUT",
                        image, {
                        isRawBody: true,
                        customContentType: image.type
                    });

                    if (putResponse.error || putResponse.status >= 400) {
                        const imageErrorMessage = putResponse.message || (putResponse.body && (putResponse.body.message || putResponse.body.error)) || "Dettagli non disponibili.";
                        mainSuccessMessage += ` Errore nel caricamento dell'immagine: ${imageErrorMessage}`;
                        // Display as partial success with image error
                        displayMessage(mainSuccessMessage, 'warning'); // Or 'error' if image is critical
                    } else {
                        mainSuccessMessage += ` Immagine caricata con successo.`;
                        displayMessage(mainSuccessMessage, 'success');
                        // Redirect to leMieSegnalazioni.html after 2 seconds
                        setTimeout(() => {
                            window.location.href = 'leMieSegnalazioni.html';
                        }, 2000);
                        segnalazioneForm.reset(); // Reset form only on full success

                        // Clear image preview if you have one
                        const photoPreviewContainer = document.getElementById('photoPreview'); // Assuming this ID for preview
                        if (photoPreviewContainer) photoPreviewContainer.innerHTML = '';
                    }
                } else {
                    // No image to upload, or idproblema missing from first response
                    displayMessage(mainSuccessMessage, 'success');
                    segnalazioneForm.reset();

                }
            } catch (error) {
                // Catch exceptions from fetchData itself or other synchronous errors
                console.error("Eccezione durante l'invio della segnalazione:", error);
                const exceptionMessage = error.message || (error.body && (error.body.message || error.body.error)) || "Si è verificato un errore imprevisto.";
                displayMessage(exceptionMessage, 'error');
            }
        });
    };
});
