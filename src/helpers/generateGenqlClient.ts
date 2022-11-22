import type { AxiosRequestConfig } from 'axios'
import type { ClientOptions } from '@genql/runtime'
import { httpToWs } from './Config'

interface CliOptions extends Omit<ClientOptions, 'url'> {
    anonymous?: boolean
}

export function generateGenqlClient<T>({
    accessTokenHasExpired,
    setReqConfig,
    createClient,
    serviceUrl,
    path = '/v1/graphql',
}: {
    accessTokenHasExpired: () => boolean
    setReqConfig: () => Promise<AxiosRequestConfig<any>>
    createClient: (options?: ClientOptions | undefined) => T
    serviceUrl: () => string
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

    async function genqlClient(options: CliOptions = {}): Promise<T> {
        let req_headers: Record<string, string> = {}

        const { anonymous, headers, ...rest } = options

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
            ...rest,
        })
    }

    async function genqlClientWs() {
        const req_headers = ((await setReqConfig()).headers ?? {}) as Record<string, string>

        if (accessTokenHasExpired() || !wsClient) {
            wsClient = createClient({
                url: `${httpToWs(serviceUrl())}${path}`,
                cache: 'reload',
                batch: { batchInterval: 50, maxBatchSize: 100 },
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

    return { getGenqlClient, resetGenqlClient, genqlClient, genqlClientWs }
}
