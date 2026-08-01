/**
 * The QNR authoring collaboration contract: the normalized template document, the op
 * vocabulary, and the reducer that turns one into the other.
 *
 * Published as its own subpath (`asma-core-helpers/collaboration`) rather than through the
 * root barrel, and that is load-bearing rather than tidiness: the root barrel re-exports
 * modules that read `window` and `localStorage` at module top level (`helpers/getSubdomain`,
 * `helpers/initEnvConfigsVars`), and ESM evaluates every re-exported module on import — so
 * importing the barrel from a Bun/Node service throws `ReferenceError: window is not
 * defined` before any of this code runs. This entry point is browser- and server-safe
 * because nothing under it imports anything at all.
 *
 * Both sides of the questionnaire editor consume exactly this module: the frontend applies
 * an op locally before it leaves the client, bunjs applies the same op authoritatively
 * before it becomes durable. Two implementations would make every divergence a data-loss
 * bug, which is why the contract lives here instead of in either consumer.
 *
 * @see asma-modules/_docs/editor/qnrs/cross/2026-07-12-20-20-architecture-qnr-v2-model-collaboration-sync.md:422 (shared contracts package)
 * @see asma-modules/_docs/editor/qnrs/cross/2026-07-12-21-40-plan-qnr-stage2-new-model-editor-and-sync.md:690 (FILE-001)
 */

export * from './questionTypes.js'
export * from './templateDocument.js'
export * from './operations.js'
export * from './applyOperation.js'
