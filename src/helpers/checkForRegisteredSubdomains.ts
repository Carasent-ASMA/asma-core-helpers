import { EventBus } from 'asma-event-bus/lib/event-buss'
import {
    //srvAuthGetInternal,
    //type IOpenReplay,
    checkForRegisteredSubdomainInternal,
} from './generateSrvAuthBindings'
import { _setOpenReplayConfig } from './openReplayConfigs'
import { redirectFromSubdomainToDomain } from './getSubdomain'
import { realWindow } from '..'
import type { ICheckSigninOptions } from './generateSrvAuthBindings.types'

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

export type IResWithSubdomain = {
    props: Omit<ICheckSigninOptions<any>, 'openreplay' | 'features' | 'srv_urls'>
    registeredSubdomain: boolean
    unregister: () => void
}

export type IResWithSubdomainOnError = { error: true; registeredSubdomain: boolean; message: string; code: number }

export async function checkForRegisteredSubdomain({
    redirect_if_not_exists = true,
    setSelectedCustomer,
    logos,
    authenticated,
    service,
}: {
    redirect_if_not_exists?: boolean
    setSelectedCustomer?: (customer_id: string) => void
    logos: { fretexLogo: string; carasentLogo: string }
    authenticated: () => boolean
    /**
     * @deprecated one need remove this. Please do not use it anymore
     */
    service: 'app-shell' | 'advoca-portal' | 'app-advoca'
}): Promise<IResWithSubdomain | IResWithSubdomainOnError> {
    try {
        const { unregister } = onThemeChange(({ theme }) => {
            appendAsmaLogoLink(theme, logos, service)
        })

        const res = await checkForRegisteredSubdomainInternal()

        if (res?.metadata.customer_id) {
            setSelectedCustomer?.(res.metadata.customer_id)
        }
        if (res?.metadata.openreplay) {
            _setOpenReplayConfig(res.metadata.openreplay)
        }

        if (res?.metadata.theme) {
            setTheme(res.metadata.theme)
        }

        if (!!!res?.metadata.customer_id && redirect_if_not_exists) {
            redirectFromSubdomainToDomain()
        }

        appendAsmaLogoLink(getTheme(), logos, service)

        return { props: res!.metadata, registeredSubdomain: authenticated() || !!res?.metadata.customer_id, unregister }
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
