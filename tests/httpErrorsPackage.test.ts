import assert from 'node:assert/strict'
import { test } from 'node:test'

test('imports the built HTTP error API without browser globals or root initialization', async () => {
    assert.equal('window' in globalThis, false)
    const { _getServerErrorMessage, _processServerError, readHttpErrorBody } = await import('asma-core-helpers/http-errors')
    assert.equal(typeof _processServerError, 'function')
    assert.equal('window' in globalThis, false)
    const response = new Response(JSON.stringify({ publicMessage: 'Select another questionnaire.' }),
        { status: 422, headers: { 'content-type': 'application/json' } })
    const body = await readHttpErrorBody(response)
    assert.equal(_getServerErrorMessage({ status: response.status, body }), 'Select another questionnaire.')
    assert.equal(response.bodyUsed, false)
    assert.equal(_getServerErrorMessage({ response: { status: 401, data: { success: false } } }),
        'Your session has expired. Sign in again.')
})
