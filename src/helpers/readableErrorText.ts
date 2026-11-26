/** Keep human-readable error text; protocol documents belong in diagnostics. */
export function readableErrorText(value: unknown): string | undefined {
    if (typeof value !== 'string') return undefined
    const text = value.trim()
    if (!text || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text)) return undefined
    // Protocol documents can start with declarations/comments or an already-open wrapper.
    // Paired tags and standard HTML containers differ from prose such as '<name> is required'.
    if (
        /<(?:\?|!|\/)/.test(text) ||
        /<(?:html|head|body|title|script|style|pre|div|p|h[1-6]|br|hr)\b/i.test(text) ||
        /^<[^>]+>$/.test(text)
    )
        return undefined
    if (/\n\s+at\s+\S+(?:\s+\([^)]*:\d+(?::\d+)?\)|:\d+:\d+)/.test(text)) return undefined
    if (text.startsWith('{') || text.startsWith('[')) {
        try {
            const parsed: unknown = JSON.parse(text)
            if (parsed !== null && typeof parsed === 'object') return undefined
        } catch {
            // Ordinary text can start with a bracket; only a serialized document is rejected.
        }
    }
    return text
}
