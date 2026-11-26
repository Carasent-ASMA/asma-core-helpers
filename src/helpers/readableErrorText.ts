/** Keep human-readable error text; protocol documents belong in diagnostics. */
export function readableErrorText(value: unknown): string | undefined {
    if (typeof value !== 'string') return undefined
    const text = value.trim()
    if (!text || /^<(?:!doctype\b|[a-z][\w:-]*(?:\s|\/?>))/i.test(text)) return undefined
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
