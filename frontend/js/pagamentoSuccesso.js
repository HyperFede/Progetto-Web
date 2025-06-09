document.addEventListener('DOMContentLoaded', async function () {

    const successMessageContainer = document.querySelector('.card-body'); // Target for potential message updates
    const successIcon = successMessageContainer ? successMessageContainer.querySelector('.bi-check-circle-fill') : null;
    const successTitle = successMessageContainer ? successMessageContainer.querySelector('.display-5') : null;
    const successLeadText = successMessageContainer ? successMessageContainer.querySelector('.lead') : null;

    function displayVerificationError(message) {
        if (successMessageContainer) {
            if (successIcon) successIcon.className = 'bi bi-x-circle-fill text-danger'; // Change icon to error
            if (successTitle) successTitle.textContent = 'Verifica Pagamento Fallita';
            if (successLeadText) successLeadText.textContent = message || 'Si è verificato un errore durante la verifica del pagamento. Contatta l\'assistenza.';
            // You might want to hide the "Torna alla Home" button or change its text/action
        } else {
            alert(message || 'Si è verificato un errore durante la verifica del pagamento.');
        }
    }

    const urlParams = new URLSearchParams(window.location.search);
    const orderId = urlParams.get('order_id');
    const sessionId = urlParams.get('session_id');

    if (!orderId || !sessionId) {
        console.error('ID Ordine o ID Sessione mancanti nella URL.');
        displayVerificationError('Informazioni di pagamento mancanti o corrotte. Impossibile verificare.');
        return;
    }


    try {
        const response = await fetchData("/api/payments/verify-session", "POST", {
            sessionid: sessionId
        });

        if (response.status === 200 && response.data.success) {
        } else {
            console.error('Verifica sessione Stripe fallita o risposta inattesa:', response);
            const errorMessage = (response.data && response.data.message) || response.message || 'La verifica del pagamento non è andata a buon fine.';
            displayVerificationError(errorMessage);
        }
    } catch (error) {
        console.error('Eccezione durante la verifica della sessione Stripe:', error);
        const errorMessage = error.message || (error.body && error.body.message) || 'Errore di comunicazione con il server durante la verifica del pagamento.';
        displayVerificationError(errorMessage);
    }

    if (typeof initializeHeader === 'function') { initializeHeader(); }
    if (typeof initializeLogoutButtons === 'function') { initializeLogoutButtons(); }
});