import { EventBus } from 'asma-event-bus/lib/event-buss'
//import { clearCacheData } from './clearCacheData'
import { srvAuthGetInternal } from './generateSrvAuthBindings'
import { redirectFromSubdomainToDomain } from './getSubdomain'

/**
 * @private use only inside this file
 */
let theme = 'default'

const { dispatch: dispatchTheme, register: registerTheme } = EventBus<{ on_theme_change: { theme: string } }>(
    'asma-theme',
)

function getThemeLocal() {
    return theme
}
function setThemeLocal(theme_local: string) {
    if (theme !== theme_local) {
        dispatchTheme('on_theme_change', { theme: theme_local }, false)

        theme = theme_local
    }
}
window.__ASMA__THEME__ = window.__ASMA__THEME__ || { getTheme: getThemeLocal, setTheme: setThemeLocal }

declare global {
    interface Window {
        __ASMA__THEME__?: {
            getTheme: () => string
            setTheme: (theme: string) => void
        }
    }
}
/* @__PURE__ */
export function onThemeChange(callback: (val: { theme: string }) => void) {
    return registerTheme('on_theme_change', callback)
}
/* @__PURE__ */
export function getTheme() {
    if (window.__ASMA__THEME__) {
        return window.__ASMA__THEME__.getTheme()
    }
    return getThemeLocal()
}
/* @__PURE__ */
export function setTheme(theme: string) {
    if (window.__ASMA__THEME__) {
        return window.__ASMA__THEME__.setTheme(theme)
    }
    setThemeLocal(theme)
}
/* @__PURE__ */
export async function checkForRegisteredSubdomain({
    redirect_if_not_exists = true,
    setSelectedCustomer,
    //srvAuthGet,
    logos,
    authenticated,
    service,
}: {
    redirect_if_not_exists?: boolean
    setSelectedCustomer?: (customer_id: string) => void
    //srvAuthGet: <R>(url: string, headers?: Record<string, string> | undefined) => Promise<R>
    logos: { fretexLogo: string; carasentLogo: string }
    authenticated: () => boolean
    /**
     * @deprecated one need remove this. Please do not use it in more use cases
     */
    service: 'app-shell' | 'advoca-portal' | 'app-advoca'
}) {
    const { unregister } = onThemeChange(({ theme }) => {
        appendAsmaLogoLink(theme, logos, service)
    })

    //const client = await directoryGenQLClient(true, { 'x-hasura-subdomain': subdomain })
    let res: { id?: string; theme?: string } | undefined

    if (!authenticated()) {
        res = await srvAuthGetInternal<{ id?: string; theme?: string }>('/check?context=subdomain', {
            'asma-origin': window.location.origin,
        })
        if (res?.id) {
            setSelectedCustomer?.(res.id)
        }

        console.log('res?.theme', res?.theme)

        if (res?.theme) {
            setTheme(res.theme)
        }

        if (!!!res?.id && redirect_if_not_exists) {
            redirectFromSubdomainToDomain()
        }
    }
    appendAsmaLogoLink(getTheme(), logos, service)

    return [authenticated() || !!res?.id, unregister] as [registeredSubdomain: boolean, unregister: () => void]
}
const asmaLogoLink = 'asma-logo-link'

function appendAsmaLogoLink(
    theme: string,
    { carasentLogo, fretexLogo }: { fretexLogo: string; carasentLogo: string },
    service: 'app-shell' | 'advoca-portal' | 'app-advoca',
) {
    if (service === 'advoca-portal') {
        theme = 'default'
    } else if (service === 'app-advoca') {
        theme !== 'fretex' && (theme = 'default')
    }
    const body = document.body!

    body.dataset['theme'] = theme

    document.getElementById(asmaLogoLink)?.remove()

    const link = document.createElement('link')

    link.setAttribute('id', asmaLogoLink)

    if (theme === 'fretex') {
        document.title = 'Fretex'
        link.setAttribute('href', fretexLogo)
    } else {
        document.title = 'Carasent'

        link.setAttribute('href', carasentLogo)
    }

    link.setAttribute('rel', 'icon')

    link.setAttribute('type', 'image/png')

    link.setAttribute('sizes', '32x32')

    document.head.appendChild(link)
}
