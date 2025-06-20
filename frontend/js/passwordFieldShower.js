// Seleziona gli elementi per il primo campo password ("password")
const togglePasswordButton = document.getElementById("toggle-password");
const passwordIcon = document.getElementById("icon-pass");
const passwordField = document.getElementById("password");

// Seleziona gli elementi per il secondo campo ("confermapassword")
const toggleConfirmPasswordButton = document.getElementById("toggle-confirm-password"); // ID corretto dal tuo HTML
const confirmPasswordIcon = document.getElementById("icon-confirm-pass");
const confirmPasswordField = document.getElementById("confermapassword");

// Aggiunge l'evento al pulsante del primo campo password
if (togglePasswordButton && passwordField && passwordIcon) {
    togglePasswordButton.addEventListener("click", () => {
        if (passwordField.type === "password") {
            passwordField.type = "text";
            passwordIcon.className = "bi bi-eye toggle-icon";
        } else {
            passwordField.type = "password";
            passwordIcon.className = "bi bi-eye-slash toggle-icon";
        }
    });
}

// Aggiunge l'evento al pulsante del secondo campo password (conferma)
if (toggleConfirmPasswordButton && confirmPasswordField && confirmPasswordIcon) {
    toggleConfirmPasswordButton.addEventListener("click", () => {
        if (confirmPasswordField.type === "password") {
            confirmPasswordField.type = "text";
            confirmPasswordIcon.className = "bi bi-eye toggle-icon";
        } else {
            confirmPasswordField.type = "password";
            confirmPasswordIcon.className = "bi bi-eye-slash toggle-icon";
        }
    });
}
