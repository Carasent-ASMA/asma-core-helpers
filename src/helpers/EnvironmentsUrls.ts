import { configWeb, EnvironmentEnums, type IEnvironmentEnums } from '..'
/* @__PURE__ */
export const EnvironmentsUrls = {
    local: {
        SRV_DIRECTORY: `http://${window.location.hostname}:7001`,
        SRV_CALENDAR: `http://${window.location.hostname}:7011`,
        SRV_PROXY_OLD: `http://${window.location.hostname}:4430`,
        SRV_PROXY_OLD_HELSE: `http://${window.location.hostname}:4430/helse`,
        SRV_PROXY_OLD_WEB: `http://${window.location.hostname}:4430/helse`,
        SRV_STORAGE: `http://${window.location.hostname}:4000`,
        SRV_CHAT: `http://${window.location.hostname}:7012`,
        SRV_CONNECTOR: 'https://connector-dev.adopus.no',
        SRV_ARTIFACT: '',
        SRV_ADVOCA: `http://${window.location.hostname}:4433`,
        SRV_PROXY: `http://${window.location.hostname}:7003`,
        SRV_NOTIFICATION: `http://${window.location.hostname}:7002`,
        SRV_ACTIVITIES: `http://${window.location.hostname}:7010`,

        SRV_AO_DIRECTORY: `http://${window.location.hostname}:7013`,
        SRV_AO_WRAPPER: '',
    },
    dev: {
        SRV_DIRECTORY: 'https://dev.adopus.no/api/directory',
        SRV_CALENDAR: 'https://dev.adopus.no/api/calendar',
        SRV_PROXY_OLD: 'https://dev.adopus.no/api/proxy',
        SRV_PROXY_OLD_HELSE: 'https://dev.adopus.no/api/proxy/helse',
        SRV_PROXY_OLD_WEB: 'https://dev.adopus.no/api/proxy/web',
        SRV_STORAGE: 'https://dev.adopus.no/api/storage',
        SRV_CHAT: 'https://dev.adopus.no/api/chat',
        SRV_CONNECTOR: 'https://connector-dev.adopus.no',
        SRV_ARTIFACT: '',
        SRV_ADVOCA: 'https://dev.advoca.no/api/service',
        SRV_PROXY: 'https://dev.adopus.no/api/srvproxy',
        SRV_NOTIFICATION: 'https://dev.adopus.no/api/notification',
        SRV_ACTIVITIES: 'https://dev.adopus.no/api/activities',

        SRV_AO_DIRECTORY: 'https://dev.adopus.no/api-ao/directory',
        SRV_AO_WRAPPER: '',
    },
    test: {
        SRV_DIRECTORY: 'https://test.adopus.no/api/directory',
        SRV_CALENDAR: 'https://test.adopus.no/api/calendar',
        SRV_PROXY_OLD: 'https://test.adopus.no/api/proxy',
        SRV_PROXY_OLD_HELSE: 'https://test.adopus.no/api/proxy/helse',
        SRV_PROXY_OLD_WEB: 'https://test.adopus.no/api/proxy/web',
        SRV_STORAGE: 'https://test.adopus.no/api/storage',
        SRV_CHAT: 'https://test.adopus.no/api/chat',
        SRV_CONNECTOR: 'https://connector-test.adopus.no',
        SRV_ARTIFACT: '',
        SRV_ADVOCA: 'https://test.advoca.no/api/service',
        SRV_PROXY: 'https://test.adopus.no/api/srvproxy',
        SRV_NOTIFICATION: 'https://test.adopus.no/api/notification',
        SRV_ACTIVITIES: 'https://test.adopus.no/api/activities',

        SRV_AO_DIRECTORY: 'https://test.adopus.no/api-ao/directory',
        SRV_AO_WRAPPER: '',
    },
    stage: {
        SRV_DIRECTORY: 'https://stage.adopus.no/api/directory',
        SRV_CALENDAR: 'https://stage.adopus.no/api/calendar',
        SRV_PROXY_OLD: 'https://stage.adopus.no/api/proxy',
        SRV_PROXY_OLD_HELSE: 'https://stage.adopus.no/api/proxy/helse',
        SRV_PROXY_OLD_WEB: 'https://stage.adopus.no/api/proxy/web',
        SRV_STORAGE: 'https://stage.adopus.no/api/storage',
        SRV_CHAT: 'https://stage.adopus.no/api/chat',
        SRV_CONNECTOR: 'https://connector.adopus.no/stage',
        SRV_ARTIFACT: '',
        SRV_ADVOCA: 'https://stage.advoca.no/api/service',
        SRV_PROXY: 'https://stage.adopus.no/api/srvproxy',
        SRV_NOTIFICATION: 'https://stage.adopus.no/api/notification',
        SRV_ACTIVITIES: 'https://stage.adopus.no/api/activities',

        SRV_AO_DIRECTORY: 'https://stage.adopus.no/api-ao/directory',
        SRV_AO_WRAPPER: '',
    },
    prod: {
        SRV_DIRECTORY: 'https://www.adopus.no/api/directory',
        SRV_CALENDAR: 'https://www.adopus.no/api/calendar',
        SRV_PROXY_OLD: 'https://www.adopus.no/api/proxy',
        SRV_PROXY_OLD_HELSE: 'https://www.adopus.no/api/proxy/helse',
        SRV_PROXY_OLD_WEB: 'https://www.adopus.no/api/proxy/web',
        SRV_STORAGE: 'https://www.adopus.no/api/storage',
        SRV_CHAT: 'https://www.adopus.no/api/chat',
        SRV_CONNECTOR: 'https://connector.adopus.no',
        SRV_ARTIFACT: '',
        SRV_ADVOCA: 'https://www.advoca.no/api/service',
        SRV_PROXY: 'https://www.adopus.no/api/srvproxy',
        SRV_NOTIFICATION: 'https://www.adopus.no/api/notification',
        SRV_ACTIVITIES: 'https://www.adopus.no/api/activities',

        SRV_AO_DIRECTORY: 'https://www.adopus.no/api-ao/directory',
        SRV_AO_WRAPPER: 'fethes dynamically from srvUrls()',
    },
}

export function environmentUrls(ENVIRONMENT_TO_OPERATE?: string) {
    let env: IEnvironmentEnums | undefined

    const env_to_operate_window = configWeb('ENVIRONMENT_TO_OPERATE', '')

    if (
        (ENVIRONMENT_TO_OPERATE && ENVIRONMENT_TO_OPERATE in EnvironmentEnums) ||
        env_to_operate_window in EnvironmentEnums
    ) {
        env = (ENVIRONMENT_TO_OPERATE || env_to_operate_window) as IEnvironmentEnums

        return env && EnvironmentsUrls[env]
    }

    return
}
export default environmentUrls
