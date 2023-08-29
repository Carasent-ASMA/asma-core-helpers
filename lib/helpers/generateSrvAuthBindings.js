import { EventBus } from 'asma-event-bus/lib/event-buss';
import { EnvironmentEnums } from '../interfaces/enums';
import { setTheme } from './checkForRegisteredSubdomains';
import { EnvConfigsFnInternal } from './generateEnvConfigsBindings';
import { parseJwt } from './parseJwt';
import { asmaOverridesEventBus } from 'asma-event-bus/lib';
//let logoutSuccessful = false
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
    const getCachedJwt = window.__ASMA__SHELL__?.auth_bindings?.getCachedJwt;
    if (!getCachedJwt) {
        throw new Error('getCachedJwt is not defined! please make sure that generateSrvAuthBindings is called before getCachedJwt');
    }
    return getCachedJwt();
}
export function getConnectorInternal() {
    const getConnector = window.__ASMA__SHELL__?.auth_bindings?.getConnector;
    if (!getConnector) {
        throw new Error('getCachedJwt is not defined! please make sure that generateSrvAuthBindings is called before getCachedJwt');
    }
    return getConnector();
}
/* @__PURE__ */
export function isJwtValidInternal() {
    const isJwtValid = window.__ASMA__SHELL__?.auth_bindings?.isJwtValid;
    if (!isJwtValid) {
        throw new Error('srvAuthGet is not defined! please make sure that generateSrvAuthBindings is called before srvAuthGet');
    }
    return isJwtValid();
}
/* @__PURE__ */
export async function srvAuthGetInternal(url, headers) {
    const srvAuthGet = window.__ASMA__SHELL__?.auth_bindings?.srvAuthGet;
    if (!srvAuthGet) {
        throw new Error('srvAuthGet is not defined! please make sure that generateSrvAuthBindings is called before srvAuthGet');
    }
    return srvAuthGet(url, headers);
}
/* @__PURE__ */
export function getSrvUrlsInternal() {
    const getSrvUrls = window.__ASMA__SHELL__?.auth_bindings?.getSrvUrls;
    if (!getSrvUrls) {
        throw new Error('getSrvUrls is not defined! please make sure that generateSrvAuthBindings is called before getSrvUrls');
    }
    return getSrvUrls();
}
/* @__PURE__ */
export async function setReqConfigInternal(data, responseType) {
    const setReqConfig = window.__ASMA__SHELL__?.auth_bindings?.setReqConfig;
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
    if (logout) {
        registerCallbackOnSrvAuthEvents('logout_event', logout);
    }
    if (window.__ASMA__SHELL__?.auth_bindings) {
        return window.__ASMA__SHELL__.auth_bindings;
    }
    let jwtToken = '';
    let features;
    let connector;
    let parsed_jwt;
    let srv_urls;
    let openreplay;
    const isJwtInvalid = () => (jwtToken && accessTokenHasExpired()) || !jwtToken;
    const isJwtValid = () => !isJwtInvalid();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const promiseRegistry = {};
    async function srvAuthGet(url, headers) {
        if (EnvConfigsFnInternal().DEVELOPMENT && EnvConfigsFnInternal().ENVIRONMENT_TO_OPERATE) {
            if (EnvConfigsFnInternal().ENVIRONMENT_TO_OPERATE in EnvironmentEnums) {
                url = `${url}&env=${EnvConfigsFnInternal().ENVIRONMENT_TO_OPERATE}`;
                // file deepcode ignore GlobalReplacementRegex: <it is intended to be replaced only first occurrence>
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
        if (typeof json === 'object' && json !== null && 'default_app_versions' in json) {
            dispatchCustomerUserRelatedAppVersions(json.default_app_versions);
            delete json.default_app_versions;
        }
        if (!res?.ok) {
            let error = json;
            if (!json) {
                error = await res.clone().text();
            }
            throw error;
        }
        if (res.status === 299 && EnvConfigsFnInternal().DEVELOPMENT) {
            console.info(json);
        }
        return json;
    }
    function accessTokenHasExpired() {
        const tokenObj = getParsedJwt();
        const accessTokenExpDate = tokenObj?.exp || 0;
        const nowTime = Math.floor(new Date().getTime() / 1000);
        return accessTokenExpDate - 10 <= nowTime;
    }
    /**
     *
     * TODO: need to investigate smarter way of registering and unregister on `logout_event`
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
        return getParsedJwt()?.['user_id'] || '-1';
    }
    function setAuthData(data) {
        if (data?.token) {
            jwtToken = data?.token;
            features = new Set(data.features);
            connector = data.connector;
            openreplay = data.openreplay;
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
        openreplay = undefined;
    }
    function getJwtToken() {
        return jwtToken;
    }
    function getOpenReplay() {
        return openreplay;
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
            if (!data || data?.errors || !data.token) {
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
        //let hasFeature = false
        //const asmaFeaturesIgnoreList: string | null = localStorage.getItem('asma-features-ignore-list')
        const enableAllFeatures = localStorage.getItem('enable-all-features') === 'true';
        //const hasFeatureCheck = !!features?.has(featureName)
        //const DEVELOPMENT = EnvConfigsFnInternal().DEVELOPMENT
        //if (EnvConfigsFnInternal().DEVELOPMENT /*  && asmaDebug && asmaFeaturesIgnoreList */) {
        // let asmaEnableAllFeatures: FeatureEnums[] | undefined
        // try {
        //     asmaEnableAllFeatures = JSON.parse(asmaFeaturesIgnoreList)
        // } catch (e) {
        //      console.error(e)
        //  }
        // if (Array.isArray(asmaEnableAllFeatures) && !asmaEnableAllFeatures.includes(featureName)) {
        //      hasFeature = true
        //  } else {
        //hasFeature = hasFeatureCheck
        //   }
        //   return true
        //} else {
        //     hasFeature = hasFeatureCheck
        // }
        /**
         * is used directory_hideParticipantGroups due to the fact that it is wrongly named and enable fretex specific functionality
         * needs to be renamed to directory_enableParticipantGroups. Excluding from dev enabling for now
         */
        if (featureName !== 'directory_hideParticipantGroups') {
            return enableAllFeatures || !!features?.has(featureName);
        }
        return !!features?.has(featureName);
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
        getOpenReplay,
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
    return (window.__ASMA__SHELL__?.auth_bindings ||
        generateSrvAuthBindings(/* SRV_AUTH, DEVELOPMENT, ENVIRONMENT_TO_OPERATE, */ /* EnvConfigsFn, */ logout));
}
let current_app_version = undefined;
function dispatchCustomerUserRelatedAppVersions(new_app_version) {
    if (!new_app_version || Object.keys(new_app_version).length === 0) {
        return;
    }
    if (!current_app_version || !deepEqual(current_app_version, new_app_version)) {
        asmaOverridesEventBus.dispatch('default-map-changed', new_app_version);
    }
    current_app_version = new_app_version;
}
function deepEqual(x, y) {
    return sortStringify(x) === sortStringify(y);
}
function sortStringify(x) {
    Object.keys(x)
        .sort()
        .reduce((acc, key) => {
        const x_key = x?.[key];
        if (x_key) {
            acc[key] = x_key;
        }
        return acc;
    }, {});
    return JSON.stringify(x);
}
//# sourceMappingURL=generateSrvAuthBindings.js.map