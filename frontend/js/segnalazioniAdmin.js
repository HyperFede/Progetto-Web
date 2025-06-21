document.addEventListener('DOMContentLoaded', () => {
    // Elemento tbody della tabella dove verranno inserite le segnalazioni
    const problemsTableBody = document.getElementById('problemsTableBody');

    // Contenitore per i messaggi di feedback all'amministratore (es. successo, errore)
    const adminMessagesContainer = document.getElementById('adminProblemMessages');

    // Elementi del Modal per la visualizzazione dell'immagine (basato sull'interazione precedente)
    // Se hai un modal generico per le immagini, questi sono gli ID che abbiamo discusso:
    const problemImageModal = document.getElementById('problemImageModal'); // L'intero modal
    const modalImageElement = document.getElementById('modalProblemImage'); // L'elemento <img> dentro il modal
    const modalTitleElement = document.getElementById('problemImageModalLabel'); // Il titolo del modal
    // Caricamento iniziale delle segnalazioni

    problemsTableBody.addEventListener('click', (event) => {
        const saveButton = event.target.closest('.save-status-btn');
        const viewImageButton = event.target.closest('.view-problem-image-btn');

        if (saveButton) {
            const problemId = saveButton.dataset.problemId;
            const row = saveButton.closest('tr');
            if (row) {
                const statusSelectElement = row.querySelector('.status-change-select');
                if (statusSelectElement && problemId) {
                    const newStatus = statusSelectElement.value;
                    if (confirm(`Sei sicuro di voler cambiare lo stato della segnalazione #${problemId} a "${newStatus}"?`)) {
                        handleStatusUpdate(problemId, newStatus);
                    }
                }
            }
        } else if (viewImageButton) {
            const imageUrl = viewImageButton.dataset.imageUrl;
            const problemId = viewImageButton.dataset.problemId;

            if (modalImageElement && modalTitleElement && problemImageModal) {
                modalImageElement.src = imageUrl;
                modalTitleElement.textContent = `Immagine Segnalazione #${problemId}`;
                // Il modal si apre automaticamente grazie a data-bs-toggle e data-bs-target
                // Se non si apre, assicurati che il modal HTML sia presente e che Bootstrap JS sia caricato.
                // Potrebbe essere necessario istanziare e mostrare il modal manualmente se data-bs-* non funziona:
                // const modal = new bootstrap.Modal(problemImageModal);
                // modal.show();
            } else {
                console.error("Elementi del modal non trovati. Impossibile visualizzare l'immagine.");
                displayAdminMessage("Errore: Impossibile visualizzare l'immagine (componenti modal mancanti).", "warning");
            }
        }
    });


    /**
     * Mostra un messaggio all'amministratore.
     * @param {string} message - Il messaggio da visualizzare.
     * @param {string} type - Il tipo di messaggio (es. 'success', 'danger', 'info').
     */
    function displayAdminMessage(message, type = 'info') {
        if (adminMessagesContainer) {
            adminMessagesContainer.innerHTML = `<div class="alert alert-${type} alert-dismissible fade show" role="alert">
                ${message}
                <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
            </div>`;
        } else {
            alert(message); // Fallback
        }
    }

    /**
     * Pulisce i messaggi dell'amministratore.
     */
    function clearAdminMessages() {
        if (adminMessagesContainer) {
            adminMessagesContainer.innerHTML = '';
        }
    }

    /**
     * Formatta una data ISO in un formato leggibile (solo data).
     * @param {string} isoDateString - La data in formato ISO.
     * @returns {string} La data formattata o 'N/D'.
     */
    function formatDateOnly(isoDateString) {
        if (!isoDateString) return 'N/D';
        // L'API fornisce 'AAAA-MM-GG'
        return isoDateString;
    }

    /**
     * Crea l'HTML per una singola riga della tabella delle segnalazioni.
     */
    function createProblemTableRow(problem) {
        const tr = document.createElement('tr');
        tr.setAttribute('id', `problem-row-${problem.idproblema}`);

        const utenteSegnalante = problem.email_cliente || problem.email_artigiano || 'Sconosciuto';

        let statusOptionsHtml = '';
        let selectDisabled = '';
        let saveButtonDisabled = '';

        // Determine available options and button/select state based on current status
        if (problem.status === 'Aperto') {
            statusOptionsHtml += `<option value="Aperto" ${problem.status === 'Aperto' ? 'selected' : ''}>Aperto</option>`;
            statusOptionsHtml += `<option value="In lavorazione" ${problem.status === 'In lavorazione' ? 'selected' : ''}>In lavorazione</option>`;
            statusOptionsHtml += `<option value="Risolto" ${problem.status === 'Risolto' ? 'selected' : ''}>Risolto</option>`;
        } else if (problem.status === 'In lavorazione') {
            statusOptionsHtml += `<option value="In lavorazione" ${problem.status === 'In lavorazione' ? 'selected' : ''}>In lavorazione</option>`;
            statusOptionsHtml += `<option value="Risolto" ${problem.status === 'Risolto' ? 'selected' : ''}>Risolto</option>`;
        } else if (problem.status === 'Risolto') {
            statusOptionsHtml += `<option value="Risolto" ${problem.status === 'Risolto' ? 'selected' : ''}>Risolto</option>`;
            selectDisabled = 'disabled'; // Disable select if status is Risolto
            saveButtonDisabled = 'disabled'; // Disable save button if status is Risolto
        } else {
            // Fallback for unexpected statuses
            statusOptionsHtml += `<option value="${problem.status}" selected>${problem.status}</option>`;
        }

        let immagineHtml = 'N/A';
        if (problem.immagine_url) {
            immagineHtml = `<a href="#" class="view-problem-image-btn"
                                data-bs-toggle="modal"
                                data-bs-target="#problemImageModal"
                                data-image-url="${problem.immagine_url}"
                                data-problem-id="${problem.idproblema}">Visualizza</a>`;
        }

        tr.innerHTML = `
            <th scope="row">${problem.idproblema}</th>
            <td>${formatDateOnly(problem.data)} ${problem.ora || ''}</td>
            <td>${utenteSegnalante}</td>
            <td>${problem.idordine || 'N/A'}</td>
            <td style="white-space: normal; word-break: break-word; min-width: 200px;" title="${problem.descrizione || ''}">${problem.descrizione || 'N/D'}</td>
            <td>${immagineHtml}</td>
            <td>
                <select class="form-select form-select-sm status-change-select" data-problem-id="${problem.idproblema}" aria-label="Stato segnalazione ${problem.idproblema}" ${selectDisabled}>
                    ${statusOptionsHtml}
                </select>
            </td>
            <td class="text-center"><button class="btn btn-primary btn-sm px-2 py-1 save-status-btn" id="saveBtn" data-problem-id="${problem.idproblema}" ${saveButtonDisabled}>Salva</button>
            </td>
        `;
        return tr;
    }

    /**
     * Recupera e visualizza le segnalazioni.
     */
    async function fetchAndDisplayProblems() {
        clearAdminMessages();
        problemsTableBody.innerHTML = '<tr><td colspan="8" class="text-center">Caricamento segnalazioni...</td></tr>';

        try {
            // Fetch all problems, as backend filtering for multiple OR statuses or NOT status is not available without changes
            const response = await fetchData('api/problems/', 'GET');
            if (response.status === 200 && response.data) {
                // Filter out problems with status 'Risolto' on the client side
                const problemsToDisplay = response.data.filter(problem => problem.status !== 'Risolto');
                console.log('Segnalazioni da visualizzare (escluso "Risolto"):', problemsToDisplay);

                problemsTableBody.innerHTML = ''; // Pulisci il messaggio di caricamento

                if (problemsToDisplay.length > 0) {
                    problemsToDisplay.forEach(problem => {
                        const row = createProblemTableRow(problem);
                        problemsTableBody.appendChild(row);
                    });
                } else {
                    problemsTableBody.innerHTML = '<tr><td colspan="8" class="text-center">Nessuna segnalazione attiva.</td></tr>';
                }
            } else {
                const errorMsg = response.message || (response.data && response.data.message) || 'Errore sconosciuto nel caricare le segnalazioni.';
                displayAdminMessage(`Errore caricamento segnalazioni: ${errorMsg}`, 'danger');
                problemsTableBody.innerHTML = '<tr><td colspan="8" class="text-center text-danger">Impossibile caricare le segnalazioni.</td></tr>';
            }
        } catch (error) {
            console.error('Eccezione durante fetchAndDisplayProblems:', error);
            displayAdminMessage(`Errore di comunicazione con il server: ${error.message || 'Dettagli non disponibili.'}`, 'danger');
            problemsTableBody.innerHTML = '<tr><td colspan="8" class="text-center text-danger">Errore di comunicazione.</td></tr>';
        }
    }

    /**
     * Gestisce l'aggiornamento dello stato di una segnalazione.
     * (Per ora, solo un placeholder per la chiamata API)
     * @param {string} problemId - L'ID della segnalazione.
     * @param {string} newStatus - Il nuovo stato.
     */

    async function handleStatusUpdate(problemId, newStatus) {


        clearAdminMessages();
        // La logica effettiva per la chiamata PUT a /api/problems/:idproblem/status
        // verrà implementata quando richiesto.
        // Esempio di come potrebbe essere (da scommentare e adattare quando si implementa il backend):
        try {
            const response = await fetchData(`api/problems/${problemId}/status`, 'PUT', { status: newStatus });

            if (response.status === 200 && response.data) {
                displayAdminMessage(`Stato della segnalazione #${problemId} aggiornato a "${newStatus}".`, 'success');
                fetchAndDisplayProblems(); // Ricarica per riflettere il cambiamento
            } else {
                displayAdminMessage(`Errore durante l'aggiornamento: ${response.message || 'Dettaglio non disponibile.'}`, 'danger');
            }
        } catch (error) {
            displayAdminMessage(`Errore di comunicazione durante l'aggiornamento: ${error.message}`, 'danger');
        }

    }
    fetchAndDisplayProblems();
});
