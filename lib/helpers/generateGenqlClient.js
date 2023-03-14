import { httpToWs } from './Config';
import { EnvConfigsFnInternal } from './generateEnvConfigsBindings';
import { registerCallbackOnSrvAuthEvents, setReqConfigInternal } from './generateSrvAuthBindings';
export function generateGenqlClient({ 
//setReqConfig,
createClient, service, path = '/v1/graphql', }) {
    let client = null;
    let wsClient = null;
    let local_abortController_registry = [];
    registerCallbackOnSrvAuthEvents('logout_event', () => {
        local_abortController_registry.forEach((ac) => ac.abort());
        resetClients();
    });
    function resetClients() {
        client = null;
        wsClient = null;
        local_abortController_registry = [];
    }
    //registerCallbackOnSrvAuthEvents('logout_event', resetClients)
    async function getGenqlClient() {
        if (client === null) {
            client = await genqlClient();
            return client;
        }
        return client;
    }
    function resetGenqlClient() {
        client = null;
        wsClient = null;
    }
    function serviceUrl() {
        const service_url = EnvConfigsFnInternal()[service];
        if (!service_url) {
            console.error('requred param serviceUrl() is undefined, please check EnvConfig object!', service);
        }
        return service_url;
    }
    async function genqlClient(options = {}) {
        const { headers, abortController: abortControlleFromOpts, ...rest } = options;
        /*  if (!serviceUrl()) {
             throw Error('requred param srv_url is undefined, please check EnvConfig object!')
         } */
        const abortControllerlocal = createabortControllerAndAbortOnLogoutEvent(abortControlleFromOpts);
        return createClient({
            url: `${serviceUrl()}${path}`,
            headers: async () => {
                var _a;
                return ({
                    ...(options.anonymous
                        ? {}
                        : ((_a = (await setReqConfigInternal()).headers) !== null && _a !== void 0 ? _a : {})),
                    ...headers,
                });
            },
            signal: abortControllerlocal.signal,
            batch: { batchInterval: 50, maxBatchSize: 100 },
            ...rest,
        });
    }
    async function genqlClientWs() {
        if (!wsClient) {
            const aborControllerLocal = createabortControllerAndAbortOnLogoutEvent();
            wsClient = createClient({
                url: `${httpToWs(serviceUrl())}${path}`,
                cache: 'reload',
                batch: { batchInterval: 50, maxBatchSize: 100 },
                signal: aborControllerLocal.signal,
                subscription: {
                    reconnect: true,
                    reconnectionAttempts: 5,
                    headers: async () => { var _a; return ((_a = (await setReqConfigInternal()).headers) !== null && _a !== void 0 ? _a : {}); },
                },
            });
        }
        return wsClient;
    }
    function createabortControllerAndAbortOnLogoutEvent(abortControllerFromFnSig) {
        const localAbrotController = abortControllerFromFnSig || new AbortController();
        local_abortController_registry.push(localAbrotController);
        return localAbrotController;
    }
    return { getGenqlClient, resetGenqlClient, genqlClient, genqlClientWs };
}
//# sourceMappingURL=generateGenqlClient.js.map