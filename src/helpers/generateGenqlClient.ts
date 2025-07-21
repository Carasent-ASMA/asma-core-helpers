import type { createClient } from '@genql/runtime'
import type { ClientOptions } from '@genql/runtime'
import { httpToWs } from './Config.js'
import {
    EnvConfigsFnInternal,
    type IEnvironmentUrlsGenQLOnly,
    //IKeyEnvironmentUrls,
    //IKeyEnvironmentUrlsOmit,
} from './generateEnvConfigsBindings.js'
import { getSrvUrlsInternal, registerCallbackOnSrvAuthEvents, setReqConfigInternal } from './generateSrvAuthBindings.js'
//import { parseJwt } from '../helpers/parseJwt'

interface CliOptions extends Omit<ClientOptions, 'url' | 'signal'> {
    anonymous?: boolean
}

export function generateGenqlClient<T extends ReturnType<typeof createClient>>({
    setReqConfig,
    createClient,
    service,
    //serviceUrl,
    path = '/v1/graphql',
}: {
    setReqConfig?: () => Promise<{ headers: Record<string, string> }>
    createClient: (options?: ClientOptions | undefined) => T
    //serviceUrl?: () => string
    service: keyof IEnvironmentUrlsGenQLOnly
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
    function serviceUrlFn() {
        let service_url = EnvConfigsFnInternal()[service]

        if ('SRV_AO_WRAPPER' === service) {
            const url = getSrvUrlsInternal()?.ao_wrapper

            if (url) {
                service_url = url
            }
        } else if (service === 'SRV_CONNECTOR') {
            const url = getSrvUrlsInternal()?.connector
            if (url) {
                service_url = url
            }
        }

        if (!service_url) {
            const message = `'required param serviceUrl() is undefined, please check EnvConfig object!', service: ${service}`
            throw Error(message)
        }
        return service_url
    }
    const reqConf = setReqConfig || setReqConfigInternal

    async function genqlClient(options: CliOptions & { abortController?: AbortController } = {}): Promise<T> {
        const { headers, abortController: abortControllerFromOpts, ...rest } = options

        /*  if (!serviceUrl()) {
            throw Error('required param srv_url is undefined, please check EnvConfig object!')
        } */

        const abortControllerLocal = createAbortControllerAndAbortOnLogoutEvent(abortControllerFromOpts)

        const serviceUrlWithPath = serviceUrlFn() + path

        const url =
            service === 'SRV_AO_WRAPPER' || service === 'SRV_CONNECTOR'
                ? serviceUrlWithPath
                : window.origin + serviceUrlWithPath

        return createClient({
            url,
            headers: async () => ({
                ...(options.anonymous ? {} : (((await reqConf()).headers ?? {}) as Record<string, string>)),
                ...headers,
            }),

            signal: abortControllerLocal.signal,
            batch: { batchInterval: 50, maxBatchSize: 100 },
            ...rest,
        })
    }

    async function genqlClientWs() {
        if (!wsClient) {
            const aborControllerLocal = createAbortControllerAndAbortOnLogoutEvent()

            wsClient = createClient({
                url: `${httpToWs(serviceUrlFn())}${path}`,
                cache: 'reload',
                batch: { batchInterval: 50, maxBatchSize: 100 },
                signal: aborControllerLocal.signal,
                subscription: {
                    reconnect: true,
                    reconnectionAttempts: 5,
                    headers: async () => ((await reqConf()).headers ?? {}) as Record<string, string>,
                },
            })
        }

        return wsClient
    }

    function createAbortControllerAndAbortOnLogoutEvent(abortControllerFromFnSig?: AbortController) {
        const localAbrotController = abortControllerFromFnSig || new AbortController()

        local_abortController_registry.push(localAbrotController)

        return localAbrotController
    }

    return { getGenqlClient, resetGenqlClient, genqlClient, genqlClientWs }
}
