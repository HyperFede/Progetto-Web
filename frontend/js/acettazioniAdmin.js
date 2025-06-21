async function sendApproval(approval, email){
    let result;
    let sub = "Bazart: Approvazione Account Artigiano";
    if(approval == "Approvato"){
        text = `<!DOCTYPE html>
<html lang="it">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Artigiano Approvato</title>
    <link rel="icon" type="image/x-icon" href="assets/favicon.ico">
    <style>
        body, html {
            height: 100%;
        }
        .centered-box-container {
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh; /* Usa min-height per flessibilità */
            padding: 1rem; /* Aggiunge un po' di padding intorno */
        }
        .logo-box {
            padding: 2rem;
            border: 1px solid #dee2e6; /* Colore del bordo di Bootstrap */
            border-radius: .375rem; /* Border radius di Bootstrap */
            box-shadow: 0 .125rem .25rem rgba(0,0,0,.075); /* Ombra leggera di Bootstrap */
            background-color: #fff; /* Sfondo bianco per la box */
            text-align: center; /* Per centrare il testo come il paragrafo 'lead' */
        }

        :root {
            --dark-moss-green: #606c38ff;
            --pakistan-green: #283618ff;
            --cornsilk: #e9d3ae;
            --earth-yellow: #dda15eff;
            --tigers-eye: #bc6c25ff;
            
            /* Variabili applicative */
            --primary-color: var(--earth-yellow);
            --secondary-color: var(--tigers-eye);
            --background-color: var(--cornsilk);
            --text-dark: var(--pakistan-green);
            --text-light: var(--cornsilk);
            --border-color: #ffffffe6;
            --shadow: 0 10px 30px rgba(0,0,0,0.1);
            --success-color: #198754;
            --warning-color: #ffc107;
            --danger-color: #dc3545;
            --divider-color: #9a9a9a; 
        }

        /* Stili globali comuni */
        body {
            margin: 0;
            padding: 0;
            min-height: 100vh;
            font-family: "Montserrat", sans-serif;
            font-optical-sizing: auto;
            font-weight: 400;
            font-style: normal;
            background-color: var(--background-color);
            color: var(--text-dark);
        }

        .container-rel {
            background: white;
            padding: 40px 50px;
            border-radius: 15px;
            box-shadow: var(--shadow);
            width: 100%;
            max-width: 800px;
            margin: 2rem auto;
            box-sizing: border-box;
        }

        .title-center {
            text-align: center;
            color: var(--text-dark);
            letter-spacing: 1px;
            font-weight: 700;
        }

        .page-main-title {
            color: var(--text-dark);
            font-weight: 600;
        }

        .input-group {
            margin-bottom: 1.5rem;
        }

        .input-group label {
            display: block;
            margin-bottom: 0.5rem;
            color: var(--dark-moss-green);
            font-weight: 500;
        }

        input, select, textarea {
            width: 100%;
            padding: 12px 15px;
            border-color: #dee2e6;
            border-radius: 0.375rem;
            font-size: 1rem;
            transition: all 0.3s ease;
            box-sizing: border-box;
        }

        input:focus, select:focus, textarea:focus {
            outline: none;
            border-color: var(--primary-color);
            box-shadow: 0 0 0 3px rgba(221, 161, 94, 0.1);
        }
    </style>
</head>
<body>
    <div class="centered-box-container">
        <div class="logo-box">
            <img src="cid:logo@bazart" alt="Logo" style="display: block; margin-left: auto; margin-right: auto; margin-bottom: 1rem; max-height: 150px; max-width: 100%;">
            <h2 class="title-center">Il suo account è stato approvato!</h2>
            <p class="lead">adesso può accedere liberamente alle funzionalità della sua area personale.</p>
        </div>
    </div>
</body>
</html>`;
        result = await fetchData("api/utils/send-email", "POST", {destinatario: email, oggetto: sub, testo: text, attach: true});
        if(result == 200){
            // console.log("Email inviata");
        }else{
            // console.log("Errore nell'invio dell'email")
        }
    }else{
        text = `<!DOCTYPE html>
<html lang="it">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Artigiano Rifiutato</title>
    <link rel="icon" type="image/x-icon" href="assets/favicon.ico">
    <style>
        body, html {
            height: 100%;
        }
        .centered-box-container {
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh; /* Usa min-height per flessibilità */
            padding: 1rem; /* Aggiunge un po' di padding intorno */
        }
        .logo-box {
            padding: 2rem;
            border: 1px solid #dee2e6; /* Colore del bordo di Bootstrap */
            border-radius: .375rem; /* Border radius di Bootstrap */
            box-shadow: 0 .125rem .25rem rgba(0,0,0,.075); /* Ombra leggera di Bootstrap */
            background-color: #fff; /* Sfondo bianco per la box */
            text-align: center; /* Per centrare il testo come il paragrafo 'lead' */
        }

        :root {
            --dark-moss-green: #606c38ff;
            --pakistan-green: #283618ff;
            --cornsilk: #e9d3ae;
            --earth-yellow: #dda15eff;
            --tigers-eye: #bc6c25ff;
            
            /* Variabili applicative */
            --primary-color: var(--earth-yellow);
            --secondary-color: var(--tigers-eye);
            --background-color: var(--cornsilk);
            --text-dark: var(--pakistan-green);
            --text-light: var(--cornsilk);
            --border-color: #ffffffe6;
            --shadow: 0 10px 30px rgba(0,0,0,0.1);
            --success-color: #198754;
            --warning-color: #ffc107;
            --danger-color: #dc3545;
            --divider-color: #9a9a9a; 
        }

        /* Stili globali comuni */
        body {
            margin: 0;
            padding: 0;
            min-height: 100vh;
            font-family: "Montserrat", sans-serif;
            font-optical-sizing: auto;
            font-weight: 400;
            font-style: normal;
            background-color: var(--background-color);
            color: var(--text-dark);
        }

        .container-rel {
            background: white;
            padding: 40px 50px;
            border-radius: 15px;
            box-shadow: var(--shadow);
            width: 100%;
            max-width: 800px;
            margin: 2rem auto;
            box-sizing: border-box;
        }

        .title-center {
            text-align: center;
            color: var(--text-dark);
            letter-spacing: 1px;
            font-weight: 700;
        }

        .page-main-title {
            color: var(--text-dark);
            font-weight: 600;
        }

        .input-group {
            margin-bottom: 1.5rem;
        }

        .input-group label {
            display: block;
            margin-bottom: 0.5rem;
            color: var(--dark-moss-green);
            font-weight: 500;
        }

        input, select, textarea {
            width: 100%;
            padding: 12px 15px;
            border-color: #dee2e6;
            border-radius: 0.375rem;
            font-size: 1rem;
            transition: all 0.3s ease;
            box-sizing: border-box;
        }

        input:focus, select:focus, textarea:focus {
            outline: none;
            border-color: var(--primary-color);
            box-shadow: 0 0 0 3px rgba(221, 161, 94, 0.1);
        }
    </style>
</head>
<body>
    <div class="centered-box-container">
        <div class="logo-box">
            <img src="cid:logo@bazart" alt="Logo" style="display: block; margin-left: auto; margin-right: auto; margin-bottom: 1rem; max-height: 150px; max-width: 100%;">
            <h2 class="title-center">Il suo account è stato rifiutato!</h2>
            <p class="lead">Il suo account non è conforme alle nostre policy di sicurezza. Si prega di registrarsi nuovamente con nuovi dati conformi alla nostra regolamentazione.</p>
        </div>
    </div>
</body>
</html>`;
        result = await fetchData("api/utils/send-email", "POST", {destinatario: email, oggetto: sub, testo: text, attach: true});
        if(result == 200){
            console.log("Email inviata");
        }else{
            console.log("Errore nell'invio dell'email")
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const pendingApprovalsContainer = document.getElementById('pendingApprovalsContainer');
    const adminMessagesContainer = document.getElementById('adminMessages');

    const confirmationModalElement = document.getElementById('confirmationModal');
    const confirmationModalMessage = document.getElementById('confirmationModalMessage');
    const confirmActionBtn = document.getElementById('confirmActionBtn');
    let confirmationModalInstance;
    var email;

    if (!pendingApprovalsContainer) {
        console.error('Element with ID "pendingApprovalsContainer" not found.');
        if (adminMessagesContainer) {
            displayAdminMessage('Errore di configurazione della pagina: container approvazioni mancante.', 'danger');
        }
        return;
    }
        if (confirmationModalElement) {
        confirmationModalInstance = new bootstrap.Modal(confirmationModalElement);
    }


    function displayAdminMessage(message, type = 'info') {
        if (adminMessagesContainer) {
            adminMessagesContainer.innerHTML = `<div class="alert alert-${type}" role="alert">${message}</div>`;
        } else {
            alert(message); // Fallback
        }
    }

    function clearAdminMessages() {
        if (adminMessagesContainer) {
            adminMessagesContainer.innerHTML = '';
        }
    }

    function formatDate(isoDateString) {
        if (!isoDateString) return 'N/D';
        const date = new Date(isoDateString);
        return date.toLocaleDateString('it-IT', {
            year: 'numeric', month: 'long', day: 'numeric',
            hour: '2-digit', minute: '2-digit'
        });
    }

    function createApprovalCardHtml(approval) {
        // Assuming 'username_artigiano', 'email_artigiano', 'dataesito' (submission date for pending)
        // and 'idstorico' are available in the approval object.
        // The backend uses 'In lavorazione' as the initial state.
        email = approval.email_artigiano;
        return `
            <div class="col-12 mb-4" id="approval-card-${approval.idstorico}">
                <div class="card p-4 shadow-sm">
                    <!-- Top row: email left, P.IVA right -->
                    <div class="d-flex justify-content-between mb-2 align-items-center">
                <div>
                    <strong>Email:</strong>
                    <span class="text-body">${approval.email_artigiano}</span>
                </div>
                <div>
                    <strong>P.IVA:</strong>
                    <span class="text-body">${approval.piva || 'N/D'}</span>
                </div>
            </div>
            <!-- Description label + text -->
                <div class="mb-3">
                    <strong>Descrizione Artigiano:</strong>
                    <p class="mt-1 mb-0 text-body">
                        ${approval.artigianodescrizione || '<span class="text-muted fst-italic">Nessuna descrizione fornita.</span>'}
                    </p>
                </div>

                <!-- Buttons -->
                <div class="d-flex gap-2">
                    <button 
                        class="btn btn-success btn-sm px-4 approve-btn" 
                        data-idstorico="${approval.idstorico}">
                    <i class="bi bi-check-lg me-1"></i>Approva
                    </button>
                    <button
                    class="btn btn-danger btn-sm px-4 reject-btn" 
                    data-idstorico="${approval.idstorico}">
                    <i class="bi bi-x-lg me-1"></i>Rifiuta
                  </button>
                </div>
              </div>
            </div>

        `;
    }

    async function fetchAndDisplayPendingApprovals() {
        clearAdminMessages();
        pendingApprovalsContainer.innerHTML = '<p>Caricamento richieste di approvazione...</p>';

        try {
            // The backend uses 'In lavorazione' as the initial state for new artisan sign-ups.
            const response = await fetchData('api/approvals?esito=In lavorazione', 'GET');

            if (response.status === 200 && response.data) {
                if (response.data.length > 0) {
                    pendingApprovalsContainer.innerHTML = response.data.map(createApprovalCardHtml).join('');
                } else {
                    pendingApprovalsContainer.innerHTML = '<p class="text-center">Nessuna richiesta di approvazione artigiano in attesa.</p>';
                }
            } else {
                const errorMsg = response.message || (response.data && response.data.message) || 'Errore nel caricare le richieste.';
                displayAdminMessage(`Errore caricamento richieste: ${errorMsg}`, 'danger');
                pendingApprovalsContainer.innerHTML = '<p class="text-center text-danger">Impossibile caricare le richieste.</p>';
            }
        } catch (error) {
            console.error('Eccezione durante fetchAndDisplayPendingApprovals:', error);
            displayAdminMessage(`Errore di comunicazione: ${error.message || 'Dettagli non disponibili.'}`, 'danger');
            pendingApprovalsContainer.innerHTML = '<p class="text-center text-danger">Errore di comunicazione con il server.</p>';
        }
    }

    async function handleApprovalDecision(idstorico, decision) {
        clearAdminMessages();
        const cardElement = document.getElementById(`approval-card-${idstorico}`);
        if (cardElement) {
            // Optionally disable buttons on the specific card
            cardElement.querySelectorAll('button').forEach(btn => btn.disabled = true);
        }

        try {
            const response = await fetchData(`api/approvals/${idstorico}/decide`, 'PUT', { esito: decision });

            if (response.status === 200 && response.data) {
                //displayAdminMessage(`Richiesta #${idstorico} ${decision.toLowerCase()} con successo.`, 'success');
                if (cardElement) {
                    cardElement.remove(); // Remove the card from the UI
                    // Check if container is empty after removal
                    if (pendingApprovalsContainer.children.length === 0) {
                        pendingApprovalsContainer.innerHTML = '<p class="text-center">Nessuna richiesta di approvazione artigiano in attesa.</p>';
                    }
                } else {
                    fetchAndDisplayPendingApprovals(); // Fallback: refresh all if card not found by ID
                }
                sendApproval(decision, email);
            } else {
                const errorMsg = response.message || (response.data && response.data.message) || `Errore durante la decisione per la richiesta #${idstorico}.`;
                displayAdminMessage(errorMsg, 'danger');
                if (cardElement) {
                    cardElement.querySelectorAll('button').forEach(btn => btn.disabled = false); // Re-enable buttons on error
                }
            }
        } catch (error) {
            console.error(`Eccezione durante handleApprovalDecision per ID ${idstorico}:`, error);
            displayAdminMessage(`Errore di comunicazione per la richiesta #${idstorico}: ${error.message || 'Dettagli non disponibili.'}`, 'danger');
            if (cardElement) {
                cardElement.querySelectorAll('button').forEach(btn => btn.disabled = false); // Re-enable buttons on error
            }
        }
    }

        let currentAction = null; // To store { idstorico, decision } for the modal


    // Event delegation for approve/reject buttons
    pendingApprovalsContainer.addEventListener('click', function (event) {
        const target = event.target;
                // Check if the clicked element itself is a button or if its parent is (for icons inside buttons)
        const button = target.closest('.approve-btn, .reject-btn');
        if (button && button.dataset.idstorico) {
            const idstorico = button.dataset.idstorico;
            let decision;
            let actionText;

            if (button.classList.contains('approve-btn')) {
                decision = 'Approvato';
                actionText = 'APPROVARE';
            } else if (button.classList.contains('reject-btn')) {
                decision = 'Rifiutato';
                actionText = 'RIFIUTARE';
            }
            
                        if (decision && confirmationModalInstance && confirmationModalMessage) {
                currentAction = { idstorico, decision };
                confirmationModalMessage.textContent = `Sei sicuro di voler ${actionText} la richiesta #${idstorico}`;
                confirmationModalInstance.show();
            }
        }
    });

        if (confirmActionBtn && confirmationModalInstance) {
        confirmActionBtn.addEventListener('click', () => {
            if (currentAction) {
                handleApprovalDecision(currentAction.idstorico, currentAction.decision);
                currentAction = null; // Reset after action
            }
            confirmationModalInstance.hide();
        });
    }

    // Initial load
    fetchAndDisplayPendingApprovals();
});
