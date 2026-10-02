import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { type } from 'arktype'

import { applyOperation, OperationConflictError } from './applyOperation.js'
import { canonicalJson, hashCanonical, reduceToMinimalForm } from './canonicalize.js'
import { findDocLawViolations } from './docLaws.js'
import type { TemplateOp } from './operations.js'
import {
    findDocLawDefaultViolations,
    templateAuthoringIsDefault,
    templateDocumentIsDefault,
    templateOpSchema,
    validateTemplateDocument,
} from './schemas.js'
import {
    classifyTemplateAuthoringOverlap,
    compatibilityIdPath,
    COMPATIBILITY_COLLECTIONS,
    isTemplateAuthoringDefault,
    readTemplateAuthoringLocus,
    resolveTemplateAuthoringMeta,
    settingFieldPath,
    TEMPLATE_META_FIELDS,
    TEMPLATE_SETTING_DEFAULTS,
    TEMPLATE_SETTING_FIELDS,
    templateAuthoringConflictTarget,
    templateAuthoringIntentsOf,
    templateLociOverlap,
} from './templateAuthoringMeta.js'
import { emptyTemplateDocument, type QnrTemplateDocument } from './templateDocument.js'

/**
 * ASMA-8339's shared leg: the closed typed metadata/settings surface over the released open arms.
 *
 * The suite is organised around the one risk this work carries. The surface is additive, so almost
 * every way of getting it wrong is silent: a default declared on the wrong side changes the canonical
 * bytes of documents that already exist, an alias left behind reverses an author's explicit choice,
 * and a locus compared by equality lets one author overwrite another with no conflict raised. So the
 * assertions below are mostly about what must NOT change and what must NOT be reachable.
 */

const DOC = 'tpl-8339'

const applyAll = (ops: readonly TemplateOp[], from = emptyTemplateDocument(DOC)): QnrTemplateDocument =>
    ops.reduce<QnrTemplateDocument>((doc, op) => applyOperation(doc, op), from)

const metaOf = (doc: QnrTemplateDocument): Record<string, unknown> =>
    (doc.meta ?? {}) as Record<string, unknown>

const refusal = (op: TemplateOp, from = emptyTemplateDocument(DOC)): string => {
    try {
        applyOperation(from, op)
    } catch (error) {
        assert.ok(error instanceof OperationConflictError, `expected a conflict, got ${String(error)}`)
        return error.message
    }
    return assert.fail(`operation ${op.type} was accepted but must be refused`)
}

/** A document shaped the way the legacy importer left one: flat flags, old spellings, unknown residue. */
const importedLikeDocument = (): QnrTemplateDocument => ({
    documentId: DOC,
    revision: 7,
    questionOrder: [],
    meta: {
        title: 'Innkomst',
        initiator: 'recipient',
        security_level: 2,
        settings: {
            ask_for_phone_nr: true,
            refresh_button: false,
            tab_mode: true,
            activityId_required: true,
            some_unmapped_legacy_flag: true,
        },
        legacy: { plan_category: 17, flags: { weird_old_thing: 'yes' } },
    },
})

// ─────────────────────────────── P1 · vocabulary and replay ───────────────────────────────

describe('the released open arms are untouched', () => {
    it('still replays an arbitrary law-valid patch through both arms', () => {
        const doc = applyAll([
            { type: 'template.updateMeta', patch: { title: 'T', 'instancePolicy.initiator': 'recipient' } },
            { type: 'template.updateSettings', patch: { ask_for_phone_nr: true, 'journal.requires_activity_id': true } },
            { type: 'template.updateMeta', patch: { some_unknown_legacy_key: 'kept' } },
        ])

        // Byte-for-byte what the released reducer produced: the open arms write exactly what they are
        // given, create no canonical structure, and apply no default omission of their own.
        assert.deepEqual(doc.meta, {
            title: 'T',
            instancePolicy: { initiator: 'recipient' },
            settings: { ask_for_phone_nr: true, journal: { requires_activity_id: true } },
            some_unknown_legacy_key: 'kept',
        })
    })

    it('still accepts a patch naming a path the new typed vocabulary refuses', () => {
        // The open arm is how an already-stored log replays and how malformed owned residue is
        // repaired; the typed arms refuse this path, and that asymmetry has to stay.
        const doc = applyAll([{ type: 'template.updateMeta', patch: { 'legacy.plan_category': 17 } }])
        assert.deepEqual(metaOf(doc)['legacy'], { plan_category: 17 })
    })
})

