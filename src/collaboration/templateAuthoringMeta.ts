import type { JsonValue } from './canonicalize.js'
import type { ConflictMarker } from './conflicts.js'
import type { TemplateOp } from './operations.js'
import type {
    DocScalar,
    Initiator,
    QnrTemplateDocument,
    QnrTemplateMeta,
    RequiredAccessLevel,
    TemplateUpdateMode,
    TemplateVisibility,
} from './templateDocument.js'
import { INITIATORS, TEMPLATE_UPDATE_MODES, TEMPLATE_VISIBILITIES } from './templateDocument.js'

/**
 * The template metadata/settings authoring surface: one exact-path registry, one non-mutating
 * total reader, and the canonical loci concurrent intent is compared on.
 *
 * **Why a registry rather than three agreeing implementations.** The reducer, the canonical write
 * boundary, the legacy importer and the authoring UI must share one vocabulary and one set of
 * defaults, because the hash is computed on the minimal form: if the importer thought
 * `rendering.refresh_button` defaulted to `false` and the reducer thought `true`, an imported
 * template and the same template re-authored by hand would carry two `document_hash` values for one
 * authored state — minting a spurious version and reading as divergence against the import. So the
 * defaults are declared once, here, and every consumer reads them from this module.
 *
 * **Why the paths are absolute and matched exactly.** The released `templateDocumentIsDefault`
 * matches its default names by *suffix* (`path.endsWith('.' + name)`), which was safe for the three
 * names it carried and is not safe for this vocabulary: `title`, `enabled` and `refresh_button` are
 * ordinary words that appear in imported unknown bags, inside presentation profiles and on questions.
 * A suffix rule would prune a coincidentally-named unknown key — silent data loss in a hashed
 * document. Every path declared here is therefore the complete document-absolute path, anchored at
 * the document root the way `reduceToMinimalForm` is invoked on a whole document.
 *
 * **Why this registry is NOT retrofitted onto the released canonical form.** See
 * `templateAuthoringIsDefault` in `schemas.ts`: three of the paths below (`requiredAccessLevel`,
 * `initiator`, `template_update_mode`) are released schema members with no declared default, so an
 * already-stored document may legitimately carry them spelled out. Declaring their defaults inside
 * the released predicate would change those documents' canonical bytes and therefore their
 * `document_hash` — i.e. it would break the immutable versions this work must preserve. The released
 * predicate stays byte-identical and the expanded one applies to new writes and new canonical
 * imports only.
 *
 * @see asma-modules/_docs/editor/qnrs/cross/2026-07-12-20-20-architecture-qnr-v2-model-collaboration-sync.md:195 — DOC-LAW-2
 */

// ─────────────────────────────── the closed field vocabulary ───────────────────────────────

/**
 * The seven editable metadata paths, relative to `meta`, and the value each one takes.
 *
 * A correlated union rather than `{ field: string; value: OpValue }`: the value a path accepts is a
 * property OF the path, so a single loose pair would type-check `{field: 'visibility', value: 7}`
 * and leave the reducer as the only thing that noticed — a runtime refusal for something the
 * compiler can prevent. The op arms in `operations.ts` are derived from this union, so adding a
 * field here is what adds it to the wire, and nothing can drift between the two declarations.
 *
 * `legacy.plan_category` is deliberately NOT a member. It is import-preserved compatibility residue
 * with no asserted default, not a control an author sets; giving it an authoring arm would invent a
 * product meaning this work is not authorized to invent.
 */
export type TemplateMetaFieldWrite =
    | { field: 'title'; value: string }
    | { field: 'description'; value: string }
    | { field: 'visibility'; value: TemplateVisibility }
    | { field: 'instancePolicy.requiredAccessLevel'; value: RequiredAccessLevel }
    | { field: 'instancePolicy.invitationRequired'; value: boolean }
    | { field: 'instancePolicy.initiator'; value: Initiator }
    | { field: 'instancePolicy.template_update_mode'; value: TemplateUpdateMode }

/** The seven metadata paths a typed operation may write. */
export type MetaField = TemplateMetaFieldWrite['field']

/** Every value any metadata path accepts. Correlation lives in {@link TemplateMetaFieldWrite}. */
export type MetaFieldValue = TemplateMetaFieldWrite['value']

/**
 * The 23 settings leaves, as group-relative paths under `meta.settings`.
 *
 * Grouped by the surface they configure rather than flattened, because the groups are what make the
 * minimal form prunable: unsetting the last leaf of `rendering` removes `rendering`, and unsetting
 * the last group removes `settings` (DOC-LAW-2). Every leaf is a boolean; the only non-false default
 * is `rendering.refresh_button`.
 */
export const TEMPLATE_SETTING_FIELDS = [
    'journal.auto_import',
    'journal.requires_activity_id',
    'journal.register_new_activity',
    'journal.user_context_me',
    'pdf.import',
    'pdf.generate_for_participant',
    'pdf.send_to_journal',
    'rendering.tabs',
    'rendering.continuous',
    'rendering.multi_step',
    'rendering.collapse_all',
    'rendering.top_level_actions',
    'rendering.refresh_button',
    'rendering.filter_document_reports_on_tab',
    'rendering.hide_recipient_info',
    'lifecycle.rejectable',
    'lifecycle.shareable',
    'lifecycle.allow_multiple',
    'lifecycle.generate_on_start',
    'recipient.requires_phone_number',
    'highlight.enabled',
    'highlight.show_to_recipient',
    'distribution.mirror_to_advoca',
] as const

export type SettingField = (typeof TEMPLATE_SETTING_FIELDS)[number]

/** The seven metadata paths as a runtime list, so a consumer can iterate the vocabulary it renders. */
export const TEMPLATE_META_FIELDS = [
    'title',
    'description',
    'visibility',
    'instancePolicy.requiredAccessLevel',
    'instancePolicy.invitationRequired',
    'instancePolicy.initiator',
    'instancePolicy.template_update_mode',
] as const satisfies readonly MetaField[]

/**
 * The owner-domain soft-reference sets (REQ-013): ids only, no bodies, no FK validation.
 *
 * Authored by membership add/remove rather than whole-array writes, for DOC-LAW-1's reason: two
 * authors adding different ids concurrently produce two member edits that both survive, where two
 * whole-array patches would have the second discard the first.
 */
export const COMPATIBILITY_COLLECTIONS = ['consentTemplateIds', 'smsTemplateIds'] as const
export type CompatibilityCollection = (typeof COMPATIBILITY_COLLECTIONS)[number]

export const isMetaField = (value: unknown): value is MetaField =>
    typeof value === 'string' && (TEMPLATE_META_FIELDS as readonly string[]).includes(value)

export const isSettingField = (value: unknown): value is SettingField =>
    typeof value === 'string' && (TEMPLATE_SETTING_FIELDS as readonly string[]).includes(value)

export const isCompatibilityCollection = (value: unknown): value is CompatibilityCollection =>
    typeof value === 'string' && (COMPATIBILITY_COLLECTIONS as readonly string[]).includes(value)

// ─────────────────────────────── defaults, by exact path ───────────────────────────────

