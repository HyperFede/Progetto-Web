async function aggiungiAlCarrello(id = null, quantita = 1){
    if(id == null){
        const urlParams = new URLSearchParams(window.location.search);
        id = urlParams.get('id');
    }
    let obj = { // Dichiarata con let
        "quantita": quantita
    };

    let result = await fetchData(`api/cart/items/${id}/add`, "PUT", obj);
    if (result.status == 200) {
        // console.log("Aggiunto al carrello (quantità aggiornata)!")
        if (typeof fetchAndUpdateCartCounter === 'function') {
            await fetchAndUpdateCartCounter(true); // Passa true per animare
        }
    } else if (result.status == 404) { // Prodotto non ancora nel carrello, proviamo ad aggiungerlo come nuovo item
        obj = { // Riassegna obj
            "idprodotto": id,
            "quantita": quantita
        };
        
        let postResult = await fetchData("/api/cart/items", "POST", obj); // Rinominato result per evitare confusione
        if (postResult.status == 201) {
            // console.log("Aggiunto al carrello (nuovo prodotto)!")
            if (typeof fetchAndUpdateCartCounter === 'function') {
                await fetchAndUpdateCartCounter(true); // Passa true per animare
            }
        } else {
            // console.log("Errore nella aggiunta (POST)!", postResult)
            // Qui si potrebbe mostrare un messaggio di errore all'utente
            if (postResult.message) {
                // alert(`Errore: ${postResult.message}`);
                console.warn("Messaggio dal backend (POST):", postResult.message);
            }
        }
    } else {
        // console.log("Errore nell'aggiunta (PUT) o stock terminato!", result)
        // Qui si potrebbe mostrare un messaggio di errore all'utente (es. stock non disponibile)
        if (result.message) {
            // alert(`Errore: ${result.message}`);
            console.warn("Messaggio dal backend (PUT):", result.message);
        }
    }
}