describe('the typed arms are closed in path, value and payload', () => {
    it('refuses an unknown metadata field at the reducer, not only at the schema', () => {
        const message = refusal({ type: 'template.setMetaFieldTyped', field: 'nope' } as unknown as TemplateOp)
        assert.match(message, /is not an editable template metadata field/)
    })

    it('refuses an unknown settings leaf', () => {
        const message = refusal({
            type: 'template.setSettingTyped',
            field: 'rendering.not_a_flag',
            value: true,
        } as unknown as TemplateOp)
        assert.match(message, /is not a template settings leaf/)
    })

    it('refuses a value of the wrong type for the field', () => {
        assert.match(
            refusal({ type: 'template.setMetaFieldTyped', field: 'visibility', value: 'gone' } as unknown as TemplateOp),
            /is not a valid value for metadata field/,
        )
        assert.match(
            refusal({
                type: 'template.setMetaFieldTyped',
                field: 'instancePolicy.requiredAccessLevel',
                value: 5,
            } as unknown as TemplateOp),
            /is not a valid value for metadata field/,
        )
    })

    it('refuses a legacy "false" string instead of reading it as truthy', () => {
        // The exact mutation the proof matrix names: JavaScript truthiness would make the string
        // 'false' turn the flag ON, which is the opposite of what the document says.
        assert.match(
            refusal({
                type: 'template.setSettingTyped',
                field: 'rendering.tabs',
                value: 'false',
            } as unknown as TemplateOp),
            /takes a boolean or null, not string/,
        )
    })

    it('refuses an unrecognized payload member on a replayed op', () => {
        const message = refusal({
            type: 'template.setSettingTyped',
            field: 'rendering.tabs',
            value: true,
            patch: { title: 'x' },
        } as unknown as TemplateOp)
        assert.match(message, /unrecognized payload member\(s\): "patch"/)
    })

    it('tolerates a payload member explicitly holding undefined', () => {
        // It carries nothing and cannot survive JSON transport; refusing it would reject an ordinary
        // `{...base, patch: undefined}` spread for no gain.
        const doc = applyAll([
            { type: 'template.setSettingTyped', field: 'rendering.tabs', value: true, patch: undefined } as TemplateOp,
        ])
        assert.deepEqual(metaOf(doc)['settings'], { rendering: { tabs: true } })
    })

    it('refuses every unknown field name and extra property at the wire schema too', () => {
        for (const op of [
            { type: 'template.setMetaFieldTyped', field: 'legacy.plan_category', value: 1 },
            { type: 'template.setMetaFieldTyped', field: 'title', value: 7 },
            { type: 'template.setMetaFieldTyped', field: 'title', value: 'T', patch: {} },
            { type: 'template.setSettingTyped', field: 'rendering.nope', value: true },
            { type: 'template.setSettingTyped', field: 'rendering.tabs', value: 'yes' },
            { type: 'template.addCompatibilityId', collection: 'journalIds', id: 'c-1' },
            { type: 'template.addCompatibilityId', collection: 'consentTemplateIds', id: '' },
            { type: 'template.removeCompatibilityId', collection: 'consentTemplateIds', id: 'c-1', extra: 1 },
        ]) {
            assert.ok(templateOpSchema(op) instanceof type.errors, `schema accepted ${JSON.stringify(op)}`)
        }
    })

    it('accepts each legal typed payload at the wire schema', () => {
        for (const op of [
            { type: 'template.setMetaFieldTyped', field: 'visibility', value: 'hidden' },
            { type: 'template.setMetaFieldTyped', field: 'instancePolicy.requiredAccessLevel', value: 3 },
            { type: 'template.setMetaFieldTyped', field: 'title', value: null },
            ...TEMPLATE_SETTING_FIELDS.map((field) => ({ type: 'template.setSettingTyped', field, value: true })),
            { type: 'template.addCompatibilityId', collection: 'consentTemplateIds', id: '42' },
            { type: 'template.removeCompatibilityId', collection: 'smsTemplateIds', id: 'sms-1' },
        ]) {
            assert.equal(templateOpSchema(op) instanceof type.errors, false, `schema refused ${JSON.stringify(op)}`)
        }
    })
})

// ─────────────────────────────── P2 · defaults, omission, hydration ───────────────────────────────

describe('every settings leaf stores only what differs from its default', () => {
    it('omits a leaf written at its default and stores one written against it', () => {
        for (const field of TEMPLATE_SETTING_FIELDS) {
            const fallback = TEMPLATE_SETTING_DEFAULTS[field]

            // Absent: a fresh document carries no `meta` at all (DOC-LAW-2), and the reader still
            // resolves the leaf to its default.
            const absent = emptyTemplateDocument(DOC)
            assert.equal(absent.meta, undefined)
            assert.equal(resolveTemplateAuthoringMeta(absent.meta).settings[field], fallback)

            // Written AT the default: byte-identical to never having touched it.
            const atDefault = applyAll([{ type: 'template.setSettingTyped', field, value: fallback }])
            assert.equal(atDefault.meta, undefined, `${field} stored its own default`)

            // Written AGAINST the default: stored, and read back.
            const against = applyAll([{ type: 'template.setSettingTyped', field, value: !fallback }])
            // `questionOrder: []` is the one documented DOC-LAW-2 exemption on a LIVE document, so the
            // law check runs on the minimal form the hash is actually taken over.
            assert.deepEqual(
                findDocLawViolations(reduceToMinimalForm(against, { isDefault: templateAuthoringIsDefault })),
                [],
            )
            assert.deepEqual(findDocLawDefaultViolations(against), [])
            assert.ok(validateTemplateDocument(against).ok, `${field} produced an invalid document`)
            assert.equal(resolveTemplateAuthoringMeta(against.meta).settings[field], !fallback)

            // `null` restores the default and prunes every ancestor it emptied.
            const cleared = applyAll([{ type: 'template.setSettingTyped', field, value: null }], against)
            assert.equal(cleared.meta, undefined, `${field} left an empty ancestor behind`)
        }
    })

    it('keeps refresh_button on by default and stores only an explicit off', () => {
        // The one non-false default. Getting it wrong flips a control for every imported template
        // that omits the flag, which is why it has its own case.
        assert.equal(resolveTemplateAuthoringMeta(undefined).settings['rendering.refresh_button'], true)
        assert.equal(isTemplateAuthoringDefault('meta.settings.rendering.refresh_button', true), true)
        assert.equal(isTemplateAuthoringDefault('meta.settings.rendering.refresh_button', false), false)

        const off = applyAll([{ type: 'template.setSettingTyped', field: 'rendering.refresh_button', value: false }])
        assert.deepEqual(metaOf(off)['settings'], { rendering: { refresh_button: false } })
        assert.equal(resolveTemplateAuthoringMeta(off.meta).settings['rendering.refresh_button'], false)
    })

    it('prunes only the emptied ancestor, leaving sibling groups in place', () => {
        const doc = applyAll([
            { type: 'template.setSettingTyped', field: 'rendering.tabs', value: true },
            { type: 'template.setSettingTyped', field: 'journal.auto_import', value: true },
            { type: 'template.setSettingTyped', field: 'rendering.tabs', value: null },
        ])
        assert.deepEqual(metaOf(doc)['settings'], { journal: { auto_import: true } })
    })
})

