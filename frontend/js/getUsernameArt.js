document.addEventListener('DOMContentLoaded', async function () {
    let result = await fetchData("/api/auth/session-info", "GET");
    if (result.status == 200) {
        if (result.data.tipologia == "Artigiano") {
            let usernameArtigiano = document.getElementById("usernameProfilo");

        if (!usernameArtigiano){
            usernameArtigiano = document.getElementById("nav-username");
        }
        usernameArtigiano.textContent = result.data.username;

                       // Select all buttons that should be managed for adding products
            const addProductButtons = document.querySelectorAll(".add-product-btn"); 
            console.log("getUsernameArt.js", addProductButtons);
            addProductButtons.forEach(button => {
                if (button) { 
                    if (result.data.esitoapprovazione == "In lavorazione" || result.data.esitoapprovazione == "Rifiutato") {
                        button.classList.add('is-disabled');
                        button.setAttribute('aria-disabled', 'true'); // For accessibility
                        button.title = "La tua registrazione è in attesa di approvazione. Non puoi aggiungere prodotti.";
                    } else {
                        // Ensure it's enabled if approved
                        button.classList.remove('is-disabled');
                        button.setAttribute('aria-disabled', 'false');
                        button.title = "Inserisci Prodotto";
                    }
                }
            });

        }
    }
});

// Modified to accept the clicked button element as an argument
function goToAddProducts(buttonElement) { 
    // Check if the specific button clicked has the 'is-disabled' class
    if (buttonElement && buttonElement.classList.contains('is-disabled')) {
        // Optionally, provide feedback to the user or simply do nothing
        console.warn("Azione 'Inserisci Prodotto' bloccata: l'account artigiano non è approvato o la funzionalità è disabilitata.");
        return; // Prevent navigation
    }
    window.location.href = "aggiungiProdotto.html";

}
