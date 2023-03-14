//import type { AxiosRequestConfig } from 'axios'
import type { createClient } from '@genql/runtime'
import type { ClientOptions } from '@genql/runtime'
import { httpToWs } from './Config'
import { registerCallbackOnSrvAuthEvents, setReqConfigInternal } from './generateSrvAuthBindings'
//import { parseJwt } from '../helpers/parseJwt'

interface CliOptions extends Omit<ClientOptions, 'url' | 'signal'> {
    anonymous?: boolean
}

export function generateGenqlClient<T extends ReturnType<typeof createClient>>({
    //setReqConfig,
    createClient,
    serviceUrl,
    path = '/v1/graphql',
}: {
    //setReqConfig: () => Promise<AxiosRequestConfig<any>>
    createClient: (options?: ClientOptions | undefined) => T
    serviceUrl: () => string
    path?: string
}) {
    let client: T | null = null

    let wsClient: T | null = null

    let local_abortController_registry: AbortController[] = []

    registerCallbackOnSrvAuthEvents('logout_event', () => {
        local_abortController_registry.forEach((ac) => ac.abort())

        resetClients()
    })

    function resetClients() {
        client = null

        wsClient = null

        local_abortController_registry = []
    }

    //registerCallbackOnSrvAuthEvents('logout_event', resetClients)

    async function getGenqlClient() {
        if (client === null) {
            client = await genqlClient()

            return client
        }

        return client
    }

    function resetGenqlClient() {
        client = null

        wsClient = null
    }

    async function genqlClient(options: CliOptions & { abortController?: AbortController } = {}): Promise<T> {
        const { headers, abortController: abortControlleFromOpts, ...rest } = options

        if (!serviceUrl()) {
            throw Error('requred param srv_url is undefined, please check EnvConfig object!')
        }

        const abortControllerlocal = createabortControllerAndAbortOnLogoutEvent(abortControlleFromOpts)

        return createClient({
            url: `${serviceUrl()}${path}`,
            headers: async () => ({
                ...(options.anonymous
                    ? {}
                    : (((await setReqConfigInternal()).headers ?? {}) as Record<string, string>)),
                ...headers,
            }),
            signal: abortControllerlocal.signal,
            batch: { batchInterval: 50, maxBatchSize: 100 },
            ...rest,
        })
    }

    async function genqlClientWs() {
        if (!wsClient) {
            const aborControllerLocal = createabortControllerAndAbortOnLogoutEvent()

            wsClient = createClient({
                url: `${httpToWs(serviceUrl())}${path}`,
                cache: 'reload',
                batch: { batchInterval: 50, maxBatchSize: 100 },
                signal: aborControllerLocal.signal,
                subscription: {
                    reconnect: true,
                    reconnectionAttempts: 5,
                    headers: async () => ((await setReqConfigInternal()).headers ?? {}) as Record<string, string>,
                },
            })
        }

        return wsClient
    }

    function createabortControllerAndAbortOnLogoutEvent(abortControllerFromFnSig?: AbortController) {
        const localAbrotController = abortControllerFromFnSig || new AbortController()

        local_abortController_registry.push(localAbrotController)

        return localAbrotController
    }

    return { getGenqlClient, resetGenqlClient, genqlClient, genqlClientWs }
}
