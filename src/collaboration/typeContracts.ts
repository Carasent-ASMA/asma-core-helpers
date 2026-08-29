import type { TemplateOp } from './operations.js'
import type {
    ActionMetadata,
    AlternativeChartLegend,
    LegacyBindingOverride,
    MappingBinding,
} from './templateDocument.js'

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

// ─── LegacyBindingOverride requires at least one member ───
// A bare `{}` is an exception recording nothing, and under DOC-LAW-2 it is also a second encoding of
// "absent". The three arms are what make that unrepresentable rather than merely refused at runtime:
// one optional-everything type would type-check the empty record and leave the parser as the only guard.
export type LegacyOverrideRefusesEmpty = Assert<Refuses<Record<string, never>, LegacyBindingOverride>>

/** Each single member, and the all-member record, must stay legal or the assertion above proves nothing. */
export type LegacyOverrideAcceptsLegalShapes = Assert<
    Refuses<{ planId: string }, LegacyBindingOverride> extends false
        ? Refuses<{ kind: string }, LegacyBindingOverride> extends false
            ? Refuses<{ mappingRule: string }, LegacyBindingOverride> extends false
                ? Refuses<{ planId: string; kind: string; mappingRule: string }, LegacyBindingOverride> extends false
                    ? true
                    : false
                : false
            : false
        : false
>

// ─── the Chart assignment payload carries no label ───
// The reducer derives `label` from the owning legend. A client-supplied one would let a single legend id
// carry two labels across two alternatives — two `document_hash` values for one authored state — so the
// operation payload must not even be able to express it.
export type SetChartLegendRefusesClientLabel = Assert<
    Refuses<
        {
            type: 'alternative.setChartLegend'
            questionId: string
            alternativeId: string
            chartLegend: { id: string; questionIdMap: string; label: string }
        },
        TemplateOp
    >
>

/** The label-free selection, and the `null` clear, must both stay legal. */
export type SetChartLegendAcceptsSelectionAndNull = Assert<
    Refuses<
        {
            type: 'alternative.setChartLegend'
            questionId: string
            alternativeId: string
            chartLegend: { id: string; questionIdMap: string }
        },
        TemplateOp
    > extends false
        ? Refuses<
              { type: 'alternative.setChartLegend'; questionId: string; alternativeId: string; chartLegend: null },
              TemplateOp
          > extends false
            ? true
            : false
        : false
>

/** The STORED assignment does carry the derived label — the payload and the record are different types. */
export type StoredChartLegendCarriesLabel = Assert<
    Refuses<{ id: string; questionIdMap: string }, AlternativeChartLegend>
>

// ─── the Expression formula is one operation, not two field writes ───
// Splitting the formula from its target list is the mutation this refusal exists to catch: an op arm
// missing `expressionTargets` must not type-check, or a caller could land the text and lose the list.
export type SetExpressionFormulaRequiresTargets = Assert<
    Refuses<
        { type: 'alternative.setExpressionFormula'; questionId: string; alternativeId: string; value: string },
        TemplateOp
    >
>

// ─── the released document member stays `unknown` on read ───
/**
 * `MappingBinding.legacyOverride` must NOT be narrowed to the closed canonical union.
 *
 * Nothing else can catch this. Narrowing it is a type-only change, so every runtime gate stays green:
 * the open `[key: string]: unknown` index keeps the narrowed member assignable, the reducer writes
 * through a `Record<string, unknown>` cast, and `parseLegacyBindingOverride` takes `unknown`, so no call
 * site objects. `ts:check`, `pnpm test` and `pnpm test:package` all pass with the member narrowed.
 *
 * The consequence is consumer-visible and is exactly what ADR-0008 DEC-006 forbids: with the member
 * narrowed, a consumer may write `binding.legacyOverride?.planId` with no compile error against a
 * document carrying an arbitrary historical value. History would *appear* canonical, and BunJS
 * publication would lose its reason to call the parser at all.
 *
 * Asserting the member REFUSES the canonical union is the pin: `unknown` is not assignable to
 * `LegacyBindingOverride | undefined`, so this holds at head and fails the moment the member is
 * narrowed to it.
 */
export type LegacyOverrideMemberStaysUnknown = Assert<
    Refuses<MappingBinding['legacyOverride'], LegacyBindingOverride | undefined>
>

/**
 * The other half, so the assertion above cannot pass by the member having become something unrelated:
 * a canonical value must still be assignable *into* the member.
 */
export type LegacyOverrideMemberAcceptsCanonical = Assert<
    Refuses<LegacyBindingOverride, MappingBinding['legacyOverride']> extends false ? true : false
>
