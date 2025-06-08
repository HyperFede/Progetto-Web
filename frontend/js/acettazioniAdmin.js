document.addEventListener('DOMContentLoaded', () => {
    const pendingApprovalsContainer = document.getElementById('pendingApprovalsContainer');
    const adminMessagesContainer = document.getElementById('adminMessages');

    if (!pendingApprovalsContainer) {
        console.error('Element with ID "pendingApprovalsContainer" not found.');
        if (adminMessagesContainer) {
            displayAdminMessage('Errore di configurazione della pagina: container approvazioni mancante.', 'danger');
        }
        return;
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
                        class="btn btn-success btn-sm px-4" 
                        data-idstorico="${approval.idstorico}">
                    <i class="bi bi-check-lg me-1"></i>Approva
                    </button>
                    <button
                    class="btn btn-danger btn-sm px-4" 
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
                displayAdminMessage(`Richiesta #${idstorico} ${decision.toLowerCase()} con successo.`, 'success');
                if (cardElement) {
                    cardElement.remove(); // Remove the card from the UI
                    // Check if container is empty after removal
                    if (pendingApprovalsContainer.children.length === 0) {
                        pendingApprovalsContainer.innerHTML = '<p class="text-center">Nessuna richiesta di approvazione artigiano in attesa.</p>';
                    }
                } else {
                    fetchAndDisplayPendingApprovals(); // Fallback: refresh all if card not found by ID
                }
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

    // Event delegation for approve/reject buttons
    pendingApprovalsContainer.addEventListener('click', function (event) {
        const target = event.target;
        const idstorico = target.dataset.idstorico;

        if (idstorico) { // Check if the clicked element or its parent has data-idstorico
            if (target.classList.contains('approve-btn')) {
                if (confirm(`Sei sicuro di voler APPROVARE la richiesta #${idstorico}?`)) {
                    handleApprovalDecision(idstorico, 'Approvato');
                }
            } else if (target.classList.contains('reject-btn')) {
                if (confirm(`Sei sicuro di voler RIFIUTARE la richiesta #${idstorico}?`)) {
                    handleApprovalDecision(idstorico, 'Rifiutato');
                }
            }
        }
    });

    // Initial load
    fetchAndDisplayPendingApprovals();
});
