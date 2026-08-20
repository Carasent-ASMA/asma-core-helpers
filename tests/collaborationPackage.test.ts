import assert from 'node:assert/strict'
import { test } from 'node:test'

test('publishes the document contract validator from the collaboration subpath', async () => {
    const { findQuestionOwnershipViolations } = await import('asma-core-helpers/collaboration')

    assert.equal(typeof findQuestionOwnershipViolations, 'function')
})
