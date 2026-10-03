import assert from 'node:assert/strict'
import { test } from 'node:test'

test('publishes the document contract validator from the collaboration subpath', async () => {
    const { findQuestionOwnershipViolations } = await import('asma-core-helpers/collaboration')

    assert.equal(typeof findQuestionOwnershipViolations, 'function')
})

/**
 * The combined post-v0.31 repair's public surface, checked through the **built** package rather than
 * the source tree.
 *
 * `pnpm test` imports `./src/...` directly, so it cannot catch a value that exists in source but never
 * reaches `lib/` — a missing barrel re-export, or a type-only export where a runtime one was intended.
 * BunJS and the app consume exactly this entry point, so this is the boundary that matters to them.
 */
test('publishes the ASMA-7683 combined repair surface from the collaboration subpath', async () => {
    const mod = await import('asma-core-helpers/collaboration')

    // Runtime values: the helpers a consumer must not re-implement or re-spell.
    for (const name of [
        'parseLegacyBindingOverride',
        'makeLegacyUnresolvedId',
        'isLegacyUnresolvedId',
        'makeExpressionTargetToken',
        'makeExpressionAlternativeToken',
        'isExpressionTargetToken',
        'isExpressionAlternativeToken',
    ] as const) {
        assert.equal(typeof mod[name], 'function', `${name} must be a published function`)
    }
    assert.equal(mod.LEGACY_UNRESOLVED_ID_PREFIX, 'legacy-unresolved:')

    // The seven new operation names are in the total registry, which is what makes a missing reducer
    // case or schema arm a build failure in every consumer rather than a runtime surprise in one.
    for (const opType of [
        'tab.setQuestion',
        'tab.setRowCountQuestion',
        'mappingBinding.setLegacyOverride',
        'alternative.setExpressionFormula',
        'alternative.setChartLegend',
        'chartLegend.create',
        'chartLegend.delete',
    ] as const) {
        // `IMPLEMENTED_OP_TYPES` is the exported projection of the internal total `OP_TYPE_COVERAGE`
        // record, so a name missing from the registry cannot reach this list.
        assert.ok(mod.IMPLEMENTED_OP_TYPES.includes(opType), `${opType} must be implemented`)
        assert.ok(mod.SCHEMA_TEMPLATE_OP_TYPES.includes(opType), `${opType} must have a schema arm`)
    }

    // Registry parity at the built boundary: exactly one entry per name, both directions.
    assert.deepEqual([...mod.SCHEMA_TEMPLATE_OP_TYPES].sort(), [...mod.IMPLEMENTED_OP_TYPES].sort())
    assert.equal(new Set(mod.IMPLEMENTED_OP_TYPES).size, mod.IMPLEMENTED_OP_TYPES.length)

    // The emitted declarations must carry the three Chart types; a type-only export that never lands in
    // `lib/*.d.ts` would leave a consumer unable to name what it stores.
    const { readFile } = await import('node:fs/promises')
    const declarations = await readFile(new URL('../lib/collaboration/templateDocument.d.ts', import.meta.url), 'utf8')
    for (const typeName of [
        'ChartLegend',
        'AlternativeChartLegend',
        'AlternativeChartLegendSelection',
        'LegacyBindingOverride',
        'LegacyBindingOverrideParseResult',
        'LegacyUnresolvedIdKind',
    ] as const) {
        assert.ok(
            declarations.includes(`type ${typeName}`),
            `${typeName} must appear in the emitted declarations`,
        )
    }
})

/**
 * ASMA-8339's shared surface, checked through the BUILT package.
 *
 * The Bun importer and the authoring app consume exactly this entry point, and the whole point of a
 * shared registry is that neither of them re-spells a default or a legacy alias. A value that exists
 * in source but never reaches `lib/` would send them straight back to spelling it themselves, which is
 * the divergence the module exists to prevent — and `pnpm test` cannot see it, because it imports
 * `./src/...` directly.
 */
