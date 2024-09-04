import { realWindow } from '..'

export function parseJwt<R>(jwtToken: string) {
    let base64Url = jwtToken?.split('.')[1]

    if (!base64Url) {
        return
    }
    try {
        return JSON.parse(decodeURIComponent(escape(realWindow.atob(base64Url)))) as R
    } catch (e) {
        console.error(
            'tried to decode base64Url: ',
            base64Url,
            'Error parsing jwt, JSON.parse(decodeURIComponent(escape(realWindow.atob(base64Url)))): ',
            e,
        )
        try {
            return JSON.parse(realWindow.atob(base64Url)) as R
        } catch (e) {
            console.error(
                'tried to decode base64Url: ',
                base64Url,
                'Error parsing jwt second step JSON.parse(realWindow.atob(base64Url)): ',
                e,
            )
            return
        }
    }
}

function escape(str: string) {
    return str.replace(/[^\w.]/g, function (c) {
        return '%' + c.charCodeAt(0).toString(16)
    })
}

export function splitAndValidateBase64(base64String: string) {
    // Define the allowed Base64 character set including padding '='
    const base64Charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/='

    // Function to validate if a chunk is a valid Base64 segment
    const isValidBase64Chunk = (chunk: string) => {
        if (chunk.length !== 4) {
            console.error(`chunk.length !== 4', chunk:${chunk}`)
            return false // Chunks must be 4 characters long
        }
        // Check each character in the chunk
        for (let char of chunk) {
            if (!base64Charset.includes(char)) {
                console.error(`chunk: ${chunk} !base64Charset.includes(char), char:${char}`)
                return false
            }
        }

        // Validate padding (if present)
        const paddingCount = (chunk.match(/=/g) || []).length
        if (paddingCount > 2) {
            console.error(`chunk: ${chunk}, paddingCount > 2, paddingCount:${paddingCount}`)
            return false
        } // There can be at most 2 padding characters

        // Padding should be at the end of the chunk
        if (paddingCount > 0 && !chunk.endsWith('=')) {
            console.error(`chunk: ${chunk},paddingCount:${paddingCount}, paddingCount > 0 && !chunk.endsWith('=')`)
            return false
        }
        return true
    }

    // Split the string into 4-character chunks
    const chunks = base64String.match(/.{1,4}/g) || []

    // Filter out invalid chunks
    const validChunks = chunks.filter(isValidBase64Chunk)

    // Join the valid chunks back into a single string
    const validBase64String = validChunks.join('')

    return validBase64String
}
