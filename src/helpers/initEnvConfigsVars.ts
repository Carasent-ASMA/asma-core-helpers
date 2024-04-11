import { subdomain } from './getSubdomain'

export const env =
    (window.location.hostname.includes('dev.') && 'dev') ||
    (window.location.hostname.includes('test.') && 'test') ||
    (window.location.hostname.includes('stage.') && 'stage') ||
    (window.location.hostname.includes('localhost') && 'localhost') ||
    'prod'
export type IEnv = typeof env
export const env_to_operate = window.__asma_development_environment_to_operate__

export let domain = window.location.hostname.split('.').at(-2) as 'adopus' | 'adcuris' | 'advoca' | 'avans' | undefined

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
    const host = (window.location.hostname.includes('adcuris') && 'ADCURIS') || 'ADOPUS'

    if (env === 'localhost' && env_to_operate) {
        return SRV_CONNECTOR[host][env_to_operate]
    }

    return SRV_CONNECTOR[host][env]
}

export function createAdvocaAccessUrl() {
    let advoca_url = 'https://subdomain.advoca.no'

    const host_name_arr = window.location.hostname.split('.')

    let subdomain = 'www'

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
    if (window.location.hostname.includes('adcuris')) {
        advoca_url = advoca_url.replace('adcuris', 'advoca')
        subdomain = subdomain.replace('advoca-', '').replace('advoca', 'www')
    }

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

let env_computed = ''

function computeBaseUrl() {
    let base_url = ''

    if (domain === 'avans') {
        domain = 'adopus'
    }
    let tld = 'no'

    if (domain === 'adcuris') {
        tld = 'health'
    }

    if (env == 'localhost') {
        if (!env_to_operate || env_to_operate.includes('localhost')) {
            env_computed = 'dev'
        } else {
            env_computed = env_to_operate === 'prod' ? 'www' : env_to_operate
        }

        base_url = `https://${env_computed}.${domain}.${tld}`
    } else if (subdomain === 'cdn') {
        env_computed = 'dev'

        base_url = `https://${env_computed}.${domain}.${tld}`
    }

    return base_url
}

export const base_url = computeBaseUrl()
export const OPENREPLAY_PROJECT_KEY = {
    /* taken from stage to test if it works */
    dev: 'XpLyoDeHEHwkJbD7TIZA',
    localhost: '',
    test: '',
    stage: 'XpLyoDeHEHwkJbD7TIZA',
    blue: '',
    prod: {
        adopus: '7bnUpS7Glly1Y1j8SAxm',
        adcuris: 'CyUaMTrUJByBHbHHv1Ql',
    },
}

export function getOpenReplayKey(journal: string) {
    const _env = env_to_operate || env

    const _journal = journal.toLowerCase() === 'adcuris' ? 'adcuris' : 'adopus'

    let key = OPENREPLAY_PROJECT_KEY[_env]

    if (_env === 'prod' && typeof key !== 'string') {
        key = key[_journal]
    }
    return key
}

const { hostname } = window.location
export const nbid_env = localStorage.getItem('nbid-env')

const nbidNonprod =
    nbid_env === 'nonprod' || ['dev.', 'localhost', 'test.'].some((substring) => hostname.includes(substring))

const hostnameNonprod = ['dev.', 'localhost', 'test.'].some((substring) => hostname.includes(substring))

export function createSignicatAuthUrl() {
    const nonprod = nbidNonprod || hostnameNonprod

    const url = nonprod ? 'https://preprod.signicat.com/oidc/authorize' : 'https://secure.avans.no/oidc/authorize'

    return url
}
export function createOpenReplyIngestPoint() {
    const nonprod = env === 'localhost' || env === 'dev' || env === 'test' || env === 'stage'

    return nonprod ? `https://openreplaynonprod.advoca.no/ingest` : `https://openreplay.advoca.no/ingest`
}

export function getClientId() {
    const nonprod = nbidNonprod || hostnameNonprod

    const url = nonprod ? 'preprod.advoca.no' : 'prod.advoca.no'

    return url
}
