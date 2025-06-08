document.addEventListener('DOMContentLoaded', async function(){
    let result = await fetchData("/api/auth/session-info", "GET");
    if(result.status == 200){
        document.getElementById("usernameProfilo").textContent = result.data.username;
    }
})