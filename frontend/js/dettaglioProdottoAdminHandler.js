document.addEventListener('DOMContentLoaded', async function () {
    productActionBarDisplayAndAdminUIUpdate();
});

async function eliminaProdotto() {
    let response = await fetchData("api/auth/session-info", "GET");
    idprodotto = getProductIdFromURL();
    if (response.status === 200) {
        if (response.data.tipologia === "Admin") {

            // Use confirm() which returns true if the user clicks "OK"
            if (confirm("Sei sicuro di voler eliminare il prodotto? Questa azione è irreversibile.")) {
                const deleteResponse = await fetchData("api/products/" + idprodotto, "DELETE");
                console.log(deleteResponse);
                // Check the 'status' property of the response object. 200 or 204 are success codes for DELETE.
                if (deleteResponse.status === 200 || deleteResponse.status === 204) {
                    alert("Prodotto eliminato con successo."); // Optional: give feedback before redirecting
                    window.location.href = "index.html";
                }

            }
            else {
                console.error("Impossibile")
            }
        }
    }
}

async function productActionBarDisplayAndAdminUIUpdate(){
                const productActionBar = document.getElementById("product-action-bar");


    let response = await fetchData("api/auth/session-info", "GET");
    console.log("AdminHandlerResponse", response);

    if (response.status === 200) {
        if (response.data.tipologia === "Admin") {
            
            const adminActions = document.getElementById("admin-action-bar");
            adminActions.style.display = "block";
            productActionBar.setAttribute('style', 'display:none !important');

            // The delete review button HTML is now generated directly in dettaglioProdotto.js
            // based on the isAdmin flag.

        }
        else{
            productActionBar.style.display = "grid";
        }
    }
    else{
                    productActionBar.style.display = "grid";

    }

}