/** The metadata defaults, keyed by document-absolute path. Absent is the only encoding of each. */
export const TEMPLATE_META_DEFAULTS = {
    title: '',
    description: '',
    visibility: 'visible',
    'instancePolicy.requiredAccessLevel': 4,
    'instancePolicy.invitationRequired': false,
    'instancePolicy.initiator': 'coordinator',
    'instancePolicy.template_update_mode': 'never',
} as const satisfies Record<MetaField, MetaFieldValue>

/**
 * The settings defaults.
 *
 * `rendering.refresh_button` is the one `true`: legacy's flag model initialises it on, so a template
 * that never mentions it still shows the refresh control. Evidence is
 * `asma-app-editor/src/mst/models/flags/QnrFlagsBase.model.ts`. Getting this one wrong is not a
 * cosmetic defect — it flips a control for every imported template that omits the flag.
 */
export const TEMPLATE_SETTING_DEFAULTS = {
    'journal.auto_import': false,
    'journal.requires_activity_id': false,
    'journal.register_new_activity': false,
    'journal.user_context_me': false,
    'pdf.import': false,
    'pdf.generate_for_participant': false,
    'pdf.send_to_journal': false,
    'rendering.tabs': false,
    'rendering.continuous': false,
    'rendering.multi_step': false,
    'rendering.collapse_all': false,
    'rendering.top_level_actions': false,
    'rendering.refresh_button': true,
    'rendering.filter_document_reports_on_tab': false,
    'rendering.hide_recipient_info': false,
    'lifecycle.rejectable': false,
    'lifecycle.shareable': false,
    'lifecycle.allow_multiple': false,
    'lifecycle.generate_on_start': false,
    'recipient.requires_phone_number': false,
    'highlight.enabled': false,
    'highlight.show_to_recipient': false,
    'distribution.mirror_to_advoca': false,
} as const satisfies Record<SettingField, boolean>

/** `meta.<field>` — the document-absolute path (and canonical conflict locus) of a metadata field. */
export const metaFieldPath = (field: MetaField): string => `meta.${field}`

/** `meta.settings.<field>` — the document-absolute path (and locus) of a settings leaf. */
export const settingFieldPath = (field: SettingField): string => `meta.settings.${field}`

/** `meta.compatibility.<collection>` — the whole set, which overlaps every one of its members. */
export const compatibilityCollectionPath = (collection: CompatibilityCollection): string =>
    `meta.compatibility.${collection}`

/**
 * The locus of ONE member of a soft-id set.
 *
 * The id is an opaque bracketed member, not a dotted path segment: a soft id may legitimately contain
 * a `.` (and legacy numeric ids stringify to anything), so `meta.compatibility.consentTemplateIds.a.b`
 * would be ambiguous between the id `a.b` and a nested path. `JSON.stringify` escapes quotes and
 * backslashes, which makes the encoding injective — two different ids can never produce one locus,
 * and a locus can never be mistaken for an ancestor of another member.
 *
 * NFC-normalised for the same reason the stored set is (see `normalizeCompatibilityId`): the canonical
 * serializer normalises strings, so two NFC-equivalent spellings are ONE member and must be ONE locus.
 */
export const compatibilityIdPath = (collection: CompatibilityCollection, id: string): string =>
    `${compatibilityCollectionPath(collection)}[${JSON.stringify(id.normalize('NFC'))}]`

/**
 * Every default this surface declares, by exact document-absolute path.
 *
 * A `Map` rather than an object so a path containing a `__proto__`-shaped segment cannot reach
 * `Object.prototype` during lookup.
 */
export const TEMPLATE_AUTHORING_DEFAULTS: ReadonlyMap<string, MetaFieldValue | boolean> = new Map<
    string,
    MetaFieldValue | boolean
>([
    ...TEMPLATE_META_FIELDS.map(
        (field): [string, MetaFieldValue] => [metaFieldPath(field), TEMPLATE_META_DEFAULTS[field]],
    ),
    ...TEMPLATE_SETTING_FIELDS.map(
        (field): [string, boolean] => [settingFieldPath(field), TEMPLATE_SETTING_DEFAULTS[field]],
    ),
])

/**
 * Whether `value` at `path` is this surface's declared default and must therefore be omitted.
 *
 * Exact-path only, by design — see the module header. Feeds `templateAuthoringIsDefault`, which is
 * the canonical-write predicate; it is deliberately NOT part of the released
 * `templateDocumentIsDefault` used to verify historical stored snapshots.
 */
export const isTemplateAuthoringDefault = (path: string, value: unknown): boolean =>
    TEMPLATE_AUTHORING_DEFAULTS.has(path) && TEMPLATE_AUTHORING_DEFAULTS.get(path) === value

/** The declared default of a metadata field — total, so a reader never spells one itself. */
export const templateMetaDefault = <F extends MetaField>(field: F): (typeof TEMPLATE_META_DEFAULTS)[F] =>
    TEMPLATE_META_DEFAULTS[field]

/** The declared default of a settings leaf. */
export const templateSettingDefault = (field: SettingField): boolean => TEMPLATE_SETTING_DEFAULTS[field]

// ─────────────────────────────── recognized historical spellings ───────────────────────────────

/**
 * How competing spellings of one field resolve.
 *
 * Two strategies, and the difference is not stylistic — it is the difference between a conservative
 * requirement and a replaceable preference:
 *
 * - **`or`** — the journal activity-id and auto-import aliases. Legacy carries three spellings of the
 *   activity requirement (`activityId_required`, `soknadid_required`, the misspelled
 *   `sokndaid_required`), written by different code paths over the years, and a template that set ANY
 *   of them required an activity id. Taking the last entry would silently drop the requirement for
 *   whichever spelling happened to come second in key order, so these OR — and disagreeing booleans
 *   are reported, never resolved silently.
 * - **`canonical-first`** — everything else. The canonical own-property wins when present, else the
 *   first recognized alias wins. Phone is the named case: it must NOT OR, because the new typed
 *   vocabulary is `requires_phone_number` and an author who turns the requirement OFF must see it
 *   off — an OR would let the stale `ask_for_phone_nr: true` outvote the explicit new `false`.
 *   (The reducer additionally clears the alias on a typed write, so the stale value cannot survive to
 *   be read at all; the reader's precedence is the second half of that guarantee, for documents no
 *   typed op has touched yet.)
 */
export type TemplateAliasStrategy = 'or' | 'canonical-first'

export type TemplateAliasRule = {
    /** Document-absolute recognized historical spellings, in precedence order. */
    readonly aliasPaths: readonly string[]
    readonly strategy: TemplateAliasStrategy
}

/** `meta.settings.<name>` — where legacy's flat flag bag landed on import. */
const flatSettingAlias = (name: string): string => `meta.settings.${name}`

/**
 * The recognized alias spellings, keyed by canonical document-absolute path.
 *
 * Closed and explicit: a spelling absent here is an ordinary unknown member that this surface must
 * leave alone, not a value it may read or clear. Extending the table is the only way to recognize a
 * new legacy spelling, which is what keeps "recognized alias" from becoming "anything that looks
 * related".
 */
