import { type ValidationLocale, validationMessages } from '../validation/messages.js'

import {
    httpErrorLocale,
    type HttpErrorMessageOptions,
    httpFallback,
    httpTransportFallback,
} from './httpErrorMessages.js'
import { readableErrorText } from './readableErrorText.js'

const NETWORK_ERROR_CODES = new Set(['ERR_NETWORK', 'ECONNRESET', 'ENOTFOUND'])
const TIMEOUT_ERROR_CODES = new Set(['ECONNABORTED', 'ETIMEDOUT'])
const NATIVE_EXCEPTION_NAMES = new Set([
    'SyntaxError', 'TypeError', 'ReferenceError', 'RangeError', 'EvalError', 'URIError',
])
const FETCH_ERROR_MESSAGES = new Set([
    'Failed to fetch',
    'Load failed',
    'NetworkError when attempting to fetch resource.',
    'fetch failed',
    'The network connection was lost.',
    'Network request failed',
])

function transportFailure(
    error: Record<string, unknown>,
    status: unknown,
): 'network' | 'timeout' | 'unexpected' | 'interrupted' | undefined {
    const networkError = isRecord(error['networkError']) ? error['networkError'] : undefined
    error = networkError ?? error
    if (error['code'] === 'ERR_CANCELED' || (error['name'] === 'TypeError' && error['message'] === 'Cancelled'))
        return 'interrupted'
    if (error['code'] === 'ERR_BAD_RESPONSE') return 'unexpected'
    if (error['name'] === 'TimeoutError') return 'timeout'
    if (error['name'] === 'AbortError') return 'interrupted'
    if (typeof error['code'] === 'string') {
        if (TIMEOUT_ERROR_CODES.has(error['code'])) return 'timeout'
        if (NETWORK_ERROR_CODES.has(error['code'])) return 'network'
    }
    if (status === 0 || error['name'] === 'NetworkError') return 'network'
    if (
        error['name'] === 'TypeError' &&
        typeof error['message'] === 'string' &&
        FETCH_ERROR_MESSAGES.has(error['message'])
    ) {
        return 'network'
    }
    if (networkError) return 'network'
    // Native runtime/parser/DOM messages describe implementation failures, not a
    // public reason. Keep recognized transport errors above and legacy app Errors below.
    // The name/tag checks also cover exceptions produced in another browser realm.
    if (
        (typeof error['name'] === 'string' && NATIVE_EXCEPTION_NAMES.has(error['name'])) ||
        Object.prototype.toString.call(error) === '[object DOMException]'
    ) {
        return 'unexpected'
    }
    return undefined
}

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
export function getHttpErrorMessage(
    error: unknown,
    options: HttpErrorMessageOptions = {},
    legacyLimit?: number,
): string | undefined {
    const legacyText = (value: unknown) => readableErrorText(value)?.slice(0, legacyLimit)
    if (!isRecord(error)) return undefined
    const response = isRecord(error['response']) ? error['response'] : undefined
    const status: unknown = response?.['status'] ?? error['statusCode'] ?? error['status']
    const locale = httpErrorLocale(options)
    if (typeof status !== 'number' || !Number.isInteger(status) || status < 400 || status > 599) {
        const failure = transportFailure(error, status)
        return failure ? httpTransportFallback(failure, locale) : undefined
    }
    const body: unknown = response?.['data'] ?? error['data'] ?? error['body'] ?? error
    if (Array.isArray(body) && (status === 400 || status === 422)) {
        const validation = validationMessagesFromBody({ issues: body }, locale)
        if (validation.length) return validation.join('; ')
    }
    if (isRecord(body)) {
        const message = readableErrorText(body['publicMessage'])
        if (message) return message
        if (Object.hasOwn(body, 'publicMessage')) return httpFallback(status, locale)
        if (status < 500 && readableErrorText(body['Message'])) return legacyText(body['Message'])
        if (status === 400 || status === 422) {
            const validation = validationMessagesFromBody(body, locale)
            if (validation.length) return validation.join('; ')
        }
    }
    // Old Auth/Storage/connector responses deliberately expose their 4xx reason. Keep that
    // contract unless the body identifies itself as a newer private diagnostic envelope.
    const modernEnvelope =
        isRecord(body) &&
        (Object.hasOwn(body, 'statusCode') ||
            Object.hasOwn(body, 'requestId') ||
            (Object.hasOwn(body, 'code') && Object.hasOwn(body, 'traceId')))
    if (status < 500 && !modernEnvelope) {
        if (typeof body === 'string' && response?.['data'] && readableErrorText(body)) return legacyText(body)
        if (Array.isArray(body) && body.length && response?.['data']) return undefined
        if (isRecord(body)) {
            if (response?.['data'] && Object.keys(body).length) return undefined
            if (Object.keys(body).length === 1 && readableErrorText(body['error'])) return legacyText(body['error'])
        }
        if (Array.isArray(error['graphQLErrors']) && error['graphQLErrors'].length) return undefined
    }
    return httpFallback(status, locale)
}