test('publishes the ASMA-8339 template metadata/settings contract from the collaboration subpath', async () => {
    const mod = await import('asma-core-helpers/collaboration')

    for (const name of [
        'resolveTemplateAuthoringMeta',
        'parseMetaFieldValue',
        'isTemplateAuthoringDefault',
        'templateAuthoringIsDefault',
        'metaFieldPath',
        'settingFieldPath',
        'compatibilityIdPath',
        'compatibilityCollectionPath',
        'normalizeCompatibilityId',
        'normalizeCompatibilityIds',
        'templateAliasPathsOf',
        'templateCanonicalPathsTouchedByAlias',
        'templateLociOverlap',
        'templateAuthoringIntentsOf',
        'classifyTemplateAuthoringOverlap',
        'readTemplateAuthoringLocus',
        'templateAuthoringConflictTarget',
        'isMetaField',
        'isSettingField',
        'isCompatibilityCollection',
        'templateMetaDefault',
        'templateSettingDefault',
    ] as const) {
        assert.equal(typeof mod[name], 'function', `${name} must be a published function`)
    }

    // The released predicate must still be published ALONGSIDE the new one: verifying a historical
    // snapshot as stored and normalizing a new write are different jobs, and a consumer that could
    // only reach one of them would have to pick the wrong one for half its call sites.
    assert.equal(typeof mod.templateDocumentIsDefault, 'function')

    // OQ-V2-56: the same argument one release further back. A consumer pinned to 0.28.1 hashed the
    // three binding behaviours as content, so it needs the 0.28.1 rule by name — reachable through the
    // BUILT entry point, because that is the only thing the consumer actually imports.
    assert.equal(typeof mod.templateDocumentIsDefaultV0281, 'function')
    assert.equal(mod.templateDocumentIsDefaultV0281('mappingBindingsById.b-1.cardinality', '0..1'), false)
    assert.equal(mod.templateDocumentIsDefault('mappingBindingsById.b-1.cardinality', '0..1'), true)
    assert.equal(mod.templateDocumentIsDefaultV0281('questionsById.q-1.required', false), true)

    assert.equal(mod.TEMPLATE_SETTING_FIELDS.length, 23)
    assert.equal(mod.TEMPLATE_META_FIELDS.length, 7)
    assert.deepEqual([...mod.COMPATIBILITY_COLLECTIONS], ['consentTemplateIds', 'smsTemplateIds'])
    assert.equal(mod.TEMPLATE_SETTING_DEFAULTS['rendering.refresh_button'], true)
    assert.equal(mod.TEMPLATE_META_DEFAULTS['instancePolicy.initiator'], 'coordinator')
    assert.deepEqual([...mod.TEMPLATE_VISIBILITIES], ['visible', 'hidden'])

    // The alias table has to survive the build as DATA, not just as a type: the importer reads it to
    // decide which legacy spelling it may consume.
    assert.deepEqual([...mod.templateAliasPathsOf('meta.settings.recipient.requires_phone_number')], [
        'meta.settings.recipient.ask_for_phone_nr',
        'meta.settings.ask_for_phone_nr',
    ])

    for (const opType of [
        'template.setMetaFieldTyped',
        'template.setSettingTyped',
        'template.addCompatibilityId',
        'template.removeCompatibilityId',
    ] as const) {
        assert.ok(mod.IMPLEMENTED_OP_TYPES.includes(opType), `${opType} must be implemented`)
        assert.ok(mod.SCHEMA_TEMPLATE_OP_TYPES.includes(opType), `${opType} must have a schema arm`)
    }

    // The two RELEASED open arms must still be in the registry: they are how an already-stored
    // `collab_ops` log replays, and dropping them would make old history unreplayable.
    for (const opType of ['template.updateMeta', 'template.updateSettings'] as const) {
        assert.ok(mod.IMPLEMENTED_OP_TYPES.includes(opType))
        assert.ok(mod.SCHEMA_TEMPLATE_OP_TYPES.includes(opType))
    }

    const { readFile } = await import('node:fs/promises')
    const declarations = await readFile(
        new URL('../lib/collaboration/templateAuthoringMeta.d.ts', import.meta.url),
        'utf8',
    )
    for (const typeName of [
        'MetaField',
        'MetaFieldValue',
        'SettingField',
        'CompatibilityCollection',
        'TemplateMetaFieldWrite',
        'ResolvedTemplateAuthoringMeta',
        'TemplateAuthoringFinding',
        'TemplateAuthoringIntent',
        'TemplateAuthoringOverlap',
    ] as const) {
        assert.ok(declarations.includes(`type ${typeName}`), `${typeName} must appear in the emitted declarations`)
    }
})
