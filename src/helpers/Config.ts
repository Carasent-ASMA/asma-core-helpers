type ObjectType<T> = T extends string ? string : T extends boolean ? boolean : never

export function config<T>(env_var: string, default_value: T): ObjectType<T> {
    const srv_url = getDynamicSrvUrl(env_var)

    if (srv_url) {
        return srv_url as ObjectType<T>
    }

    const connector =
        (window.location.host.includes('adopus.no') && 'adopus') ||
        (window.location.host.includes('adcuris.no') && 'adcuris') ||
        undefined

    if (connector) {
        return (window._env_cloud?.[connector]?.[env_var] ?? default_value) as ObjectType<T>
    }

    return window.__ENV?.[env_var] as ObjectType<T>
}

export function configWeb<T>(env_var: string, default_value: T): ObjectType<T> {
    const srv_url = getDynamicSrvUrl(env_var)

    if (srv_url) {
        return srv_url as ObjectType<T>
    }

    return (window.__ENV?.[env_var] ?? default_value) as ObjectType<T>
}

function getDynamicSrvUrl(env_var: string) {
    if (env_var.startsWith('SRV')) {
        const env_name = env_var.replace('SRV_', '').toLowerCase()

        const srv_url = window._srvUrls?.[env_name]
        if (srv_url) {
            return srv_url
        }
    }
    return
}

export function httpToWs(url: string) {
    url = absoluteUrl(url)

    return url.replace('http', 'ws').replace('https', 'wss')
}

function absoluteUrl(url: string) {
    if (url.startsWith('http') || url.startsWith('https')) {
        return url
    }

    url = window.location.origin + url

    return url
}