describe('every metadata field stores only what differs from its default', () => {
    it('round-trips each policy value and omits the default', () => {
        for (const value of [1, 2, 3, 4] as const) {
            const doc = applyAll([
                { type: 'template.setMetaFieldTyped', field: 'instancePolicy.requiredAccessLevel', value },
            ])
            // Every explicit tier is preserved without binary remapping — except tier 4, which IS the
            // default and is therefore absence.
            assert.equal(resolveTemplateAuthoringMeta(doc.meta).instancePolicy.requiredAccessLevel, value)
            assert.equal(doc.meta === undefined, value === 4)
        }

        for (const value of ['never', 'always', 'ask'] as const) {
            const doc = applyAll([
                { type: 'template.setMetaFieldTyped', field: 'instancePolicy.template_update_mode', value },
            ])
            assert.equal(resolveTemplateAuthoringMeta(doc.meta).instancePolicy.template_update_mode, value)
            assert.equal(doc.meta === undefined, value === 'never')
        }

        for (const value of ['visible', 'hidden'] as const) {
            const doc = applyAll([{ type: 'template.setMetaFieldTyped', field: 'visibility', value }])
            assert.equal(resolveTemplateAuthoringMeta(doc.meta).visibility, value)
            assert.equal(doc.meta === undefined, value === 'visible')
        }
    })

    it('treats an empty title as absence', () => {
        const titled = applyAll([{ type: 'template.setMetaFieldTyped', field: 'title', value: 'Innkomst' }])
        assert.deepEqual(metaOf(titled)['title'], 'Innkomst')
        const emptied = applyAll([{ type: 'template.setMetaFieldTyped', field: 'title', value: '' }], titled)
        assert.equal(emptied.meta, undefined)
    })

    it('never writes a second home for the initiator', () => {
        // M-008: the canonical producer home is `meta.instancePolicy.initiator`. A typed write must not
        // leave or create a root `meta.initiator`, or one authored state would have two spellings and
        // two hashes.
        const doc = applyAll([
            { type: 'template.setMetaFieldTyped', field: 'instancePolicy.initiator', value: 'recipient' },
        ])
        assert.deepEqual(doc.meta, { instancePolicy: { initiator: 'recipient' } })
        assert.equal(Object.hasOwn(metaOf(doc), 'initiator'), false)
    })
})

describe('hydration is total and changes nothing', () => {
    it('resolves a document that carries no meta at all', () => {
        const resolved = resolveTemplateAuthoringMeta(undefined)
        assert.equal(resolved.title, '')
        assert.equal(resolved.visibility, 'visible')
        assert.equal(resolved.instancePolicy.initiator, 'coordinator')
        assert.equal(resolved.instancePolicy.requiredAccessLevel, 4)
        assert.equal(Object.keys(resolved.settings).length, TEMPLATE_SETTING_FIELDS.length)
        assert.deepEqual(resolved.compatibility, { consentTemplateIds: [], smsTemplateIds: [] })
        assert.deepEqual(resolved.findings, [])
    })

    it('leaves the document bytes and hash unchanged', async () => {
        // The reader is handed the live document the reducer also holds. A reader that filled in a
        // default would change the hashed bytes of a document nobody edited — minting a version from
        // a page load.
        const doc = importedLikeDocument()
        const before = canonicalJson(doc)
        const beforeHash = await hashCanonical(reduceToMinimalForm(doc, { isDefault: templateAuthoringIsDefault }))

        const resolved = resolveTemplateAuthoringMeta(doc.meta)
        assert.ok(resolved.findings.length > 0, 'this fixture is meant to produce findings')

        assert.equal(canonicalJson(doc), before)
        assert.equal(
            await hashCanonical(reduceToMinimalForm(doc, { isDefault: templateAuthoringIsDefault })),
            beforeHash,
        )
    })

    it('hands back copies rather than windows into the document', () => {
        const doc = importedLikeDocument()
        const resolved = resolveTemplateAuthoringMeta(doc.meta)
        assert.notEqual(resolved.legacy, metaOf(doc)['legacy'])
        assert.deepEqual(resolved.legacy, { plan_category: 17, flags: { weird_old_thing: 'yes' } })
    })
})

// ─────────────────────────────── aliases: read, clear, never resurrect ───────────────────────────────

const withMeta = (meta: Record<string, unknown>, revision = 1): QnrTemplateDocument => ({
    documentId: DOC,
    revision,
    questionOrder: [],
    meta,
})

describe('the phone requirement has one new spelling and two readable old ones', () => {
    for (const [label, meta] of [
        ['the flat legacy spelling', { settings: { ask_for_phone_nr: true } }],
        ['the released nested spelling', { settings: { recipient: { ask_for_phone_nr: true } } }],
    ] as const) {
        it(`reads ${label} and clears it on the first typed write`, () => {
            const stored = withMeta(meta as Record<string, unknown>)

            const before = resolveTemplateAuthoringMeta(stored.meta)
            assert.equal(before.settings['recipient.requires_phone_number'], true)
            assert.deepEqual(
                before.findings.map((finding) => finding.kind),
                ['legacy-alias-read'],
            )

            // Writing the DEFAULT (false) stores nothing, so without the alias clear the stale `true`
            // would survive and the reader would hand the requirement straight back — the author's
            // explicit "off" silently reversed. This is the mutation P9 names as alias resurrection.
            const off = applyOperation(stored, {
                type: 'template.setSettingTyped',
                field: 'recipient.requires_phone_number',
                value: false,
            })
            assert.equal(off.meta, undefined)
            assert.equal(resolveTemplateAuthoringMeta(off.meta).settings['recipient.requires_phone_number'], false)

            // And a typed `true` writes only the canonical spelling.
            const on = applyOperation(stored, {
                type: 'template.setSettingTyped',
                field: 'recipient.requires_phone_number',
                value: true,
            })
            assert.deepEqual(on.meta, { settings: { recipient: { requires_phone_number: true } } })
        })
    }

    it('never ORs the canonical spelling against the old one', () => {
        const stored = withMeta({
            settings: { recipient: { requires_phone_number: false, ask_for_phone_nr: true } },
        })
        const resolved = resolveTemplateAuthoringMeta(stored.meta)
        assert.equal(resolved.settings['recipient.requires_phone_number'], false)
        assert.deepEqual(
            resolved.findings.map((finding) => finding.kind),
            ['alias-disagreement'],
        )
    })
})

