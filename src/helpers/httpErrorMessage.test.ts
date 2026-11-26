import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { _getServerErrorMessage, _processServerError } from './_processServerError.js'

function fetchError(data: unknown, status = 422): Record<string, unknown> {
    return {
        data,
        response: new Response(null, { status }),
        message: 'Editor request failed for /private with status 422',
    }
}

describe('HTTP error messages through the shared entry point', () => {
    it('always provides readable fallback text for empty, event and malformed legacy errors', () => {
        for (const error of [null, undefined, '', '   ', {}, new Event('error'), { response: { data: { detail: null } } }]) {
            assert.equal(
                _getServerErrorMessage(error, { locale: 'no' }),
                'Noe gikk galt. Prøv igjen, og kontakt brukerstøtte hvis problemet fortsetter.',
            )
        }
    })

    it('does not render proxy HTML, serialized error JSON, or unreadable Blob bodies', () => {
        for (const data of ['<!DOCTYPE html><html>private ingress</html>', '{"message":"private diagnostic"}', new Blob(['private'])]) {
            const error = { response: { status: 413, data }, message: 'Request failed with status code 413' }
            assert.equal(_processServerError(error), 'The request is too large. Reduce its size and try again.')
        }
        assert.doesNotMatch(_processServerError('<html>private ingress</html>'), /html|private|Missing field/)
    })

    it('uses status fallback for unmarked structured segment errors, never their diagnostic code', () => {
        for (const code of ['PWY-114', 'PWY-104', 'some_future_domain_code']) {
            assert.equal(
                _processServerError({ response: { status: 403, data: { code, message: 'diagnostic', traceId: 'trace-1' } } }),
                'You do not have permission to do this.',
            )
        }
        assert.equal(
            _processServerError({ response: { status: 422, data: { error: 'Select another document.' } } }),
            'Select another document.',
        )
    })

    it('localizes standard timeout and interruption errors without displaying their internal text', () => {
        assert.equal(_processServerError(new DOMException('signal timed out', 'TimeoutError')), 'The request took too long. Try again.')
        assert.equal(
            _processServerError(new DOMException('signal aborted', 'AbortError'), { locale: 'nb' }),
            'Forespørselen ble avbrutt. Prøv igjen.',
        )
    })

    it('reads status and body retained by non-Axios download and letter-claim clients', () => {
        const error = Object.assign(new Error('Failed to download via /internal/documents'), {
            status: 422,
            body: { publicMessage: 'Select a signed document.' },
        })
        assert.equal(_processServerError(error), 'Select a signed document.')
        assert.equal(error.message, 'Failed to download via /internal/documents')
        assert.equal(error.status, 422)
        assert.equal(error.body.publicMessage, 'Select a signed document.')
    })

    it('uses the HTTP fallback when a status-only client has no parsed body', () => {
        assert.equal(
            _processServerError({ status: 403, message: 'Failed to download via /private' }, { locale: 'nb' }),
            'Du har ikke tilgang til å gjøre dette.',
        )
        assert.doesNotMatch(
            _processServerError({ status: 503, body: { publicMessage: null, message: 'SQL diagnostics' } }),
            /SQL|diagnostics|Missing field/,
        )
    })

    it('shows readable network and timeout recovery while retaining the original error', () => {
        for (const code of ['ERR_NETWORK', 'ECONNRESET', 'ENOTFOUND']) {
            const error = Object.assign(new Error('Network Error'), { code, name: 'AxiosError' })
            assert.equal(_processServerError(error), 'Could not connect. Check your connection and try again.')
            assert.equal(error.code, code)
            assert.equal(error.message, 'Network Error')
        }
        for (const code of ['ECONNABORTED', 'ETIMEDOUT']) {
            assert.equal(
                _processServerError({ code, message: 'timeout of 30000ms exceeded' }, { locale: 'no' }),
                'Forespørselen tok for lang tid. Prøv igjen.',
            )
        }
    })

    it('handles native browser fetch failures without depending on an application error class', () => {
        for (const message of ['Failed to fetch', 'Load failed', 'NetworkError when attempting to fetch resource.']) {
            const error = new TypeError(message)
            assert.equal(
                _processServerError(error, { locale: 'nb-NO' }),
                'Kunne ikke koble til. Kontroller forbindelsen og prøv igjen.',
            )
        }
        assert.equal(_processServerError(new TypeError('A different programming error')), 'A different programming error')
    })

    it('keeps a malformed successful response distinct from an HTTP refusal', () => {
        const response = new Response(null, { status: 200 })
        const error = Object.assign(new Error('Editor API returned an empty response body for /private'), {
            code: 'ERR_BAD_RESPONSE',
            response,
        })
        assert.equal(
            _processServerError(error, { locale: 'nb' }),
            'Noe gikk galt. Prøv igjen, og kontakt brukerstøtte hvis problemet fortsetter.',
        )
        assert.equal(error.response, response)
        assert.equal(error.response.status, 200)
        assert.equal(
            _processServerError({ ...fetchError({ publicMessage: 'Select a context.' }), code: 'ERR_BAD_RESPONSE' }),
            'Select a context.',
        )
    })

    it('uses an explicit public message without depending on a client class', () => {
        for (const name of ['EditorResponseError', 'BunjsOpenApiResponseError', 'AxiosError']) {
            assert.equal(
                _getServerErrorMessage({ ...fetchError({ publicMessage: 'Choose another title.' }), name }),
                'Choose another title.',
            )
        }
    })

    it('keeps a one-word public message', () => {
        assert.equal(_getServerErrorMessage(fetchError({ publicMessage: 'Expired' })), 'Expired')
    })

    it('does not decide whether diagnostic text is public from its spelling', () => {
        const result = _getServerErrorMessage(
            fetchError({ message: 'duplicate key value violates unique constraint qnr_title_key' }, 400),
        )
        assert.doesNotMatch(result, /duplicate key|qnr_title_key|request failed/)
    })

    it('reads an Axios response without mutating the original diagnostics', () => {
        const data = { publicMessage: 'Select a context.', requestId: 'request-1' }
        const error = { response: { status: 422, data }, message: 'Request failed with status code 422' }
        assert.equal(_getServerErrorMessage(error), 'Select a context.')
        assert.equal(error.response.data, data)
        assert.equal(data.requestId, 'request-1')
    })

    it('retains constraints for every field rather than checking a field whitelist', () => {
        assert.equal(
            _getServerErrorMessage(fetchError({ errors: { consent_title: ['Must contain at most 80 characters.'] } })),
            'Consent title: Must contain at most 80 characters.',
        )
    })

    it('allows field names that also happen to be protocol property names', () => {
        assert.equal(
            _getServerErrorMessage(fetchError({ errors: { message: ['Write a shorter message.'] } })),
            'Message: Write a shorter message.',
        )
    })

    it('retains all validation reasons and paths', () => {
        assert.equal(
            _getServerErrorMessage(
                fetchError({
                    errors: {
                        title: ['Choose a different title.', 'Must contain at most 80 characters.'],
                        'questions.2.custom_field': ['Select an option.'],
                    },
                }),
            ),
            'Title: Choose a different title.; Title: Must contain at most 80 characters.; Questions → 3 → Custom field: Select an option.',
        )
    })

    it('reads the legacy Laravel field-map response', () => {
        assert.equal(
            _getServerErrorMessage(fetchError({ 'template.context': ['validation.required'] })),
            'Template → Context: Required',
        )
    })

    it('reads structured validator issues without replacing their explanation', () => {
        assert.equal(
            _getServerErrorMessage(
                fetchError(
                    {
                        issues: [
                            {
                                code: 'too_big',
                                path: ['template', 'title'],
                                message: 'Must contain at most 80 characters.',
                                maximum: 80,
                            },
                        ],
                    },
                    400,
                ),
            ),
            'Template → Title: Must contain at most 80 characters.',
        )
    })

    it('reads the existing serialized Hono/Zod response', () => {
        assert.equal(
            _getServerErrorMessage(
                fetchError(
                    {
                        success: false,
                        error: {
                            name: 'ZodError',
                            message: JSON.stringify([{ path: ['new_field'], message: 'Choose a different value.' }]),
                        },
                    },
                    400,
                ),
            ),
            'New field: Choose a different value.',
        )
    })

    it('preserves a root-level validation message', () => {
        assert.equal(
            _getServerErrorMessage(fetchError({ issues: [{ path: [], message: 'Select at least one recipient.' }] })),
            'Select at least one recipient.',
        )
    })

    it('does not confuse a diagnostic array with field validation', () => {
        assert.doesNotMatch(_getServerErrorMessage(fetchError({ error: ['SELECT secret FROM database'] })), /SELECT/)
    })

    for (const data of [
        null,
        undefined,
        '',
        { error: { name: 'ZodError', message: '{broken' } },
        { publicMessage: {} },
    ]) {
        it('handles an unusable HTTP error body', () => {
            assert.match(_getServerErrorMessage(fetchError(data)), /Check|check/)
        })
    }

    it('keeps 5xx diagnostics out of the user message', () => {
        assert.doesNotMatch(
            _getServerErrorMessage(fetchError({ message: 'SQL failed', errors: { sql: ['private query'] } }, 500)),
            /SQL|query/,
        )
    })

    it('honors an explicit private marker even when diagnostics resemble validation', () => {
        assert.doesNotMatch(
            _getServerErrorMessage(fetchError({ publicMessage: null, errors: { sql: ['private query'] } })),
            /query|Sql/,
        )
    })

    it('handles direct error envelopes and unknown status codes', () => {
        assert.equal(
            _getServerErrorMessage({ statusCode: 409, publicMessage: 'This version was changed by someone else.' }),
            'This version was changed by someone else.',
        )
        assert.doesNotMatch(_getServerErrorMessage(fetchError(null, 418)), /Missing field|request failed/)
    })

    it('preserves the non-HTTP GraphQL and text compatibility paths', () => {
        assert.equal(_getServerErrorMessage({ errors: [{ message: 'GraphQL explanation' }] }), 'GraphQL explanation')
        assert.equal(_getServerErrorMessage('Existing message'), 'Existing message')
        assert.equal(
            _getServerErrorMessage({ message: "field 'deleted_at' not found" }),
            "field 'deleted_at' not found",
        )
    })

    it('preserves the older Axios public-response adapter', () => {
        assert.equal(
            _getServerErrorMessage({ response: { status: 422, data: { Message: 'Legacy public reason' } } }),
            'Legacy public reason',
        )
    })

    it('uses the selected interface language for fallback and required validation text', () => {
        for (const locale of ['no', 'nb', 'nb-NO', 'NO']) {
            assert.equal(
                _getServerErrorMessage(fetchError(null), { locale }),
                'Kontroller feltene i skjemaet og prøv igjen.',
            )
            assert.equal(
                _getServerErrorMessage(fetchError({ errors: { title: ['validation.required'] } }), { locale }),
                'Title: Obligatorisk',
            )
        }
        assert.equal(
            _getServerErrorMessage(fetchError(null, 401), { locale: 'no' }),
            'Økten din er utløpt. Logg inn på nytt.',
        )
        assert.equal(
            _getServerErrorMessage(fetchError(null), { locale: 'en-GB' }),
            'Check the form fields and try again.',
        )
        assert.equal(
            _getServerErrorMessage(fetchError({ publicMessage: 'Expired' }), { locale: 'no' }),
            'Expired',
        )
    })

    it('keeps nested validation constraints from segment error envelopes', () => {
        assert.equal(
            _getServerErrorMessage(fetchError({
                code: 'domain_validation',
                message: 'Request validation failed.',
                details: { issues: [{ path: ['title'], message: 'Must contain at most 80 characters.' }] },
            }, 400)),
            'Title: Must contain at most 80 characters.',
        )
        assert.doesNotMatch(
            _getServerErrorMessage(fetchError({
                publicMessage: null,
                details: { issues: [{ path: ['sql'], message: 'private constraint' }] },
            }, 400)),
            /private|constraint/,
        )
    })

    it('keeps complete HTTP explanations at the actual snackbar entry point', () => {
        const publicMessage = 'Choose another title. '.repeat(20)
        const result = _processServerError(fetchError({ publicMessage }))
        assert.equal(result, publicMessage.trim())
        assert.ok(result.length > 250)
    })

    it('preserves legacy Axios text/array and HTTP GraphQL adapters', () => {
        assert.equal(
            _getServerErrorMessage({ response: { status: 403, data: 'You may not edit this.' } }),
            'You may not edit this.',
        )
        assert.equal(
            _getServerErrorMessage({ response: { status: 400, data: [{ message: 'First problem' }] } }),
            'First problem',
        )
        assert.equal(
            _getServerErrorMessage(fetchError({ Message: 'Legacy public reason' })),
            'Legacy public reason',
        )
        assert.equal(
            _getServerErrorMessage({
                response: new Response(null, { status: 400 }),
                graphQLErrors: [{ message: "field 'deleted_at' not found" }],
                message: "[GraphQL] field 'deleted_at' not found",
            }),
            "[GraphQL] field 'deleted_at' not found",
        )
        assert.doesNotMatch(
            _getServerErrorMessage({ response: { status: 500, data: 'SELECT private FROM database' } }),
            /SELECT|private/,
        )
    })

    it('honors explicit public intent for 5xx and deduplicates validation reasons', () => {
        assert.equal(
            _getServerErrorMessage(fetchError({ publicMessage: '  Retry later.  ' }, 503)),
            'Retry later.',
        )
        assert.equal(
            _getServerErrorMessage(fetchError({ errors: { title: ['Required', 'Required'] } }, 400)),
            'Title: Required',
        )
        assert.equal(
            _getServerErrorMessage(fetchError({ publicMessage: null }, 400)),
            'Check the form fields and try again.',
        )
    })
})
