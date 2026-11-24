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
