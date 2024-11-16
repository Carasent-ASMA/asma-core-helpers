import {
    //srvAuthGetInternal,
    //type IOpenReplay,
    checkForRegisteredSubdomainInternal,
    isJwtValidInternal,
} from './generateSrvAuthBindings'
//import { _setOpenReplayConfig } from './openReplayConfigs'
//import { redirectFromSubdomainToDomain } from './getSubdomain'
import type { ICheckSigninOptions } from './generateSrvAuthBindings.types'

/**
 * @private use only inside this file
 */
/* let theme = 'default'
let realWindow = getRealWindow()
const { dispatch: dispatchTheme, register: registerTheme } = EventBus<{ on_theme_change: { theme: string } }>(
    'asma-theme',
) */
/* 
function getThemeLocal() {
    return theme
} */
/* function setThemeLocal(theme_local: string) {
    if (theme !== theme_local) {
        dispatchTheme('on_theme_change', { theme: theme_local }, false)

        theme = theme_local
    }
} */
/* realWindow.__ASMA__THEME__ = realWindow.__ASMA__THEME__ || {
    getTheme: getThemeLocal,
    setTheme: setThemeLocal,
} */

/* export function onThemeChange(callback: (val: { theme: string }) => void) {
    return registerTheme('on_theme_change', callback)
} */
/**
 * deprecated use SrvAuthBindings.getTheme instead
 */
/* export function getTheme() {
    if (realWindow.__ASMA__THEME__) {
        return realWindow.__ASMA__THEME__.getTheme()
    }
    return getThemeLocal()
} */
/**
 * deprecated use SrvAuthBindings.getTheme instead
 */
/* export function setTheme(theme: string) {
    if (realWindow.__ASMA__THEME__) {
        return realWindow.__ASMA__THEME__.setTheme(theme)
    }
    setThemeLocal(theme)
} */

export type IResWithSubdomain = {
    props: Omit<ICheckSigninOptions<any>, 'openreplay' | 'features' | 'srv_urls'>
    registeredSubdomain: boolean
}

export type IResWithSubdomainOnError = { error: true; registeredSubdomain: boolean; message: string; code: number }

export async function checkForRegisteredSubdomain /* {}:  */(): Promise<IResWithSubdomain | IResWithSubdomainOnError> {
    // setSelectedCustomer,
    // logos,
    //authenticated,
    //service,
    //{
    /**
     * @deprecated one need remove this. Please do not use it anymore.
     */
    //redirect_if_not_exists?: boolean
    //setSelectedCustomer?: (customer_id: string) => void
    //logos: { fretexLogo: string; carasentLogo: string }
    //authenticated: () => boolean
    /**
     * @deprecated one need remove this. Please do not use it anymore
     */
    //service: 'app-shell' | 'advoca-portal' | 'app-advoca'
    /* } */
    try {
        /*  const { unregister } = onThemeChange(({ theme }) => {
            appendAsmaLogoLink(theme, logos, service)
        }) */

        const res = await checkForRegisteredSubdomainInternal()

        /* if (res?.metadata.customer_id) {
            setSelectedCustomer?.(res.metadata.customer_id)
        } */
        /*  if (res?.metadata.openreplay) {
            _setOpenReplayConfig(res.metadata.openreplay)
        } */

        /*  if (res?.metadata.theme) {
            setTheme(res.metadata.theme)
        } */

        /* if (!!!res?.metadata.customer_id && redirect_if_not_exists) {
            redirectFromSubdomainToDomain()
        } */

        return { props: res!.metadata, registeredSubdomain: isJwtValidInternal() || !!res?.metadata.customer_id }
    } catch (e) {
        console.error(e)

        return { code: e.code, message: e.message, registeredSubdomain: false, error: true }
    }
}
