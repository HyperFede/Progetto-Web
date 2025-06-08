async function fetchData(url, method = "POST", body = null, fetchOptions = {}) {
    try{
        // Default headers
        const headers = { ...fetchOptions.customHeaders }; // Allow for other custom headers

        if (fetchOptions.isRawBody) {
            if (fetchOptions.customContentType) {
                headers['Content-Type'] = fetchOptions.customContentType;
            }
            // For raw body, Content-Type should be set by the caller if needed, or browser might infer.
            // If not set, some servers might default to application/octet-stream or reject.
        } else if (body !== null) { // Only set JSON content type if body is not raw and not null
            headers['Content-Type'] = fetchOptions.customContentType || 'application/json';
        }

        const options = {
            method: method,
            headers: headers
        };

        if (body !== null) { // Check for null explicitly
            if (fetchOptions.isRawBody) {
                options.body = body; // Send body as-is (e.g., File, Blob, ArrayBuffer)
            } else {
                options.body = JSON.stringify(body); // Default to JSON stringify
            }
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