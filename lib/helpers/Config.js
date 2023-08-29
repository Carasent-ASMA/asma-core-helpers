/* @__PURE__ */
export function config(env_var, default_value) {
    const srv_url = getDynamicSrvUrl(env_var);
    if (srv_url) {
        return srv_url;
    }
    const connector = (window.location.host.includes('adopus.no') && 'adopus') ||
        (window.location.host.includes('adcuris.no') && 'adcuris') ||
        undefined;
    if (connector) {
        return (window._env_cloud?.[connector]?.[env_var] ?? default_value);
    }
    return window.__ENV?.[env_var];
}
/* @__PURE__ */
export function configWeb(env_var, default_value) {
    const srv_url = getDynamicSrvUrl(env_var);
    if (srv_url) {
        return srv_url;
    }
    return (window.__ENV?.[env_var] ?? default_value);
}
function getDynamicSrvUrl(env_var) {
    if (env_var.startsWith('SRV')) {
        const env_name = env_var.replace('SRV_', '').toLowerCase();
        const srv_url = window._srvUrls?.[env_name];
        if (srv_url) {
            return srv_url;
        }
    }
    return;
}
/* @__PURE__ */
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