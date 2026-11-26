/** Decode refusal payloads from blob downloads and fetch without replacing the original error. */
export async function readHttpErrorBody(body: unknown): Promise<unknown> {
    let value = body
    try {
        if (typeof Response !== 'undefined' && body instanceof Response) {
            value = await body.clone().text()
        } else if (typeof Blob !== 'undefined' && body instanceof Blob) {
            value = await body.text()
        }
    } catch {
        // Reading diagnostics is optional. The caller still has the actual response/status.
        return body
    }
    if (typeof value !== 'string') return value
    try {
        return JSON.parse(value) as unknown
    } catch {
        return value
    }
}