export const TEMPLATE_AUTHORING_ALIASES: ReadonlyMap<string, TemplateAliasRule> = new Map<string, TemplateAliasRule>([
    // M-008: the field map's `doc.meta.initiator` is a location drift. The canonical producer home is
    // `meta.instancePolicy.initiator`; the root spelling is readable, never written, and cleared on a
    // typed write so choosing the omitted default cannot resurrect it.
    ['meta.instancePolicy.initiator', { aliasPaths: ['meta.initiator'], strategy: 'canonical-first' }],
    // M-009: legacy's assurance tier arrived as `meta.security_level`. Every explicit tier is preserved
    // without binary remapping, so the alias is read as a tier and not as "authenticated yes/no".
    [
        'meta.instancePolicy.requiredAccessLevel',
        { aliasPaths: ['meta.security_level'], strategy: 'canonical-first' },
    ],
    // M-023: `is_auto_importable` is the accepted second spelling.
    [
        'meta.settings.journal.auto_import',
        { aliasPaths: [flatSettingAlias('auto_import'), flatSettingAlias('is_auto_importable')], strategy: 'or' },
    ],
    // M-024/025: three legacy spellings of one requirement, the third a preserved misspelling.
    [
        'meta.settings.journal.requires_activity_id',
        {
            aliasPaths: [
                flatSettingAlias('activityId_required'),
                flatSettingAlias('soknadid_required'),
                flatSettingAlias('sokndaid_required'),
            ],
            strategy: 'or',
        },
    ],
    ['meta.settings.journal.register_new_activity', { aliasPaths: [flatSettingAlias('reg_new_activity')], strategy: 'canonical-first' }],
    ['meta.settings.journal.user_context_me', { aliasPaths: [flatSettingAlias('user_context_me')], strategy: 'canonical-first' }],
    ['meta.settings.pdf.import', { aliasPaths: [flatSettingAlias('import_pdf')], strategy: 'canonical-first' }],
    ['meta.settings.pdf.generate_for_participant', { aliasPaths: [flatSettingAlias('generate_pdf_for_participant')], strategy: 'canonical-first' }],
    ['meta.settings.pdf.send_to_journal', { aliasPaths: [flatSettingAlias('send_pdf_to_journal')], strategy: 'canonical-first' }],
    ['meta.settings.rendering.tabs', { aliasPaths: [flatSettingAlias('tab_mode')], strategy: 'canonical-first' }],
    ['meta.settings.rendering.continuous', { aliasPaths: [flatSettingAlias('continuous')], strategy: 'canonical-first' }],
    ['meta.settings.rendering.multi_step', { aliasPaths: [flatSettingAlias('multi_step_questionnaire')], strategy: 'canonical-first' }],
    ['meta.settings.rendering.collapse_all', { aliasPaths: [flatSettingAlias('collapse_all')], strategy: 'canonical-first' }],
    ['meta.settings.rendering.top_level_actions', { aliasPaths: [flatSettingAlias('top_level_actions')], strategy: 'canonical-first' }],
    ['meta.settings.rendering.refresh_button', { aliasPaths: [flatSettingAlias('refresh_button')], strategy: 'canonical-first' }],
    ['meta.settings.rendering.filter_document_reports_on_tab', { aliasPaths: [flatSettingAlias('filter_document_reports_on_tab')], strategy: 'canonical-first' }],
    // M-038: legacy `hide_external_key` hides recipient-identifying columns; the v2 name states what is
    // hidden rather than preserving the legacy key's name for a thing that is not a key.
    ['meta.settings.rendering.hide_recipient_info', { aliasPaths: [flatSettingAlias('hide_external_key')], strategy: 'canonical-first' }],
    ['meta.settings.lifecycle.rejectable', { aliasPaths: [flatSettingAlias('rejectable')], strategy: 'canonical-first' }],
    ['meta.settings.lifecycle.shareable', { aliasPaths: [flatSettingAlias('shareable')], strategy: 'canonical-first' }],
    ['meta.settings.lifecycle.allow_multiple', { aliasPaths: [flatSettingAlias('allow_multiple')], strategy: 'canonical-first' }],
    ['meta.settings.lifecycle.generate_on_start', { aliasPaths: [flatSettingAlias('generate_on_start')], strategy: 'canonical-first' }],
    // M-043: the released typed spelling `settings.recipient.ask_for_phone_nr` is itself now an alias —
    // it shipped, so documents carry it and it must stay readable and replayable (ADR-0008 DEC-006).
    // The flat legacy spelling is the second alias. New producers write only `requires_phone_number`.
    [
        'meta.settings.recipient.requires_phone_number',
        {
            aliasPaths: ['meta.settings.recipient.ask_for_phone_nr', flatSettingAlias('ask_for_phone_nr')],
            strategy: 'canonical-first',
        },
    ],
    ['meta.settings.highlight.enabled', { aliasPaths: [flatSettingAlias('highlight_rule')], strategy: 'canonical-first' }],
    ['meta.settings.highlight.show_to_recipient', { aliasPaths: [flatSettingAlias('show_highlight_rule_to_patient')], strategy: 'canonical-first' }],
    ['meta.settings.distribution.mirror_to_advoca', { aliasPaths: [flatSettingAlias('mirror_to_advoca')], strategy: 'canonical-first' }],
])

/** The recognized alias paths of one canonical path, or none. */
export const templateAliasPathsOf = (canonicalPath: string): readonly string[] =>
    TEMPLATE_AUTHORING_ALIASES.get(canonicalPath)?.aliasPaths ?? []

/**
 * The canonical paths a write at `path` reaches through the recognized alias table.
 *
 * **Overlap, not equality**, and that distinction was a reproduced defect. An open patch writing
 * `initiator.unresolved` is writing INSIDE the recognized alias `meta.initiator`: it makes that path
 * an object, and the next typed initiator write deletes the alias wholesale — taking the intervening
 * data with it. Matching the alias exactly classified the two as disjoint, so the orders produced
 * different documents with no conflict raised, which is precisely the lost update the locus
 * machinery exists to catch. Ancestor and descendant both count, the same way they do for canonical
 * loci.
 *
 * Plural because one legacy spelling could in principle serve two canonical fields; the lookup is a
 * scan rather than a reverse index so the forward table stays the single declaration.
 */
export const templateCanonicalPathsTouchedByAlias = (path: string): readonly string[] =>
    [...TEMPLATE_AUTHORING_ALIASES.entries()]
        .filter(([, rule]) => rule.aliasPaths.some((aliasPath) => templateLociOverlap(path, aliasPath)))
        .map(([canonicalPath]) => canonicalPath)

// ─────────────────────────────── the non-mutating total reader ───────────────────────────────

/**
 * What a reader could not resolve cleanly. A finding is the difference between "the author never set
 * this" and "the stored value is unusable": without it a malformed known value would be shown as its
 * default, and the author would see a setting that reads `off` over a document that says something
 * else entirely.
 */
export type TemplateAuthoringFinding = {
    kind:
        | 'malformed-value'
        /** Two recognized spellings of one field are both present and disagree. */
        | 'alias-disagreement'
        /** A recognized legacy spelling supplied the effective value; no canonical property exists yet. */
        | 'legacy-alias-read'
        /** A soft-id set, or one of its members, is not a law-valid primitive set. */
        | 'malformed-collection'
        /**
         * An ancestor container on the way to this field is not a container, so the field cannot be
         * read — and the typed operations refuse to write through it. Distinct from
         * `malformed-value`, which is about the leaf itself: here the leaf was never reached.
         */
        | 'malformed-ancestor'
    /** The canonical locus the finding is about. */
    locus: string
    /** The exact document paths the evidence was read from. */
    paths: readonly string[]
    detail: string
}

