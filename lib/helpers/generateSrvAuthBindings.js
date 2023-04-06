//import axios, { type AxiosResponse, type ResponseType } from 'axios'
import { EventBus } from 'asma-event-bus/lib/event-buss';
import { EnvironmentEnums } from '../interfaces/enums';
import { setTheme } from './checkForRegisteredSubdomains';
import { EnvConfigsFnInternal } from './generateEnvConfigsBindings';
import { parseJwt } from './parseJwt';
//let logoutsuccesfull = false
/* @__PURE__ */
export const { dispatch: dispatchSrvAuthEvents, register: registerCallbackOnSrvAuthEvents } = EventBus('auth-bindings');
function dispatchLogoutEvent() {
    dispatchSrvAuthEvents('logout_event', {}, false);
}
function dispatchJwtChangedEvent() {
    dispatchSrvAuthEvents('jwt_changed', {}, false);
}
/**
 * @generic FeatureEnums - feature_names_enums from asma-genql-directory
 * @generic SrvUrlsEnums - srv_names_enums from asma-genql-directory
 */
//type EnvConfigsFn = () => { SRV_AUTH: string; DEVELOPMENT: boolean; ENVIRONMENT_TO_OPERATE: string }
/* @__PURE__ */
export async function getCachedJwtInternal() {
    var _a, _b;
    const getCachedJwt = (_b = (_a = window.__ASMA__SHELL__) === null || _a === void 0 ? void 0 : _a.auth_bindings) === null || _b === void 0 ? void 0 : _b.getCachedJwt;
    if (!getCachedJwt) {
        throw new Error('getCachedJwt is not defined! please make sure that generateSrvAuthBindings is called before getCachedJwt');
    }
    return getCachedJwt();
}
/* @__PURE__ */
export function isJwtValidInternal() {
    var _a, _b;
    const isJwtValid = (_b = (_a = window.__ASMA__SHELL__) === null || _a === void 0 ? void 0 : _a.auth_bindings) === null || _b === void 0 ? void 0 : _b.isJwtValid;
    if (!isJwtValid) {
        throw new Error('srvAuthGet is not defined! please make sure that generateSrvAuthBindings is called before srvAuthGet');
    }
    return isJwtValid();
}
/* @__PURE__ */
export async function srvAuthGetInternal(url, headers) {
    var _a, _b;
    const srvAuthGet = (_b = (_a = window.__ASMA__SHELL__) === null || _a === void 0 ? void 0 : _a.auth_bindings) === null || _b === void 0 ? void 0 : _b.srvAuthGet;
    if (!srvAuthGet) {
        throw new Error('srvAuthGet is not defined! please make sure that generateSrvAuthBindings is called before srvAuthGet');
    }
    return srvAuthGet(url, headers);
}
/* @__PURE__ */
export function getSrvUrlsInternal() {
    var _a, _b;
    const getSrvUrls = (_b = (_a = window.__ASMA__SHELL__) === null || _a === void 0 ? void 0 : _a.auth_bindings) === null || _b === void 0 ? void 0 : _b.getSrvUrls;
    if (!getSrvUrls) {
        throw new Error('getSrvUrls is not defined! please make sure that generateSrvAuthBindings is called before getSrvUrls');
    }
    return getSrvUrls();
}
/* @__PURE__ */
export async function setReqConfigInternal(data, responseType) {
    var _a, _b;
    const setReqConfig = (_b = (_a = window.__ASMA__SHELL__) === null || _a === void 0 ? void 0 : _a.auth_bindings) === null || _b === void 0 ? void 0 : _b.setReqConfig;
    if (!setReqConfig) {
        throw new Error('setReqConfig is not defined! please make sure that generateSrvAuthBindings is called before setReqConfig');
    }
    return setReqConfig(data, responseType);
}
/* @__PURE__ */
export function generateSrvAuthBindings(
//SRV_AUTH: () => string,
//DEVELOPMENT: () => boolean,
//EnvironmentToOperateFn: () => string,
//EnvConfigsFn: EnvConfigsFn,
logout) {
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
    let srv_urls;
    const isJwtInvalid = () => (jwtToken && accessTokenHasExpired()) || !jwtToken;
    const isJwtValid = () => !isJwtInvalid();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const promiseRegistry = {};
    async function srvAuthGet(url, headers) {
        if (EnvConfigsFnInternal().DEVELOPMENT && EnvConfigsFnInternal().ENVIRONMENT_TO_OPERATE) {
            if (EnvConfigsFnInternal().ENVIRONMENT_TO_OPERATE in EnvironmentEnums) {
                url = `${url}&env=${EnvConfigsFnInternal().ENVIRONMENT_TO_OPERATE}`;
                // file deepcode ignore GlobalReplacementRegex: <it is intended to be replaced only first occurence>
                url = url.includes('&') && !url.includes('?') ? url.replace('&', '?') : url;
            }
            else {
                console.warn('EnvironmentToOperateFn() is not a valid EnvironmentEnums', 'shall be one of:', EnvironmentEnums, 'actual value:', EnvConfigsFnInternal().ENVIRONMENT_TO_OPERATE);
            }
        }
        if (!promiseRegistry[url]) {
            promiseRegistry[url] = fetch(`${EnvConfigsFnInternal().SRV_AUTH}${url}`, {
                headers: {
                    ...headers,
                    'asma-origin': window.location.origin,
                },
                credentials: 'include',
                //withCredentials: true,
            });
        }
        const res = await promiseRegistry[url].finally(() => {
            delete promiseRegistry[url];
        });
        const json = await res.clone().json();
        if (!(res === null || res === void 0 ? void 0 : res.ok)) {
            let error = json;
            if (!json) {
                error = await res.clone().text();
            }
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
            srv_urls = data.srv_urls;
            dispatchJwtChangedEvent();
            data.theme && setTheme(data.theme);
            return;
        }
        jwtToken = '';
        parsed_jwt = undefined;
        features = undefined;
        srv_urls = undefined;
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
            console.warn(error);
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
    function getSrvUrls() {
        return srv_urls;
    }
    /**
     *
     * @param featureName feature_name_enums add this: generateSrvAuthBindings<feature_name_enums.>(...)
     * @returns boolean
     */
    function hasFeature(featureName) {
        let hasFeature = false;
        const asmaFeaturesIgnoreList = localStorage.getItem('asma-features-ignore-list');
        const asmaDebug = localStorage.getItem('asma-debug') === 'true';
        const hasFeatureCheck = !!(features === null || features === void 0 ? void 0 : features.has(featureName));
        if (EnvConfigsFnInternal().DEVELOPMENT && asmaDebug && asmaFeaturesIgnoreList) {
            let asmaEnableAllFeatures;
            try {
                asmaEnableAllFeatures = JSON.parse(asmaFeaturesIgnoreList);
            }
            catch (e) {
                console.error(e);
            }
            if (Array.isArray(asmaEnableAllFeatures) && !asmaEnableAllFeatures.includes(featureName)) {
                hasFeature = true;
            }
            else {
                hasFeature = hasFeatureCheck;
            }
        }
        else {
            hasFeature = hasFeatureCheck;
        }
        return hasFeature;
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
        getSrvUrls,
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
/* @__PURE__ */
export function generateSrvAuthBindingsMicroApp(
//SRV_AUTH: () => string,
//DEVELOPMENT: () => boolean,
//ENVIRONMENT_TO_OPERATE: () => EnvironmentEnums,
//EnvConfigsFn: EnvConfigsFn,
logout) {
    var _a;
    return (((_a = window.__ASMA__SHELL__) === null || _a === void 0 ? void 0 : _a.auth_bindings) ||
        generateSrvAuthBindings(/* SRV_AUTH, DEVELOPMENT, ENVIRONMENT_TO_OPERATE, */ /* EnvConfigsFn, */ logout));
}
//# sourceMappingURL=generateSrvAuthBindings.js.map