import type { ICheckSigninOptions } from '../helpers/generateSrvAuthBindings.types.js'

export const SHARED_CONTEXT_REVISION = 1

type SessionFields = ICheckSigninOptions<string>

export type SharedContextActor = Readonly<Required<Pick<SessionFields, 'user_id' | 'user_role'>>>
export type SharedContextOrganization = Readonly<Pick<SessionFields, 'customer_id'>>
export type SharedContextJournal = Readonly<{
    journal: Exclude<SessionFields['journal'], 'UNKNOWN'>
    journal_user_id: NonNullable<SessionFields['journal_user_id']>
}>
export type SharedContextRecord = Readonly<{
    user_id: NonNullable<SessionFields['user_id']>
    customer_id: SessionFields['customer_id']
    relationship: 'self' | 'participant' | 'ward'
    journal: SharedContextJournal | null
}>

/**
 * Host-only input AFTER authenticated session/policy and owner record validation.
 * This shape is not an authorization proof. Never construct it from URL props,
 * unsigned decoded claims, cached metadata or an uncorrelated wards response.
 */
export type ValidatedSharedContext = Readonly<{
    revision: typeof SHARED_CONTEXT_REVISION
    actor: SharedContextActor
    organization: SharedContextOrganization
    journal: SharedContextJournal | null
    selectedRecord: SharedContextRecord | null
    exp: NonNullable<SessionFields['exp']>
}>

export type SharedContextInactiveStatus = 'unavailable' | 'anonymous' | 'pending' | 'denied' | 'disposed'
export type SharedContextSnapshot =
    | Readonly<ValidatedSharedContext & { status: 'ready'; generation: number }>
    | Readonly<{
          revision: typeof SHARED_CONTEXT_REVISION
          status: SharedContextInactiveStatus
          generation: number
          actor: null
          organization: null
          journal: null
          selectedRecord: null
      }>

export type SharedContextReadySnapshot = Extract<SharedContextSnapshot, { status: 'ready' }>
export type SharedContextListener = (snapshot: SharedContextSnapshot) => void

export type SharedContextLease = Readonly<{
    snapshot: SharedContextReadySnapshot
    signal: AbortSignal
    isCurrent: () => boolean
    assertCurrent: () => void
    onRevoke: (cleanup: () => void) => () => void
    /** Check again after every await; commit store/render effects synchronously with commit. */
    run: <T>(work: (lease: SharedContextLease) => T | Promise<T>) => Promise<T>
    /** Synchronous effects only. Async callbacks must use run then another guarded commit. */
    commit: (effect: (snapshot: SharedContextReadySnapshot) => void) => void
}>

/** A host supplies the existing owner endpoint and credential-owning fetch closure. */
export type SharedContextOwnerClientSource = Readonly<{ url: string; fetch: typeof fetch }>
export type SharedContextOwnerClient = Readonly<SharedContextOwnerClientSource & { lease: SharedContextLease }>

export type SharedContextBinding = Readonly<{
    revision: typeof SHARED_CONTEXT_REVISION
    getSnapshot: () => SharedContextSnapshot
    subscribe: (listener: SharedContextListener) => () => void
    capture: () => SharedContextLease
    createOwnerClient: (owner: string) => Promise<SharedContextOwnerClient>
    dispose: () => void
}>

export type SharedContextTransition = Readonly<{
    generation: number
    publish: (validated: ValidatedSharedContext) => boolean
}>

export type SharedContextController = Readonly<{
    getSnapshot: () => SharedContextSnapshot
    subscribe: (listener: SharedContextListener) => () => void
    /** Invalidate synchronously before starting any new identity/grant/record lookup. */
    invalidate: (status?: Exclude<SharedContextInactiveStatus, 'disposed'>) => SharedContextTransition
    mount: (revision?: number) => SharedContextBinding
    dispose: () => void
}>

export type SharedContextOptions = Readonly<{
    now?: () => number
    /** Host-only, owner-qualified factory. Missing or unknown owners must deny. */
    createOwnerClient?: (
        owner: string,
        lease: SharedContextLease,
    ) => SharedContextOwnerClientSource | Promise<SharedContextOwnerClientSource>
}>