/**
 * The hydrated metadata surface — total, because the stored document is minimal.
 *
 * **Never persisted.** This is the read-side hydration the architecture puts at the document
 * boundary; writing it back would store every default and change `document_hash` for a document
 * nobody edited. `settings` is flat, keyed by the same group-relative paths the operations use, so a
 * UI renders the 23 controls by iterating `TEMPLATE_SETTING_FIELDS` and an app never re-spells the
 * nesting.
 */
export type ResolvedTemplateAuthoringMeta = {
    title: string
    description: string
    visibility: TemplateVisibility
    instancePolicy: {
        requiredAccessLevel: RequiredAccessLevel
        invitationRequired: boolean
        initiator: Initiator
        template_update_mode: TemplateUpdateMode
    }
    settings: Record<SettingField, boolean>
    compatibility: Record<CompatibilityCollection, readonly string[]>
    /**
     * Import-preserved residue, surfaced read-only and shaped exactly as stored. Optional rather
     * than defaulted: `plan_category` has no asserted default, and inventing `{}` here would tempt a
     * consumer to persist an empty container DOC-LAW-2 forbids.
     */
    legacy?: { plan_category?: DocScalar; flags?: Record<string, unknown> }
    findings: readonly TemplateAuthoringFinding[]
}

/**
 * The traversal root every canonical path is anchored at.
 *
 * Paths in this module are document-absolute (`meta.settings.rendering.tabs`) because they are also
 * the conflict loci, and a locus that dropped its `meta.` prefix would not match the path a conflict
 * record carries. So the reader wraps the metadata it was handed in a document-shaped root rather than
 * stripping the prefix at 30 call sites — one wrapper, and the registry stays the only place a path is
 * spelled.
 */
type MetaRoot = { meta: QnrTemplateMeta | undefined }

/**
 * An own-property read along a dotted path, with THREE outcomes rather than two.
 *
 * `blocked` is the one that cannot be folded into `absent`, and folding it was a real defect: when an
 * import leaves a scalar at `meta.settings.rendering`, every leaf below it is unreadable, and
 * reporting that as absence hands the author eight ordinary-looking defaults over a document that
 * says something else — while the reducer separately REFUSES to write there. The reader and the
 * writer have to agree about which paths are blocked, so the reader names the blocking path instead
 * of quietly treating it as "not set".
 */
type PathRead =
    | { status: 'absent' }
    | { status: 'present'; value: unknown }
    /** `blockedAt` is already document-absolute: the walk starts at the `{ meta }` root. */
    | { status: 'blocked'; blockedAt: string; value: unknown }

const ABSENT: PathRead = { status: 'absent' }

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
    if (typeof value !== 'object' || value === null) return false
    const proto = Object.getPrototypeOf(value)
    return proto === Object.prototype || proto === null
}

/**
 * Reads a dotted path by OWN properties only.
 *
 * `in` and plain member access would both walk the prototype chain, so a path ending in `constructor`
 * or `toString` would report a value no document stores. `Object.hasOwn` is the check that makes
 * "the document says so" the only way a value is present.
 */
const readOwnPath = (root: unknown, path: string): PathRead => {
    const segments = path.split('.')
    let current: unknown = root
    let walked = ''
    for (const segment of segments) {
        // `undefined` is ABSENCE at every depth, never a blocked container: the reader is handed
        // `{ meta: undefined }` for a brand-new family that carries no `meta` key at all, and calling
        // that malformed would put a finding on every field of an empty document.
        if (current === undefined) return ABSENT
        if (!isPlainObject(current)) return { status: 'blocked', blockedAt: walked, value: current }
        if (!Object.hasOwn(current, segment)) return ABSENT
        current = current[segment]
        walked = walked === '' ? segment : `${walked}.${segment}`
    }
    return current === undefined ? ABSENT : { status: 'present', value: current }
}

/** A field's own validator: the effective value, or `undefined` when the stored value is unusable. */
type ValueReader<T> = (value: unknown) => T | undefined

const readBoolean: ValueReader<boolean> = (value) => (typeof value === 'boolean' ? value : undefined)
const readString: ValueReader<string> = (value) => (typeof value === 'string' ? value : undefined)
const readEnumerated = <T extends string>(allowed: readonly T[]): ValueReader<T> => (value) =>
    typeof value === 'string' && (allowed as readonly string[]).includes(value) ? (value as T) : undefined

const REQUIRED_ACCESS_LEVELS: readonly RequiredAccessLevel[] = [1, 2, 3, 4]
const readAccessLevel: ValueReader<RequiredAccessLevel> = (value) =>
    REQUIRED_ACCESS_LEVELS.find((level) => level === value)

/**
 * What each metadata field accepts — the SINGLE declaration, read by both the total reader and the
 * reducer's replay re-validation.
 *
 * One table rather than a validator per consumer: the reducer must re-check a replayed op (a stored
 * log replays with no validator in front of it), and if it spelled the check itself that spelling
 * would be free to drift from the reader's. `satisfies` keeps each entry's precise value type, so a
 * reader wired to the wrong field is a compile error.
 */
const META_FIELD_READERS = {
    title: readString,
    description: readString,
    visibility: readEnumerated(TEMPLATE_VISIBILITIES),
    'instancePolicy.requiredAccessLevel': readAccessLevel,
    'instancePolicy.invitationRequired': readBoolean,
    'instancePolicy.initiator': readEnumerated(INITIATORS),
    'instancePolicy.template_update_mode': readEnumerated(TEMPLATE_UPDATE_MODES),
} as const satisfies {
    [F in MetaField]: ValueReader<Extract<TemplateMetaFieldWrite, { field: F }>['value']>
}

/**
 * The value a metadata field accepts, or `undefined` when the candidate is not one.
 *
 * The cast is the one place a union of precise readers has to be called through a dynamic field: each
 * entry accepts `unknown` and returns its own field's value type, so widening the return to
 * `MetaFieldValue` is sound — it is the union of exactly those types.
 */
export const parseMetaFieldValue = (field: MetaField, value: unknown): MetaFieldValue | undefined =>
    (META_FIELD_READERS[field] as ValueReader<MetaFieldValue>)(value)

/**
 * Resolves one field from its canonical path and recognized aliases, collecting findings.
 *
 * The four outcomes a caller must be able to tell apart, and why each needs its own treatment:
 * absent (use the default, say nothing), canonical present (use it), alias-only present (use it and
 * say so, because the next typed write will replace the spelling), and malformed (use the default but
 * record that the document disagrees — the one case where showing the default silently would be a
 * lie).
 */
