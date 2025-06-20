document.addEventListener('DOMContentLoaded', function () {
    const token = getTokenFromURL();

    const passwordInput = document.getElementById("password");
    const confirmPasswordInput = document.getElementById("confermapassword");
    const resetPasswordButton = document.getElementById("resetPasswordButton");
    const resetMessageDiv = document.getElementById("resetMessage"); // Assumes a div with this ID exists for messages

    if (!token) {
        displayMessage('Token di recupero non valido o mancante. Richiedi un nuovo link.', 'danger');
        if (resetPasswordButton) resetPasswordButton.disabled = true;
        if (passwordInput) passwordInput.disabled = true;
        if (confirmPasswordInput) confirmPasswordInput.disabled = true;

    };

    function clearMessages() {
        if (resetMessageDiv) {
            resetMessageDiv.innerHTML = '';
            resetMessageDiv.style.display = 'none';
        }
    }


    function displayMessage(message, type = 'danger') {
        if (resetMessageDiv) {
            let alertClass = '';
            let style = '';
            // Set class and inline styles to ensure correct, light colors
            if (type === 'success') {
                alertClass = 'alert-success';
                style = 'background-color: #d1e7dd; color: #0f5132; border-color: #badbcc;';
            } else { // 'danger' or default
                alertClass = 'alert-danger';
                style = 'background-color: #f8d7da; color: #842029; border-color: #f5c2c7;';
            }
            resetMessageDiv.innerHTML = `<div class="alert ${alertClass}" style="${style}" role="alert">${message}</div>`;
            resetMessageDiv.style.display = 'block';

        } else {
            alert(message); // Fallback
        }
    }

    if (resetPasswordButton) {
        resetPasswordButton.addEventListener('click', async function (event) {
            event.preventDefault();
            clearMessages();

            const password = passwordInput.value;
            const confirmPassword = confirmPasswordInput.value;

            if (!password || !confirmPassword) {
                displayMessage("Per favore, inserisci e conferma la nuova password.");
                return;
            }
            if (password !== confirmPassword) {
                displayMessage("Le password non corrispondono.");
                return;
            }

            const objToSend = {
                token: token,
                nuovapassword: password
            };
            const response = await fetchData("api/auth/recover-password/reset", "POST", objToSend);


            if (response.status === 200) {
                displayMessage("Password resettata con successo! Sarai reindirizzato alla pagina di login.", 'success');
                setTimeout(() => {
                    window.location.href = 'login.html';
                }, 2500); // Redirect after 2.5 seconds
            } else {
                const errorMessage = response.message || (response.body && response.body.message) || "Si è verificato un errore. Il token potrebbe essere scaduto.";
                displayMessage(errorMessage);

            }
        });
    }
});

function getTokenFromURL() {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('token');
}
