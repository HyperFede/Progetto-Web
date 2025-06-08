async function aggiungiAlCarrello(id = null, quantita = 1){
    if(id == null){
        const urlParams = new URLSearchParams(window.location.search);
        id = urlParams.get('id');
    }
    obj = {
        "idprodotto": id,
        "quantita": quantita
    }
    console.log(obj)
    let result = await fetchData("/api/cart/items", "POST", obj);
    console.log(result);
        if(result.status == 201){
            console.log("Aggiunto al carrello!")
        }else{
            console.log("Errore nella aggiunta!")
        }
}