const resolveField = <T>(
    root: MetaRoot,
    canonicalPath: string,
    fallback: T,
    read: ValueReader<T>,
    findings: TemplateAuthoringFinding[],
    combine?: (left: T, right: T) => T,
): T => {
    const rule = TEMPLATE_AUTHORING_ALIASES.get(canonicalPath)

    /**
     * One spelling's contribution: the parsed value when the document holds a usable one, plus
     * whether the document holds an own property there AT ALL.
     *
     * The two are separate because a malformed value is PRESENT. Collapsing them is what let a stale
     * `ask_for_phone_nr: true` outvote an explicit canonical `requires_phone_number: 'false'` — the
     * canonical property existed, so no alias should have been consulted, but a malformed parse looked
     * exactly like absence.
     */
    const readSpelling = (path: string): { present: boolean; value: T | undefined } => {
        const raw = readOwnPath(root, path)
        if (raw.status === 'absent') return { present: false, value: undefined }

        if (raw.status === 'blocked') {
            findings.push({
                kind: 'malformed-ancestor',
                locus: canonicalPath,
                paths: [raw.blockedAt],
                detail:
                    `"${raw.blockedAt}" holds ${describeContainer(raw.value)}, not a container, so ` +
                    `"${path}" cannot be read; the typed operations refuse to write through it`,
            })
            // Blocked is NOT presence: there is no own property to defend, and the field has no
            // trustworthy value. The finding is what keeps the returned default distinguishable from
            // an authored one.
            return { present: false, value: undefined }
        }

        const parsed = read(raw.value)
        if (parsed === undefined) {
            findings.push({
                kind: 'malformed-value',
                locus: canonicalPath,
                paths: [path],
                detail: `stored value ${JSON.stringify(raw.value) ?? String(raw.value)} is not a valid value for this field`,
            })
        }
        return { present: true, value: parsed }
    }

    const canonical = readSpelling(canonicalPath)

    /**
     * Aliases are always READ, because a stale spelling is worth REPORTING even when it cannot win.
     * What the strategy below decides is only whether one may supply the effective value.
     */
    const aliasValues = (rule?.aliasPaths ?? [])
        .map((path) => ({ path, value: readSpelling(path).value }))
        .filter((entry): entry is { path: string; value: T } => entry.value !== undefined)

    // The OR strategy folds canonical and aliases together: any spelling asserting `true` wins, and a
    // disagreement is reported rather than resolved by key order.
    //
    // **This is deliberately NOT the canonical-first rule below, and the frozen contract says so in
    // both directions.** The two journal fields unify several legacy spellings of ONE requirement
    // written by different code paths over the years, so a template that set any of them required an
    // activity id; resolving to the canonical `false` while `soknadid_required: true` is still stored
    // would silently drop that requirement. Phone is the explicit counter-case — it "never ORs
    // competing canonical/old phone keys" — which is why it uses canonical-first and this does not.
    // The suite pins that only these two boolean settings leaves use `or`.
    //
    // `combine` is supplied by the caller rather than carried on the rule, because a combiner on the
    // rule would have to be typed over every field's value type at once. Every `or` rule in the table
    // is a boolean settings leaf, which is what makes one `||` combiner sufficient — and that
    // invariant is asserted in the suite rather than left as a comment, so a future `or` rule on a
    // non-boolean field is a red test and not a silent fall-through to canonical-first.
    if (rule?.strategy === 'or' && combine !== undefined) {
        const contributors = [
            ...(canonical.value === undefined ? [] : [{ path: canonicalPath, value: canonical.value }]),
            ...aliasValues,
        ]
        if (contributors.length === 0) return fallback
        const folded = contributors.reduce<T>((acc, entry) => combine(acc, entry.value), contributors[0]!.value)
        if (contributors.some((entry) => entry.value !== folded)) {
            findings.push({
                kind: 'alias-disagreement',
                locus: canonicalPath,
                paths: contributors.map((entry) => entry.path),
                detail: `recognized spellings disagree; resolved conservatively to ${JSON.stringify(folded)}`,
            })
        }
        return folded
    }

    /**
     * **Canonical-first: an alias may supply the value ONLY while the canonical property is absent.**
     *
     * The malformed half is the one that was wrong and is reproduced in the suite: a canonical
     * `requires_phone_number: 'false'` is PRESENT — the author wrote this field, here — and a stale
     * `ask_for_phone_nr: true` must not be allowed to re-decide it just because the stored value does
     * not parse. Treating "unusable" as "absent" is what let the old spelling win. A malformed
     * canonical therefore resolves to the declared default, with the `malformed-value` finding already
     * recorded above so the default is never mistaken for an authored one.
     */
    if (canonical.present) {
        if (canonical.value === undefined) return fallback

        // A disagreeing alias is still a classified finding: it is a stale value a reader on an older
        // contract could pick up, and the next typed write is what clears it.
        const disagreeing = aliasValues.filter((entry) => entry.value !== canonical.value)
        if (disagreeing.length > 0) {
            findings.push({
                kind: 'alias-disagreement',
                locus: canonicalPath,
                paths: [canonicalPath, ...disagreeing.map((entry) => entry.path)],
                detail: `canonical value ${JSON.stringify(canonical.value)} wins over ${disagreeing
                    .map((entry) => `${entry.path}=${JSON.stringify(entry.value)}`)
                    .join(', ')}`,
            })
        }
        return canonical.value
    }

    const first = aliasValues[0]
    if (first !== undefined) {
        findings.push({
            kind: 'legacy-alias-read',
            locus: canonicalPath,
            paths: [first.path],
            detail: `effective value read from the recognized legacy spelling "${first.path}"`,
        })
        const disagreeing = aliasValues.slice(1).filter((entry) => entry.value !== first.value)
        if (disagreeing.length > 0) {
            findings.push({
                kind: 'alias-disagreement',
                locus: canonicalPath,
                paths: [first.path, ...disagreeing.map((entry) => entry.path)],
                detail: 'recognized legacy spellings disagree; the first recognized one wins',
            })
        }
        return first.value
    }

    return fallback
}

/** Names what a blocking value actually is, so a finding reads as evidence rather than a category. */
const describeContainer = (value: unknown): string =>
    value === null ? 'null' : Array.isArray(value) ? 'an array' : `a ${typeof value}`

/**
 * The canonical member form of one soft id.
 *
 * Two normalisations, each for a stated reason:
 *
 * - **A legacy numeric id becomes its lossless decimal string.** The sets are declared `string[]`, and
 *   legacy template ids are integers; `String(n)` round-trips every JS number that can be an id, so
 *   the port keeps the identity instead of dropping the association.
 * - **NFC.** `canonicalJson` NFC-normalises strings, so two NFC-equivalent spellings of one id
 *   serialise to the same bytes. Deduplicating on the raw strings would therefore store two members
 *   that canonicalize to one, which is a duplicate inside a *set* and a second encoding of one state.
 */
export const normalizeCompatibilityId = (value: unknown): string | undefined => {
    if (typeof value === 'string') return value.length === 0 ? undefined : value.normalize('NFC')
    if (typeof value === 'number' && Number.isFinite(value)) return String(value)
    return undefined
}

/**
 * The id a NEW typed membership operation may carry: a nonempty string, NFC-normalised. Never a number.
 *
 * Separate from {@link normalizeCompatibilityId} on purpose, and the separation is the point. Numeric
 * tolerance exists for **stored legacy members** — ids the port inherited and must not drop. A new
 * operation is authored today against a contract whose wire schema says `string > 0`, so accepting
 * `id: 42` in the reducer would mean the schema and the replay path disagree about what the vocabulary
 * is: an op refused at the boundary would still land when replayed from a log. One spelling for new
 * producers, full tolerance for old data.
 */
export const parseCompatibilityOperationId = (value: unknown): string | undefined =>
    typeof value === 'string' && value.length > 0 ? value.normalize('NFC') : undefined

