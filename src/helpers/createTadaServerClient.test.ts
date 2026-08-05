import assert from 'node:assert/strict'
import { test } from 'node:test'

import { parse } from '@0no-co/graphql.web'

import { createTadaServerClient } from './createTadaServerClient.js'

test('forwards the exact request JWT to the upstream GraphQL service', async () => {
    let authorizationHeader: string | null = null
    const client = createTadaServerClient({
        url: 'https://wrapper.example/v1/graphql',
        jwt: 'request-jwt',
        fetch: async (_input, init) => {
            authorizationHeader = new Headers(init?.headers).get('authorization')
            return Response.json({ data: { __typename: 'Query' } })
        },
    })

    const result = await client.query(parse('query ServerClientTest { __typename }'), {}).toPromise()

    assert.equal(result.error, undefined)
    assert.equal(authorizationHeader, 'Bearer request-jwt')
})
