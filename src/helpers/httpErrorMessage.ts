import { type ValidationLocale, validationMessages } from '../validation/messages.js'

import { httpErrorLocale, type HttpErrorMessageOptions, httpFallback } from './httpErrorMessages.js'

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

function validationMessage(path: unknown, message: unknown, locale: ValidationLocale): string | undefined {
    const reason = message === 'validation.required' ? validationMessages[locale].required : nonEmptyText(message)
    if (!reason) return undefined
    const label = fieldLabel(path)
    return label ? `${label}: ${reason}` : reason
}

function validatorIssues(body: Record<string, unknown>): unknown[] {
    if (Array.isArray(body['issues'])) return body['issues']
    if (Array.isArray(body['errors'])) return body['errors']
    const details = body['details']
    if (isRecord(details) && Array.isArray(details['issues'])) return details['issues']
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

function validationMessagesFromBody(body: Record<string, unknown>, locale: ValidationLocale): string[] {
    const messages = validatorIssues(body).flatMap((issue) => {
        if (!isRecord(issue)) return []
        const message = validationMessage(issue['path'], issue['message'], locale)
        return message ? [message] : []
    })
    // Laravel field maps are a legacy public validation contract. Other arrays in an error
    // envelope (for example `error: [...]`) are diagnostics, not field errors.
    const fields = isRecord(body['errors']) ? body['errors'] : body
    for (const [path, reasons] of Object.entries(fields)) {
        if (fields === body && ['error', 'errors', 'issues', 'message', 'publicMessage'].includes(path)) continue
        if (!Array.isArray(reasons) || !reasons.every((reason) => typeof reason === 'string')) continue
        for (const reason of reasons) {
            const message = validationMessage(path, reason, locale)
            if (message) messages.push(message)
        }
    }
    return [...new Set(messages)]
}

/**
 * Read fetch/Axios failures by their response contract, independently of client error classes.
 * `publicMessage` is explicitly displayable; `message` remains a diagnostic field. Legacy
 * Laravel and Hono/Zod validation payloads keep their field paths and actual constraints.
 * Undefined leaves non-HTTP errors to the existing GraphQL/text compatibility handling.
 */
export function getHttpErrorMessage(error: unknown, options: HttpErrorMessageOptions = {}): string | undefined {
    if (!isRecord(error)) return undefined
    const response = isRecord(error['response']) ? error['response'] : undefined
    const status: unknown = response?.['status'] ?? error['statusCode']
    if (typeof status !== 'number' || !Number.isInteger(status) || status < 400 || status > 599) return undefined
    const locale = httpErrorLocale(options)
    const body: unknown = response?.['data'] ?? error['data'] ?? error
    if (Array.isArray(body) && (status === 400 || status === 422)) {
        const validation = validationMessagesFromBody({ issues: body }, locale)
        if (validation.length) return validation.join('; ')
    }
    if (isRecord(body)) {
        const message = nonEmptyText(body['publicMessage'])
        if (message) return message
        if (Object.hasOwn(body, 'publicMessage')) return httpFallback(status, locale)
        if (status < 500 && nonEmptyText(body['Message'])) return nonEmptyText(body['Message'])
        if (status === 400 || status === 422) {
            const validation = validationMessagesFromBody(body, locale)
            if (validation.length) return validation.join('; ')
        }
    }
    // Preserve established legacy adapters (including text/array Axios responses and urql),
    // while new private envelopes and all unmarked 5xx failures use a safe fallback.
    if (status < 500 && (!isRecord(body) || !Object.hasOwn(body, 'statusCode'))) {
        if (response?.['data']) return undefined
        if (Array.isArray(error['graphQLErrors']) && error['graphQLErrors'].length) return undefined
    }
    return httpFallback(status, locale)
}
