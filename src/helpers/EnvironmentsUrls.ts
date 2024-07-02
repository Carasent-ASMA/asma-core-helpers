import { realWindow, subdomain /* , domain */ } from '..'
import {
    srvConnector,
    env,
    env_to_operate,
    //base_url,
    signicatSignUrl,
    devExpress,
    createAdvocaAccessUrl,
    getClientId,
    createSignicatAuthUrl,
    nbid_env,
    createOpenReplyIngestPoint,
    getOpenReplayKey,
    computeBaseUrl,
} from '../helpers/initEnvConfigsVars'

export const EnvironmentsUrls1 = (adcuris_subdomains?: string[]) => {
    let base_url = computeBaseUrl()

    if (/* domain === 'advoca' && */ adcuris_subdomains?.includes(subdomain)) {
        base_url = base_url + '/ac'
    }

    return {
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
        DEVELOPMENT:
            realWindow.location.hostname.includes('dev.') || realWindow.location.hostname.includes('localhost'),
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
        AZURE_APP_REDIRECT_URI: realWindow.location.origin,
        OPENREPLAY_PROJECT_KEY: getOpenReplayKey,
        CDN_ASMA_BASE_URL: '/cdn',
        SIGNICAT_REDIRECT_URL: `${realWindow.location.origin}/auth/callback`,
        SIGNICAT_AUTH_URL: createSignicatAuthUrl(),
        ADOPUS_ACCESS_URL: realWindow.location.origin,
        SIGNICAT_CLIENT_ID: getClientId(),
        NBID_ENV: nbid_env,
        OPENREPLAY_INGEST_POINT: createOpenReplyIngestPoint(),
    }
}
