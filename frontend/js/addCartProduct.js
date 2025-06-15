async function aggiungiAlCarrello(id = null, quantita = 1){
    if(id == null){
        const urlParams = new URLSearchParams(window.location.search);
        id = urlParams.get('id');
    }
    obj = {
        "quantita": quantita
    }

    let result = await fetchData(`api/cart/items/${id}/add`, "PUT", obj);
        if(result.status == 200){
        //    console.log("Aggiunto al carrello!")
        }else if(result.status==404){
            obj = {
                    "idprodotto": id,
                    "quantita": quantita
                }
            
                let result = await fetchData("/api/cart/items", "POST", obj);
                    if(result.status == 201){
                       // console.log("Aggiunto al carrello!")
                    }else{
                       // console.log("Errore nella aggiunta!")
                    }
        }else{
            //STOCK TERMINATO
        }
}