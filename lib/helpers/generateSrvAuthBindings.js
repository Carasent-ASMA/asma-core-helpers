//import axios, { type AxiosResponse, type ResponseType } from 'axios'
import { EventBus } from 'asma-event-bus/lib/event-buss';
import { EnvironmentEnums } from '../interfaces/enums';
import { setTheme } from './checkForRegisteredSubdomains';
import { parseJwt } from './parseJwt';
//let logoutsuccesfull = false
export const { dispatch: dispatchSrvAuthEvents, register: registerCallbackOnSrvAuthEvents } = EventBus('auth-bindings');
function dispatchLogoutEvent() {
    dispatchSrvAuthEvents('logout_event', {}, false);
}
function dispatchJwtChangedEvent() {
    dispatchSrvAuthEvents('jwt_changed', {}, false);
}
export function generateSrvAuthBindings(SRV_AUTH, DEVELOPMENT, EnvironmentToOperateFn, logout) {
    var _a;
    if (logout) {
        registerCallbackOnSrvAuthEvents('logout_event', logout);
    }
    if ((_a = window.__ASMA__SHELL__) === null || _a === void 0 ? void 0 : _a.auth_bindings) {
        return window.__ASMA__SHELL__.auth_bindings;
    }
    let jwtToken = '';
    let features;
    let connector;
    let parsed_jwt;
    const isJwtInvalid = () => (jwtToken && accessTokenHasExpired()) || !jwtToken;
    const isJwtValid = () => !isJwtInvalid();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const promiseRegistry = {};
    async function srvAuthGet(url, headers) {
        if (DEVELOPMENT() && EnvironmentToOperateFn()) {
            if (EnvironmentToOperateFn() in EnvironmentEnums) {
                url = `${url}&env=${EnvironmentToOperateFn()}`;
                // file deepcode ignore GlobalReplacementRegex: <it is intended to be replaced only first occurence>
                url = url.includes('&') && !url.includes('?') ? url.replace('&', '?') : url;
            }
            else {
                console.warn('EnvironmentToOperateFn() is not a valid EnvironmentEnums', 'shall be one of:', EnvironmentEnums, 'actual value:', EnvironmentToOperateFn());
            }
        }
        const promise = promiseRegistry[url] ||
            fetch(`${SRV_AUTH()}${url}`, {
                headers: {
                    ...headers,
                    'asma-origin': window.location.origin,
                },
                credentials: 'include',
                //withCredentials: true,
            });
        if (!promiseRegistry[url]) {
            promiseRegistry[url] = promise;
        }
        const res = await promise.finally(() => {
            delete promiseRegistry[url];
        });
        const json = await res.json();
        if (!res.ok) {
            const error = json || (await res.text());
            throw error;
        }
        return json;
    }
    function accessTokenHasExpired() {
        const tokenObj = getParsedJwt();
        const accessTokenExpDate = (tokenObj === null || tokenObj === void 0 ? void 0 : tokenObj.exp) || 0;
        const nowTime = Math.floor(new Date().getTime() / 1000);
        return accessTokenExpDate - 10 <= nowTime;
    }
    /**
     *
     * TODO: need to investigate smarter way of registerning and unregistering on `logout_event`
     **/
    registerCallbackOnSrvAuthEvents('logout_event', () => {
        setAuthData({ token: '' });
        srvAuthGet('/signout');
    });
    async function signin(url, headers) {
        const data = await srvAuthGet(url, headers);
        setAuthData(data);
        return data;
    }
    function getUserId() {
        var _a;
        return ((_a = getParsedJwt()) === null || _a === void 0 ? void 0 : _a['user_id']) || '-1';
    }
    function setAuthData(data) {
        if (data === null || data === void 0 ? void 0 : data.token) {
            jwtToken = data === null || data === void 0 ? void 0 : data.token;
            features = new Set(data.features);
            connector = data.connector;
            parsed_jwt = parseJwt(jwtToken);
            dispatchJwtChangedEvent();
            data.theme && setTheme(data.theme);
            return;
        }
        jwtToken = '';
        parsed_jwt = undefined;
        features = undefined;
        connector = undefined;
    }
    function getJwtToken() {
        return jwtToken;
    }
    async function getCachedJwt() {
        if (isJwtInvalid()) {
            const new_jwt = await getNewJwtToken();
            return new_jwt;
        }
        else {
            return jwtToken;
        }
    }
    async function setReqConfig(data, responseType) {
        const token = await getCachedJwt();
        const res = {
            data: data,
            responseType: responseType,
            headers: {},
        };
        if (token) {
            res.headers['Authorization'] = `Bearer ${token}`;
        }
        return res;
    }
    async function getNewJwtToken() {
        try {
            /*  if (!fetchJwtPromise) {
                fetchJwtPromise = srvAuthGet('/token')
            } */
            const data = await srvAuthGet('/token');
            if (!data || (data === null || data === void 0 ? void 0 : data.errors) || !data.token) {
                dispatchLogoutEvent();
                return;
            }
            setAuthData(data);
            return jwtToken;
        }
        catch (error) {
            dispatchLogoutEvent();
            console.error(error);
            return jwtToken;
        }
    }
    function getParsedJwt() {
        if (!parsed_jwt) {
            parsed_jwt = parseJwt(jwtToken);
        }
        return parsed_jwt;
    }
    function getFeatures() {
        return features;
    }
    /**
     *
     * @param featureName feature_name_enums add this: generateSrvAuthBindings<feature_name_enums.>(...)
     * @returns boolean
     */
    function hasFeature(featureName) {
        return !!(features === null || features === void 0 ? void 0 : features.has(featureName));
    }
    function getConnector() {
        return connector;
    }
    const auth_bindings = {
        hasFeature,
        getConnector,
        getFeatures,
        isJwtValid,
        signin,
        srvAuthGet,
        /**
         * @deprecated use dispatchLogoutEvent directly
         */
        signoutAuth: dispatchLogoutEvent,
        dispatchLogoutEvent,
        setReqConfig,
        /**
         * @deprecated use getCachedJwt
         *  */
        getJwtTokenAsync: getCachedJwt,
        getCachedJwt,
        getNewJwtToken,
        /**
         * @deprecated use registerCallbackOnSrvAuthEvents directly
         */
        registerOnJwtChanges: registerCallbackOnSrvAuthEvents,
        getUserId,
        getParsedJwt,
        getJwtToken,
        // cancelRequest,
        accessTokenHasExpired,
    };
    window.__ASMA__SHELL__ = window.__ASMA__SHELL__ || {};
    window.__ASMA__SHELL__.auth_bindings = auth_bindings;
    return auth_bindings;
}
/**
 * @deprecated use generateSrvAuthBindings
 *
 */
export function generateSrvAuthBindingsMicroApp(SRV_AUTH, DEVELOPMENT, ENVIRONMENT_TO_OPERATE, logout) {
    var _a;
    return (((_a = window.__ASMA__SHELL__) === null || _a === void 0 ? void 0 : _a.auth_bindings) ||
        generateSrvAuthBindings(SRV_AUTH, DEVELOPMENT, ENVIRONMENT_TO_OPERATE, logout));
}
//# sourceMappingURL=generateSrvAuthBindings.js.map