import { httpToWs } from './Config';
export function generateGenqlClient({ setReqConfig, createClient, serviceUrl, path = '/v1/graphql', }) {
    // let jwt_exp = 0
    let client = null;
    let wsClient = null;
    //function accessTokenHasExpired() {
    //    const nowTime = Math.floor(new Date().getTime() / 1000)
    //
    //    //set exp time -20sec for token to be refreshed early
    //    return jwt_exp - 10 <= nowTime
    //}
    async function getGenqlClient() {
        if ( /* accessTokenHasExpired() || */client === null) {
            client = await genqlClient();
            return client;
        }
        return client;
    }
    //function resetGenqlClient() {
    //    client = null
    //}
    // function setJwtExp(token?: string) {
    //     if (!token) return
    //
    //     const parsed_jwt = parseJwt<{ exp: number }>(token)?.exp
    //
    //     jwt_exp = parsed_jwt || 0
    // }
    /**
     *
     * This is used for anonymous requests as well as authenticated requests
     *
     */
    async function genqlClient(options = {}) {
        //let req_headers: Record<string, string> = {}
        const { anonymous, headers, ...rest } = options;
        if (!serviceUrl()) {
            console.warn('requred param srv_url is undefined, please check EnvConfig object!');
        }
        //if (!anonymous) {
        //req_headers = ((await setReqConfig()).headers ?? {}) as Record<string, string>
        // setJwtExp(req_headers['Authorization'])
        // }
        return createClient({
            url: `${serviceUrl()}${path}`,
            headers: async () => {
                var _a;
                return ({
                    ...(options.anonymous ? {} : ((_a = (await setReqConfig()).headers) !== null && _a !== void 0 ? _a : {})),
                    ...headers,
                });
            },
            batch: { batchInterval: 50, maxBatchSize: 100 },
            ...rest,
        });
    }
    async function genqlClientWs() {
        if ( /* accessTokenHasExpired() || */!wsClient) {
            //const req_headers = ((await setReqConfig()).headers ?? {}) as Record<string, string>
            //setJwtExp(req_headers['Authorization'])
            wsClient = createClient({
                url: `${httpToWs(serviceUrl())}${path}`,
                cache: 'reload',
                batch: { batchInterval: 50, maxBatchSize: 100 },
                subscription: {
                    reconnect: true,
                    reconnectionAttempts: 5,
                    headers: async () => { var _a; return ((_a = (await setReqConfig()).headers) !== null && _a !== void 0 ? _a : {}); },
                },
            });
        }
        return wsClient;
    }
    return { getGenqlClient, /* resetGenqlClient, */ genqlClient, genqlClientWs };
}
//# sourceMappingURL=generateGenqlClient.js.map