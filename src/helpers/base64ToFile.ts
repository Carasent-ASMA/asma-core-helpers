import { realWindow } from '../g-definitions'

export function base64toFile(b64Data: string, name: string, type = 'application/pdf') {
    const bytes = realWindow.atob(b64Data)
    const writer = new Uint8Array(new ArrayBuffer(bytes.length))

    for (let i = 0; i < bytes.length; i++) {
        writer[i] = bytes.charCodeAt(i)
    }
    return new File([writer.buffer], name, { type })
}
