

export function parseJwt<R>(jwtToken: string){
    const base64Url = jwtToken?.split('.')[1]

    if (!base64Url) {
        return 
    }

    return JSON.parse(decodeURIComponent(escape(window.atob(base64Url)))) as R
}