describe('the initiator and assurance tier read their old homes without adopting them', () => {
    it('reads a root meta.initiator only while the canonical property is absent', () => {
        const stored = withMeta({ initiator: 'recipient' })
        assert.equal(resolveTemplateAuthoringMeta(stored.meta).instancePolicy.initiator, 'recipient')

        // Choosing the omitted default must not leave the alias behind to be read back.
        const reset = applyOperation(stored, {
            type: 'template.setMetaFieldTyped',
            field: 'instancePolicy.initiator',
            value: 'coordinator',
        })
        assert.equal(reset.meta, undefined)
        assert.equal(resolveTemplateAuthoringMeta(reset.meta).instancePolicy.initiator, 'coordinator')
    })

    it('reports a classified disagreement when both homes exist', () => {
        const stored = withMeta({ initiator: 'recipient', instancePolicy: { initiator: 'coordinator' } })
        const resolved = resolveTemplateAuthoringMeta(stored.meta)
        assert.equal(resolved.instancePolicy.initiator, 'coordinator')
        const finding = resolved.findings.find((entry) => entry.kind === 'alias-disagreement')
        assert.deepEqual(finding?.paths, ['meta.instancePolicy.initiator', 'meta.initiator'])
    })

    it('reads meta.security_level as a tier and preserves it without binary remapping', () => {
        for (const level of [1, 2, 3, 4] as const) {
            const resolved = resolveTemplateAuthoringMeta(withMeta({ security_level: level }).meta)
            assert.equal(resolved.instancePolicy.requiredAccessLevel, level)
        }
        const cleared = applyOperation(withMeta({ security_level: 2 }), {
            type: 'template.setMetaFieldTyped',
            field: 'instancePolicy.requiredAccessLevel',
            value: 3,
        })
        assert.deepEqual(cleared.meta, { instancePolicy: { requiredAccessLevel: 3 } })
    })
})

describe('the OR aliases resolve conservatively and report the disagreement', () => {
    it('unifies all three activity spellings', () => {
        for (const alias of ['activityId_required', 'soknadid_required', 'sokndaid_required'] as const) {
            const resolved = resolveTemplateAuthoringMeta(withMeta({ settings: { [alias]: true } }).meta)
            assert.equal(resolved.settings['journal.requires_activity_id'], true, alias)
        }
    })

    it('resolves a conflicting activity pair to required, never to the last entry', () => {
        const resolved = resolveTemplateAuthoringMeta(
            withMeta({ settings: { journal: { requires_activity_id: false }, soknadid_required: true } }).meta,
        )
        assert.equal(resolved.settings['journal.requires_activity_id'], true)
        const finding = resolved.findings.find((entry) => entry.kind === 'alias-disagreement')
        assert.deepEqual(finding?.paths, [
            'meta.settings.journal.requires_activity_id',
            'meta.settings.soknadid_required',
        ])
    })

    it('ORs the auto-import pair the same way', () => {
        const resolved = resolveTemplateAuthoringMeta(
            withMeta({ settings: { auto_import: false, is_auto_importable: true } }).meta,
        )
        assert.equal(resolved.settings['journal.auto_import'], true)
        assert.ok(resolved.findings.some((entry) => entry.kind === 'alias-disagreement'))
    })
})

describe('a malformed known value is never shown as its default in silence', () => {
    it('reports the path and the stored value', () => {
        const resolved = resolveTemplateAuthoringMeta(
            withMeta({ settings: { rendering: { tabs: 'false' } }, visibility: 'retired' }).meta,
        )
        assert.equal(resolved.settings['rendering.tabs'], false)
        assert.equal(resolved.visibility, 'visible')
        assert.deepEqual(
            resolved.findings.filter((entry) => entry.kind === 'malformed-value').map((entry) => entry.locus).sort(),
            ['meta.settings.rendering.tabs', 'meta.visibility'],
        )
    })

    it('distinguishes malformed from absent', () => {
        // Same effective value, different evidence: absence is silent, a malformed stored value is not.
        assert.deepEqual(resolveTemplateAuthoringMeta(undefined).findings, [])
    })
})

describe('an unrelated unknown member survives every typed edit', () => {
    it('clears only the edited field’s own recognized aliases', () => {
        const stored = withMeta({
            settings: {
                some_unmapped_legacy_flag: true,
                refresh_button: false,
                tab_mode: true,
                journal: { requires_activity_id: true },
            },
            an_unknown_meta_sibling: { kept: 1 },
        })

        const edited = applyOperation(stored, {
            type: 'template.setSettingTyped',
            field: 'rendering.collapse_all',
            value: true,
        })

        // `collapse_all` has its own alias; `refresh_button` and `tab_mode` belong to other fields and
        // must be left exactly where the import put them, as must the unmapped flag and the sibling.
        assert.deepEqual(edited.meta, {
            settings: {
                some_unmapped_legacy_flag: true,
                refresh_button: false,
                tab_mode: true,
                journal: { requires_activity_id: true },
                rendering: { collapse_all: true },
            },
            an_unknown_meta_sibling: { kept: 1 },
        })
    })

    it('refuses to overwrite a malformed owned container instead of destroying it', () => {
        const stored = withMeta({ settings: { rendering: 'imported-nonsense' } })
        const message = refusal(
            { type: 'template.setSettingTyped', field: 'rendering.tabs', value: true },
            stored,
        )
        assert.match(message, /"meta\.settings\.rendering" holds a string, not a container/)

        // The released open arm is the repair path, which is why refusing costs no capability.
        const repaired = applyOperation(stored, { type: 'template.updateSettings', patch: { rendering: null } })
        assert.deepEqual(
            applyOperation(repaired, { type: 'template.setSettingTyped', field: 'rendering.tabs', value: true }).meta,
            { settings: { rendering: { tabs: true } } },
        )
    })
})

// ─────────────────────────────── soft-id membership ───────────────────────────────

