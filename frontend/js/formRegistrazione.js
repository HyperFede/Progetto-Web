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

    function validatePiva(piva) {
        var re = /^\d{11}$/;
        return re.test(piva);
    }


    //quando viene submittato
    document.getElementById('formRegistrazione').addEventListener('submit', async function(event) {
                event.preventDefault();
                const usernameError = document.getElementById("username-error");
                const emailError = document.getElementById("email-error");
                usernameError.classList.add("invisible");
                emailError.classList.add("invisible");
                document.getElementById("email-invalid").classList.add("invisible");

                const inputNome = document.getElementById("nome");
                const inputCognome = document.getElementById("cognome");
                const inputUsername = document.getElementById("username");
                const inputPassword = document.getElementById("password");
                const inputEmail = document.getElementById("email");
                const inputPiva = document.getElementById("piva");
                const inputDesc = document.getElementById("descrizione");
                const inputIndirzzo = document.getElementById("indirizzo");
    
                //prende tutti i dati e li converti in un oggetto facile per inviare all'endpoint
                const formData = new FormData(this);
    
                const formObj = Object.fromEntries(formData.entries());

                if(!validateEmail(formObj.email)){
                    document.getElementById("email-invalid").classList.remove("invisible");
                    formObj.email.scrollIntoView({ behavior: 'smooth', block: 'center' }); // Scroll to the error message

                    return;
                }


    
                // //console.log(formObj);
    
                if(formObj.checkArtigiano){
                    formObj.tipologia = "Artigiano";
                    formObj.piva = pivaText.value;
                    formObj.artigianodescrizione = descText.value;
                    if (!validatePiva(formObj.piva)) {
                        document.getElementById("piva-invalid").classList.remove("invisible");
                        formObj.piva.scrollIntoView({ behavior: 'smooth', block: 'center' }); // Scroll to the error message
                        return;
                    }
                    else{
                        document.getElementById("piva-invalid").classList.add("invisible");
                    }
                }
                else{
                    formObj.tipologia = "Cliente";
                }
    
                let result = await fetchData("/api/users", "POST", formObj);
                if(result.status === 201 || result.status === 200){

                    
                    usernameError.classList.add("invisible");
                    inputEmail.classList.remove("is-invalid");
                    emailError.classList.add("invisible");
                    inputUsername.classList.remove("is-invalid");
                    document.getElementById("piva-invalid").classList.add("invisible");



                    [inputNome, inputCognome, inputUsername, inputPassword, inputEmail, inputIndirzzo, inputPiva, inputDesc].forEach(input => {
                        input.classList.add("is-valid");
                    })

                    await fetchData ("api/auth/login", "POST", {username: formObj.username, password: formObj.password});
                    
                    setTimeout(() => {
                        if(formObj.tipologia == "Cliente"){
                            window.location.href = "/"; // No need for parentheses around the URL string
                        }else{
                            window.location.href = "dashboardArtigiano.html"; // No need for parentheses
                        }
                    }, 1000); // 2000 milliseconds = 2 seconds delay
                }else{
                    if(result.message == "Username già esistente."){
                        //TODO: mettere qualcosa in caso di failure della registrazione
                        usernameError.classList.remove("invisible");
                        inputUsername.classList.add("is-invalid");
                        usernameError.scrollIntoView({ behavior: 'smooth', block: 'center' }); // Scroll to the error message

                        inputUsername.classList.add("is-invalid");
                    }else if(result.message == "Email già esistente."){
                        emailError.classList.remove("invisible");
                        inputEmail.classList.add("is-invalid");
                        inputEmail.scrollIntoView({ behavior: 'smooth', block: 'center' }); // Scroll to the error message
                    }
                }
            });
})
