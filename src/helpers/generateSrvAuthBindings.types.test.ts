// ASMA-8221 / TB-16a: the Ad Voca TabBar metadata rides along the signin options.
//
// The contract pinned here: `tabbar` exists on the wire type AND survives
// `ICheckSigninTransformedOptions`, which must only rewrite `features` into a Set. If someone
// widens that Omit, the assignment below stops compiling.
import assert from 'node:assert/strict'
import { test } from 'node:test'

import type { AdvocaTabBarMetadata } from 'asma-types'

import type { ICheckSigninOptions, ICheckSigninTransformedOptions } from './generateSrvAuthBindings.types.js'

const onWire: ICheckSigninOptions<string>['tabbar'] = {
    version: 1,
    destinationIds: null,
} satisfies AdvocaTabBarMetadata

const transformed: ICheckSigninTransformedOptions<string>['tabbar'] = onWire

test('tabbar metadata survives the features Set transformation', () => {
    assert.deepEqual(transformed, { version: 1, destinationIds: null })
})
