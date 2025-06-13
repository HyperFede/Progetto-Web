document.addEventListener('DOMContentLoaded', async function(){


    sessionStorage.setItem("id", getOrderIdFromURL());

});


function getOrderIdFromURL() {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('id');
}

function dateFormatter(datestr){
  const date = new Date(datestr);
  
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  
  return `${day}/${month}/${year} ${hours}:${minutes}`;
}

function showProducts(result){
    let productsRes = `<h3 class="customer-reviews-title mb-4">Recensioni dei clienti</h3>`;
        const infos = result.data.map((rec) => {
            
            productsRes += rec.immagine != undefined ? (
                `<div class="customer-review-box mb-3">
                    <div class="review-header d-flex justify-content-between align-items-center mb-1">
                        <span class="review-customer-name">${rec.username}</span>
                        <span class="review-date">${dateFormatter(rec.data)}</span>
                    </div>
                    <div class="review-rating-title d-flex align-items-center mb-2">
                        <span class="review-stars me-2">
                            <i class="bi bi-star-fill"></i>
                            <i class="bi bi-star-fill"></i>
                            <i class="bi bi-star-fill"></i>
                            <i class="bi bi-star-fill"></i>
                            <i class="bi bi-star"></i>
                        </span>
                        <strong class="review-object">Prodotto eccellente!</strong>
                    </div>
                    <div class="review-body d-flex align-items-start">
                        <div class="review-image-container me-3">
                            <img src="http://localhost:3000/api/products/${rec.idprodotto}/image_content" alt="Foto recensione cliente" class="review-customer-photo">
                        </div>
                        <div class="review-text-content flex-grow-1">
                            <p class="review-text">
                                ${rec.testo}
                            </p>
                        </div>
                    </div>
                </div>`
            ) : (
                `<div class="customer-review-box mb-3">
                    <div class="review-header d-flex justify-content-between align-items-center mb-1">
                        <span class="review-customer-name">${rec.username}</span>
                        <span class="review-date">${dateFormatter(rec.data)}</span>
                    </div>
                    <div class="review-rating-title d-flex align-items-center mb-2">
                        <span class="review-stars me-2">
                            <i class="bi bi-star-fill"></i>
                            <i class="bi bi-star-fill"></i>
                            <i class="bi bi-star-fill"></i>
                            <i class="bi bi-star-fill"></i>
                            <i class="bi bi-star-fill"></i>
                        </span>
                        <strong class="review-object">Ottimo acquisto</strong>
                    </div>
                    <div class="review-body">
                        <div class="review-text-content">
                            <p class="review-text">
                                ${rec.testo}
                            </p>
                        </div>
                    </div>
                </div>`
            )
        });


        document.getElementById("review").innerHTML = productsRes;
}


document.addEventListener('DOMContentLoaded', async function() {
    const urlParams = new URLSearchParams(window.location.search);
    id = urlParams.get('id');

    let result = await fetchData(`/api/products/${id}`, "GET");
    const nomeProdotto = document.querySelectorAll("#nomeProdotto");
    nomeProdotto.forEach((n) => {
        n.textContent = result.data.nome;
    })
    const prezzoProdotto = document.querySelectorAll("#prezzoProdotto");
    prezzoProdotto.forEach((n) => {
        n.textContent = `€${result.data.prezzounitario}`;
    })

    const artigianoProdotto = document.getElementById("artigianoProdotto");
    artigianoProdotto.textContent = result.data.nomeartigiano
    const descProdotto = document.getElementById("descProdotto");
    descProdotto.textContent = result.data.descrizione
    const immagineProdotto = document.getElementById("immagineProdotto");
    immagineProdotto.src = result.data.immagine_url
    const categoriaProdotto = document.getElementById("categoriaProdotto");
    categoriaProdotto.textContent = result.data.categoria
    const statoProdotto = document.getElementById("statoProdotto");

    if(result.data.quantitadisponibile > 0){
        statoProdotto.textContent = "Disponibile"
    }else{
        statoProdotto.textContent = "Non disponibile";
        statoProdotto.style.color = "red";
        const adder = document.getElementById("quantityInput");
        adder.disabled = true;
    }

    const hrefArtigiano = document.getElementById("hrefArtigiano");
    hrefArtigiano.href = `dettaglioArtigiano.html?id=${result.data.idartigiano}`;


    //CARICO RECENSIONI

    let recensioni = await fetchData(`/api/reviews/product/${id}`, "GET");
    if(result.status == 200){
        showProducts(recensioni);

    }else{
        //console.log("Errore caricamento prodotti!")
    }
})