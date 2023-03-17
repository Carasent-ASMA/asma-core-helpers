import { httpToWs } from './Config';
import { EnvConfigsFnInternal,
//IKeyEnvironmentUrls,
//IKeyEnvironmentUrlsOmit,
 } from './generateEnvConfigsBindings';
import { getSrvUrlsInternal, registerCallbackOnSrvAuthEvents, setReqConfigInternal } from './generateSrvAuthBindings';
/* @__PURE__ */
export function generateGenqlClient({ 
//setReqConfig,
createClient, service, 
//serviceUrl,
path = '/v1/graphql', }) {
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
    function serviceUrlFn() {
        var _a, _b;
        let service_url = EnvConfigsFnInternal()[service];
        if ('SRV_AO_WRAPPER' === service) {
            const url = (_a = getSrvUrlsInternal()) === null || _a === void 0 ? void 0 : _a.ao_wrapper;
            if (url) {
                service_url = url;
            }
        }
        else if (service === 'SRV_CONNECTOR') {
            const url = (_b = getSrvUrlsInternal()) === null || _b === void 0 ? void 0 : _b.connector;
            if (url) {
                service_url = url;
            }
        }
        if (!service_url) {
            const message = `'requred param serviceUrl() is undefined, please check EnvConfig object!', service: ${service}`;
            throw Error(message);
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
            url: `${serviceUrlFn()}${path}`,
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
                url: `${httpToWs(serviceUrlFn())}${path}`,
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