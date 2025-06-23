document.addEventListener('DOMContentLoaded', async function () {
    const response = await fetchData("api/auth/session-info", "GET")
    if (response.status === 200) {
        if (response.data.tipologia === "Artigiano") {
            window.location.href = "dashboardArtigiano.html";
        }
    }
})