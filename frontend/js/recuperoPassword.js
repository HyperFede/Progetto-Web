document.addEventListener('DOMContentLoaded', function () {
    // Elements for Step 1: Identity Verification
    const usernameInput = document.getElementById('username');
    const emailInput = document.getElementById('email');
    const verifyIdentityButton = document.getElementById('verifyIdentityButton');
    const verifyMessageDiv = document.getElementById('verifyMessage');

    // Elements for Step 2: New Password (will be used later)
    // const recuperoForm = document.getElementById('recuperoForm');
    // const newPasswordSection = document.getElementById('newPasswordSection');
    // const newPasswordInput = document.getElementById('newPassword');
    // const resetPasswordButton = document.getElementById('resetPasswordButton');
    // const resetMessageDiv = document.getElementById('resetMessage');
    // const toggleNewPasswordButton = document.getElementById('toggle-new-password');
    // const iconNewPass = document.getElementById('icon-new-pass');

    // To store the token from the verification step (will be used later)
    // let recoveryToken = null;

    // Step 1: Verify Identity
    if (verifyIdentityButton && usernameInput && emailInput && verifyMessageDiv) {
        verifyIdentityButton.addEventListener('click', async function (event) {
            event.preventDefault(); // Prevent default button action
            verifyMessageDiv.innerHTML = ''; // Clear previous messages

            const username = usernameInput.value.trim();
            const email = emailInput.value.trim();

            if (!username || !email) {
                verifyMessageDiv.innerHTML = '<span class="error-text">Username ed Email sono obbligatori.</span>';
                return;
            }

            // Prepare data for the backend.
            // Your backend /api/auth/recover-password/verify-identity expects 'username' and 'email' (or 'piva').
            // We'll send username and email. The backend will determine if PIVA is needed based on user type.
            const requestBody = {
                username: username,
                email: email
                // If you had a PIVA field, you'd include it here conditionally:
                // piva: pivaValue // (if applicable)
            };

            try {
                console.log('Attempting to verify identity with:', requestBody);
                let response = await fetchData("/api/products/recover-password/verify-identity", "POST", requestBody);

                if (response.status === 200 && response.data && response.data.resetToken) {
                    // Store the token for the next step (we'll implement this later)
                    // recoveryToken = response.data.resetToken;
                    console.log('Verification successful. Token:', response.data.resetToken);

                    verifyMessageDiv.innerHTML = `<span class="success-text">${response.data.message || 'Verifica completata. Puoi procedere al reset della password.'}</span>`;
                    
                    // Here, we would typically show the new password section and hide the verify button.
                    // For now, we'll just log success.
                    // newPasswordSection.style.display = 'block';
                    // verifyIdentityButton.style.display = 'none';
                    // usernameInput.disabled = true;
                    // emailInput.disabled = true;

                } else {
                    // Handle errors from the backend (e.g., user not found, email/piva mismatch)
                    verifyMessageDiv.innerHTML = `<span class="error-text">${response.data.message || 'Verifica fallita. Controlla i dati inseriti.'}</span>`;
                    console.error('Verification failed:', response);
                }
            } catch (error) {
                // Handle network errors or other issues with the fetchData call
                console.error('Errore durante la verifica dell\'identità:', error);
                verifyMessageDiv.innerHTML = '<span class="error-text">Errore di comunicazione con il server. Riprova più tardi.</span>';
            }
        });
    }

    // Step 2: Reset Password (will be implemented later)
    // ...

    // Password visibility toggle (will be implemented later)
    // ...
});