/**
 * The canonical stored form of a touched soft-id set: sorted, unique, NFC.
 *
 * Sorted by UTF-16 code unit, which is the same comparison `canonicalJson` uses for object keys —
 * one ordering rule in the contract rather than two. Sorting at all is what makes the set's identity
 * independent of the order members were added in: two authors who add the same two ids in opposite
 * orders must produce one document, not two hashes.
 */
export const normalizeCompatibilityIds = (ids: readonly string[]): string[] => [...new Set(ids)].sort()

/** A stored collection, read with its malformed members reported rather than silently dropped. */
const resolveCompatibilityCollection = (
    root: MetaRoot,
    collection: CompatibilityCollection,
    findings: TemplateAuthoringFinding[],
): readonly string[] => {
    const locus = compatibilityCollectionPath(collection)
    const raw = readOwnPath(root, locus)
    if (raw.status === 'absent') return []

    if (raw.status === 'blocked') {
        findings.push({
            kind: 'malformed-ancestor',
            locus,
            paths: [raw.blockedAt],
            detail:
                `"${raw.blockedAt}" holds ${describeContainer(raw.value)}, not a container, so ` +
                `"${locus}" cannot be read; the typed membership operations refuse to write through it`,
        })
        return []
    }

    if (!Array.isArray(raw.value)) {
        findings.push({
            kind: 'malformed-collection',
            locus,
            paths: [locus],
            detail: `stored value is ${describeContainer(raw.value)}, not an array of soft ids`,
        })
        return []
    }

    const members: string[] = []
    raw.value.forEach((member: unknown, index: number) => {
        const normalized = normalizeCompatibilityId(member)
        if (normalized === undefined) {
            findings.push({
                kind: 'malformed-collection',
                locus,
                paths: [`${locus}.${index}`],
                detail: `member ${index} is not a nonempty soft id`,
            })
            return
        }
        members.push(normalized)
    })

    return normalizeCompatibilityIds(members)
}

/**
 * The one total reader over the stored metadata — the single declaration of what this surface means.
 *
 * **Non-mutating, and that is load-bearing rather than hygiene.** The caller is usually holding the
 * live document the reducer also holds, so a reader that filled in a default would change the hashed
 * bytes of a document nobody edited — minting a version from a page load. Nothing here writes to
 * `meta`, and the returned `compatibility` arrays are fresh.
 *
 * Accepts `undefined` so a brand-new family (no `meta` key at all, DOC-LAW-2) resolves to the same
 * total object as a document that spelled every default out.
 */
export const resolveTemplateAuthoringMeta = (
    meta: QnrTemplateMeta | undefined,
): ResolvedTemplateAuthoringMeta => {
    const findings: TemplateAuthoringFinding[] = []
    const root: MetaRoot = { meta }
    const orBoolean = (left: boolean, right: boolean): boolean => left || right

    const settings = Object.fromEntries(
        TEMPLATE_SETTING_FIELDS.map((field) => [
            field,
            resolveField(
                root,
                settingFieldPath(field),
                TEMPLATE_SETTING_DEFAULTS[field],
                readBoolean,
                findings,
                orBoolean,
            ),
        ]),
    ) as Record<SettingField, boolean>

    const resolved: ResolvedTemplateAuthoringMeta = {
        title: resolveField(root, 'meta.title', TEMPLATE_META_DEFAULTS.title, META_FIELD_READERS.title, findings),
        description: resolveField(
            root,
            'meta.description',
            TEMPLATE_META_DEFAULTS.description,
            META_FIELD_READERS.description,
            findings,
        ),
        visibility: resolveField(
            root,
            'meta.visibility',
            TEMPLATE_META_DEFAULTS.visibility,
            META_FIELD_READERS.visibility,
            findings,
        ),
        instancePolicy: {
            requiredAccessLevel: resolveField(
                root,
                'meta.instancePolicy.requiredAccessLevel',
                TEMPLATE_META_DEFAULTS['instancePolicy.requiredAccessLevel'],
                META_FIELD_READERS['instancePolicy.requiredAccessLevel'],
                findings,
            ),
            invitationRequired: resolveField(
                root,
                'meta.instancePolicy.invitationRequired',
                TEMPLATE_META_DEFAULTS['instancePolicy.invitationRequired'],
                META_FIELD_READERS['instancePolicy.invitationRequired'],
                findings,
            ),
            initiator: resolveField(
                root,
                'meta.instancePolicy.initiator',
                TEMPLATE_META_DEFAULTS['instancePolicy.initiator'],
                META_FIELD_READERS['instancePolicy.initiator'],
                findings,
            ),
            template_update_mode: resolveField(
                root,
                'meta.instancePolicy.template_update_mode',
                TEMPLATE_META_DEFAULTS['instancePolicy.template_update_mode'],
                META_FIELD_READERS['instancePolicy.template_update_mode'],
                findings,
            ),
        },
        settings,
        compatibility: {
            consentTemplateIds: resolveCompatibilityCollection(root, 'consentTemplateIds', findings),
            smsTemplateIds: resolveCompatibilityCollection(root, 'smsTemplateIds', findings),
        },
        findings,
    }

    const legacy = readOwnPath(root, 'meta.legacy')
    if (legacy.status === 'absent') return resolved
    if (legacy.status === 'blocked') {
        findings.push({
            kind: 'malformed-ancestor',
            locus: 'meta.legacy',
            paths: [legacy.blockedAt],
            detail: `"${legacy.blockedAt}" holds ${describeContainer(legacy.value)}, not a container`,
        })
        return resolved
    }
    if (!isPlainObject(legacy.value)) {
        findings.push({
            kind: 'malformed-value',
            locus: 'meta.legacy',
            paths: ['meta.legacy'],
            detail: `stored residue is ${describeContainer(legacy.value)}, not a container`,
        })
        return resolved
    }
    // Shallow-copied so a consumer cannot reach into the live document through the result.
    return { ...resolved, legacy: { ...legacy.value } }
}

// ─────────────────────────────── canonical loci and concurrent intent ───────────────────────────────

/**
 * Whether two loci name overlapping state.
 *
 * Both directions count, because the log a new submission is checked against contains ancestor writes:
 * a released `template.updateMeta` patch on `instancePolicy` overlaps a typed write to
 * `instancePolicy.initiator`, and a whole-set write to `compatibility.consentTemplateIds` overlaps
 * every member of that set. Treating only equal strings as overlapping is exactly the missed check
 * that lets a catch-up op silently overwrite another author's intent.
 */
export const templateLociOverlap = (left: string, right: string): boolean =>
    left === right || isAncestorLocus(left, right) || isAncestorLocus(right, left)

/** `[` as well as `.`, so a collection locus is an ancestor of its bracketed member loci. */
const isAncestorLocus = (ancestor: string, descendant: string): boolean =>
    descendant.startsWith(`${ancestor}.`) || descendant.startsWith(`${ancestor}[`)

/**
 * What one operation intends at one locus.
 *
 * `set` carries the canonical value the op lands — `null` meaning "the leaf/member is absent", which
 * is how a restored default and an explicit unset both look in a minimal document. `opaque` means the
 * op touches the locus but its effect is not determinable from the op alone: that is every released
 * open-arm patch, whose outcome depends on the base document the reducer would apply it to. Shared
 * deliberately reports `opaque` rather than guessing, because a guess here would be a silent
 * convergence verdict on an overwrite.
 */
