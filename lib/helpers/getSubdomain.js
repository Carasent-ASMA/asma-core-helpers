function getSubdomain() {
    const hostname_arr = window.location.hostname.split('.'); // fretex-dfsf.advoca.no
    let subdomain = '';
    if (hostname_arr.length === 3 &&
        hostname_arr[0] &&
        !['dev', 'test', 'stage', 'intern', 'www'].find((sub) => sub === hostname_arr[0])) {
        subdomain = hostname_arr[0];
        const subdomain_arr = subdomain.split('-');
        if (subdomain_arr.length === 2 && subdomain_arr[0]) {
            subdomain = subdomain_arr[0];
        }
    }
    return subdomain;
}
export const subdomain = getSubdomain();
export function redirectFromSubdomainToDomain() {
    const domain_hostname = `${createDomainUrlFromSubdomain()}${window.location.pathname}`;
    window.location.href = domain_hostname;
    return null;
}
export function createDomainUrlFromSubdomain() {
    let hostname = window.location.hostname.replace(subdomain, '');
    (hostname.startsWith('-') && (hostname = hostname.substring(1))) ||
        (hostname.startsWith('.') && (hostname = 'www' + hostname));
    const { port, protocol } = window.location;
    return protocol + '//' + hostname + (port ? `:${port}` : '');
}
//# sourceMappingURL=getSubdomain.js.map