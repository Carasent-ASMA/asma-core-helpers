import {
    srvConnector,
    env,
    env_to_operate,
    base_url,
    signicatSignUrl,
    devExpress,
    createAdvocaAccessUrl,
    OPENREPLAY_PROJECT_KEY,
    getClientId,
    createSignicatAuthUrl,
    nbid_env,
} from '../helpers/initEnvConfigsVars'

export const EnvironmentsUrls1 = {
    SRV_DIRECTORY: `${base_url}/api/directory`,
    SRV_CALENDAR: `${base_url}/api/calendar`,
    SRV_PROXY_OLD: `${base_url}/api/proxy`,
    SRV_PROXY_OLD_HELSE: `${base_url}/api/proxy/helse`,
    SRV_PROXY_OLD_WEB: `${base_url}/api/proxy/web`,
    SRV_STORAGE: `${base_url}/api/storage`,
    SRV_CHAT: `${base_url}/api/chat`,
    SRV_CONNECTOR: srvConnector(env, env_to_operate),
    SRV_ARTIFACT: '',
    SRV_ADVOCA: `${base_url}/api/service`,
    SRV_PROXY: `${base_url}/api/srvproxy`,
    SRV_NOTIFICATION: `${base_url}/api/notification`,
    SRV_ACTIVITIES: `${base_url}/api/activities`,

    SRV_AO_DIRECTORY: `${base_url}/api-ao/directory`,
    SRV_AO_WRAPPER: '',
    SRV_AUTH: `${base_url}/api/auth`,
    DEVELOPMENT: window.location.hostname.includes('dev.') || window.location.hostname.includes('localhost'),
    ENVIRONMENT_TO_OPERATE: env_to_operate,
    DEBUG_ADCURIS: false,
    //SRV_FORWARDER_SECRET: '',
    SIGNICAT_SIGN_URL: signicatSignUrl(env, env_to_operate),
    INFO_ADVOCA: 'https://carasent.no/ad-voca/deltaker-bruker',
    DEVEXPRESS: devExpress(env, env_to_operate),
    ADVOCA_ACCESS_URL: createAdvocaAccessUrl(),
    AUTO_SAVE_INTERVAL_IN_MINUTES: 1,
    ENV: env_to_operate || env,

    API_KEY_GEOCODE: 'AIzaSyAqlT9AT7xDvehIS0XmEXAafzYify5_npg',
    AZURE_APP_ID: 'cba50bcf-ef6a-4623-8b42-fb592cb064d7',
    AZURE_APP_REDIRECT_URI: window.location.origin,
    OPENREPLAY_PROJECT_KEY: OPENREPLAY_PROJECT_KEY[env_to_operate || env],
    CDN_ASMA_BASE_URL: 'https://cdn.advoca.no',
    SIGNICAT_REDIRECT_URL: `${window.location.origin}/auth/callback`,
    SIGNICAT_AUTH_URL: createSignicatAuthUrl(),
    SIGNICAT_CLIENT_ID: getClientId(),
    NBID_ENV: nbid_env,
}
/* export const EnvironmentsUrls = {
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
        SRV_AUTH: '',
    },
    dev: {
        SRV_DIRECTORY: `${base_url}/api/directory',
        SRV_CALENDAR: `${base_url}/api/calendar',
        SRV_PROXY_OLD: `${base_url}/api/proxy',
        SRV_PROXY_OLD_HELSE: `${base_url}/api/proxy/helse',
        SRV_PROXY_OLD_WEB: `${base_url}/api/proxy/web',
        SRV_STORAGE: `${base_url}/api/storage',
        SRV_CHAT: `${base_url}/api/chat',
        SRV_CONNECTOR: 'https://connector-dev.adopus.no',
        SRV_ARTIFACT: '',
        SRV_ADVOCA: 'https://dev.advoca.no/api/service',
        SRV_PROXY: `${base_url}/api/srvproxy',
        SRV_NOTIFICATION: `${base_url}/api/notification',
        SRV_ACTIVITIES: `${base_url}/api/activities',

        SRV_AO_DIRECTORY: `${base_url}/api-ao/directory',
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
        SRV_CONNECTOR: 'https://connector.adopus.no/prod',
        SRV_ARTIFACT: '',
        SRV_ADVOCA: 'https://www.advoca.no/api/service',
        SRV_PROXY: 'https://www.adopus.no/api/srvproxy',
        SRV_NOTIFICATION: 'https://www.adopus.no/api/notification',
        SRV_ACTIVITIES: 'https://www.adopus.no/api/activities',

        SRV_AO_DIRECTORY: 'https://www.adopus.no/api-ao/directory',
        SRV_AO_WRAPPER: 'fethes dynamically from srvUrls()',
    },
} */

/* export function environmentUrls(ENVIRONMENT_TO_OPERATE?: string) {
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
} */
//export default environmentUrls
