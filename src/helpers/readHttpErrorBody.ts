const MAX_ERROR_BODY_BYTES = 1024 * 1024

function isTextBody(contentType: string): boolean {
    return !contentType || /^text\//i.test(contentType) || /[/+]json(?:;|$)/i.test(contentType)
}

async function readResponseText(response: Response): Promise<string | undefined> {
    if (!isTextBody(response.headers.get('content-type') ?? '')) return undefined
    const declaredSize = Number(response.headers.get('content-length'))
    if (declaredSize > MAX_ERROR_BODY_BYTES) return undefined
    const reader = response.clone().body?.getReader()
    if (!reader) return ''
    const decoder = new TextDecoder('utf-8', { fatal: true })
    let text = ''
    let size = 0
    try {
        for (;;) {
            const { value, done } = await reader.read()
            if (done) return text + decoder.decode()
            size += value.byteLength
            if (size > MAX_ERROR_BODY_BYTES) {
                void reader.cancel().catch(() => undefined)
                return undefined
            }
            text += decoder.decode(value, { stream: true })
        }
    } finally {
        reader.releaseLock()
    }
}

/** Decode bounded JSON/text refusal bodies without replacing the original error or response. */
export async function readHttpErrorBody(body: unknown): Promise<unknown> {
    let value = body
    try {
        if (typeof Response !== 'undefined' && body instanceof Response) {
            value = await readResponseText(body)
            if (value === undefined) return body
        } else if (typeof Blob !== 'undefined' && body instanceof Blob) {
            if (body.size > MAX_ERROR_BODY_BYTES || !isTextBody(body.type)) return body
            value = new TextDecoder('utf-8', { fatal: true }).decode(await body.arrayBuffer())
        }
    } catch {
        // Reading diagnostics is optional. The caller still has the actual response/status.
        return body
    }
    if (typeof value !== 'string') return value
    if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) return body
    try {
        return JSON.parse(value) as unknown
    } catch {
        return value
    }
}
