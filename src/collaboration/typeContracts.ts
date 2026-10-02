import type { TemplateOp } from './operations.js'
import type { MetaField, SettingField } from './templateAuthoringMeta.js'
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

// ─── ASMA-8339: the typed metadata/settings arms are closed in path, value and payload ───

/**
 * An arbitrary path must not type-check.
 *
 * This is the assertion that keeps `template.setMetaFieldTyped` from degenerating into the open arm it
 * sits beside: a `field: string` would admit `meta`, a settings group, the import-only `legacy`
 * residue and every unknown member of an imported bag, and the reducer would be the only thing
 * standing between a client and a wholesale metadata overwrite.
 */
export type SetMetaFieldRefusesArbitraryPath = Assert<
    Refuses<{ type: 'template.setMetaFieldTyped'; field: 'legacy.plan_category'; value: 'x' }, TemplateOp>
>

/** The import-only residue is not an authoring field, which `MetaField` itself must say. */
export type MetaFieldExcludesLegacyResidue = Assert<Refuses<'legacy.plan_category', MetaField>>

/**
 * A value from the wrong field must not type-check.
 *
 * The correlation is the reason the arms are per-field rather than one `{field; value}` pair: without
 * it `{field: 'visibility', value: 'coordinator'}` compiles, lands in a document, and reaches an
 * immutable version before anything notices.
 */
export type SetMetaFieldRefusesCrossFieldValue = Assert<
    Refuses<{ type: 'template.setMetaFieldTyped'; field: 'visibility'; value: 'coordinator' }, TemplateOp>
>
export type SetMetaFieldRefusesWrongPrimitive = Assert<
    Refuses<{ type: 'template.setMetaFieldTyped'; field: 'title'; value: 42 }, TemplateOp>
>
export type SetMetaFieldRefusesOutOfRangeAccessLevel = Assert<
    Refuses<
        { type: 'template.setMetaFieldTyped'; field: 'instancePolicy.requiredAccessLevel'; value: 5 },
        TemplateOp
    >
>

/** Each legal pair, and the `null` unset, must stay legal or the refusals above prove nothing. */
export type SetMetaFieldAcceptsLegalPairs = Assert<
    Refuses<{ type: 'template.setMetaFieldTyped'; field: 'visibility'; value: 'hidden' }, TemplateOp> extends false
        ? Refuses<
              { type: 'template.setMetaFieldTyped'; field: 'instancePolicy.initiator'; value: 'recipient' },
              TemplateOp
          > extends false
            ? Refuses<
                  { type: 'template.setMetaFieldTyped'; field: 'instancePolicy.requiredAccessLevel'; value: 1 },
                  TemplateOp
              > extends false
                ? Refuses<{ type: 'template.setMetaFieldTyped'; field: 'title'; value: null }, TemplateOp> extends false
                    ? true
                    : false
                : false
            : false
        : false
>

/**
 * A typed arm must not accept the OPEN arm's payload member.
 *
 * Without the `patch?: never` exclusions, `{type: 'template.setSettingTyped', field, value, patch}`
 * is structurally assignable — TypeScript admits extra properties on a non-fresh object — so a client
 * assembling an op by spreading an old payload would ship a member nothing refuses until the wire
 * schema's `'+': 'reject'`, and nothing at all on a replayed log.
 */
export type SetSettingRefusesOpenArmPayload = Assert<
    Refuses<
        {
            type: 'template.setSettingTyped'
            field: 'rendering.tabs'
            value: true
            patch: Record<string, string>
        },
        TemplateOp
    >
>

/** A membership payload must not satisfy a leaf arm, or vice versa. */
export type SetSettingRefusesMembershipPayload = Assert<
    Refuses<
        {
            type: 'template.setSettingTyped'
            field: 'rendering.tabs'
            value: true
            collection: 'consentTemplateIds'
            id: 'c-1'
        },
        TemplateOp
    >
>
export type AddCompatibilityIdRefusesLeafPayload = Assert<
    Refuses<
        {
            type: 'template.addCompatibilityId'
            collection: 'consentTemplateIds'
            id: 'c-1'
            field: 'rendering.tabs'
            value: true
        },
        TemplateOp
    >
>

export type SetSettingRefusesUnknownLeaf = Assert<
    Refuses<{ type: 'template.setSettingTyped'; field: 'rendering.not_a_flag'; value: true }, TemplateOp>
>
export type SetSettingRefusesNonBoolean = Assert<
    Refuses<{ type: 'template.setSettingTyped'; field: 'rendering.tabs'; value: 'true' }, TemplateOp>
>
export type SettingFieldExcludesReleasedPhoneSpelling = Assert<Refuses<'recipient.ask_for_phone_nr', SettingField>>

export type AddCompatibilityIdRefusesUnknownCollection = Assert<
    Refuses<{ type: 'template.addCompatibilityId'; collection: 'journalTemplateIds'; id: 'c-1' }, TemplateOp>
>

export type CompatibilityMembershipAcceptsLegalShapes = Assert<
    Refuses<{ type: 'template.addCompatibilityId'; collection: 'consentTemplateIds'; id: '42' }, TemplateOp> extends false
        ? Refuses<
              { type: 'template.removeCompatibilityId'; collection: 'smsTemplateIds'; id: 'sms-1' },
              TemplateOp
          > extends false
            ? true
            : false
        : false
>

/**
 * The two RELEASED open arms must stay open.
 *
 * The one assertion here that guards against a plausible well-meant change rather than a mistake:
 * narrowing `template.updateMeta`/`template.updateSettings` to the new closed vocabulary would look
 * like tightening and would in fact make every already-stored `collab_ops` log unreplayable and every
 * immutable version unverifiable, because the legacy importer and the released client wrote arbitrary
 * dotted patches through exactly these arms.
 */
/**
 * The patches below carry ONLY unrecognized keys, deliberately. A patch that also carried a known key
 * would still be assignable to an arm narrowed to just that key, so the probe would pass over exactly
 * the narrowing it exists to catch — verified by seeding `patch: Record<'title', OpValue>` and
 * watching the weaker form stay green.
 */
export type UpdateMetaStaysOpen = Assert<
    Refuses<
        { type: 'template.updateMeta'; patch: { 'some.unknown.legacy_flag': true; security_level: 3 } },
        TemplateOp
    > extends false
        ? true
        : false
>
export type UpdateSettingsStaysOpen = Assert<
    Refuses<{ type: 'template.updateSettings'; patch: { ask_for_phone_nr: true; tab_mode: false } }, TemplateOp> extends false
        ? true
        : false
>
