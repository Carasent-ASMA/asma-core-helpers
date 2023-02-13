export function config(env_var, default_value) {
    var _a, _b, _c, _d;
    const srv_url = getDynamicSrvUrl(env_var);
    if (srv_url) {
        return srv_url;
    }
    const connector = (window.location.host.includes('adopus.no') && 'adopus') ||
        (window.location.host.includes('adcuris.no') && 'adcuris') ||
        undefined;
    if (connector) {
        return ((_c = (_b = (_a = window._env_cloud) === null || _a === void 0 ? void 0 : _a[connector]) === null || _b === void 0 ? void 0 : _b[env_var]) !== null && _c !== void 0 ? _c : default_value);
    }
    return (_d = window.__ENV) === null || _d === void 0 ? void 0 : _d[env_var];
}
export function configWeb(env_var, default_value) {
    var _a, _b;
    const srv_url = getDynamicSrvUrl(env_var);
    if (srv_url) {
        return srv_url;
    }
    return ((_b = (_a = window.__ENV) === null || _a === void 0 ? void 0 : _a[env_var]) !== null && _b !== void 0 ? _b : default_value);
}
function getDynamicSrvUrl(env_var) {
    var _a;
    if (env_var.startsWith('SRV')) {
        const env_name = env_var.replace('SRV_', '').toLowerCase();
        const srv_url = (_a = window._srvUrls) === null || _a === void 0 ? void 0 : _a[env_name];
        if (srv_url) {
            return srv_url;
        }
    }
    return;
}
export function httpToWs(url) {
    url = absoluteUrl(url);
    return url.replace('http', 'ws').replace('https', 'wss');
}
function absoluteUrl(url) {
    if (url.startsWith('http') || url.startsWith('https')) {
        return url;
    }
    url = window.location.origin + url;
    return url;
}
//# sourceMappingURL=Config.js.map