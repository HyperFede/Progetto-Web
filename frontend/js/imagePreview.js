document.addEventListener('DOMContentLoaded', function () {
    const imageContainer = document.querySelector('.product-detail-image-container');
    if (!imageContainer) {
        // //console.log("Image preview script: .product-detail-image-container not found.");
        return;
        
    }

    // Select all necessary elements
    const productImageInput = imageContainer.querySelector('#productImageInput');
    const currentImageDisplay = imageContainer.querySelector('.current-image-display');
    const addImageTrigger = imageContainer.querySelector('.add-image-trigger');
    const addImageIcon = document.getElementById('addImageIcon');
    const addImageAggiungiTxt = document.getElementById('addImageAggiungiTxt');

    const imageActionOverlay = imageContainer.querySelector('.image-action-overlay');
    const removeImageBtn = imageContainer.querySelector('#removeImageBtn');

    if (!productImageInput || !currentImageDisplay || !addImageTrigger || !imageActionOverlay || !removeImageBtn) {
        console.warn("Image preview script: One or more required elements are missing.");
        return;
    }

    /**
     * Updates the UI based on whether an image is present.
     * @param {boolean} hasImage - True if an image is being displayed, false otherwise.
     */
    function updateImageUI(hasImage) {
        if (hasImage) {
            // State: An image is present
            currentImageDisplay.style.display = 'flex';
            imageActionOverlay.style.display = 'flex'; // Show the 'Remove' button overlay
            addImageTrigger.style.display = 'none';     // Hide the 'Add Image' camera icon
            addImageIcon.style.display = 'none';
            addImageAggiungiTxt.style.display = 'none';
            imageContainer.classList.add('state-has-image');
            imageContainer.classList.remove('state-add-image');
            //console.log(addImageTrigger);
        } else {
            // State: No image, show placeholder and add trigger
            currentImageDisplay.style.display = 'flex';
            imageActionOverlay.style.display = 'none';      // Hide the 'Remove' button
            addImageTrigger.style.display = 'flex';       // FIX: Show the 'Add Image' camera icon
            imageContainer.classList.add('state-add-image');
            imageContainer.classList.remove('state-has-image');
        }
    }

    // FIX: Make the camera icon the primary click target to add an image.
    addImageTrigger.addEventListener('click', () => {
        productImageInput.click();
    });
    
    // Also allow clicking the placeholder text area for better UX
    currentImageDisplay.addEventListener('click', () => {
        // Only trigger if there is no image currently displayed
        if (!currentImageDisplay.querySelector('img')) {
            productImageInput.click();
        }
    });

    // Handle file selection
    productImageInput.addEventListener('change', function (e) {
        //console.log(addImageTrigger);
        const file = e.target.files[0];
        if (file && file.type.startsWith('image/')) {
            const reader = new FileReader();
            reader.onload = evt => {
                currentImageDisplay.innerHTML = `
                    <img src="${evt.target.result}" alt="Anteprima Prodotto">

                `;
                updateImageUI(true);
            };
            reader.readAsDataURL(file);
        } else if (file) {
            alert("Per favore, seleziona un file immagine.");
            productImageInput.value = ''; // Clear the invalid selection
            if (!currentImageDisplay.querySelector('img')) {
                updateImageUI(false);
            }
        } else {
            if (!currentImageDisplay.querySelector('img')) {
                updateImageUI(false);
            }
        }
    });

    // Handle image removal
    removeImageBtn.addEventListener('click', () => {
        productImageInput.value = ''; // Clear the file input
        updateImageUI(false);         // Reset the UI to the 'no image' state
    });

    // Initial UI setup on page load
    const existingImage = currentImageDisplay.querySelector('img');
    const hasInitialImage = !!(existingImage && existingImage.src && !existingImage.src.includes('data:image/gif;base64'));
    updateImageUI(hasInitialImage);
});