import { realWindow } from '..'
import { subdomain } from './getSubdomain'
const _origin = realWindow.location.origin
export const env =
    ((_origin.includes('.dev.') || _origin.includes('//dev.')) && 'dev') ||
    ((_origin.includes('.test.') || _origin.includes('//test.')) && 'test') ||
    ((_origin.includes('.stage.') || _origin.includes('//stage.')) && 'stage') ||
    (_origin.includes('localhost') && 'localhost') ||
    'prod'
export type IEnv = typeof env
export const env_to_operate = realWindow.__asma_development_environment_to_operate__

export let domain = realWindow.location.hostname.split('.').at(-2) as
    | 'adopus'
    | 'adcuris'
    | 'advoca'
    | 'avans'
    | undefined

if (!domain || !['adopus', 'adcuris', 'advoca', 'avans'].includes(domain)) {
    throw new Error('Domain not found! please use dns ..[advoca,adopus,avans].[no,health,localhost]')
}

const SIGNICAT_SIGN_URL = {
    dev: 'https://preprod.signicat.com/std/docaction/avans',
    localhost: 'https://preprod.signicat.com/std/docaction/avans',
    test: 'https://preprod.signicat.com/std/docaction/avans',
    stage: 'https://secure.avans.no/std/docaction/avans',
    prod: 'https://secure.avans.no/std/docaction/avans',
}
export function signicatSignUrl(_env: typeof env, env_to_operate?: typeof env) {
    if (_env === 'localhost' && env_to_operate) {
        return SIGNICAT_SIGN_URL[env_to_operate]
    }
    return SIGNICAT_SIGN_URL[_env]
}

const SRV_CONNECTOR = {
    ADCURIS: {
        dev: 'https://kurs.somasolutions.no/api',
        localhost: 'https://kurs.somasolutions.no/api',
        test: 'https://kurs.somasolutions.no/api',
        stage: 'https://connector-stage.avanssoma.no/api',
        prod: 'https://adcurisconnector.avans.no/api',
    },
    ADOPUS: {
        dev: 'https://connector-dev.adopus.no',
        localhost: 'https://connector-dev.adopus.no',
        test: 'https://connector-dev.adopus.no',
        stage: 'https://connector.adopus.no/stage',
        prod: 'https://connector.adopus.no/prod',
    },
}

export function srvConnector(env: IEnv, env_to_operate?: IEnv) {
    const host = (realWindow.location.hostname.includes('adcuris') && 'ADCURIS') || 'ADOPUS'

    if (env === 'localhost' && env_to_operate) {
        return SRV_CONNECTOR[host][env_to_operate]
    }

    return SRV_CONNECTOR[host][env]
}

export function createAdvocaAccessUrl() {
    let advoca_url = 'https://subdomain.advoca.no'

    const subdomain = window.location.host.split('.').slice(0, -2).join('.')

    /*  const host_name_arr = realWindow.location.hostname.split('.')

    let subdomain = 'web'

    if (host_name_arr.length === 3 && host_name_arr[0]) {
        subdomain = host_name_arr[0]
    }

    // new subdomain structure => subdomain.subdomain.advoca.no
    if (host_name_arr.length === 4 && host_name_arr[0]) {
        subdomain = host_name_arr[0] + '.' + host_name_arr[1]
    }

    // excludes for shell => dev/stage.advoca.no, for more dynamic, depends on customer, convert it in code
    if (host_name_arr.length === 4 && host_name_arr[0] && host_name_arr[1] && host_name_arr[0] === 'shell') {
        subdomain = host_name_arr[1]
    }

    // for adcuris
    if (realWindow.location.hostname.includes('adcuris')) {
        advoca_url = advoca_url.replace('adcuris', 'advoca')
        subdomain = subdomain.replace('advoca-', '').replace('advoca', 'www')
    } */

    return advoca_url.replace('subdomain', subdomain)
}

const DEVEXPRESS = {
    dev: 'https://reporting-nonprod.adopus.no',
    localhost: 'https://reporting-nonprod.adopus.no',
    test: 'https://reporting-nonprod.adopus.no',
    stage: 'https://reporting-nonprod.adopus.no',
    prod: 'https://reporting-prod.adopus.no',
}

export function devExpress(_env: IEnv, env_to_operate?: IEnv) {
    if (_env === 'localhost' && env_to_operate) {
        return DEVEXPRESS[env_to_operate]
    }
    return DEVEXPRESS[env]
}

//let env_computed = ''

