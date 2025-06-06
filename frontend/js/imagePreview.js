document.addEventListener('DOMContentLoaded', function () {
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
