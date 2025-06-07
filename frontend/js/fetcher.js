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
            if (!response.ok) {
                const error = new Error(response.statusText);
                error.status = response.status;
                throw error;
            }
        }

        if(!response.ok){
            const error = new Error(data?.message || response.statusText);
            error.status = response.status;
            error.body = data;
            throw error;
        }

        return {data: data, status: response.status};

    }catch(error){
        console.error("Errore in fetchData:", error);

        return {
            message: error.message,
            status: error.status || null,
            body: error.body || null,
            error: true
        };
    }
}