export type TemplateAuthoringIntent =
    | { locus: string; kind: 'set'; value: JsonValue | null }
    | { locus: string; kind: 'opaque' }

/** The canonical stored leaf value a typed write lands: `null` when it restores the default. */
const storedLeafValue = <T extends JsonValue>(path: string, value: T | null): JsonValue | null =>
    value === null || isTemplateAuthoringDefault(path, value) ? null : value

/**
 * Which canonical loci an operation touches, and what it intends there.
 *
 * The four typed arms report determinate intents. The two released open arms report `opaque` intents
 * for every canonical locus their patch keys reach — by exact path, by ancestor, by descendant, and
 * through the recognized alias table, because a patch that writes `settings.ask_for_phone_nr` is
 * writing the phone requirement whatever it spells it. The new narrative collection arm reports
 * its marker/order/rule writes. All other non-metadata arms retain their released empty result;
 * ownership dependencies are classified separately only when paired with the new arm.
 */
export const templateAuthoringIntentsOf = (op: TemplateOp): readonly TemplateAuthoringIntent[] => {
    switch (op.type) {
        case 'narrativeRuleCollection.edit': {
            const intents: TemplateAuthoringIntent[] = [{
                locus: narrativeLocus('narrativeRuleSettingsByQuestionId', op.questionId, 'conditionalPresence'),
                kind: 'set', value: null,
            }]
            if (op.action.kind !== 'materialize') {
                intents.push({ locus: narrativeLocus('narrativeRuleOrderByQuestionId', op.questionId), kind: 'opaque' },
                    { locus: narrativeLocus('narrativeRulesById', op.action.ruleId), kind: 'opaque' })
            }
            return intents
        }
        case 'template.setMetaFieldTyped': {
            const path = metaFieldPath(op.field)
            return [{ locus: path, kind: 'set', value: storedLeafValue(path, op.value) }]
        }
        case 'template.setSettingTyped': {
            const path = settingFieldPath(op.field)
            return [{ locus: path, kind: 'set', value: storedLeafValue(path, op.value) }]
        }
        case 'template.addCompatibilityId': {
            // The strict parser, matching the reducer: an op the reducer refuses must claim no locus,
            // or a refused write would still be able to block a valid concurrent one.
            const id = parseCompatibilityOperationId(op.id)
            if (id === undefined) return []
            return [{ locus: compatibilityIdPath(op.collection, id), kind: 'set', value: id }]
        }
        case 'template.removeCompatibilityId': {
            const id = parseCompatibilityOperationId(op.id)
            if (id === undefined) return []
            return [{ locus: compatibilityIdPath(op.collection, id), kind: 'set', value: null }]
        }
        case 'template.updateMeta':
            return openPatchIntents(op.patch, 'meta')
        case 'template.updateSettings':
            return openPatchIntents(op.patch, 'meta.settings')
        default:
            return []
    }
}

/**
 * Every canonical locus known to this surface — the set an open patch key is matched against.
 *
 * Collection loci rather than member loci, deliberately: a collection locus is an ancestor of each of
 * its `[...]` members, so one entry covers "this patch replaces the whole set" and "this patch touches
 * member X" at once, which is what makes a whole-set write overlap a concurrent membership edit.
 */
const CANONICAL_LOCI: readonly string[] = [
    ...TEMPLATE_META_FIELDS.map(metaFieldPath),
    ...TEMPLATE_SETTING_FIELDS.map(settingFieldPath),
    ...COMPATIBILITY_COLLECTIONS.map(compatibilityCollectionPath),
]

const openPatchIntents = (
    patch: Record<string, unknown>,
    root: string,
): readonly TemplateAuthoringIntent[] => {
    const loci = new Set<string>()
    for (const key of Object.keys(patch)) {
        // A patch key whose FIRST segment is empty writes nothing: `writeField` returns the record
        // unchanged on an empty head, so `''` and `'.title'` are both historical no-ops. Mapping them
        // to the patch root was a reproduced defect — the root is an ancestor of every canonical
        // locus, so one inert key made an old patch conflict with every typed field in the document.
        const [head] = key.split('.')
        if (head === undefined || head === '') continue

        const written = `${root}.${key}`
        for (const locus of CANONICAL_LOCI) {
            if (templateLociOverlap(written, locus)) loci.add(locus)
        }
        for (const canonicalPath of templateCanonicalPathsTouchedByAlias(written)) loci.add(canonicalPath)
    }
    return [...loci].map((locus): TemplateAuthoringIntent => ({ locus, kind: 'opaque' }))
}

/**
 * Whether two operations' metadata intents commute, converge, or conflict.
 *
 * - **disjoint** — no overlapping locus. Different leaves of one group, and different ids of one
 *   collection, land here: both edits survive, which is the whole reason settings are leaf operations
 *   and soft-id sets are membership operations rather than object patches.
 * - **convergent** — every overlapping locus carries the same determinate intended value on both
 *   sides. Add/add and remove/remove of one id are the canonical cases, as is two clients choosing
 *   the same value for one flag; the second write is content-idempotent and may be allowed through.
 * - **conflict** — anything else: different values at one locus, add against remove of one id, or an
 *   overlap where either side is `opaque`. A scalar has no automatic "both" merge, so this is a
 *   refusal plus a durable marker, never a silent last-writer-wins.
 */
export type TemplateAuthoringOverlap =
    | { status: 'disjoint' }
    | { status: 'convergent'; loci: readonly string[] }
    | { status: 'conflict'; loci: readonly string[] }

const narrativeLocus = (root: string, id: string, leaf?: string): string =>
    `${root}[${JSON.stringify(id)}]${leaf === undefined ? '' : `.${leaf}`}`

/** Ownership reads are dependencies, never fabricated opaque writes. Flags are preserved, not
 * collection preconditions. All-owner scans conservatively overlap released moving/deleting arms;
 * NEW arms cannot move IDs and their exact target/rule writes already cover new-vs-new overlap. */
const narrativeReadLoci = (op: Extract<TemplateOp, { type: 'narrativeRuleCollection.edit' }>): string[] => {
    const reads = [narrativeLocus('questionsById', op.questionId), 'questionOrder',
        narrativeLocus('narrativeRuleSettingsByQuestionId', op.questionId, 'conditionalPresence'),
        narrativeLocus('narrativeRuleOrderByQuestionId', op.questionId)]
    if (op.action.kind !== 'materialize') {
        reads.push(narrativeLocus('narrativeRulesById', op.action.ruleId), 'narrativeRuleOrderByQuestionId')
    }
    if (op.action.kind === 'set') {
        const condition = op.action.condition
        reads.push(narrativeLocus('questionsById', condition.sourceQuestionId),
            narrativeLocus('alternativeOrderByQuestionId', condition.sourceQuestionId))
        for (const id of [...(condition.alternativeId === undefined ? [] : [condition.alternativeId]),
            ...(condition.alternativeIds ?? [])]) {
            reads.push(narrativeLocus('alternativesById', id), 'alternativeOrderByQuestionId')
        }
    }
    return reads
}

/** Used ONLY when paired with the NEW arm. Old-vs-old default[] and replay remain released.
 * A context-free classifier cannot know a grid deletion's descendants or a moved rule's old owner:
 * those actual write families conservatively cover their roots until row-lock revalidation. */
