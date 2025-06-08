document.addEventListener('DOMContentLoaded', async function(){
    let result = await fetchData("/api/auth/session-info", "GET");
                if(result.status == 200){
                    //loggato
                    //console.log(result);

                    const usernameSpans = document.querySelectorAll('#nav-username');
                    usernameSpans.forEach(span => {
                        span.textContent = result.data.username;
                    })

                    const selectorInvisible = document.querySelectorAll('.invisible');
                    selectorInvisible.forEach(section => {
                        if(result.data.tipologia != "Admin")
                        section.classList.remove("invisible")
                        section.classList.add("logged")
                    });

                    const selectorUnlogged = document.querySelectorAll('.unlogged');
                    selectorUnlogged.forEach(section => {
                        section.classList.add("invisible");
                    });
                    
                    if(result.data.tipologia == "Admin"){
                        const selectorAdmin = document.querySelectorAll('.invisible-admin');
                        selectorAdmin.forEach(section => {
                            section.classList.remove("invisible-admin");
                        });
                    }

                }else{
                    //non loggato
                    console.log(result);
                }
})