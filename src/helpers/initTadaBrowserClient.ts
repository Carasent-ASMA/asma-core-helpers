/**
 * initTadaBrowserClient — high-level, self-contained urql client factory.
 *
 * Every ASMA `app-*` family resolves its GraphQL endpoint from the same
 * EnvConfigs / srv_urls source and authenticates with the same cached JWT, so
 * that wiring lives here rather than being copy-pasted into each app. Callers
 * pass the target `service` (and optionally a `path` or service-specific
 * `resolveExchanges`); URL resolution and JWT binding are handled internally
 * via the shared `*Internal` bindings — no per-app injection required.
 *
 * For the low-level factory that takes an already-resolved URL and explicit
 * JWT getters, use `createTadaBrowserClient`.
 *
 * @see asma-modules/_docs/frontend/operations/2026-07-11-23-00-runbook-graphql-schema-generation-secrets.md
 */
import { createTadaBrowserClient, type ResolveExchanges } from './createTadaBrowserClient.js'
import { EnvConfigsFnInternal, type IEnvironmentUrlsGenQLOnly } from './generateEnvConfigsBindings.js'
import { getCachedJwtInternal, getSrvUrlsInternal, isJwtValidInternal } from './generateSrvAuthBindings.js'

/**
 * Resolves the GraphQL base URL for a service from EnvConfigs, preferring the
 * runtime `srv_urls` override (carried in the JWT metadata) for the
 * consolidated Adopus wrapper and the connector when one is present.
 */
export function resolveSrvUrl(service: keyof IEnvironmentUrlsGenQLOnly): string {
    let service_url = EnvConfigsFnInternal()[service]

    if (service === 'HSR_AO_WRAPPER') {
        const url = getSrvUrlsInternal()?.ao_wrapper
        if (url) {
            service_url = url
        }
    } else if (service === 'SRV_CONNECTOR') {
        const url = getSrvUrlsInternal()?.connector
        if (url) {
            service_url = url
        }
    }

    if (!service_url) {
        throw Error(
            `'required param serviceUrl() is undefined, please check EnvConfig object!', service: ${service}`,
        )
    }
    return service_url
}

export interface InitTadaBrowserClientOptions {
    /** Target service; its GraphQL URL is resolved via EnvConfigs / srv_urls. */
    service: keyof IEnvironmentUrlsGenQLOnly
    /** GraphQL path appended to the resolved base URL. Defaults to '/v1/graphql'. */
    path?: string
    /** Optional service-specific exchanges (e.g. the Adopus per-tenant namespace rewrite). */
    resolveExchanges?: ResolveExchanges
}

/**
 * Creates a configured, authenticated urql Client for an ASMA frontend app
 * from just a `service` name. URL resolution (`resolveSrvUrl`) and JWT binding
 * (`getCachedJwtInternal` / `isJwtValidInternal`) are wired internally.
 */
export function initTadaBrowserClient({ service, path = '/v1/graphql', resolveExchanges }: InitTadaBrowserClientOptions) {
    return createTadaBrowserClient({
        url: `${resolveSrvUrl(service)}${path}`,
        getJwt: getCachedJwtInternal,
        isJwtValid: isJwtValidInternal,
        resolveExchanges,
    })
}
