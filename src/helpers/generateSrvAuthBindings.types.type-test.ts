// Compile-time contract checks for the signin options (ASMA-8221 / TB-16a).
//
// Deliberately NOT named *.test.ts: the main tsconfig excludes test files, and the runtime test
// runner (`node --import tsx --test`) strips types without checking them — an assertion there is
// vacuous. This file is type-level only (its emit is an empty module) and IS compiled by
// `pnpm ts:check`, so breaking the contract fails the build.
import type { AdvocaTabBarMetadata } from 'asma-types'

import type { SharedContextBinding } from '../context/context.types.js'
import type { CreateContextTadaBrowserClientOptions, createTadaBrowserClient } from './createTadaBrowserClient.js'
import type { ICheckSigninOptions, ICheckSigninTransformedOptions } from './generateSrvAuthBindings.types.js'
import type { initTadaBrowserClient } from './initTadaBrowserClient.js'

type Expect<T extends true> = T

/**
 * The duplicated legacy overload is last, so Parameters extraction keeps legacy property access
 * while direct context literals still select the explicit context overload. Context wrappers use
 * the already exported CreateContextTadaBrowserClientOptions type rather than Parameters<>.
 */
type LegacyClientParameters = Parameters<typeof createTadaBrowserClient>[0]
type LegacyInitParameters = Parameters<typeof initTadaBrowserClient>[0]
export type LegacyClientUrl = LegacyClientParameters['url']
export type LegacyInitService = LegacyInitParameters['service']
export type LegacyClientParametersAccept = Expect<{
    url: string
    getJwt: () => Promise<string | undefined>
    getJwtToken: () => string | undefined
    isJwtValid: () => boolean
} extends LegacyClientParameters ? true : false>
export type LegacyInitParametersAccept = Expect<{ service: 'SRV_AO_WRAPPER' } extends LegacyInitParameters ? true : false>
export type ContextOptionsAccept = Expect<{
    contextBinding: SharedContextBinding
    owner: string
} extends CreateContextTadaBrowserClientOptions ? true : false>

/**
 * `tabbar` exists on the wire type with exactly the shared DTO shape. If the field is removed,
 * indexing it below is a compile error; if its shape drifts from asma-types, Expect<false> fails.
 */
export type TabbarOnWireMatchesSharedDto = Expect<
    NonNullable<ICheckSigninOptions<string>['tabbar']> extends AdvocaTabBarMetadata ? true : false
>

/**
 * `tabbar` SURVIVES the transformation: `ICheckSigninTransformedOptions` must only rewrite
 * `features` into a Set. If its Omit ever widens (e.g. to 'features' | 'tabbar'), indexing
 * 'tabbar' below is a compile error and ts:check fails.
 */
export type TabbarSurvivesFeaturesTransform = Expect<
    ICheckSigninTransformedOptions<string>['tabbar'] extends AdvocaTabBarMetadata | undefined ? true : false
>
