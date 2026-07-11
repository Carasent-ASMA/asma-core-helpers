import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { parse, print } from '@0no-co/graphql.web'

import { adopusSlugFromJwt, denamespaceData, namespaceDocument } from './adopusNamespaceExchange.js'

const PREFIXED = new Set(['Actor', 'Actor_bool_exp', 'Int_comparison_exp', 'uniqueidentifier'])

const normalize = (sdl: string) => print(parse(sdl))

describe('namespaceDocument (transforms 1-3)', () => {
    it('wraps the operation, prefixes variable definition types, leaves builtins alone', () => {
        const doc = parse(`
            query fetchActors($where: Actor_bool_exp, $limit: Int, $id: uniqueidentifier) {
                Actor(where: $where, limit: $limit) { ActorNo Navn }
            }
        `)
        const out = print(namespaceDocument(doc, 'avansas', PREFIXED))
        assert.equal(
            out,
            normalize(`
                query fetchActors($where: avansas_Actor_bool_exp, $limit: Int, $id: avansas_uniqueidentifier) {
                    avansas {
                        Actor(where: $where, limit: $limit) { ActorNo Navn }
                    }
                }
            `),
        )
    })

    it('prefixes wrapped list/non-null variable types', () => {
        const doc = parse(`query q($ids: [Int_comparison_exp!]!) { Actor { ActorNo } }`)
        const out = print(namespaceDocument(doc, 'avansas', PREFIXED))
        assert.match(out, /\$ids: \[avansas_Int_comparison_exp!\]!/)
    })

    it('prefixes inline and named fragment type conditions, at any depth', () => {
        const doc = parse(`
            query q {
                Actor {
                    ... on Actor { ActorNo }
                    ActorActor_Overordnet { ... on Actor { Navn } }
                    ...actorFields
                }
            }
            fragment actorFields on Actor { Navn }
        `)
        const out = print(namespaceDocument(doc, 'avansas', PREFIXED))
        assert.equal((out.match(/on avansas_Actor/g) ?? []).length, 3)
        assert.doesNotMatch(out, /on Actor\b/)
    })

    it('wraps mutations too', () => {
        const doc = parse(`mutation m($w: Actor_bool_exp!) { update_Actor(where: $w) { affected_rows } }`)
        const out = print(namespaceDocument(doc, 'genesisdev', PREFIXED))
        assert.equal(
            out,
            normalize(`
                mutation m($w: genesisdev_Actor_bool_exp!) {
                    genesisdev { update_Actor(where: $w) { affected_rows } }
                }
            `),
        )
    })
})

describe('denamespaceData (transforms 4-5)', () => {
    it('unwraps the namespace and strips __typename prefixes deeply', () => {
        const wire = {
            avansas: {
                Actor: [
                    {
                        __typename: 'avansas_Actor',
                        ActorNo: 1,
                        ActorActor_Overordnet: [{ __typename: 'avansas_Actor', ActorNo: 2 }],
                    },
                ],
            },
        }
        assert.deepEqual(denamespaceData(wire, 'avansas'), {
            Actor: [
                {
                    __typename: 'Actor',
                    ActorNo: 1,
                    ActorActor_Overordnet: [{ __typename: 'Actor', ActorNo: 2 }],
                },
            ],
        })
    })

    it('leaves unprefixed __typename values and non-typename fields untouched', () => {
        const wire = { avansas: { Actor: [{ __typename: 'Actor', Navn: 'avansas_not_a_typename' }] } }
        assert.deepEqual(denamespaceData(wire, 'avansas'), {
            Actor: [{ __typename: 'Actor', Navn: 'avansas_not_a_typename' }],
        })
    })

    it('passes data through when the namespace key is absent', () => {
        assert.deepEqual(denamespaceData({ Actor: [] }, 'avansas'), { Actor: [] })
    })
})

describe('adopusSlugFromJwt', () => {
    const jwtWith = (claims: object) =>
        `x.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.y`

    it('reads and sanitizes the subdomain claim', () => {
        assert.equal(adopusSlugFromJwt(jwtWith({ subdomain: 'Fretex-Dev' })), 'fretex_dev')
    })

    it('returns undefined for missing token, missing claim, or unsanitizable subdomain', () => {
        assert.equal(adopusSlugFromJwt(undefined), undefined)
        assert.equal(adopusSlugFromJwt(jwtWith({})), undefined)
        assert.equal(adopusSlugFromJwt(jwtWith({ subdomain: '1-bad!' })), undefined)
    })
})
