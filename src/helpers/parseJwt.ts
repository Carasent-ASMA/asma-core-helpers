import { realWindow } from "../g-definitions"

export function parseJwt<R>(jwtToken: string) {
    const base64Url = jwtToken?.split('.')[1]

    if (!base64Url) {
        return
    }

    return JSON.parse(decodeURIComponent(escape(realWindow.atob(base64Url)))) as R
}

function escape(str: string) {
    return str.replace(/[^\w.]/g, function (c) {
        return '%' + c.charCodeAt(0).toString(16)
    })
}
