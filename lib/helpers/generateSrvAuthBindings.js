import axios from 'axios';
import { EventBus } from 'asma-event-bus/lib/event-buss';
import { EnvironmentEnums, parseJwt } from '..';
let logoutsuccesfull = false;
export const { dispatch, register: registerCallbackOnJwtChanged } = EventBus('auth-bindings');
export function generateSrvAuthBindings(SRV_AUTH, DEVELOPMENT, EnvironmentToOperateFn, logout) {
    var _a, _b;
    let logoutMfes = [];
    if (logout && ((_a = window.__ASMA__SHELL__) === null || _a === void 0 ? void 0 : _a.auth_bindings)) {
        logoutMfes.push(logout);
    }
    if ((_b = window.__ASMA__SHELL__) === null || _b === void 0 ? void 0 : _b.auth_bindings) {
        window.__ASMA__SHELL__.logoutMfes = logoutMfes;
        return window.__ASMA__SHELL__.auth_bindings;
    }
    let jwtToken = '';
    let features;
    let parsed_jwt;
    let fetchJwtPromise = null;
    const isJwtInvalid = () => (jwtToken && accessTokenHasExpired()) || !jwtToken;
    const isJwtValid = () => !isJwtInvalid();
    async function srvAuthGet(url, headers) {
        if (DEVELOPMENT() && EnvironmentToOperateFn()) {
            if (EnvironmentToOperateFn() in EnvironmentEnums) {
                url = `${url}&env=${EnvironmentToOperateFn()}`;
                url = url.includes('&') && !url.includes('?') ? url.replace('&', '?') : url;
            }
            else {
                console.warn('EnvironmentToOperateFn() is not a valid EnvironmentEnums', 'shall be one of:', EnvironmentEnums, 'actual value:', EnvironmentToOperateFn());
            }
        }
        return axios.get(`${SRV_AUTH()}${url}`, {
            headers: {
                ...headers,
                'asma-origin': window.location.origin,
            },
            withCredentials: true,
        });
    }
    function accessTokenHasExpired() {
        const tokenObj = getParsedJwt();
        const accessTokenExpDate = (tokenObj === null || tokenObj === void 0 ? void 0 : tokenObj.exp) || 0;
        const nowTime = Math.floor(new Date().getTime() / 1000);
        //set exp time -20sec for token to be refreshed early
        return accessTokenExpDate - 10 <= nowTime;
    }
    async function signin(url, headers) {
        const { data } = await srvAuthGet(url, headers);
        setAuthData(data);
        logoutsuccesfull = false;
        return data;
    }
    async function signoutAuth() {
        setAuthData({ token: '' });
        await srvAuthGet('/signout');
    }
    function getUserId() {
        var _a;
        return ((_a = getParsedJwt()) === null || _a === void 0 ? void 0 : _a['user_id']) || '-1';
    }
    function setAuthData(data) {
        jwtToken = data.token;
        features = new Set(data.features);
        parsed_jwt = undefined;
        dispatch('jwt_changed', {}, false);
    }
    function getJwtToken() {
        return jwtToken;
    }
    async function getJwtTokenAsync() {
        if (isJwtInvalid()) {
            const new_jwt = await getNewJwtToken();
            return new_jwt;
        }
        else {
            return jwtToken;
        }
    }
    async function setReqConfig(data, responseType) {
        const token = await getJwtTokenAsync();
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
        if (logoutsuccesfull)
            return;
        try {
            if (!fetchJwtPromise) {
                fetchJwtPromise = srvAuthGet('/token');
            }
            const { data } = await fetchJwtPromise;
            if (!data || data.errors || data.message != 'Success' || !data.token) {
                logout === null || logout === void 0 ? void 0 : logout();
                logoutsuccesfull = true;
                //signoutAuth()
            }
            setAuthData({ token: data.token || '', features: data.features || [] });
        }
        catch (error) {
            logout === null || logout === void 0 ? void 0 : logout();
            logoutsuccesfull = true;
            //signoutAuth()
            setAuthData({ token: '', features: [] });
            console.error(error);
        }
        finally {
            fetchJwtPromise = null;
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
    const auth_bindings = {
        hasFeature,
        getFeatures,
        isJwtValid,
        signin,
        srvAuthGet,
        signoutAuth,
        setReqConfig,
        getJwtTokenAsync,
        getNewJwtToken,
        getUserId,
        getParsedJwt,
        getJwtToken,
        accessTokenHasExpired,
    };
    window.__ASMA__SHELL__ = window.__ASMA__SHELL__ || {};
    window.__ASMA__SHELL__.auth_bindings = auth_bindings;
    return auth_bindings;
}
/**
 * @deprecated use generateSrvAuthBindings
 * @param SRV_AUTH
 * @param DEVELOPMENT
 * @param ENVIRONMENT_TO_OPERATE
 * @param logout
 * @returns
 */
export function generateSrvAuthBindingsMicroApp(SRV_AUTH, DEVELOPMENT, ENVIRONMENT_TO_OPERATE, logout) {
    var _a;
    return (((_a = window.__ASMA__SHELL__) === null || _a === void 0 ? void 0 : _a.auth_bindings) ||
        generateSrvAuthBindings(SRV_AUTH, DEVELOPMENT, ENVIRONMENT_TO_OPERATE, logout));
}
//# sourceMappingURL=generateSrvAuthBindings.js.map