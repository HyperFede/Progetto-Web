document.addEventListener('DOMContentLoaded', function () {
    const email = document.getElementById('email');
    const verifyIdentityButton = document.getElementById('verifyIdentityButton');
    const verifyMessage = document.getElementById("verifyMessage");

            // Clear any previous messages
    verifyMessage.innerHTML = '';
    verifyMessage.classList.remove('alert-success', 'alert-danger'); // Remove previous alert styles
    verifyMessage.style.display = 'none'; // Hide it initially

    

    verifyIdentityButton.addEventListener('click', async function (event) {
        event.preventDefault(); // Prevent the default form submission or button action
        if (!email.value) {
            verifyMessage.innerHTML = '<span class="error-text">Inserisci un indirizzo email valido.</span>';
            verifyMessage
        }
        else{
            emailDaMandare = email.value;
        }
        response = await fetchData('api/auth/send-recovery-email', "POST", {email: emailDaMandare});
        if (response.status === 200){
            //console.log("Email inviata con successo");
            verifyMessage.innerHTML = '<span class="success-text">Tii abbiamo inviato un link per il recupero della password.</span>';
            verifyMessage.classList.add('alert', 'alert-success'); // Add Bootstrap success alert styles
            verifyMessage.style.display = 'block'; // Show the message
        } else {
            // Handle error case (e.g., network error, or backend returns non-200 status)
            const errorMessage = response.message || (response.body && response.body.body.message) || "Si è verificato un errore durante l'invio dell'email.";
            verifyMessage.innerHTML = `<span class="error-text">${errorMessage}</span>`;
            verifyMessage.classList.add('alert', 'alert-danger'); // Add Bootstrap danger alert styles
            verifyMessage.style.display = 'block'; // Show the message

        }
    });

});