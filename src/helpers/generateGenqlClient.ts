import type { AxiosRequestConfig } from 'axios'
import type { ClientOptions, createClient } from '@genql/runtime'
import { httpToWs } from './Config'
import { registerCallbackOnSrvAuthEvents } from './generateSrvAuthBindings'
//import { parseJwt } from '../helpers/parseJwt'

interface CliOptions extends Omit<ClientOptions, 'url'> {
    anonymous?: boolean
}

export function generateGenqlClient<T extends ReturnType<typeof createClient>>({
    setReqConfig,
    createClient,
    serviceUrl,
    path = '/v1/graphql',
}: {
    // jwt_exp: number
    setReqConfig: () => Promise<AxiosRequestConfig<any>>
    createClient: (options?: ClientOptions | undefined) => T
    serviceUrl: () => string
    /**
     * Returns true whenether token and refresh token is epired! this helps to cancel all concurent requests after first request is invalidated.
     * @returns true if request should be cancelled
     */
    path?: string
}) {

    let client: T | null = null

    let wsClient: T | null = null

    function resetClients() {
        client = null
        wsClient = null
    }

    registerCallbackOnSrvAuthEvents('jwt_changed', resetClients)

   
    async function getGenqlClient() {
        if ( client === null) {
            client = await genqlClient()

            return client
        }

        return client
    }

    function resetGenqlClient() {
        client = null
        wsClient = null
    }

    
    async function genqlClient(options: CliOptions&{abortController?:AbortController} = {}): Promise<T> {

        const { anonymous, headers, abortController, ...rest } = options

        if (!serviceUrl()) {
            console.warn('requred param srv_url is undefined, please check EnvConfig object!')
        }
       
        const localAbrotController = createabortControllerAndAbortOnLogoutEvent(abortController)

        return createClient({
            url: `${serviceUrl()}${path}`,
            headers: async () => ({
                ...(options.anonymous ? {} : (((await setReqConfig()).headers ?? {}) as Record<string, string>)),
                ...headers,
            }),
            signal: localAbrotController.signal,
            batch: { batchInterval: 50, maxBatchSize: 100 },
            ...rest,
        })
    }

    async function genqlClientWs() {
        if ( !wsClient) {
           
        const localAbrotController= createabortControllerAndAbortOnLogoutEvent()


            wsClient = createClient({
                url: `${httpToWs(serviceUrl())}${path}`,
                cache: 'reload',
                batch: { batchInterval: 50, maxBatchSize: 100 },
                signal: localAbrotController.signal,
                subscription: {
                    reconnect: true,
                    reconnectionAttempts: 5,
                    headers: async () => ((await setReqConfig()).headers ?? {}) as Record<string, string>,
                },
            })
        }

        return wsClient
    }

    function createabortControllerAndAbortOnLogoutEvent(abortController?:AbortController){
        let localAbrotController = abortController || new AbortController()
            
        const {unregister} = registerCallbackOnSrvAuthEvents('logout_event',()=>{
            localAbrotController?.abort()
            
            resetClients()
            
            unregister()
        })
    
        return localAbrotController
    }

    return { getGenqlClient, resetGenqlClient, genqlClient, genqlClientWs }
}



