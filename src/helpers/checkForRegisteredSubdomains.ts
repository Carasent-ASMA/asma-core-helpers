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
}: {
    redirect_if_not_exists?: boolean
    setSelectedCustomer?: (customer_id: string) => void
    srvAuthGet: <R>(url: string, headers?: Record<string, string> | undefined) => Promise<R>
}) {
    const res = await srvAuthGet<{ id?: string; theme?: string }>(
        '/check?context=subdomain',
        {
            'asma-origin': window.location.origin,
        },
        // deepcode ignore PromiseNotCaughtGeneral: <this is intended to throw if fails>
    )
    //const client = await directoryGenQLClient(true, { 'x-hasura-subdomain': subdomain })

    if (res?.id) {
        setSelectedCustomer?.(res.id)
    }

    res?.theme && setTheme(res.theme)

    if (!!!res?.id && redirect_if_not_exists) {
        redirectFromSubdomainToDomain()
    }
    return !!res?.id
}