describe('compatibility sets are authored one member at a time', () => {
    it('stores a sorted unique set and drops the key when the last member leaves', () => {
        const added = applyAll([
            { type: 'template.addCompatibilityId', collection: 'consentTemplateIds', id: 'c-zulu' },
            { type: 'template.addCompatibilityId', collection: 'consentTemplateIds', id: 'c-alfa' },
            { type: 'template.addCompatibilityId', collection: 'smsTemplateIds', id: 's-1' },
        ])
        assert.deepEqual(metaOf(added)['compatibility'], {
            consentTemplateIds: ['c-alfa', 'c-zulu'],
            smsTemplateIds: ['s-1'],
        })

        const emptied = applyAll(
            [
                { type: 'template.removeCompatibilityId', collection: 'consentTemplateIds', id: 'c-alfa' },
                { type: 'template.removeCompatibilityId', collection: 'consentTemplateIds', id: 'c-zulu' },
                { type: 'template.removeCompatibilityId', collection: 'smsTemplateIds', id: 's-1' },
            ],
            added,
        )
        assert.equal(emptied.meta, undefined, 'an emptied set must leave no container behind')
    })

    it('is content-idempotent on add/add and remove/remove', () => {
        const once = applyAll([{ type: 'template.addCompatibilityId', collection: 'smsTemplateIds', id: 's-1' }])
        const twice = applyOperation(once, {
            type: 'template.addCompatibilityId',
            collection: 'smsTemplateIds',
            id: 's-1',
        })
        // Same canonical bytes, so no new hash and no spurious version — the revision bump is the
        // reducer's unconditional contract, not a content change.
        assert.equal(canonicalJson({ ...once, revision: 0 }), canonicalJson({ ...twice, revision: 0 }))

        const removed = applyOperation(once, {
            type: 'template.removeCompatibilityId',
            collection: 'smsTemplateIds',
            id: 's-absent',
        })
        assert.equal(canonicalJson({ ...once, revision: 0 }), canonicalJson({ ...removed, revision: 0 }))
    })

    it('preserves a legacy numeric id by its lossless decimal spelling', () => {
        const imported = applyAll([
            { type: 'template.updateMeta', patch: { 'compatibility.consentTemplateIds': [7, 3] } },
        ])
        assert.deepEqual(metaOf(imported)['compatibility'], { consentTemplateIds: [7, 3] })

        const touched = applyOperation(imported, {
            type: 'template.addCompatibilityId',
            collection: 'consentTemplateIds',
            id: 'c-1',
        })
        assert.deepEqual(metaOf(touched)['compatibility'], { consentTemplateIds: ['3', '7', 'c-1'] })
    })

    it('treats two NFC-equivalent spellings of one id as one member', () => {
        // `canonicalJson` NFC-normalises strings, so without normalising at the membership boundary the
        // set would hold two members that serialise to the same bytes — a duplicate inside a set.
        const doc = applyAll([
            { type: 'template.addCompatibilityId', collection: 'smsTemplateIds', id: 'mål' },
            { type: 'template.addCompatibilityId', collection: 'smsTemplateIds', id: 'mål' },
        ])
        assert.deepEqual(metaOf(doc)['compatibility'], { smsTemplateIds: ['mål'] })
    })

    it('refuses a malformed stored set rather than normalizing around it', () => {
        assert.match(
            refusal(
                { type: 'template.addCompatibilityId', collection: 'consentTemplateIds', id: 'c-1' },
                withMeta({ compatibility: { consentTemplateIds: 'c-9' } }),
            ),
            /holds a string, not an array of soft ids/,
        )
        assert.match(
            refusal(
                { type: 'template.removeCompatibilityId', collection: 'consentTemplateIds', id: 'c-1' },
                withMeta({ compatibility: { consentTemplateIds: [{ id: 'c-9' }] } }),
            ),
            /is not a soft id; the typed membership operations refuse/,
        )
    })

    it('reports a malformed set to the reader instead of hiding it', () => {
        const resolved = resolveTemplateAuthoringMeta(
            withMeta({ compatibility: { consentTemplateIds: [{ id: 'c-9' }, 'c-1'] } }).meta,
        )
        assert.deepEqual(resolved.compatibility.consentTemplateIds, ['c-1'])
        assert.deepEqual(
            resolved.findings.filter((entry) => entry.kind === 'malformed-collection').map((entry) => entry.paths),
            [['meta.compatibility.consentTemplateIds.0']],
        )
    })
})

// ─────────────────────────────── P7 · commutativity and intent ───────────────────────────────

