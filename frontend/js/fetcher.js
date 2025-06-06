async function fetchData(url, method="POST", body=null){
    try{
        //setup headers
        const options = {
            method: method,
            headers: {
                "Content-Type": "application/json"
            }
        };

        if(body){
            options.body = JSON.stringify(body);
        }

        const response = await fetch(url, options);
        let data = null;
        try{
            data = await response.json()
        }catch(error){
            console.error("Error nel json: ", error);
        }

        if(!response.ok){
            throw new Error("HTTP Error: ", response.status)
        }

        return {data: data, status: response.status};

    }catch(error){
        console.error("Errore durante la fetch: ", error);
        return null;
    }
}