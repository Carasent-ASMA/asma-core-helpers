import { EventBus } from 'asma-event-bus/lib/event-buss'
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
export function onThemeChange(callback: (val: { theme: string }) => void) {
    return registerTheme('on_theme_change', callback)
}
export function getTheme() {
    if (window.__ASMA__THEME__) {
        return window.__ASMA__THEME__.getTheme()
    }
    return getThemeLocal()
}
export function setTheme(theme: string) {
    if (window.__ASMA__THEME__) {
        return window.__ASMA__THEME__.setTheme(theme)
    }
    setThemeLocal(theme)
}

export async function checkForRegisteredSubdomain({
    redirect_if_not_exists = true,
    setSelectedCustomer,
    srvAuthGet,
    logos,
    authenticated,
    no_greenish_theme = false,
}: {
    redirect_if_not_exists?: boolean
    setSelectedCustomer?: (customer_id: string) => void
    srvAuthGet: <R>(url: string, headers?: Record<string, string> | undefined) => Promise<R>
    logos: { fretexLogo: string; carasentLogo: string }
    authenticated: boolean
    no_greenish_theme?: boolean
}) {
    const { unregister } = onThemeChange(({ theme }) => {
        let themeToApply = theme

        no_greenish_theme && theme === 'greenish' && (themeToApply = 'default')

        appendAsmaLogoLink(themeToApply, logos)
    })

    //const client = await directoryGenQLClient(true, { 'x-hasura-subdomain': subdomain })
    let res: { id?: string; theme?: string } | undefined

    if (!authenticated) {
        res = await srvAuthGet<{ id?: string; theme?: string }>('/check?context=subdomain', {
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
    appendAsmaLogoLink(getTheme(), logos)

    return [authenticated || !!res?.id, unregister] as [registeredSubdomain: boolean, unregister: () => void]
}
const asmaLogoLink = 'asma-logo-link'

function appendAsmaLogoLink(theme: string, { carasentLogo, fretexLogo }: { fretexLogo: string; carasentLogo: string }) {
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