describe('disjoint edits commute and overlapping ones do not', () => {
    const bytes = (doc: QnrTemplateDocument): string =>
        canonicalJson(reduceToMinimalForm({ ...doc, revision: 0 }, { isDefault: templateAuthoringIsDefault }))

    it('two leaves of one settings group commute', () => {
        const a: TemplateOp = { type: 'template.setSettingTyped', field: 'rendering.tabs', value: true }
        const b: TemplateOp = { type: 'template.setSettingTyped', field: 'rendering.continuous', value: true }
        assert.equal(bytes(applyAll([a, b])), bytes(applyAll([b, a])))
        assert.deepEqual(classifyTemplateAuthoringOverlap(a, b), { status: 'disjoint' })
    })

    it('two different ids of one collection commute', () => {
        const a: TemplateOp = { type: 'template.addCompatibilityId', collection: 'consentTemplateIds', id: 'c-1' }
        const b: TemplateOp = { type: 'template.addCompatibilityId', collection: 'consentTemplateIds', id: 'c-2' }
        assert.equal(bytes(applyAll([a, b])), bytes(applyAll([b, a])))
        assert.deepEqual(classifyTemplateAuthoringOverlap(a, b), { status: 'disjoint' })
    })

    it('calls the same value at one locus convergent and a different one a conflict', () => {
        const on: TemplateOp = { type: 'template.setSettingTyped', field: 'rendering.tabs', value: true }
        const off: TemplateOp = { type: 'template.setSettingTyped', field: 'rendering.tabs', value: false }
        const unset: TemplateOp = { type: 'template.setSettingTyped', field: 'rendering.tabs', value: null }

        assert.deepEqual(classifyTemplateAuthoringOverlap(on, on), {
            status: 'convergent',
            loci: ['meta.settings.rendering.tabs'],
        })
        // `false` IS the default here, so an explicit false and an explicit unset intend the same
        // absence — two authors who both turn the flag off converge rather than conflict.
        assert.deepEqual(classifyTemplateAuthoringOverlap(off, unset), {
            status: 'convergent',
            loci: ['meta.settings.rendering.tabs'],
        })
        assert.deepEqual(classifyTemplateAuthoringOverlap(on, off), {
            status: 'conflict',
            loci: ['meta.settings.rendering.tabs'],
        })
    })

    it('calls add against remove of one id a conflict and add against add convergent', () => {
        const add: TemplateOp = { type: 'template.addCompatibilityId', collection: 'smsTemplateIds', id: 's-1' }
        const remove: TemplateOp = { type: 'template.removeCompatibilityId', collection: 'smsTemplateIds', id: 's-1' }
        assert.equal(classifyTemplateAuthoringOverlap(add, add).status, 'convergent')
        assert.equal(classifyTemplateAuthoringOverlap(remove, remove).status, 'convergent')
        assert.equal(classifyTemplateAuthoringOverlap(add, remove).status, 'conflict')
    })

    it('makes an older open patch participate in the overlap check', () => {
        const typed: TemplateOp = {
            type: 'template.setMetaFieldTyped',
            field: 'instancePolicy.initiator',
            value: 'recipient',
        }

        // Ancestor: patching the whole policy object reaches the leaf below it.
        assert.equal(
            classifyTemplateAuthoringOverlap(typed, {
                type: 'template.updateMeta',
                patch: { instancePolicy: { initiator: 'coordinator' } },
            }).status,
            'conflict',
        )
        // Exact path.
        assert.equal(
            classifyTemplateAuthoringOverlap(typed, {
                type: 'template.updateMeta',
                patch: { 'instancePolicy.initiator': 'coordinator' },
            }).status,
            'conflict',
        )
        // Recognized alias: a patch writing the OLD spelling is writing this field.
        assert.equal(
            classifyTemplateAuthoringOverlap(typed, { type: 'template.updateMeta', patch: { initiator: 'coordinator' } })
                .status,
            'conflict',
        )
        // Whole-set replacement reaches every member of that set.
        assert.equal(
            classifyTemplateAuthoringOverlap(
                { type: 'template.addCompatibilityId', collection: 'consentTemplateIds', id: 'c-1' },
                { type: 'template.updateMeta', patch: { 'compatibility.consentTemplateIds': ['c-9'] } },
            ).status,
            'conflict',
        )
        // An unrelated patch key still commutes.
        assert.deepEqual(
            classifyTemplateAuthoringOverlap(typed, {
                type: 'template.updateSettings',
                patch: { some_unmapped_legacy_flag: true },
            }),
            { status: 'disjoint' },
        )
    })

    it('reports no metadata intent for the rest of the vocabulary', () => {
        assert.deepEqual(
            templateAuthoringIntentsOf({ type: 'question.create', questionId: 'q-1', questionType: 'TextShort' }),
            [],
        )
    })
})

// ─────────────────────────────── canonical loci ───────────────────────────────

describe('canonical loci name exactly one piece of state', () => {
    it('encodes a soft id as an opaque member rather than a dotted path', () => {
        const dotted = compatibilityIdPath('consentTemplateIds', 'a.b')
        assert.equal(dotted, 'meta.compatibility.consentTemplateIds["a.b"]')
        // Injective: the two ids below would collide under a dotted encoding.
        assert.notEqual(dotted, compatibilityIdPath('consentTemplateIds', 'a'))
        assert.notEqual(
            compatibilityIdPath('consentTemplateIds', 'q"uote'),
            compatibilityIdPath('consentTemplateIds', 'q\\uote'),
        )
    })

    it('treats a collection as an ancestor of each of its members', () => {
        const member = compatibilityIdPath('smsTemplateIds', 's-1')
        assert.equal(templateLociOverlap('meta.compatibility.smsTemplateIds', member), true)
        assert.equal(templateLociOverlap('meta.compatibility.consentTemplateIds', member), false)
        assert.equal(templateLociOverlap('meta.instancePolicy', 'meta.instancePolicy.initiator'), true)
        assert.equal(
            templateLociOverlap('meta.settings.rendering.tabs', 'meta.settings.rendering.continuous'),
            false,
        )
    })

    it('reads the real current value at a locus, and null for absence', () => {
        const doc = withMeta({
            instancePolicy: { initiator: 'recipient' },
            compatibility: { smsTemplateIds: ['s-1'] },
        })
        assert.equal(readTemplateAuthoringLocus(doc, 'meta.instancePolicy.initiator'), 'recipient')
        assert.equal(readTemplateAuthoringLocus(doc, settingFieldPath('rendering.tabs')), null)
        assert.equal(readTemplateAuthoringLocus(doc, compatibilityIdPath('smsTemplateIds', 's-1')), 's-1')
        assert.equal(readTemplateAuthoringLocus(doc, compatibilityIdPath('smsTemplateIds', 's-2')), null)
    })

    it('reads own properties only, so a locus can never resolve on the prototype', () => {
        // Found by seeding the removal of the `Object.hasOwn` guard, which survived the suite as first
        // written. `readTemplateAuthoringLocus` takes an ARBITRARY locus — a conflict record's stored
        // `fieldPath` — so without the guard `meta.constructor` resolves to a function and
        // `meta.__proto__.title` reads whatever is on `Object.prototype`. Either value would then be
        // written into a conflict record, where the canonical serializer refuses a function outright
        // and a prototype-sourced string is simply a value no document holds.
        const doc = withMeta({ instancePolicy: { initiator: 'recipient' } })
        for (const locus of [
            'meta.constructor',
            'meta.hasOwnProperty',
            'meta.toString',
            'meta.__proto__.title',
            'meta.instancePolicy.constructor',
        ]) {
            assert.equal(readTemplateAuthoringLocus(doc, locus), null, locus)
        }
    })

    it('records a marker against the document with the real path', () => {
        assert.deepEqual(templateAuthoringConflictTarget(DOC, settingFieldPath('rendering.refresh_button')), {
            entityType: 'template',
            entityId: DOC,
            fieldPath: 'meta.settings.rendering.refresh_button',
        })
    })
})

