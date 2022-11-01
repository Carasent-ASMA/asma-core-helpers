import type { AxiosRequestConfig } from 'axios'
import type { ClientOptions } from '@genql/runtime'

export function generateGenqlClient<T>({
    accessTokenHasExpired,
    setReqConfig,
    createClient,
    serviceUrl,
    serviceUrlWs,
    path = '/v1/graphql',
}: {
    accessTokenHasExpired: () => boolean
    setReqConfig: () => Promise<AxiosRequestConfig<any>>
    createClient: (options?: ClientOptions | undefined) => T
    serviceUrl: () => string | undefined
    serviceUrlWs: () => string | undefined
    path?: string
}) {
    let client: T | null = null
    let wsClient: T | null = null

    async function getGenqlClient() {
        if (accessTokenHasExpired() || client === null) {
            client = await genqlClient()

            return client
        }

        return client
    }

    function resetGenqlClient() {
        client = null
    }

    async function genqlClient(
        anonymous: boolean | undefined = undefined,
        headers: Record<string, string> = {},
    ): Promise<T> {
        let req_headers: Record<string, string> = {}
        if (!serviceUrl()) {
            console.warn('requred param srv_url is undefined, please check EnvConfig object!')
        }
        if (!anonymous) {
            req_headers = ((await setReqConfig()).headers ?? {}) as Record<string, string>
        }

        return createClient({
            url: `${serviceUrl()}${path}`,
            headers: {
                ...req_headers,
                ...headers,
            },
            batch: { batchInterval: 50, maxBatchSize: 100 },
        })
    }

    async function genqlClientWs() {
        const req_headers = ((await setReqConfig()).headers ?? {}) as Record<string, string>

        if (accessTokenHasExpired() || !wsClient) {
            wsClient = createClient({
                url: `${serviceUrlWs()}${path}`,
                cache: 'reload',
                subscription: {
                    timeout: 1,
                    reconnect: true,
                    reconnectionAttempts: 5,
                    headers: {
                        ...req_headers,
                    },
                },
            })
        }

        return wsClient
    }

    return { getGenGqlClient: getGenqlClient, resetGenqlClient, genqlClient, genqlClientWs }
}
