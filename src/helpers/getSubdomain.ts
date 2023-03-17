const hostname_arr = () => window.location.hostname.split('.') // fretex-dfsf.advoca.no
/* @__PURE__ */
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
/* @__PURE__ */
export const subdomain = getSubdomain()
/* @__PURE__ */
export function redirectFromSubdomainToDomain() {
    const domain_hostname = `${createDomainUrlFromSubdomain()}${window.location.pathname}`

    window.location.href = domain_hostname

    return null
}
/* @__PURE__ */
export function createDomainUrlFromSubdomain() {
    let hostname = window.location.hostname.replace(subdomain, '')
    const hostname_arr_length = hostname_arr().length
    //TODO first if statment will be removed in the future when we all asma will move to nested subdomains
    if (hostname_arr_length === 3) {
        ;(hostname.startsWith('-') && (hostname = hostname.substring(1))) ||
            (hostname.startsWith('.') && (hostname = 'www' + hostname))
    } else if (hostname_arr_length === 4) {
        // deepcode ignore GlobalReplacementRegex: <this is intended>
        hostname = hostname.replace('.', '')
    }

    const { port, protocol } = window.location

    return protocol + '//' + hostname + (port ? `:${port}` : '')
}
