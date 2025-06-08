// Questo script gestisce l'anteprima delle immagini caricate in un input di tipo file.
// Assicurati di resettare l'anteprima mettendo

/**
 *  const photoPreviewContainer = document.getElementById('photoPreview');
 *  photoPreviewContainer.innerHTML = ''; // Pulisci preview foto
 */

document.addEventListener('DOMContentLoaded', function () {
    // assicurati che il nominativo delle variabili corrisponda agli ID degli elementi nel tuo HTML 
    const photoUploadInput = document.getElementById('photoUploadInput');
    const photoPreviewContainer = document.getElementById('photoPreview');

    if (photoUploadInput && photoPreviewContainer) {
        photoUploadInput.addEventListener('change', function (event) {
            photoPreviewContainer.innerHTML = '';
            const files = event.target.files;
            if (files.length > 0) {
                Array.from(files).forEach(file => {
                    if (file.type.startsWith('image/')) {
                        const reader = new FileReader();
                        reader.onload = function (e) {
                            const img = document.createElement('img');
                            img.src = e.target.result;
                            img.style.maxWidth = '100px'; // opzionale
                            img.style.margin = '5px';      // opzionale
                            photoPreviewContainer.appendChild(img);
                        };
                        reader.readAsDataURL(file);
                    }
                });
            }
        });
    }
});
