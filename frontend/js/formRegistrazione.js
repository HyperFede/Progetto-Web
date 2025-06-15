//quando il DOM è caricato
document.addEventListener('DOMContentLoaded', function(){
    const checkbox = document.getElementById("toggleSwitch");
    const pivaText = document.getElementById("piva");
    const descText = document.getElementById("descrizione");

    //andiamo a monitorare i cambiamenti dello switch nel form
    checkbox.addEventListener('change', function(){
        const isChecked = this.checked;
        
        //se lo switch è attivo vengono mostrati i campi sottostanti
        const selector = document.querySelectorAll('.conditional-section');
            selector.forEach(section => {
                section.style.display = this.checked ? 'block' : 'none';
            });
        
        pivaText.required = isChecked;
        pivaText.disabled = !isChecked;
        descText.required = isChecked;
        descText.disabled = !isChecked;
    });
    
    
    function validateEmail(email) {
        var re = /\S+@\S+\.\S+/;
        return re.test(email);
    }


    //quando viene submittato
    document.getElementById('formRegistrazione').addEventListener('submit', async function(event) {
                event.preventDefault();
                const usernameError = document.getElementById("username-error");
                const emailError = document.getElementById("email-error");
                usernameError.classList.add("invisible");
                emailError.classList.add("invisible");
                document.getElementById("email-invalid").classList.add("invisible");
    
                //prende tutti i dati e li converti in un oggetto facile per inviare all'endpoint
                const formData = new FormData(this);
    
                const formObj = Object.fromEntries(formData.entries());

                if(!validateEmail(formObj.email)){
                    document.getElementById("email-invalid").classList.remove("invisible");
                    return;
                }
    
                // console.log(formObj);
    
                if(formObj.checkArtigiano){
                    formObj.tipologia = "Artigiano";
                    formObj.piva = pivaText.value;
                    formObj.artigianodescrizione = descText.value;
                }else{
                    formObj.tipologia = "Cliente";
                }
    
                let result = await fetchData("/api/users", "POST", formObj);
                if(result.status == 200){
                    if(formObj.tipologia == "Cliente"){
                        window.location.replace("/")
                    }else{
                        window.location.replace("artigianoInAttesa.html")
                    }
                }else{
                    if(result.message == "Username già esistente."){
                        //TODO: mettere qualcosa in caso di failure della registrazione
                        usernameError.classList.remove("invisible");
                    }else if(result.message == "Email già esistente."){
                        emailError.classList.remove("invisible");
                    }
                }
            });
})
