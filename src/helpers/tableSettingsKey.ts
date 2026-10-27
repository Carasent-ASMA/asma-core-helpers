import { subscribeToHistory } from '../g-definitions.js'
import { registerCallbackOnSrvAuthEvents } from './generateSrvAuthBindings.js'
import { realWindow } from './getSubdomain.js'

export interface TableSettingsKeyOptions {
    /**
     * A short, stable name for a view of the same table, for example `ME` or `RECIPIENT`. It is kept only if
     * it matches [A-Za-z0-9-]{0,32}; anything else becomes ''.
     *
     * It must be an opaque name chosen by the app, never a patient, questionnaire, answer or record id, and
     * never free text (AC 12 of ASMA-8597: keys hold no record data). The pattern checks the shape only: a
     * number or a UUID passes it, because the helper cannot tell it from a name.
     */
    context?: string
}

/**
 * `<app>.<table>` for new ids; legacy ids such as `UsersTable` pass too. Rejects spaces, `:`, `/` and non-ASCII.
 * It checks the shape only, so a UUID-shaped id passes; see the `tableId` rule on `getTableSettingsKey`.
 */
const TABLE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/
const CONTEXT_PATTERN = /^[A-Za-z0-9-]{0,32}$/

function readUserAndCustomerId(): { userId: string; customerId: string } | undefined {
    try {
        const metadata = realWindow.__ASMA__SHELL__?.auth_bindings?.getMetadata()
        // The shell fills these from a server response, so check them at runtime, whatever the types promise.
        const userId: unknown = metadata?.user_id
        const customerId: unknown = metadata?.customer_id

        if (typeof userId !== 'string' || userId === '' || typeof customerId !== 'string' || customerId === '') {
            return undefined
        }

        return { userId, customerId }
    } catch {
        return undefined
    }
}

function sanitizeContext(context: unknown): string {
    return typeof context === 'string' && CONTEXT_PATTERN.test(context) ? context : ''
}

/**
 * Storage key for a table's saved settings: `${tableId}_${userId}_${customerId}_${context}`, the format
 * asma-app-directory's `generateUniqKey` already uses. Returns `undefined` until both the signed-in user
 * and the tenant are known, or when `tableId` is not a valid id, so a table shows its defaults and saves
 * nothing instead of writing a `…_undefined_…` key.
 *
 * Naming rule for new table ids: `<app>.<table>` in lowercase kebab-case, for example
 * `directory.my-participants`. Name the table, never a header label, a position or a record id.
 *
 * @param tableId A stable, opaque name for the table. It must never be a patient, questionnaire, answer or
 * record id, or anything built from one (AC 12 of ASMA-8597: keys hold no record data). The helper does not
 * guard against this: a UUID-shaped id passes. Keeping such ids out of keys is the job of the key inventory
 * in ASMA-8698 (AC 3) and of each app's own migration to this helper.
 * @param options `context` is the same kind of name, see {@link TableSettingsKeyOptions}.
 *
 * The helper never reads the URL: pass the app's current context (for example its `user_context` value)
 * as `options.context`. A key contains only the table id, the opaque user and tenant ids and the sanitized
 * context, never names or record data.
 */
export function getTableSettingsKey(tableId: string, options?: TableSettingsKeyOptions): string | undefined {
    if (typeof tableId !== 'string' || !TABLE_ID_PATTERN.test(tableId)) {
        return undefined
    }

    const ids = readUserAndCustomerId()

    if (!ids) {
        return undefined
    }

    return `${tableId}_${ids.userId}_${ids.customerId}_${sanitizeContext(options?.context)}`
}

/**
 * Calls `listener` after `jwt_changed`, `logout_event` and every history change, and returns the function
 * that unsubscribes from all three. History is included because an app's context usually comes from the
 * URL. The listener only signals; read the key again with `getTableSettingsKey`. Made for
 * `useSyncExternalStore(onTableSettingsKeyChange, () => getTableSettingsKey(id, { context }))`.
 */
export function onTableSettingsKeyChange(listener: () => void): () => void {
    const jwtChanged = registerCallbackOnSrvAuthEvents('jwt_changed', () => listener())
    const loggedOut = registerCallbackOnSrvAuthEvents('logout_event', () => listener())
    const unsubscribeHistory = subscribeToHistory(() => listener())

    return () => {
        jwtChanged.unregister()
        loggedOut.unregister()
        unsubscribeHistory()
    }
}