const narrativeInterveningWrites = (op: TemplateOp): readonly TemplateAuthoringIntent[] => {
    const opaque = (...loci: string[]): TemplateAuthoringIntent[] => loci.map((locus) => ({ locus, kind: 'opaque' }))
    switch (op.type) {
        case 'narrativeRuleCollection.edit': return templateAuthoringIntentsOf(op)
        case 'narrativeRuleSettings.set':
            return [{ locus: narrativeLocus('narrativeRuleSettingsByQuestionId', op.questionId, op.field),
                kind: 'set', value: op.value ? true : null }]
        case 'narrativeRule.set':
            return opaque(narrativeLocus('narrativeRulesById', op.ruleId), 'narrativeRuleOrderByQuestionId')
        case 'narrativeRule.delete':
            return opaque(narrativeLocus('narrativeRulesById', op.ruleId), 'narrativeRuleOrderByQuestionId')
        case 'question.delete':
            return opaque('questionsById', 'questionOrder', 'narrativeRuleSettingsByQuestionId',
                'narrativeRulesById', 'narrativeRuleOrderByQuestionId', 'alternativesById', 'alternativeOrderByQuestionId')
        case 'question.create':
            return opaque(narrativeLocus('questionsById', op.questionId), 'questionOrder')
        case 'question.move': return opaque('questionOrder')
        case 'gridColumn.create':
        case 'gridColumn.move':
            // Structural ownership is read across all grids, not known from op.questionId alone.
            return opaque('questionsById', 'questionOrder')
        case 'question.updateField':
            return opaque(narrativeLocus('questionsById', op.questionId, op.field))
        case 'alternative.create':
        case 'alternative.move':
        case 'alternative.delete':
            return opaque(narrativeLocus('alternativesById', op.alternativeId), 'alternativeOrderByQuestionId')
        default: return templateAuthoringIntentsOf(op)
    }
}

export const classifyTemplateAuthoringOverlap = (
    left: TemplateOp,
    right: TemplateOp,
): TemplateAuthoringOverlap => {
    const hasNarrativeEdit = left.type === 'narrativeRuleCollection.edit' || right.type === 'narrativeRuleCollection.edit'
    const leftIntents = hasNarrativeEdit ? narrativeInterveningWrites(left) : templateAuthoringIntentsOf(left)
    const rightIntents = hasNarrativeEdit ? narrativeInterveningWrites(right) : templateAuthoringIntentsOf(right)

    const overlapping = new Set<string>()
    let converges = true

    for (const mine of leftIntents) {
        for (const theirs of rightIntents) {
            if (!templateLociOverlap(mine.locus, theirs.locus)) continue
            overlapping.add(mine.locus)
            overlapping.add(theirs.locus)
            if (mine.kind !== 'set' || theirs.kind !== 'set' || mine.value !== theirs.value) converges = false
        }
    }

    const checkReads = (reader: TemplateOp, writer: TemplateOp, writes: readonly TemplateAuthoringIntent[]): void => {
        if (reader.type !== 'narrativeRuleCollection.edit') return
        const reads = writer.type === 'narrativeRuleCollection.edit'
            ? (reader.action.kind === 'materialize' ? [narrativeLocus('narrativeRuleOrderByQuestionId', reader.questionId)] : [])
            : narrativeReadLoci(reader)
        for (const read of reads) for (const write of writes) {
            // Ordinary title/value edits do not change identity or structural ownership.
            if (writer.type === 'question.updateField' &&
                !['type', 'grid', 'grid.columnIds'].some((field) => templateLociOverlap(field, writer.field))) continue
            if (!templateLociOverlap(read, write.locus)) continue
            overlapping.add(read)
            overlapping.add(write.locus)
            converges = false
        }
    }
    checkReads(left, right, rightIntents)
    checkReads(right, left, leftIntents)
    if (overlapping.size === 0) return { status: 'disjoint' }
    const loci = [...overlapping].sort()
    return converges ? { status: 'convergent', loci } : { status: 'conflict', loci }
}

/**
 * The value a document currently holds at a locus, `null` when absent.
 *
 * Exists so the conflict record's base and current values come from one implementation rather than
 * each caller's own traversal: a generic "read the structure" fallback is what produced markers whose
 * base and left values were the same current value, which tells a resolver nothing. `null` for absent
 * is deliberate and legal — conflict records are outside the template's DOC-LAW-2.
 *
 * A bracketed member locus answers membership: the id when the set contains it, `null` when not.
 */
export const readTemplateAuthoringLocus = (
    document: Pick<QnrTemplateDocument, 'meta'> & Partial<Pick<QnrTemplateDocument,
        'questionsById' | 'questionOrder' | 'narrativeRulesById' | 'narrativeRuleOrderByQuestionId' |
        'narrativeRuleSettingsByQuestionId' | 'alternativesById' | 'alternativeOrderByQuestionId'>>,
    locus: string,
): JsonValue | null => {
    const narrative = /^(?<root>questionsById|narrativeRulesById|narrativeRuleOrderByQuestionId|narrativeRuleSettingsByQuestionId|alternativesById|alternativeOrderByQuestionId)\[(?<id>"(?:[^"\\]|\\.)*")\](?:\.(?<leaf>.*))?$/u.exec(locus)
    if (narrative?.groups !== undefined) {
        const id: unknown = JSON.parse(narrative.groups['id'] as string)
        const root = narrative.groups['root'] as keyof typeof document
        const collection = document[root]
        if (typeof id !== 'string' || collection === undefined || !Object.hasOwn(collection, id)) return null
        const entry = (collection as Record<string, unknown>)[id]
        if (narrative.groups['leaf'] === undefined) return entry as JsonValue
        const read = readOwnPath(entry, narrative.groups['leaf'])
        return read.status === 'present' ? read.value as JsonValue : null
    }
    const member = /^(?<collection>meta\.compatibility\.[^.[]+)\[(?<id>.*)\]$/u.exec(locus)
    if (member?.groups !== undefined) {
        const parsedId: unknown = JSON.parse(member.groups['id'] as string)
        if (typeof parsedId !== 'string') return null
        const set = readOwnPath(document, member.groups['collection'] as string)
        if (set.status !== 'present' || !Array.isArray(set.value)) return null
        return set.value.some((entry: unknown) => normalizeCompatibilityId(entry) === parsedId)
            ? parsedId
            : null
    }

    // A blocked read is reported as absence here on purpose: a conflict record carries values, and a
    // scalar sitting where a container belongs is not the value of the locus that was asked for. The
    // reader above is where that condition is classified and surfaced.
    const read = readOwnPath(document, locus)
    return read.status === 'present' ? (read.value as JsonValue) : null
}

/**
 * Where a template metadata conflict is recorded on the released marker shape.
 *
 * The document IS the entity for this surface — there is no per-field entity id — so the locus is the
 * marker's `fieldPath` and the family document its `entityId`. Spelling that convention here keeps
 * the real path in the record instead of a generic `_structure` placeholder.
 */
export const templateAuthoringConflictTarget = (
    documentId: string,
    locus: string,
): Pick<ConflictMarker, 'entityType' | 'entityId' | 'fieldPath'> => ({
    entityType: 'template',
    entityId: documentId,
    fieldPath: locus,
})
