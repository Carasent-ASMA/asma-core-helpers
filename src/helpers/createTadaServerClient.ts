import { createClient, fetchExchange, type Client } from '@urql/core'

export interface CreateTadaServerClientOptions {
    url: string
    jwt: string
    fetch?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
}

export function createTadaServerClient({ url, jwt, fetch }: CreateTadaServerClientOptions): Client {
    if (!jwt) {
        throw new TypeError('A request JWT is required.')
    }

    return createClient({
        url,
        fetch,
        fetchOptions: {
            headers: {
                Authorization: `Bearer ${jwt}`,
            },
        },
        exchanges: [fetchExchange],
        preferGetMethod: false,
        requestPolicy: 'network-only',
    })
}
