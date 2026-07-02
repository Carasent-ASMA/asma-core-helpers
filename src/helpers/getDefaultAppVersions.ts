/**
 * First-hit platform accessor.
 *
 * The server injects `window.__ASMA_PLATFORM__` at first hit (asma-static-server, ASMA-7544).
 * Both the old (qiankun) and the new (ESM) architecture read their per-user app versions through
 * this one accessor: the injected value is preferred, the auth-response value is the fallback — so
 * versions no longer depend on the `checkForRegisteredSubdomain`/signin round-trip timing. Absent
 * injection (flag off / old HTML), the fallback IS today's behaviour.
 *
 * @see _docs/frontend/plans/2026-07-02-14-25-plan-asma-static-server-esm-first-hit-compatibility.md:? — REQ-008, TASK-014
 */

export interface InjectedPlatformApp {
    version: string
    base: string
}

export interface InjectedPlatform {
    default_app_versions?: Record<string, string>
    apps?: Record<string, InjectedPlatformApp>
}

/** Read the server-injected platform payload (qiankun-aware via `rawWindow`); undefined outside a browser. */
export function getInjectedPlatform(): InjectedPlatform | undefined {
    if (typeof window === 'undefined') {
        return undefined
    }
    const realWindow = (window as Window).rawWindow || window
    return realWindow.__ASMA_PLATFORM__
}

/**
 * The per-user `service -> version` map, preferring the server-injected first-hit value and
 * falling back to a provided auth-response value.
 */
export function getDefaultAppVersions(fallback?: Record<string, string>): Record<string, string> | undefined {
    const injected = getInjectedPlatform()?.default_app_versions
    if (injected && Object.keys(injected).length > 0) {
        return injected
    }
    return fallback
}
