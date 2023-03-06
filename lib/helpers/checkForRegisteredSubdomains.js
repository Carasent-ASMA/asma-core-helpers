import { EventBus } from 'asma-event-bus/lib/event-buss';
import { redirectFromSubdomainToDomain } from './getSubdomain';
/**
 * @private use only inside this file
 */
let theme = 'default';
const { dispatch: dispatchTheme, register: registerTheme } = EventBus('asma-theme');
function getThemeLocal() {
    return theme;
}
function setThemeLocal(theme_local) {
    if (theme !== theme_local) {
        dispatchTheme('on_theme_change', { theme: theme_local }, false);
        theme = theme_local;
    }
}
window.__ASMA__THEME__ = window.__ASMA__THEME__ || { getTheme: getThemeLocal, setTheme: setThemeLocal };
export function onThemeChange(callback) {
    return registerTheme('on_theme_change', callback);
}
export function getTheme() {
    if (window.__ASMA__THEME__) {
        return window.__ASMA__THEME__.getTheme();
    }
    return getThemeLocal();
}
export function setTheme(theme) {
    if (window.__ASMA__THEME__) {
        return window.__ASMA__THEME__.setTheme(theme);
    }
    setThemeLocal(theme);
}
export async function checkForRegisteredSubdomain({ redirect_if_not_exists = true, setSelectedCustomer, srvAuthGet, logos, authenticated, }) {
    const { unregister } = onThemeChange(({ theme }) => {
        appendAsmaLogoLink(theme, logos);
    });
    //const client = await directoryGenQLClient(true, { 'x-hasura-subdomain': subdomain })
    let res;
    if (!authenticated) {
        res = await srvAuthGet('/check?context=subdomain', {
            'asma-origin': window.location.origin,
        });
        if (res === null || res === void 0 ? void 0 : res.id) {
            setSelectedCustomer === null || setSelectedCustomer === void 0 ? void 0 : setSelectedCustomer(res.id);
        }
        if (res === null || res === void 0 ? void 0 : res.theme) {
            setTheme(res.theme);
        }
        appendAsmaLogoLink(getTheme(), logos);
        if (!!!(res === null || res === void 0 ? void 0 : res.id) && redirect_if_not_exists) {
            redirectFromSubdomainToDomain();
        }
    }
    return [!!(res === null || res === void 0 ? void 0 : res.id), unregister];
}
const asmaLogoLink = 'asma-logo-link';
function appendAsmaLogoLink(theme, { carasentLogo, fretexLogo }) {
    var _a;
    const body = document.body;
    body.dataset['theme'] = theme;
    (_a = document.getElementById(asmaLogoLink)) === null || _a === void 0 ? void 0 : _a.remove();
    const link = document.createElement('link');
    link.setAttribute('id', asmaLogoLink);
    if (theme === 'fretex') {
        document.title = 'Fretex';
        link.setAttribute('href', fretexLogo);
    }
    else {
        document.title = 'Carasent';
        link.setAttribute('href', carasentLogo);
    }
    link.setAttribute('rel', 'icon');
    link.setAttribute('type', 'image/png');
    link.setAttribute('sizes', '32x32');
    document.head.appendChild(link);
}
//# sourceMappingURL=checkForRegisteredSubdomains.js.map