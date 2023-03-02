const hostname_arr = window.location.hostname.split('.')// fretex-dfsf.advoca.no

function getSubdomain() {

    let subdomain = ''

    if (
        hostname_arr.length === 3 &&
        hostname_arr[0] &&
        !['dev', 'test', 'stage', 'intern', 'www'].find((sub) => sub === hostname_arr[0])
    ) {
        subdomain = hostname_arr[0]

        const subdomain_arr = subdomain.split('-')

        if (subdomain_arr.length === 2 && subdomain_arr[0]) {
            subdomain = subdomain_arr[0]
        }
    }else if(hostname_arr.length === 4 && hostname_arr[0]){
        subdomain = hostname_arr[0]
    }
    return subdomain
}

export const subdomain = getSubdomain()

export function redirectFromSubdomainToDomain() {
    const domain_hostname = `${createDomainUrlFromSubdomain()}${window.location.pathname}`

    window.location.href = domain_hostname

    return null
}

export function createDomainUrlFromSubdomain() {
    let hostname = window.location.hostname.replace(subdomain, '')
    //TODO first if statment will be removed in the future when we all asma will move to nested subdomains
    if(hostname_arr.length === 3){

        ;(hostname.startsWith('-') && (hostname = hostname.substring(1))) ||
            (hostname.startsWith('.') && (hostname = 'www' + hostname))
    }
    else if(hostname_arr.length === 4){
        // deepcode ignore GlobalReplacementRegex: <this is intended>
        hostname = hostname.replace('.','')
    }

    const { port, protocol } = window.location

    return protocol + '//' + hostname + (port ? `:${port}` : '')
}