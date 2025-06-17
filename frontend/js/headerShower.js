// Funzione per aggiornare l'interfaccia utente del contatore del carrello
function updateCartCounterUI(count, animate = false) { // Aggiunto parametro animate
    const countLg = document.getElementById('cart-item-count-lg');
    const countSm = document.getElementById('cart-item-count-sm');
    const iconLg = document.getElementById('cart-icon-lg');
    const iconSm = document.getElementById('cart-icon-sm');

    const displayValue = count > 0 ? 'inline-block' : 'none';
    const textValue = count > 0 ? count.toString() : '';

    const badges = [countLg, countSm];
    const icons = [iconLg, iconSm];

    badges.forEach(badge => {
        if (badge) {
            badge.textContent = textValue;
            badge.style.display = displayValue;
        }
    });

    if (animate && count > 0) {
        // console.log("headerShower.js - updateCartCounterUI: Tento animazione. Conteggio:", count, "Flag Animate:", animate); // DEBUG
        // console.log("headerShower.js - updateCartCounterUI: Icona LG:", iconLg, "Icona SM:", iconSm); // DEBUG
        badges.forEach(badge => {
            if (badge && badge.style.display !== 'none') { // Anima solo se il badge è visibile
                // console.log("headerShower.js - updateCartCounterUI: Applica animazione a badge:", badge.id); // DEBUG
                badge.classList.add('cart-badge-animate');
                setTimeout(() => {
                    badge.classList.remove('cart-badge-animate');
                    // console.log("headerShower.js - updateCartCounterUI: Rimuovi animazione da badge:", badge.id); // DEBUG
                }, 500); // Durata animazione 0.5s
            }
        });

    } else if (animate && count === 0) { // Se animate è true ma il carrello è vuoto (es. dopo rimozione ultimo item)
        // console.log("headerShower.js - updateCartCounterUI: Animazione richiesta, ma conteggio è 0. Conteggio:", count); // DEBUG
    }
}

// Funzione per recuperare i dati del carrello e aggiornare il contatore
async function fetchAndUpdateCartCounter(triggerAnimation = false) {
    // console.log("headerShower.js - fetchAndUpdateCartCounter: Chiamata con triggerAnimation =", triggerAnimation); // DEBUG
    try {
        const sessionInfo = await fetchData("/api/auth/session-info", "GET");
        if (sessionInfo.status === 200 && sessionInfo.data && sessionInfo.data.idutente && sessionInfo.data.tipologia !== "Admin") {
            const userId = sessionInfo.data.idutente;
            const cartData = await fetchData(`/api/cart/${userId}`, "GET");
            if (cartData.status === 200 && cartData.data && cartData.data.items) {
                const totalQuantity = cartData.data.items.reduce((sum, item) => sum + item.quantita, 0);
                // console.log("headerShower.js - fetchAndUpdateCartCounter: Carrello recuperato. Quantità totale:", totalQuantity, "Chiamo updateCartCounterUI."); // DEBUG
                updateCartCounterUI(totalQuantity, triggerAnimation);
            } else {
                // console.warn("headerShower.js - fetchAndUpdateCartCounter: Recupero dati carrello fallito o carrello vuoto.", cartData); // DEBUG
                updateCartCounterUI(0, triggerAnimation); // Passa triggerAnimation anche qui per gestire il caso di svuotamento carrello
            }
        } else {
            // Utente non loggato, admin, o errore nel recupero sessione
            // console.log("headerShower.js - fetchAndUpdateCartCounter: Utente non loggato, admin, o errore sessione.", sessionInfo); // DEBUG
            updateCartCounterUI(0, false); // Non animare se l'utente non è loggato o è admin
        }
    } catch (error) {
        console.error("Errore durante il fetch del carrello per il contatore:", error);
        updateCartCounterUI(0, false); // Non animare in caso di errore
    }
}

document.addEventListener('DOMContentLoaded', async function(){
            let result = await fetchData("/api/auth/session-info", "GET");
            // console.log(result); // Rimosso per pulizia
            setTimeout(async () => { // Aggiunto async qui
                if(result.status == 200){
                    //loggato
                    const usernameSpans = document.querySelectorAll('#nav-username');
                    usernameSpans.forEach(span => {
                        span.textContent = result.data.username;
                    });
                    const selectorInvisible = document.querySelectorAll('.invisible');
                    selectorInvisible.forEach(section => {
                        if(result.data.tipologia != "Admin"){
                            section.classList.remove("invisible");
                            section.classList.add("logged");
                        }
                    });
                    const selectorUnlogged = document.querySelectorAll('.unlogged');
                    selectorUnlogged.forEach(section => {
                        section.classList.add("invisible");
                    });
                
                    if(result.data.tipologia == "Admin"){
                        const selectorAdmin = document.querySelectorAll('.invisible-admin');
                        selectorAdmin.forEach(section => {
                            section.classList.remove("invisible-admin");
                        });
                    }
                    // Chiamata per aggiornare il contatore del carrello
                    await fetchAndUpdateCartCounter();
                }else{
                    //non loggato
                    updateCartCounterUI(0); // Assicura che il contatore sia nascosto se non loggato
                            }
            }, 250);
        });