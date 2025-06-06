//quando il DOM è caricato
document.addEventListener('DOMContentLoaded', function(){
    const checkbox = document.getElementById("toggleSwitch");
    const pivaText = document.getElementById("piva");
    const descText = document.getElementById("descrizione");

    //andiamo a monitorare i cambiamenti dello switch nel form
    checkbox.addEventListener('change', function(){
        const isChecked = this.checked;
        
        //se lo switch è attivo vengono mostrati i campi sottostanti
        const conditionalSections = document.querySelectorAll('.conditional-section');
            conditionalSections.forEach(section => {
                section.style.display = this.checked ? 'block' : 'none';
            });
        
        pivaText.required = isChecked;
        pivaText.disabled = !isChecked;
        descText.required = isChecked;
        descText.disabled = !isChecked;
    });


    //quando viene submittato
    document.getElementById('formRegistrazione').addEventListener('submit', async function(event) {
                event.preventDefault();
    
                //prende tutti i dati e li converti in un oggetto facile per inviare all'endpoint
                const formData = new FormData(this);
    
                const formObj = Object.fromEntries(formData.entries());
    
                console.log(formObj);
    
                if(formObj.checkArtigiano){
                    formObj.tipologia = "Artigiano";
                }else{
                    formObj.tipologia = "Cliente";
                }
    
                console.log(formObj);
                let result = await fetchData("/api/users", "POST", formObj);
                if(result){
                    window.location.replace("/")
                }else{
                    console.log()
                    //TODO: mettere qualcosa in caso di failure della registrazione
                }
            });
})
