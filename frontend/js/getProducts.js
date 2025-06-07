function showProducts(result){
    let productsRes = ``;
        const products = result.data.map((product) => {
            productsRes += (
                `<div class="col">
                    <div class="card h-100" style="border-color: var(--secondary-color);">
                        <a href="dettaglioProdotto.html?id=${product.idprodotto}" class="text-decoration-none text-dark">
                        <img src="${product.immagine}" class="card-img-top" alt="Immagine Prodotto ${product.idprodotto}" style="height: 200px; object-fit: cover; width: 100%;">
                        </a>
                        <div class="card-body d-flex flex-column p-3">
                            <h5 class="card-title" style="color: var(--primary-color);">${product.nome}</h5>
                            <ul class="list-unstyled mt-2 mb-3 flex-grow-1">
                                <li><small class="text-muted">Valutazioni: <i class="bi bi-star-fill" style="color: var(--primary-color);"></i><i class="bi bi-star-fill" style="color: var(--primary-color);"></i><i class="bi bi-star-fill" style="color: var(--primary-color);"></i><i class="bi bi-star-half" style="color: var(--primary-color);"></i><i class="bi bi-star" style="color: var(--primary-color);"></i></small></li>
                                <li><small class="text-muted">Artigiano: ${product.nomeartigiano}</small></li>
                                <li><strong style="color: var(--primary-color);">Prezzo: €${product.prezzounitario}</strong></li>
                            </ul>
                            <!-- UNLOGGED -->
                            <button class="btn mt-auto unlogged" onclick="window.location.replace('/login.html')" style="background-color: var(--primary-color); color: white;">Aggiungi al carrello</button>

                            <!-- LOGGED (aggiunge il prodotto al carrello)-->
                            <button class="btn mt-auto invisible" onclick="aggiungiAlCarrello(${product.idprodotto})" style="background-color: var(--primary-color); color: white;">Aggiungi al carrello</button>
                        </div>
                    </div>
                </div>`
            )
        });


        document.getElementById("products").innerHTML = productsRes;
}

document.addEventListener("DOMContentLoaded", async function(){

    let result = await fetchData("/api/products/notdeleted", "GET");
    console.log(result);
    if(result.status == 200){
        showProducts(result);

    }else{
        console.log("Errore caricamento prodotti!")
    }
    
    document.getElementById('searchForm').addEventListener('submit', async function(event) {
        event.preventDefault();

        //prende tutti i dati e li converti in un oggetto facile per inviare all'endpoint
        const formData = new FormData(this);

        const formObj = Object.fromEntries(formData.entries());

        console.log(formObj);
        let opt = "?";
        if(formObj.name != ""){
            opt += `nome_like=${formObj.name}&`
        }
        if(formObj.categoria != ""){
            opt += `categoria=${formObj.categoria}&`
        }
        if(formObj.checkStock){
            opt += `quantitadisponibile_gte=1`
        }
        let resultSearch = await fetchData("/api/products/notdeleted" + opt, "GET");
        showProducts(resultSearch);
    })
})