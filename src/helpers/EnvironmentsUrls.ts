import { realWindow, subdomain /* , domain */ } from './getSubdomain.js'
import {
    srvConnector,
    env,
    env_to_operate,
    //base_url,
    signicatSignUrl,
    devExpress,
    createAdvocaAccessUrl,
    //getClientId,
    //createSignicatAuthUrl,
    nbid_env,
    createOpenReplyIngestPoint,
    getOpenReplayKey,
    // computeBaseUrl,
    domain,
} from '../helpers/initEnvConfigsVars.js'

export const EnvironmentsUrls1 = (adcuris_subdomains?: string[]) => {
    let ac_prefix

    if (domain === 'advoca' && env === 'prod' && adcuris_subdomains?.includes(subdomain)) {
        ac_prefix = ac_prefix + '/ac'
    }

    return {
        SRV_DIRECTORY: `${ac_prefix}/api/directory`,
        SRV_CALENDAR: `${ac_prefix}/api/calendar`,
        SRV_PROXY_OLD: `${ac_prefix}/api/proxy`,
        SRV_PROXY_OLD_HELSE: `${ac_prefix}/api/proxy/helse`,
        SRV_PROXY_OLD_WEB: `${ac_prefix}/api/proxy/web`,
        SRV_STORAGE: `${ac_prefix}/api/storage`,
        SRV_CHAT: `${ac_prefix}/api/chat`,
        SRV_CONNECTOR: srvConnector(env, env_to_operate),
        SRV_ARTIFACT: '',
        SRV_ADVOCA: `${ac_prefix}/api/service`,
        SRV_PROXY: `${ac_prefix}/api/srvproxy`,
        SRV_NOTIFICATION: `${ac_prefix}/api/notification`,
        SRV_ACTIVITIES: `${ac_prefix}/api/activities`,
        SRV_WOPI: `${ac_prefix}/wopi`,
        SRV_AO_DIRECTORY: `${ac_prefix}/api-ao/directory`,
        SRV_WRAPPER: `${ac_prefix}/api/wrapper`,
        SRV_AUTH: '/api/auth',
        // FIXME replace with dynamic url
        ONLYOFFICE_DOCUMENT_SERVER:
            env === 'prod' ? `https://onlyoffice.adopus.no` : `https://onlyoffice.stage.adopus.no`,
        /**Use this in stead  url is the same for all journal where relevant only use in api-assembly do not access those directly in code may be issues */
        /**@deprecated use SRV_WRAPPER instead */
        SRV_AO_WRAPPER_NEW: '/api/wrapper',

        SRV_AO_WRAPPER: '',
        DEVELOPMENT:
            realWindow.location.hostname.includes('dev.') || realWindow.location.hostname.includes('localhost'),
        ENVIRONMENT_TO_OPERATE: env_to_operate,
        DEBUG_ADCURIS: false,
        //SRV_FORWARDER_SECRET: '',
        SIGNICAT_SIGN_URL: signicatSignUrl(env, env_to_operate),
        CRIIPTO_SIGN_URL: 'https://asma.criipto.id/signatures/',
        CRIIPTO_SIGN_URL_NONPROD: 'https://asma-test.criipto.id/signatures/',
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
        /**
         * @deprecated - use NBID_REDIRECT_URL instead
         */
        // SIGNICAT_REDIRECT_URL: `${realWindow.location.origin}/auth/callback`,
        NBID_REDIRECT_URL: `${realWindow.location.origin}/auth/callback`,
        //SIGNICAT_AUTH_URL: createSignicatAuthUrl(),
        ADOPUS_ACCESS_URL: realWindow.location.origin,
        //  SIGNICAT_CLIENT_ID: getClientId(),
        NBID_ENV: nbid_env,
        OPENREPLAY_INGEST_POINT: createOpenReplyIngestPoint(),
    }
}
