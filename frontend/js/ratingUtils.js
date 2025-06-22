/**
 * Fetches the average rating for a given product ID and returns an HTML string
 * representing the star rating and the numeric value.
 *
 * Assumes `fetchData` (from fetcher.js) and `getStarsHtml` (from getProducts.js)
 * are globally available.
 *
 * @param {string|number} idprodotto The ID of the product.
 * @returns {Promise<string>} A promise that resolves to an HTML string for the rating,
 *                            or an error/default message string if fetching fails or no rating exists.
 */
async function getHTMLforAverageRating(idprodotto) {
    if (!idprodotto) {
        console.error('getHTMLforAverageRating: idprodotto is required.');
        return '<small class="text-muted">ID Prodotto mancante</small>';
    }

    try {
        const apiUrl = `/api/products/${idprodotto}/average-rating`;
        const result = await fetchData(apiUrl, "GET");
        //console.log(idprodotto, result)

        if (result && result.status === 200 && result.data) {
            const ratingData = result.data;
            // Corrected condition: removed duplicate null check
            if (ratingData && (ratingData.average_rating !== null && ratingData.average_rating !== undefined)) {
                const averageRating = parseFloat(ratingData.average_rating);
                const stars = getStarsHtml(averageRating); // From getProducts.js
                if (averageRating === 0) {
                    return `<span class="stars-display">${stars}</span> <small class="text-muted ms-1">N/A</small>`;
                } else {
                    return `<span class="stars-display">${stars}</span> <small class="text-muted ms-1">(${averageRating.toFixed(1)})</small>`;
                }
            } else {
                return '<small class="text-muted">N/A</small>'; // No rating available
            }
        } else {
            const errorMessage = result ? (result.data?.message || result.message || 'Errore') : 'Errore';
            console.warn(`Could not fetch average rating for product ${idprodotto}:`, errorMessage);
            return '<small class="text-muted">Rating non disp.</small>';
        }
    } catch (error) {
        console.error(`Exception while fetching average rating for product ${idprodotto}:`, error);
        return '<small class="text-muted">Errore rating</small>';
    }
}

/**
 * Generates HTML for star rating icons based on a given rating value,
 * rounding up to the nearest half star.
 * E.g., 1.0 -> 1 full; 1.1 -> 1.5 (1 full, 1 half); 1.6 -> 2.0 (2 full)
 * @param {number|string} rating - The rating value (e.g., 3, 3.2, "4.7").
 * @param {number} maxStars - The maximum number of stars to display (default is 5).
 * @returns {string} HTML string representing the star icons.
 */
function getStarsHtml(rating, maxStars = 5){
    let html = '';
    // Ensure rating is a number, default to 0 if null/undefined or not a number
    let numericRating = parseFloat(rating);
    numericRating = isNaN(numericRating) ? 0 : numericRating;

    // Cap rating between 0 and maxStars
    numericRating = Math.max(0, Math.min(numericRating, maxStars));

    // Round up to the nearest 0.5
    // Example: 1.0 -> 1.0; 1.1 -> 1.5; 1.5 -> 1.5; 1.6 -> 2.0
    const displayRating = Math.ceil(numericRating * 2) / 2;

    const fullStars = Math.floor(displayRating);
    const hasHalfStar = (displayRating - fullStars) === 0.5;

    for (let i = 0; i < fullStars; i++) {
        html += '<i class="bi bi-star-fill" style="color: var(--primary-color);"></i>';
    }
    if (hasHalfStar) {
        html += '<i class="bi bi-star-half" style="color: var(--primary-color);"></i>';
    }
    const emptyStars = maxStars - fullStars - (hasHalfStar ? 1 : 0);
    for (let i = 0; i < emptyStars; i++) {
        html += '<i class="bi bi-star" style="color: var(--primary-color);"></i>';
    }
    return html;
}