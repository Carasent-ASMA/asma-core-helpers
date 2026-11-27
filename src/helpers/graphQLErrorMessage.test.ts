import assert from 'node:assert/strict'
import { beforeEach, describe, it } from 'node:test'

import { CombinedError, createClient, fetchExchange, gql } from '@urql/core'

import { _getServerErrorMessage, _processServerError } from './_processServerError.js'

const recovery = {
    no: 'Noe gikk galt. Prøv igjen, og kontakt brukerstøtte hvis problemet fortsetter.',
    en: 'Something went wrong. Try again, and contact support if it keeps happening.',
}

function refusal(extensions: Record<string, unknown>, responseStatus = 200) {
    return new CombinedError({
        graphQLErrors: [{ message: 'private SQL diagnostic and legacy English fallback', extensions }],
        response: new Response('{}', { status: responseStatus }),
    })
}

beforeEach((context) => context.mock.method(console, 'error', () => undefined))

describe('explicit public/private GraphQL error contract', () => {
    it('localizes a real urql response for both HTTP 200 and HTTP 400', async () => {
        for (const status of [200, 400]) {
            const client = createClient({
                url: 'https://action.invalid/graphql',
                exchanges: [fetchExchange],
                fetch: () => Promise.resolve(Response.json({
                    errors: [{
                        message: 'Could not check access to this activity. Try again.',
                        extensions: { statusCode: 502, publicMessage: null, requestId: 'action-1' },
                    }],
                }, { status })),
            })
            const result = await client.query(gql`query Probe { getActivityStatuses(activity_ids: [-1]) { soknadID } }`, {}).toPromise()
            assert.ok(result.error)
            for (const locale of ['no', 'en'] as const) {
                assert.equal(_getServerErrorMessage(result.error, { locale }), recovery[locale])
                assert.equal(_processServerError(result.error, { locale }), recovery[locale])
            }
            assert.equal(result.error.graphQLErrors[0]?.extensions['statusCode'], 502)
        }
    })

    it('keeps the complete opted-in reason and every original diagnostic object', () => {
        const publicMessage = `Velg en aktiv kontekst. ${'Fullstendig forklaring. '.repeat(30)}`.trim()
        const error = refusal({ statusCode: 422, publicMessage, requestId: 'action-2', code: 'context_missing' }, 400)
        const original = { message: error.message, stack: error.stack, errors: error.graphQLErrors }
        assert.equal(_getServerErrorMessage(error, { locale: 'no' }), publicMessage)
        assert.equal(_processServerError(error, { locale: 'no' }), publicMessage)
        assert.ok(publicMessage.length > 250)
        assert.equal(error.message, original.message)
        assert.equal(error.stack, original.stack)
        assert.equal(error.graphQLErrors, original.errors)
        assert.equal(error.graphQLErrors[0]?.extensions['requestId'], 'action-2')
    })

    it('uses the actual upstream status for private refusals and supports a direct GraphQLError', () => {
        const error = refusal({ statusCode: 403, publicMessage: null })
        assert.equal(_processServerError(error, { locale: 'no' }), 'Du har ikke tilgang til å gjøre dette.')
        assert.equal(_getServerErrorMessage(error.graphQLErrors[0], { locale: 'no' }), 'Du har ikke tilgang til å gjøre dette.')
    })

    it('keeps explicit opt-out private for empty or unreadable text and malformed status metadata', () => {
        for (const publicMessage of [null, '', '   ', '<html>private response</html>', '{"internal":"private"}']) {
            for (const statusCode of [502, '403', 0, 400.5, undefined]) {
                assert.equal(_processServerError(refusal({ statusCode, publicMessage }), { locale: 'no' }), recovery.no)
            }
        }
    })

    it('keeps mixed legacy reasons while hiding the marked private diagnostic', () => {
        const error = new CombinedError({ graphQLErrors: [
            { message: 'private diagnostic', extensions: { statusCode: 502, publicMessage: null } },
            { message: 'Select an activity.' },
        ] })
        assert.equal(_processServerError(error, { locale: 'no' }), `${recovery.no}; Select an activity.`)
    })

    it('preserves unmarked legacy GraphQL copy exactly', () => {
        const error = new CombinedError({ graphQLErrors: [{ message: 'Select a context.' }] })
        assert.equal(_getServerErrorMessage(error, { locale: 'no' }), error.message)
        assert.equal(_processServerError(error, { locale: 'no' }), error.message)
    })

    it('keeps recognized network failures ahead of a marked GraphQL refusal', () => {
        const error = new CombinedError({
            networkError: new TypeError('Failed to fetch'),
            graphQLErrors: [{ message: 'private diagnostic', extensions: { statusCode: 403, publicMessage: 'Public reason.' } }],
            response: new Response('{}', { status: 400 }),
        })
        assert.equal(_processServerError(error, { locale: 'no' }), 'Kunne ikke koble til. Kontroller forbindelsen og prøv igjen.')
    })

    it('keeps the explicit HTTP public contract authoritative', () => {
        const error = Object.assign(refusal({ statusCode: 403, publicMessage: 'GraphQL reason.' }), {
            response: { status: 422, data: { publicMessage: 'HTTP reason.' } },
        })
        assert.equal(_processServerError(error, { locale: 'no' }), 'HTTP reason.')
    })
})