// ─────────────────────────────── P4 · hashes and historical continuity ───────────────────────────────

describe('the released canonical form is untouched by the expanded registry', () => {
    /**
     * Six keys that are DEFAULTS under the new registry and were NOT defaults under the released one.
     * An already-stored document may legitimately carry every one of them spelled out, so folding the
     * new registry into `templateDocumentIsDefault` would drop them from the canonical bytes and change
     * the `document_hash` of versions that are immutable. This fixture and its pin are what turn that
     * into a red test instead of a silent estate-wide rehash.
     */
    const spelledOut: QnrTemplateDocument = {
        documentId: 'tpl-pin',
        revision: 3,
        questionOrder: [],
        meta: {
            title: '',
            visibility: 'visible',
            instancePolicy: { requiredAccessLevel: 4, initiator: 'coordinator', template_update_mode: 'never' },
            settings: { rendering: { refresh_button: true } },
        },
    }

    it('keeps every spelled-out new default in the released minimal form', async () => {
        const released = reduceToMinimalForm(spelledOut, { isDefault: templateDocumentIsDefault })
        assert.equal(
            canonicalJson(released),
            '{"documentId":"tpl-pin","meta":{"instancePolicy":{"initiator":"coordinator","requiredAccessLevel":4,' +
                '"template_update_mode":"never"},"settings":{"rendering":{"refresh_button":true}},"title":"",' +
                '"visibility":"visible"},"revision":3}',
        )
        assert.equal(
            await hashCanonical(released),
            'sha256:280dae9dc6bb6ebfe42ebc84fbfe30c78c3c0b0d11d095e1a43c06fa3136ed63',
        )
    })

    it('prunes them in the new canonical-write form', async () => {
        const authoring = reduceToMinimalForm(spelledOut, { isDefault: templateAuthoringIsDefault })
        assert.equal(canonicalJson(authoring), '{"documentId":"tpl-pin","revision":3}')
        assert.equal(
            await hashCanonical(authoring),
            'sha256:a18dbb77f5524bdcf794966b633ad5ba8969d44bb59ff662b1ead8d38521ca60',
        )
    })

    it('leaves an imported-shaped document byte-identical under the released predicate', async () => {
        const released = reduceToMinimalForm(importedLikeDocument(), { isDefault: templateDocumentIsDefault })
        assert.equal(
            await hashCanonical(released),
            'sha256:6eb36f7223f432aa339cdac286b719d54d3e7b22821222df9322688582aea985',
        )
    })

    it('never prunes a coincidentally named unknown key', () => {
        // The registry is matched on complete document-absolute paths, so a FLAT imported
        // `settings.refresh_button` and a question's own `title` are untouched by both predicates —
        // a suffix rule would have erased them, which is silent data loss in a hashed document.
        const doc: QnrTemplateDocument = {
            documentId: 'tpl-unknown',
            revision: 1,
            questionOrder: ['q-1'],
            questionsById: { 'q-1': { type: 'TextShort', title: '', refresh_button: true, enabled: false } },
            meta: { settings: { refresh_button: true, visibility: 'visible' } },
        }
        for (const isDefault of [templateDocumentIsDefault, templateAuthoringIsDefault]) {
            const reduced = reduceToMinimalForm(doc, { isDefault }) as QnrTemplateDocument
            assert.deepEqual(reduced.questionsById?.['q-1'], {
                type: 'TextShort',
                title: '',
                refresh_button: true,
                enabled: false,
            })
            assert.deepEqual(reduced.meta?.settings, { refresh_button: true, visibility: 'visible' })
        }
    })
})

describe('an old log still recovers its exact document with no snapshot', () => {
    /**
     * Snapshotless recovery through the released arms only — the path bunjs takes when it rebuilds a
     * document from `collab_ops` with no snapshot to start from. Pinned on the RELEASED predicate,
     * because that is the form the stored history was hashed with.
     *
     * The log is deliberately full of things the new vocabulary would do differently: flat legacy
     * flags, the old phone and initiator spellings, `meta.security_level`, an unsorted soft-id array
     * and an unmapped residue key. None of them may be normalized, re-spelled, sorted or pruned by
     * replay — expanding the reducer must not silently change the result of an old log.
     */
    const OLD_LOG: readonly TemplateOp[] = [
        { type: 'template.updateMeta', patch: { title: 'Innkomst', security_level: 2, initiator: 'recipient' } },
        { type: 'template.updateSettings', patch: { ask_for_phone_nr: true, tab_mode: true, refresh_button: false } },
        { type: 'template.updateSettings', patch: { 'journal.requires_activity_id': true, activityId_required: true } },
        { type: 'template.updateMeta', patch: { 'compatibility.consentTemplateIds': ['c-9', 'c-1'] } },
        { type: 'template.updateMeta', patch: { some_unmapped_residue: 'kept' } },
        { type: 'template.updateSettings', patch: { ask_for_phone_nr: null } },
    ]

    it('replays to the pinned bytes and hash', async () => {
        const doc = applyAll(OLD_LOG, emptyTemplateDocument('tpl-replay'))
        assert.equal(doc.revision, OLD_LOG.length)

        const released = reduceToMinimalForm(doc, { isDefault: templateDocumentIsDefault })
        assert.equal(
            canonicalJson(released),
            '{"documentId":"tpl-replay","meta":{"compatibility":{"consentTemplateIds":["c-9","c-1"]},' +
                '"initiator":"recipient","security_level":2,"settings":{"activityId_required":true,' +
                '"journal":{"requires_activity_id":true},"refresh_button":false,"tab_mode":true},' +
                '"some_unmapped_residue":"kept","title":"Innkomst"},"revision":6}',
        )
        assert.equal(
            await hashCanonical(released),
            'sha256:5be6d4683b8a3d560e3cece37fddf4276f4cc11f8d4eaabb5cc885fb878e71a0',
        )

        // The unsorted soft-id array is the sharpest member here: the typed membership ops sort, and
        // retro-sorting an untouched imported set would rewrite history's bytes. Only a TOUCHED set is
        // normalized.
        assert.deepEqual(metaOf(doc)['compatibility'], { consentTemplateIds: ['c-9', 'c-1'] })

        // The explicit unset in the last entry removed the phone alias and nothing else.
        assert.equal(Object.hasOwn(metaOf(doc)['settings'] as object, 'ask_for_phone_nr'), false)
    })

    it('reads that recovered document through the new total reader', () => {
        const doc = applyAll(OLD_LOG, emptyTemplateDocument('tpl-replay'))
        const resolved = resolveTemplateAuthoringMeta(doc.meta)

        // Read hydration may expose the new effective defaults over an old stored form without
        // rewriting it: every value below comes from a legacy spelling the document still carries.
        assert.equal(resolved.title, 'Innkomst')
        assert.equal(resolved.instancePolicy.initiator, 'recipient')
        assert.equal(resolved.instancePolicy.requiredAccessLevel, 2)
        assert.equal(resolved.settings['rendering.tabs'], true)
        assert.equal(resolved.settings['rendering.refresh_button'], false)
        assert.equal(resolved.settings['journal.requires_activity_id'], true)
        assert.equal(resolved.settings['recipient.requires_phone_number'], false)
        assert.deepEqual(resolved.compatibility.consentTemplateIds, ['c-1', 'c-9'])
    })
})

