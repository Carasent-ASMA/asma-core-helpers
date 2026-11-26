import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readHttpErrorBody } from './readHttpErrorBody.js'

test('decodes JSON from blob error responses without losing the public contract', async () => {
    const data = { publicMessage: 'Select a context.', message: 'private diagnostic', requestId: 'request-blob' }
    for (const type of ['application/json', 'application/json; charset=utf-8']) {
        assert.deepEqual(await readHttpErrorBody(new Blob([JSON.stringify(data)], { type })), data)
    }
})
test('reads a cloned fetch response and leaves its original body available for diagnosis', async () => {
    const response = new Response('{"publicMessage":"Select a context."}', {
        status: 422,
        headers: { 'content-type': 'application/problem+json' },
    })
    assert.deepEqual(await readHttpErrorBody(response), { publicMessage: 'Select a context.' })
    assert.equal(response.bodyUsed, false)
    assert.equal(await response.text(), '{"publicMessage":"Select a context."}')
})
test('retains empty and non-JSON refusal bodies without throwing a parser error', async () => {
    for (const text of ['', '<html>upstream failure</html>', 'legacy sentence', '{broken json']) {
        assert.equal(await readHttpErrorBody(new Blob([text])), text)
        assert.equal(await readHttpErrorBody(new Response(text, { status: 422 })), text)
    }
})
test('accepts already-decoded payloads and serialized JSON', async () => {
    const data = { requestId: 'request-1' }
    assert.equal(await readHttpErrorBody(data), data)
    assert.deepEqual(await readHttpErrorBody(JSON.stringify(data)), data)
    assert.equal(await readHttpErrorBody(null), null)
})
test('retains the original body when decoding cannot be completed', async () => {
    const response = new Response('consumed', { status: 500 })
    await response.text()
    assert.equal(await readHttpErrorBody(response), response)
})

test('leaves binary and oversized bodies intact for status fallback instead of decoding documents as error text', async () => {
    const binary = new Blob(['%PDF-binary-document'], { type: 'application/pdf' })
    assert.equal(await readHttpErrorBody(binary), binary)
    const large = new Blob(['x'.repeat(1024 * 1024 + 1)], { type: 'text/plain' })
    assert.equal(await readHttpErrorBody(large), large)
    const response = new Response('x'.repeat(1024 * 1024 + 1), {
        status: 500,
        headers: { 'content-type': 'text/plain' },
    })
    assert.equal(await readHttpErrorBody(response), response)
    assert.equal(response.bodyUsed, false)
})
