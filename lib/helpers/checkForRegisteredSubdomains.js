import { EventBus } from 'asma-event-bus/lib/event-buss';
//import { clearCacheData } from './clearCacheData'
import { srvAuthGetInternal } from './generateSrvAuthBindings';
import { redirectFromSubdomainToDomain } from './getSubdomain';
import { _setOpenReplayConfig } from './openReplayConfigs';
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
/* @__PURE__ */
export function onThemeChange(callback) {
    return registerTheme('on_theme_change', callback);
}
/* @__PURE__ */
export function getTheme() {
    if (window.__ASMA__THEME__) {
        return window.__ASMA__THEME__.getTheme();
    }
    return getThemeLocal();
}
/* @__PURE__ */
export function setTheme(theme) {
    if (window.__ASMA__THEME__) {
        return window.__ASMA__THEME__.setTheme(theme);
    }
    setThemeLocal(theme);
}
/* @__PURE__ */
export async function checkForRegisteredSubdomain({ redirect_if_not_exists = true, setSelectedCustomer, 
//srvAuthGet,
logos, authenticated, service, }) {
    try {
        const { unregister } = onThemeChange(({ theme }) => {
            appendAsmaLogoLink(theme, logos, service);
        });
        //const client = await directoryGenQLClient(true, { 'x-hasura-subdomain': subdomain })
        let res;
        if (!authenticated()) {
            res = await srvAuthGetInternal('/check?context=subdomain', {
                'asma-origin': window.location.origin,
            });
            if (res?.id) {
                setSelectedCustomer?.(res.id);
            }
            if (res?.openreplay) {
                _setOpenReplayConfig(res.openreplay);
            }
            if (res?.theme) {
                setTheme(res.theme);
            }
            if (!!!res?.id && redirect_if_not_exists) {
                redirectFromSubdomainToDomain();
            }
        }
        appendAsmaLogoLink(getTheme(), logos, service);
        return [authenticated() || !!res?.id, unregister, false];
    }
    catch (e) {
        console.error(e);
        return [false, () => { }, true];
    }
}
const asmaLogoLink = 'asma-logo-link';
function appendAsmaLogoLink(theme, { carasentLogo, fretexLogo }, service) {
    if (service === 'advoca-portal') {
        theme = 'default';
    }
    else if (service === 'app-advoca') {
        theme !== 'fretex' && (theme = 'default');
    }
    const body = document.body;
    body.dataset['theme'] = theme;
    document.getElementById(asmaLogoLink)?.remove();
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