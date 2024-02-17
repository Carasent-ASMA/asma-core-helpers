import { subdomain } from './getSubdomain'

export const env =
    (window.location.hostname.includes('dev.') && 'dev') ||
    (window.location.hostname.includes('test.') && 'test') ||
    (window.location.hostname.includes('stage.') && 'stage') ||
    (window.location.hostname.includes('localhost') && 'localhost') ||
    'prod'
export type IEnv = typeof env
export const env_to_operate = window.__asma_development_environment_to_operate__

export const domain = window.location.hostname.split('.').at(-2) as 'adopus' | 'adcuris' | 'advoca' | undefined

if (!domain || !['adopus', 'adcuris', 'advoca'].includes(domain)) {
    throw new Error('Domain not found! please use dns advoca.no,adopus.no or adcuris.health')
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
    if (env == 'localhost') {
        if (!env_to_operate || env_to_operate.includes('localhost')) {
            env_computed = 'dev'
        } else {
            env_computed = env_to_operate === 'prod' ? 'www' : env_to_operate
        }

        base_url = `https://${env_computed}.${domain}.no`
    } else if (subdomain === 'cdn') {
        env_computed = 'dev'

        base_url = `https://${env_computed}.${domain}.no`
    }
    return base_url
}

export const base_url = computeBaseUrl()
