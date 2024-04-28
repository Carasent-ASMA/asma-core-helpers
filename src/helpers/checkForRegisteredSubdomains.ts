import { EventBus } from 'asma-event-bus/lib/event-buss'
import {
    //srvAuthGetInternal,
    //type IOpenReplay,
    type ICheckForRegisteredSubdomainResponse,
    checkForRegisteredSubdomainInternal,
} from './generateSrvAuthBindings'
import { _setOpenReplayConfig } from './openReplayConfigs'
import { redirectFromSubdomainToDomain } from './getSubdomain'
import { realWindow } from '../g-definitions'

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
realWindow.__ASMA__THEME__ = realWindow.__ASMA__THEME__ || { getTheme: getThemeLocal, setTheme: setThemeLocal }

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
    if (realWindow.__ASMA__THEME__) {
        return realWindow.__ASMA__THEME__.getTheme()
    }
    return getThemeLocal()
}

export function setTheme(theme: string) {
    if (realWindow.__ASMA__THEME__) {
        return realWindow.__ASMA__THEME__.setTheme(theme)
    }
    setThemeLocal(theme)
}

/* export type ICheckForRegisteredSubdomainResponse = {
    id: string
    theme: string
    openreplay: IOpenReplay | null
    device_authorized: boolean
    default_app_versions: Record<string, string>
    customer_name: string
} */

export type IResWithSubdomain = {
    props: Omit<ICheckForRegisteredSubdomainResponse<unknown>, 'openreplay' | 'features'>
    registeredSubdomain: boolean
    unregister: () => void
}

export type IResWithSubdomainOnError = { error: true; registeredSubdomain: boolean; message: string; code: number }

//const client = await directoryGenQLClient(true, { 'x-hasura-subdomain': subdomain })
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
}): Promise<IResWithSubdomain | IResWithSubdomainOnError> {
    try {
        // let res: ICheckForRegisteredSubdomainResponse<unknown> | undefined = undefined

        const { unregister } = onThemeChange(({ theme }) => {
            appendAsmaLogoLink(theme, logos, service)
        })
        /* {
            "id": "4d43855c-afa9-45ca-9e31-382dbde9681b",
            "theme": "greenish",
            "openreplay": {
                "enable": true,
                "graphql": false,
                "live_assist": false,
                "mobx": false,
                "profiler": false
            },
            "device_authorized": true,
            "default_app_versions": {
                "asma-app-artifact": "0.1.5",
                "asma-app-calendar": "0.0.0",
                "asma-app-devextreme": "0.0.2",
                "asma-app-directory": "0.0.1"
            }
        } */

        const res = await checkForRegisteredSubdomainInternal()

        if (res?.id) {
            setSelectedCustomer?.(res.id)
        }
        if (res?.openreplay) {
            _setOpenReplayConfig(res.openreplay)
        }

        if (res?.theme) {
            setTheme(res.theme)
        }

        if (!!!res?.id && redirect_if_not_exists) {
            redirectFromSubdomainToDomain()
        }

        appendAsmaLogoLink(getTheme(), logos, service)

        return { props: res!, registeredSubdomain: authenticated() || !!res?.id, unregister }
    } catch (e) {
        console.error(e)

        return { code: e.code, message: e.message, registeredSubdomain: false, error: true }
    }
}
const asmaLogoLink = 'asma-logo-link'

function appendAsmaLogoLink(
    theme: string,
    { carasentLogo, fretexLogo }: { fretexLogo: string; carasentLogo: string },
    service: 'app-shell' | 'advoca-portal' | 'app-advoca',
) {
    if (service === 'advoca-portal') {
        theme = 'default'
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