export function computeBaseUrl() {
    let base_url = ''
    /**
     * tld - top level domain. This is last part of domain name. For example, in google.com, com is tld.
     */
    let tld = domain === 'adcuris' ? 'health' : 'no'

    if (domain === 'avans') {
        domain = 'adopus'
    }
    /*   let tld = 'no'

    if (domain === 'adcuris') {
        tld = 'health'
    }
 */
    /* if (env == 'localhost') {
        // default
        if (!env_to_operate || env_to_operate.includes('localhost')) {
            env_computed = subdomain ? subdomain + '.dev' : 'dev'
            // custom
        } else {
            env_computed =
                env_to_operate === 'prod' && !subdomain
                    ? 'web'
                    : env_to_operate === 'prod'
                    ? subdomain
                    : subdomain
                    ? `${subdomain}.${env_to_operate}`
                    : env_to_operate
        }

        base_url = `https://${env_computed}.${domain}.${tld}`
    } else if (subdomain === 'cdn') {
        env_computed = 'dev'

        base_url = `https://${env_computed}.${domain}.${tld}`
    } */
    let computed_subdomain = computedSubdomain()

    /*  if (domain === 'advoca') {
        computed_subdomain = computed_subdomain || window.location.host.split('.').slice(0, -2).join('.')

        if () {
            domain = 'adcuris'

            tld = 'health'
        } else {
            domain = 'adopus'
        }
    } */

    if (computed_subdomain) {
        base_url = `https://${computed_subdomain}.${domain}.${tld}`
    }
    return base_url
}
function computedSubdomain() {
    if (env_to_operate?.includes('localhost') || window.location.host.includes('localhost')) {
        return subdomain ? subdomain + '.dev' : 'web.dev'
    }

    // custom
    if (env_to_operate) {
        !subdomain &&
            console.error(
                'subdomain is not provided, Consider avoiding using adopus, adcuris, advoca without specifying customer related subdomain.',
            )
        return env_to_operate === 'prod' ? 'web' : `${subdomain ? subdomain + '.' : ''}${env_to_operate}`
    }

    if (subdomain === 'cdn') {
        return 'web.dev'
    }

    /*  if (subdomain) {
        return env_to_operate !== 'prod' ? `${subdomain}.${env_to_operate}` : subdomain
    } */

    return
    /*  env_to_operate === 'prod' && !subdomain
            ? 'web'
            : env_to_operate === 'prod'
            ? subdomain
            : subdomain
            ? `${subdomain}.${env_to_operate}`
            : env_to_operate */

    //return env_computed
}

//export const base_url = computeBaseUrl()
const OPENREPLAY_PROJECT_KEY = {
    /* taken from stage to test if it works */
    dev: 'XpLyoDeHEHwkJbD7TIZA',
    localhost: 'XpLyoDeHEHwkJbD7TIZA',
    test: 'XpLyoDeHEHwkJbD7TIZA',
    stage: 'XpLyoDeHEHwkJbD7TIZA',
    blue: '',
    prod: {
        adopus: 'AGpq7EYp2kOvdBJPi2Nx',
        adcuris: '5xkUqBHxTkLoHW1hXm1p',
    },
}

const OPENREPLAY_ADVOCA_PROJECT_KEY = {
    dev: '2zFQuTc2VxdLJuoxVZDg',
    localhost: '2zFQuTc2VxdLJuoxVZDg',
    test: '2zFQuTc2VxdLJuoxVZDg',
    stage: '2zFQuTc2VxdLJuoxVZDg',
    blue: '',
    prod: {
        adopus: 'LvvBp2mAPmjvFVJ9z1Ik',
        adcuris: '6KV7U380fV95Rku9X3cd',
    },
}

export function getOpenReplayKey(journal: string) {
    const _env = env_to_operate || env

    const _journal = journal.toLowerCase() === 'adcuris' ? 'adcuris' : 'adopus'

    let key = (domain = 'advoca' ? OPENREPLAY_ADVOCA_PROJECT_KEY[_env] : OPENREPLAY_PROJECT_KEY[_env])

    if (_env === 'prod' && typeof key !== 'string') {
        key = key[_journal]
    }
    return key as string
}

const { origin } = realWindow.location
export const nbid_env = localStorage.getItem('nbid-env')

const nbidNonprod =
    nbid_env === 'nonprod' ||
    ['.dev.', '//dev.', 'localhost', '.test.', '//test.'].some((substring) => origin.includes(substring))

const hostnameNonprod = ['.dev.', '//dev.', 'localhost', '.test.', '//test.'].some((substring) =>
    origin.includes(substring),
)

export function createSignicatAuthUrl() {
    const nonprod = nbidNonprod || hostnameNonprod

    const url = nonprod ? 'https://preprod.signicat.com/oidc/authorize' : 'https://secure.avans.no/oidc/authorize'

    return url
}
const nonprod = env === 'localhost' || env === 'dev' || env === 'test' || env === 'stage'
const adcuris = domain === 'adcuris'
export function createOpenReplyIngestPoint() {
    return nonprod
        ? `https://openreplay.stage.advoca.no/ingest`
        : adcuris
        ? `https://openreplay.adcuris.health/ingest`
        : `https://openreplay.adopus.no/ingest`
}

export function getClientId() {
    const nonprod = nbidNonprod || hostnameNonprod

    const url = nonprod ? 'preprod.advoca.no' : 'prod.advoca.no'

    return url
}
