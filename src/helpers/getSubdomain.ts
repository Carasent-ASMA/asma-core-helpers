export const realWindow = window.rawWindow || window
export function getRealWindow() {
    if (!realWindow) {
        realWindow
    }
    return
}

const hostname_arr = () => {
    return realWindow.location.hostname.split('.')
}

function getSubdomain() {
    let subdomain = ''
    const host_arr = hostname_arr()
    if (
        host_arr.length === 3 &&
        host_arr[0] &&
        !['dev', 'test', 'stage', 'intern', 'www'].find((sub) => sub === host_arr[0])
    ) {
        subdomain = host_arr[0]

        const subdomain_arr = subdomain.split('-')

        if (subdomain_arr.length === 2 && subdomain_arr[0]) {
            subdomain = subdomain_arr[0]
        }
    } else if (host_arr.length === 4 && host_arr[0]) {
        subdomain = host_arr[0]
    }
    return subdomain
}

export const subdomain = getSubdomain()

export function redirectFromSubdomainToDomain() {
    const domain_hostname = `${createDomainUrlFromSubdomain()}${realWindow.location.pathname}`

    realWindow.location.href = domain_hostname

    return null
}

export function createDomainUrlFromSubdomain() {
    let hostname = realWindow.location.hostname.replace(subdomain, '')
    const hostname_arr_length = hostname_arr().length
    //TODO first if statment will be removed in the future when we all asma will move to nested subdomains
    if (hostname_arr_length === 3) {
        ;(hostname.startsWith('-') && (hostname = hostname.substring(1))) ||
            (hostname.startsWith('.') && (hostname = 'www' + hostname))
    } else if (hostname_arr_length === 4) {
        // deepcode ignore GlobalReplacementRegex: <this is intended>
        hostname = hostname.replace('.', '')
    }

    const { port, protocol } = realWindow.location

    return protocol + '//' + hostname + (port ? `:${port}` : '')
}
