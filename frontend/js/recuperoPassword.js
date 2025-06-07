document.addEventListener('DOMContentLoaded', function () {
    // Elements for Step 1: Identity Verification
    const usernameInput = document.getElementById('username');
    const emailOrPivaInput = document.getElementById('emailOrPiva'); // Updated ID
    const verifyIdentityButton = document.getElementById('verifyIdentityButton');
    const verifyMessageDiv = document.getElementById('verifyMessage');

    // Elements for Step 2: New Password
    const recuperoForm = document.getElementById('recuperoForm'); // Form element
    const newPasswordSection = document.getElementById('newPasswordSection');
    const newPasswordInput = document.getElementById('newPassword');
    const resetPasswordButton = document.getElementById('resetPasswordButton');
    const resetMessageDiv = document.getElementById('resetMessage');

    // To store the token from the verification step
    let recoveryToken = null;

    // Step 1: Verify Identity
    if (verifyIdentityButton && usernameInput && emailOrPivaInput && verifyMessageDiv) {
        verifyIdentityButton.addEventListener('click', async function (event) {
            event.preventDefault(); // Prevent default button action
            verifyMessageDiv.innerHTML = ''; // Clear previous messages
            if (resetMessageDiv) resetMessageDiv.innerHTML = ''; // Clear reset messages too

            const username = usernameInput.value.trim();
            const emailOrPivaValue = emailOrPivaInput.value.trim();

            if (!username || !emailOrPivaValue) {
                verifyMessageDiv.innerHTML = '<span class="error-text">Username e Email/PIVA sono obbligatori.</span>';
                return;
            }

            // Prepare data for the backend.
            const requestBody = {
                "username": username,
            };

            if (emailOrPivaValue.includes('@')) {
                requestBody.email = emailOrPivaValue;
            } else {
                // Basic PIVA validation: check if it's a number and not empty
                // You might want more sophisticated PIVA validation (e.g., length, checksum)
                if (isNaN(parseFloat(emailOrPivaValue)) || !isFinite(emailOrPivaValue) || emailOrPivaValue.length === 0) {
                    verifyMessageDiv.innerHTML = '<span class="error-text">PIVA non valida. Deve essere un numero.</span>';
                    return;
                }
                requestBody.piva = emailOrPivaValue;
            }

            console.log('Attempting to verify identity with:', requestBody);
            const response = await fetchData("/api/auth/recover-password/verify-identity", "POST", requestBody);

            if (response.status === 200 && response.data && response.data.resetToken) {
                recoveryToken = response.data.resetToken; // Store the token
                console.log('Verification successful. Token:', response.data.resetToken);

                verifyMessageDiv.innerHTML = `<span class="success-text">${response.message || 'Verifica completata. Inserisci la nuova password.'}</span>`;

                // Show the new password section and update UI
                if (newPasswordSection) newPasswordSection.style.display = 'block';
                verifyIdentityButton.style.display = 'none'; // Hide verify button
                usernameInput.disabled = true; // Disable username and email fields
                emailOrPivaInput.disabled = true;
            }
            else if (response.status === 404) {
                // Assuming 404 from backend also comes in response.message if fetchData doesn't throw
                verifyMessageDiv.innerHTML = `<span class="error-text">${(response.data && response.message) || response.message || 'Utente non trovato o dati non corrispondenti.'}</span>`;
            }
            else {
                // Handle errors from the backend (e.g., user not found, email/piva mismatch)
                verifyMessageDiv.innerHTML = `<span class="error-text">${(response.data && response.message) || response.message || 'Verifica fallita. Controlla i dati inseriti.'}</span>`;
                console.error('Verification failed:', response);
            }
        });
    }

    // Step 2: Reset Password (Form submission)
    if (recuperoForm && resetPasswordButton && newPasswordInput && resetMessageDiv) {
        recuperoForm.addEventListener('submit', async function(event) {
            event.preventDefault(); // Prevent default form submission
            resetMessageDiv.innerHTML = ''; // Clear previous messages

            const nuovapassword = newPasswordInput.value.trim(); // Backend expects 'nuovapassword'

            if (!nuovapassword) {
                resetMessageDiv.innerHTML = '<span class="error-text">La nuova password è obbligatoria.</span>';
                return;
            }

            if (!recoveryToken) {
                resetMessageDiv.innerHTML = '<span class="error-text">Token di recupero mancante o sessione scaduta. Esegui prima la verifica.</span>';
                // Optionally reset UI to verification step
                if (newPasswordSection) newPasswordSection.style.display = 'none';
                if (verifyIdentityButton) verifyIdentityButton.style.display = 'block';
                if (usernameInput) usernameInput.disabled = false;
                if (emailOrPivaInput) emailOrPivaInput.disabled = false;
                if (verifyMessageDiv) verifyMessageDiv.innerHTML = '<span class="error-text">Sessione di recupero scaduta o token non valido. Riprova la verifica.</span>';
                return;
            }

            const requestBody = {
                token: recoveryToken,
                nuovapassword: nuovapassword // Match backend expectation
            };

            try {
                console.log('Attempting to reset password with token:', recoveryToken);
                const response = await fetchData("/api/auth/recover-password/reset", "POST", requestBody);

                if (response.status === 200) {
                    recuperoForm.reset(); // Clear the form (username, email, newPassword)
                    if (newPasswordSection) newPasswordSection.style.display = 'none'; // Hide password section
                    if (verifyIdentityButton) verifyIdentityButton.style.display = 'block'; // Show verify button again
                    if (usernameInput) usernameInput.disabled = false; // Re-enable username and email
                    if (emailOrPivaInput) emailOrPivaInput.disabled = false;
                    recoveryToken = null; // Clear the token
                    if (verifyMessageDiv) verifyMessageDiv.innerHTML = ''; // Clear verification message
                    // Redirect to login after a short delay
                    resetMessageDiv.innerHTML = `<span class="success-text">${response.message || 'Password aggiornata con successo!'}</span>`;

                    setTimeout(() => { window.location.href = 'login.html'; }, 2500); // 2.5 seconds delay
                    console.log('Password reset successful:', response)

                } else {
                    // This case might be less likely if fetchData throws for non-200, error handled in catch.
                    // But if fetchData could return non-200 without throwing:
                    resetMessageDiv.innerHTML = `<span class="error-text">${(response.data && response.message) || response.message || 'Reset della password fallito. Riprova.'}</span>`;
                }
            } catch (error) {
                console.error('Errore durante il reset della password:', error);
                const backendMessage = error.body && error.body.message ? error.body.message : 'Errore di comunicazione con il server durante il reset. Riprova più tardi.';
                resetMessageDiv.innerHTML = `<span class="error-text">${backendMessage}</span>`;
            }
        });
    }
});