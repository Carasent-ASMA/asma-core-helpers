import assert from 'node:assert/strict'
import { test } from 'node:test'

import { parse } from '@0no-co/graphql.web'

import { createTadaBrowserClient } from './createTadaBrowserClient.js'

const createClient = async (fetchImpl: typeof fetch) => {
    let fetchCalls = 0
    let getJwtCalls = 0

    const { getClient } = createTadaBrowserClient({
        url: 'https://tada.example/v1/graphql',
        getJwt: async () => {
            getJwtCalls += 1
            return 'jwt'
        },
        getJwtToken: () => 'jwt',
        isJwtValid: () => true,
        clientOptions: {
            fetch: async (input, init) => {
                fetchCalls += 1
                return fetchImpl(input, init)
            },
        },
    })

    return {
        client: await getClient(),
        calls: {
            fetch: () => fetchCalls,
            getJwt: () => getJwtCalls,
        },
    }
}

test(
    'surfaces a response-less network error instead of throwing in didAuthError',
    { timeout: 2000 },
    async () => {
        const { client, calls } = await createClient(async () => {
            throw new TypeError('Failed to fetch')
        })

        const result = await client
            .mutation(parse('mutation BrowserClientNetworkErrorTest { __typename }'), {})
            .toPromise()

        assert.equal(result.error?.networkError?.message, 'Failed to fetch')
        assert.equal(result.error?.response, undefined)
        assert.equal(calls.fetch(), 1)
        assert.equal(calls.getJwt(), 1)
    },
)

test('refreshes the JWT and retries once after a 401 response', async () => {
    const { client, calls } = await createClient(async () =>
        Response.json({ errors: [{ message: 'unauthorized' }] }, { status: 401 }),
    )

    const result = await client
        .mutation(parse('mutation BrowserClientUnauthorizedTest { __typename }'), {})
        .toPromise()

    assert.equal(result.error?.response?.status, 401)
    assert.equal(calls.fetch(), 2)
    assert.equal(calls.getJwt(), 2)
})

test('does not refresh the JWT for a GraphQL error with a response', async () => {
    const { client, calls } = await createClient(async () =>
        Response.json({ data: null, errors: [{ message: 'x' }] }),
    )

    const result = await client
        .mutation(parse('mutation BrowserClientGraphQLErrorTest { __typename }'), {})
        .toPromise()

    assert.equal(result.error?.graphQLErrors.length, 1)
    assert.equal(calls.fetch(), 1)
    assert.equal(calls.getJwt(), 1)
})
