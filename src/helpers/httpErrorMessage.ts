import { validationMessages } from '../validation/messages.js'

function isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function nonEmptyText(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function fieldLabel(path: unknown): string {
    const parts = Array.isArray(path) ? path : typeof path === 'string' ? path.split(/[.[\]]/).filter(Boolean) : []
    return parts
        .map((part: unknown) => {
            if (typeof part === 'number' || (typeof part === 'string' && /^\d+$/.test(part))) {
                return String(Number(part) + 1)
            }
            if (typeof part !== 'string') return ''
            const words = part.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ')
            return words.charAt(0).toUpperCase() + words.slice(1)
        })
        .filter(Boolean)
        .join(' → ')
}

function validationMessage(path: unknown, message: unknown): string | undefined {
    const reason = message === 'validation.required' ? validationMessages.en.required : nonEmptyText(message)
    if (!reason) return undefined
    const label = fieldLabel(path)
    return label ? `${label}: ${reason}` : reason
}

function validatorIssues(body: Record<string, unknown>): unknown[] {
    if (Array.isArray(body['issues'])) return body['issues']
    if (Array.isArray(body['errors'])) return body['errors']
    const error = body['error']
    if (!isRecord(error) || error['name'] !== 'ZodError') return []
    if (Array.isArray(error['issues'])) return error['issues']
    if (typeof error['message'] !== 'string') return []
    try {
        const issues: unknown = JSON.parse(error['message'])
        return Array.isArray(issues) ? issues : []
    } catch {
        return []
    }
}

function validationMessagesFromBody(body: Record<string, unknown>): string[] {
    const messages = validatorIssues(body).flatMap((issue) => {
        if (!isRecord(issue)) return []
        const message = validationMessage(issue['path'], issue['message'])
        return message ? [message] : []
    })
    // Laravel field maps are a legacy public validation contract. Other arrays in an error
    // envelope (for example `error: [...]`) are diagnostics, not field errors.
    const fields = isRecord(body['errors']) ? body['errors'] : body
    for (const [path, reasons] of Object.entries(fields)) {
        if (fields === body && ['error', 'errors', 'issues', 'message', 'publicMessage'].includes(path)) continue
        if (!Array.isArray(reasons) || !reasons.every((reason) => typeof reason === 'string')) continue
        for (const reason of reasons) {
            const message = validationMessage(path, reason)
            if (message) messages.push(message)
        }
    }
    return [...new Set(messages)]
}

function httpFallback(status: number): string {
    if (status === 401) return 'Your session has expired. Sign in again.'
    if (status === 403) return 'You do not have permission to do this.'
    if (status === 404) return 'This no longer exists. Reload the page and try again.'
    if (status === 409) return 'This action conflicts with the current state. Reload the page and try again.'
    if (status === 413) return 'The request is too large. Reduce its size and try again.'
    if (status === 429) return 'Too many requests. Wait a little and try again.'
    if (status === 400 || status === 422) return 'Check the form fields and try again.'
    return 'Something went wrong. Try again, and contact support if it keeps happening.'
}

/**
 * Read fetch/Axios failures by their response contract, independently of client error classes.
 * `publicMessage` is explicitly displayable; `message` remains a diagnostic field. Legacy
 * Laravel and Hono/Zod validation payloads keep their field paths and actual constraints.
 * Undefined leaves non-HTTP errors to the existing GraphQL/text compatibility handling.
 */
export function getHttpErrorMessage(error: unknown): string | undefined {
    if (!isRecord(error)) return undefined
    const response = isRecord(error['response']) ? error['response'] : undefined
    const status: unknown = response?.['status'] ?? error['statusCode']
    if (typeof status !== 'number' || !Number.isInteger(status) || status < 400 || status > 599) return undefined
    const body: unknown = response?.['data'] ?? error['data'] ?? error
    if (isRecord(body)) {
        const message = nonEmptyText(body['publicMessage'])
        if (message) return message
        if (Object.hasOwn(body, 'publicMessage')) return httpFallback(status)
        if (status === 400 || status === 422) {
            const validation = validationMessagesFromBody(body)
            if (validation.length) return validation.join('; ')
        }
        // Axios/Laravel/GraphQL integrations predate the public-message envelope. Keep their
        // established adapters unless this is the new structured HTTP error contract.
        if (response && Object.hasOwn(response, 'data') && !Object.hasOwn(body, 'statusCode') && status < 500) {
            return undefined
        }
    }
    return httpFallback(status)
}
