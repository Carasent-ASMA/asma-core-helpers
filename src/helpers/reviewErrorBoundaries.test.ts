import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { _getServerErrorMessage } from './_processServerError.js'
import { httpFallback } from './httpErrorMessages.js'
import { readHttpErrorBody } from './readHttpErrorBody.js'

describe('HTTP refusal boundaries raised in independent PR review', () => {
    it('keeps the established Axios text adapter and the status fallback for new plaintext carriers', () => {
        const body = 'Select a document before continuing.'
        assert.equal(_getServerErrorMessage({ response: { status: 400, data: body } }), body)
        for (const error of [
            { status: 400, body },
            { status: 400, data: body },
            { response: new Response(null, { status: 400 }), data: body },
        ]) assert.equal(_getServerErrorMessage(error), httpFallback(400, 'en'))
    })

    it('does not promote diagnostic response arrays to public error messages', () => {
        for (const data of [
            ['private-a', 'private-b'],
            { error: ['SELECT private FROM database'] },
            { errors: ['SELECT private FROM database'] },
            { message: ['SELECT private FROM database'] },
        ]) {
            assert.equal(_getServerErrorMessage({ response: { status: 403, data } }), httpFallback(403, 'en'))
        }
    })

    it('keeps readable message records in mixed response arrays and ignores bare diagnostics', () => {
        const records = [{ message: 'First public reason' }, 'private diagnostic', null,
            { message: '<html>private page</html>' }, { message: 'Second public reason' }]
        for (const data of [records, { error: records }, { errors: records }, { message: records }]) {
            assert.equal(_getServerErrorMessage({ response: { status: 403, data } }),
                'First public reason,Second public reason')
        }
    })

    it('retains explicit caller-array and legacy response message-record contracts', () => {
        assert.equal(_getServerErrorMessage(['First public reason', 'Second public reason']),
            'First public reason,Second public reason')
        assert.equal(_getServerErrorMessage({ response: { status: 403,
            data: [{ message: 'First public reason' }, { message: 'Second public reason' }] } }),
            'First public reason,Second public reason')
    })

    for (const status of [401, 403, 404, 409, 413, 422]) {
        it(`uses the known HTTP ${status} when a legacy body has no readable reason`, () => {
            for (const locale of ['en', 'nb'] as const) {
                for (const data of [{ success: false }, { detail: null }, { foo: 123 },
                    { error: null }, { errors: [] }, [null]]) {
                    assert.equal(_getServerErrorMessage({ response: { status, data } }, { locale }),
                        httpFallback(status, locale))
                }
            }
        })
    }

    it('keeps the server fallback when there is no valid HTTP status', () => {
        for (const status of [undefined, null, '401', 200, 600, 403.5]) {
            assert.equal(_getServerErrorMessage({ response: { status, data: { detail: null } } }),
                httpFallback(500, 'en'))
        }
    })

    it('refuses undeclared or mislabeled binary bytes and leaves the original response readable', async () => {
        for (const bytes of [new Uint8Array([0, 1, 2]), new Uint8Array([255, 254])]) {
            for (const type of ['', 'text/plain', 'application/json']) {
                const blob = new Blob([bytes], { type })
                assert.equal(await readHttpErrorBody(blob), blob)
                const response = new Response(bytes, { headers: type ? { 'content-type': type } : {} })
                assert.equal(await readHttpErrorBody(response), response)
                assert.equal(response.bodyUsed, false)
                assert.deepEqual(new Uint8Array(await response.arrayBuffer()), bytes)
            }
        }
        const message = _getServerErrorMessage({ response: { status: 400, data: '\u0000\u0001PRIVATE' } })
        assert.equal(message, httpFallback(400, 'en'))
    })

    it('continues to decode UTF-8 prose and JSON without a content type', async () => {
        const data = { publicMessage: 'Velg et annet spørreskjema.' }
        assert.deepEqual(await readHttpErrorBody(new Blob([JSON.stringify(data)])), data)
        const prose = 'Velg et annet spørreskjema.\n\tPrøv igjen.\r\n'
        assert.equal(await readHttpErrorBody(new Response(prose)), prose)
    })
})