describe('imported and typed-authored content hash identically', () => {
    /**
     * The shared half of P4. If the importer and the reducer disagreed about one default, an imported
     * template and the same template re-authored by hand would carry two `document_hash` values for one
     * authored state — minting a spurious version and reading as divergence against the import. The Bun
     * leg reproduces this through its own mapper; here it is pinned against the registry both sides read.
     */
    it('agrees on the minimal form, member for member', async () => {
        const authored = applyAll([
            { type: 'template.setMetaFieldTyped', field: 'title', value: 'Innkomst' },
            { type: 'template.setMetaFieldTyped', field: 'visibility', value: 'hidden' },
            { type: 'template.setMetaFieldTyped', field: 'instancePolicy.requiredAccessLevel', value: 2 },
            { type: 'template.setMetaFieldTyped', field: 'instancePolicy.initiator', value: 'recipient' },
            { type: 'template.setSettingTyped', field: 'rendering.tabs', value: true },
            { type: 'template.setSettingTyped', field: 'rendering.refresh_button', value: false },
            { type: 'template.setSettingTyped', field: 'recipient.requires_phone_number', value: true },
            { type: 'template.addCompatibilityId', collection: 'consentTemplateIds', id: 'c-1' },
            { type: 'template.addCompatibilityId', collection: 'consentTemplateIds', id: '3' },
        ])

        const imported: QnrTemplateDocument = {
            documentId: DOC,
            revision: 0,
            questionOrder: [],
            meta: {
                title: 'Innkomst',
                visibility: 'hidden',
                instancePolicy: { requiredAccessLevel: 2, initiator: 'recipient' },
                settings: {
                    rendering: { tabs: true, refresh_button: false },
                    recipient: { requires_phone_number: true },
                },
                compatibility: { consentTemplateIds: ['3', 'c-1'] },
            },
        }

        // The canonical version form excludes the transport revision, so it is normalized away here the
        // way `canonicalVersionForm` does it on the service side.
        const form = (doc: QnrTemplateDocument): unknown =>
            reduceToMinimalForm({ ...doc, revision: 0 }, { isDefault: templateAuthoringIsDefault })

        assert.equal(canonicalJson(form(authored)), canonicalJson(form(imported)))
        assert.equal(await hashCanonical(form(authored)), await hashCanonical(form(imported)))
        assert.deepEqual(resolveTemplateAuthoringMeta(authored.meta), resolveTemplateAuthoringMeta(imported.meta))
    })

    it('normalises NFC and NFD spellings of a title to the same bytes', () => {
        const composed = applyAll([{ type: 'template.setMetaFieldTyped', field: 'title', value: 'Måltid' }])
        const decomposed = applyAll([{ type: 'template.setMetaFieldTyped', field: 'title', value: 'Måltid' }])
        assert.equal(canonicalJson(composed), canonicalJson(decomposed))
    })
})

describe('the registry is complete and internally consistent', () => {
    it('declares exactly 23 settings leaves and 7 metadata fields', () => {
        assert.equal(TEMPLATE_SETTING_FIELDS.length, 23)
        assert.equal(new Set(TEMPLATE_SETTING_FIELDS).size, 23)
        assert.equal(TEMPLATE_META_FIELDS.length, 7)
        assert.equal(new Set(TEMPLATE_META_FIELDS).size, 7)
        assert.deepEqual([...COMPATIBILITY_COLLECTIONS], ['consentTemplateIds', 'smsTemplateIds'])
    })

    it('declares a default for every field it names', () => {
        for (const field of TEMPLATE_SETTING_FIELDS) {
            assert.equal(typeof TEMPLATE_SETTING_DEFAULTS[field], 'boolean', field)
            assert.equal(isTemplateAuthoringDefault(settingFieldPath(field), TEMPLATE_SETTING_DEFAULTS[field]), true)
        }
        assert.deepEqual(
            TEMPLATE_SETTING_FIELDS.filter((field) => TEMPLATE_SETTING_DEFAULTS[field]),
            ['rendering.refresh_button'],
        )
    })

    it('resolves and stores every settings leaf through the schema', () => {
        // One pass proving the document schema actually declares each leaf: a boolean validates and a
        // string does not, so a leaf missing from the schema cannot hide behind the open index.
        for (const field of TEMPLATE_SETTING_FIELDS) {
            const [group, leaf] = field.split('.') as [string, string]
            const ok = validateTemplateDocument(withMeta({ settings: { [group]: { [leaf]: true } } }))
            assert.ok(ok.ok, `${field} is not accepted by the document schema`)
            const bad = validateTemplateDocument(withMeta({ settings: { [group]: { [leaf]: 'yes' } } }))
            assert.equal(bad.ok, false, `${field} is not typed by the document schema`)
        }
    })
})
