import { realWindow } from '..'

export function parseJwt<R>(jwtToken: string) {
    const base64Url = jwtToken?.split('.')[1]

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
