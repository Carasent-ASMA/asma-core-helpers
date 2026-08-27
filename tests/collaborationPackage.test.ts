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
