import type { TemplateOp } from './operations.js'
import type { ActionMetadata } from './templateDocument.js'

/**
 * Compile-time assertions that the closed unions stay closed.
 *
 * **Why these live in `src` and not in a test.** `tsconfig.json` excludes every `.test.ts` file from
 * `ts:check`, and the runtime (`node --import tsx --test`) strips types without checking them — so a
 * `@ts-expect-error` inside a test file is never evaluated by anything. A probe that cannot fail is
 * worse than no probe: it reads like a guarantee. These assertions are in a checked module instead, so
 * reopening either union turns `pnpm ts:check` red.
 *
 * Type-only: this module emits no runtime code.
 */

/** Fails to compile unless `T` is exactly `true`. */
type Assert<T extends true> = T

/** `true` when `Candidate` is NOT assignable to `Target` — the shape is refused by the union. */
type Refuses<Candidate, Target> = [Candidate] extends [Target] ? false : true

// ─── action.createTyped is discriminated on `kind` ───
// `actionType` is a gridAction concept. A single arm with an optional member type-checked the
// combination below and left the reducer as the only thing that noticed.
export type ActionCreateTypedRefusesTopLevelActionType = Assert<
    Refuses<
        { type: 'action.createTyped'; actionId: string; kind: 'topLevelAction'; label?: string; actionType: 'COPY' },
        TemplateOp
    >
>

/** The same member on the gridAction arm must still be accepted, or the assertion above proves nothing. */
export type ActionCreateTypedAcceptsGridActionType = Assert<
    Refuses<{ type: 'action.createTyped'; actionId: string; kind: 'gridAction'; actionType: 'COPY' }, TemplateOp> extends true
        ? false
        : true
>

// ─── ActionMetadata arms are mutually exclusive ───
// `all: true` is the all-to-all marker; carrying a bound beside it is two answers to one question, and
// a bare `{}` is indistinguishable from absent once DOC-LAW-2 strips empties.
export type ActionMetadataRefusesAllWithFrom = Assert<Refuses<{ all: true; from: string }, ActionMetadata>>
export type ActionMetadataRefusesAllWithTo = Assert<Refuses<{ all: true; to: string }, ActionMetadata>>
export type ActionMetadataRefusesEmpty = Assert<Refuses<Record<string, never>, ActionMetadata>>

/** The four legal shapes stay legal. */
export type ActionMetadataAcceptsLegalShapes = Assert<
    Refuses<{ all: true }, ActionMetadata> extends false
        ? Refuses<{ from: string }, ActionMetadata> extends false
            ? Refuses<{ to: string }, ActionMetadata> extends false
                ? Refuses<{ from: string; to: string }, ActionMetadata> extends false
                    ? true
                    : false
                : false
            : false
        : false
>
