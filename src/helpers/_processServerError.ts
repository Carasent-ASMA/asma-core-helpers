import { getHttpErrorMessage } from './httpErrorMessage.js'
import { httpErrorLocale, type HttpErrorMessageOptions, httpFallback } from './httpErrorMessages.js'
import { readableErrorText } from './readableErrorText.js'

export type { HttpErrorMessageOptions } from './httpErrorMessages.js'

export function _processServerError(error: unknown, options: HttpErrorMessageOptions = {}): string {
    console['error'](error)
    const httpMessage = getHttpErrorMessage(error, options)
    if (httpMessage !== undefined) return httpMessage
    return _getServerErrorMessage(error, options).slice(0, 250)
}

export function _getServerErrorMessage(error: unknown, options: HttpErrorMessageOptions = {}): string {
    const httpMessage = getHttpErrorMessage(error, options)
    if (httpMessage !== undefined) return httpMessage
    return readableErrorText(legacyMessage(error)) ?? httpFallback(500, httpErrorLocale(options))
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function arrayMessage(errors: unknown[]): string | undefined {
    const messages = errors.flatMap((error) => {
        const message = readableErrorText(isRecord(error) ? error['message'] : error)
        return message ? [message] : []
    })
    return messages.length ? messages.join() : undefined
}

/** Retain established non-HTTP GraphQL, connector and validation adapters. */
function legacyMessage(error: unknown): unknown {
    if (typeof error === 'string') return error
    if (Array.isArray(error)) return arrayMessage(error)
    if (!isRecord(error)) return undefined
    if (isRecord(error['data']) && readableErrorText(error['data']['Message'])) return error['data']['Message']
    if (Array.isArray(error['errors'])) return arrayMessage(error['errors'])
    if (readableErrorText(error['bodyText'])) return error['bodyText']
    if (isRecord(error['response']) && error['response']['data'] !== undefined) {
        return legacyResponseMessage(error['response']['data'])
    }
    if (readableErrorText(error['message'])) return error['message']
    if (readableErrorText(error['error'])) return error['error']
    if (isRecord(error['request'])) return error['request']['response']
    return undefined
}

function legacyResponseMessage(raw: unknown): unknown {
    const data = isRecord(raw) ? raw['error'] ?? raw : raw
    if (typeof data === 'string') return data
    if (Array.isArray(data)) return arrayMessage(data)
    if (!isRecord(data)) return undefined
    const entry = Object.entries(data)[0]
    if (!entry) return undefined
    const [key, value] = entry
    if (readableErrorText(value)) return value
    if (Array.isArray(value)) {
        const first = value[0]
        if (isRecord(first) && readableErrorText(first['message'])) return first['message']
        if (first === 'validation.required') return `window.strings.field_is_required ${key}`
        return readableErrorText(first) ? `${key}: ${first}` : undefined
    }
    if (!isRecord(value)) return undefined
    if (readableErrorText(value['message'])) return value['message']
    const child = Object.entries(value)[0]
    if (!child) return undefined
    const [childKey, childValue] = child
    return typeof childValue === 'string' || typeof childValue === 'number'
        ? `${childKey}: ${childValue}`
        : undefined
}
