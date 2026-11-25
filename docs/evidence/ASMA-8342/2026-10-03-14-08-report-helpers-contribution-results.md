# ASMA-8342 helpers contribution: frozen source and local results

> **Date:** 2026-10-03 14:08 Europe/Oslo
> **Status:** 🟡 Helpers contribution published; full Goal and independent acceptance OPEN
> **Category:** report
> **Scope:** TASK08, admitted isolated asma-core-helpers primitive and four existing seams
> **Summary:** Records the exact SOURCE checkpoint, developer checks, qualified process route, compatibility limits and consumed-plus-remaining ledger. No real consumer, supplier, server, transport, combined-source or independent acceptance is claimed.

## When to Load

Load when ROOT/TPM assesses this frozen helpers contribution or a separately qualified owner adopts its binding. Read the complete [scope acceptance](2026-10-03-11-48-report-context-scope-acceptance.md), [source manifest](source-consumer-ownership-manifest.json) and [full command outputs and receipts](2026-10-03-14-08-report-helpers-contribution-results.json). The original intake index/report/manifest remain byte-identical; this separate result is routed through the explicit ROOT/TPM callback.

## Goal and actual contribution

The exact Goal remains: **“A shared context module exposes actor, organization and selected-record state plus the shell-to-widget auth binding, and target widgets consume it without reading authentication directly.”** The helpers contribution implements the coordination primitive and additive owner-client path. Target widgets have not adopted it; the Goal remains OPEN.

SOURCE is **`f6763bd252f5462bebdfb6d5e4a43959cc76504b`**, parent **`e793130bcc3ecf0b8fd01b8b21336e9d6042dc36`**, on `feat/ASMA-8342-shared-actor-organization-and-selected-record-context-with-shell-to-widget-auth-binding`. Exact cwd: `/Users/igor/carasent/asma-modules/.worktrees/asma-8342/asma-core-helpers`. Local HEAD and origin tracking ref independently matched after successful push. This report and its JSON are the separate results concern; their eventual commit/publication SHA is returned separately and cannot be self-embedded.

SAME sole Dev: agent `2f71ba5c-8d9e-4283-b4f6-31ce0da52d66`, native `01a1016a-d566-7fb2-8722-4dda4f0a48ec`, project `prj_fc87bc1f96af0ed3`, TSW `wks_128565ef9e09dc1d`, codex-personal / `gpt-6.1-sol` / `xhigh` / `auto`, designed Dev rung2. Account selection preceded rung selection: actual Claude work/personal initialization error78 missing token and codex-work out of credits led to available personal capacity. Personal seven-day observation advanced10%→12%, reset `2026-10-09T21:14:13Z`; this is not work quota. Failed predecessors were already verified closed; no seat/reviewer was spawned or replaced during implementation.

## Exact source boundary and behavior

Eleven own source/test paths changed, with all committed blob hashes equal to the tested path hashes in the JSON:

| Paths | Contribution / compatibility boundary |
| --- | --- |
| `src/context/context.types.ts`, `createSharedContext.ts`, `index.ts` | Session field types derive from existing auth types. Immutable whitelisted actor/org/journal/record snapshots; unavailable/anonymous/pending/denied/ready/disposed states; monotonic generation, guarded publication, per-mount liveness and revocable leases. |
| `src/context/createSharedContext.test.ts` | 13 behavior tests for authority-input shape, explicit null, revocation, expiry, reentrancy, reverse completion, retained capabilities, unmount/reconnect and owner endpoint checks. |
| `src/helpers/generateSrvAuthBindings.ts`, `.types.ts` | Optional host attachment to the SAME managed producer. Clear token AND metadata, revoke before replacements/logout observers, expire synchronously on reads and proactively by timer, deny stale auth/editor completion. GET dedup keys include generation/full URL/query/headers; POST ceremonies are not coalesced. Activity cache/pending requests clear on scope or explicit invalidation. Added host-only `createSrvAuthContextOwnerClient`. |
| `src/helpers/generateSrvAuthBindings.test.ts` | 12 tests for login/producer reuse, failed/late signout, dedup semantics, late auth/refresh denial, expiry, scoped activity cache/pending work and capability creation/401 refresh. |
| `src/helpers/createTadaBrowserClient.ts`, `initTadaBrowserClient.ts` | Additive binding options. Owner creation and async exchange setup recheck generation/mount. Clients cache only within a current generation. Outer exchange sanitizes cached/streamed late results and settles revoked active operations with a sanitized error while sending teardown. Bound init returns before global environment/auth resolution; bound anonymous option denies. |
| `src/helpers/createTadaBrowserClient.test.ts` | 8 tests exercise actual urql queries, async factory/exchange races, cache/stream/teardown, abort-ignoring fetches, concurrent mounts, legacy auth headers/anonymous API and unavailable global auth/environment getters on the bound path. |
| `src/index.ts` | Additive context and bound-client type exports through the existing root entry. No new export-map entry. |

No collaboration, package, version, dependency, export map, Auth service, loader, schema or canonical source was changed. The auth seam's runtime imports now use existing direct modules rather than the root index cycle. Existing client/token-based options and returned `getClient`/`createClient` surface remain; existing auth function arguments and returned methods remain, with an optional second host-only attachment argument. Error response payload compatibility is retained. Deliberate security behavior changes reject stale completions, clear stale metadata/overviews and ensure local logout precedes user observers; code that depended on stale identity data is not compatible with that unsafe behavior.

## Trust and adoption boundary

This is **client coordination**, not an auth server. A caller-provided ready input passes structural consistency/expiry checks; it is not proof of authentication, permission, membership or an authorized backend operation. Only a host that has validated the authenticated session and compatible tenant policy and an owner-authorized selected record may publish ready. URLs, caches, local preferences and decoded/first-hit metadata cannot grant access.

The host retains credentials and the existing producer. Consumers receive URL-pinned fetch/client capability, a safe snapshot and revocable lease; the adopted path has no JWT getter or auth-global fallback. The host's factory must reject unknown owners and enforce the required owner record/journal surface. The primitive cannot supply those policy proofs. Lease `run` checks before and after async completion; store/render effects use synchronous `commit`, and consumer lifecycle cleanup must clear/detach protected state. Abort is additional cancellation, not authority. Mounts of one controller share its snapshot; distinct authorized selected contexts need distinct host-owned controllers. Custom cache/exchange/store adoption must prove its own complete scope key and cleanup.

The real producer intentionally invalidates attached contexts on a successful session/token metadata replacement, including same actor ID. Therefore a real refresh can retire the old capability; the host must revalidate/republish and obtain a new current client. The mocked current-generation401 retry proves the adapter's guard mechanics, not a complete host refresh flow.

S1–S7 remain retained. S1 authenticated session/policy assembly is unperformed. For S2 guardian identity, the future host must correlate authenticated `/protected/check?context=advoca.lg.list-of-wards` response to the **same captured session/customer/generation and selected-member relationship**. The ward-minted `user_id` is not the guardian actor; unknown/conflicting/stale/unavailable supplier denies. No pnr/name/token/schema/backend inference or new guardian role was introduced. S3 compatible tenant/policy entry and deliberate org reauth, S4 owner-authorized record/action, S5 owner journal resolution, S6 real owner client adoption, and S7 anonymous/claim ceremony proof remain future owned work.

## Actual checks and omissions

Node **v24.13.1**, repository Node/tsx framework; commands ran from the exact helpers cwd. Each final command's exit/output was captured independently:

| Actual command | Result |
| --- | --- |
| `pnpm test` → `node --import tsx --test "src/**/*.test.ts"` | Exit0; **469/469**, 95 suites, zero failed/cancelled/skipped/todo. Includes33 new behavior tests. |
| `pnpm exec tsc --noEmit` | Exit0. Production project types compile. |
| `pnpm run test:package` → `pnpm build` → `pnpm ts:check` → `tsc`, then `node --import tsx --test "tests/*.test.ts"` | Exit0; build/compiler exit0 and **5/5** existing package tests. |
| `python3 /Users/igor/carasent/asma-modules/_tools/scripts/check-codex-agent-config.py` | Exit0;65 byte-exact skills. Initial task-mirror path was absent (exit2), so the located canonical script ran read-only. |
| `git diff --check` before SOURCE | Exit0. |

Checks preceded the SOURCE commit; exact staged and subsequently committed blob hashes match every checked source path. No implementation edit followed those checks. Full outputs, timestamps, command argv, staged pins and effect records are in the JSON; the precommit HEAD at test execution remains recorded as e793130 and is not mislabeled as a commit that already existed.

Development failures are retained as corrections, not counted as final passes: the initial frozen-object test wrongly expected `Reflect.set` to throw rather than returnfalse; initial timer/unused-declaration compiler errors were fixed; an early combined shell command masked that test failure with compiler exit0. Final commands have separate exits. Offline install lacked cached tarballs, sandbox online installation failed DNS, and the permitted frozen online install completed without package/lock changes.

Unperformed: actual browser/root-entry mounting, authenticated host/policy/guardian suppliers, owner/server tenant/record/journal authorization, real consumers/providers/stores, both real transport lifetimes, deployed app@version/key joins, external-caller/rollback evidence, seeded mutations and independent QA/Audit. Existing package tests cover legacy package subpaths, not an actual browser run of the built root context entry. The production tsconfig excludes `.test.ts`; tsx behavior execution is not a separate test-file type-check claim. No Tauri toolchain or live credential/environment read was used.

## Complete lifecycle and acceptance denominator

All **177 accepted /180 current routes,81 selectors,303 mount-source candidates,189 host sites,176 target host files,39 provider faces,955 lexical candidates** remain. These are preserved source-denominator counts, not migrated-widget or runtime adoption counts.

| Lifecycle | Local evidence; remaining real proof |
| --- | --- |
| L1 login/initial mount | Ready publication is explicit; auth login invalidates but never publishes. Actual host supplier assembly/initial mount open. |
| L2 logout | Same producer clears/revokes before failed signout and observers; late signout cannot restore a newer login. Real protected render/store clearing open. |
| L3 expiry/refresh failure | Timer/read expiry and stale refresh/factory/401 denial tested. Real host revalidation/refresh flow open. |
| L4 actor/role/permissions | Generation change retires leases even for reused IDs; primitive role fixtures and replacement auth role tested. Real policy grants/composition proof open. |
| L5 organization | Local A→B→A/reverse publication cannot resurrect capabilities. Actual org reauthentication and failed-B render proof open. |
| L6 record/guardian/self | Distinct actor/record, explicit null and structural relationship/tenant negatives tested. Authenticated guardian/member/record/journal authorization open. |
| L7 navigation/composition | Primitive has no URL or cache authority supplier. Actual routes/requested selection/composition adoption open. |
| L8 concurrent/late async | Reverse publication, token/auth/editor/activity/client factory/exchange completion guards tested. Real supplier/domain races open. |
| L9 unmount/remount | Per-instance revoke, unsubscribe and retained capability denial tested. Real cached ESM module/provider/store disposal open. |
| L10 reconnect/subscription | Retained callback and urql stream/cache/teardown/reconnect mechanics tested. Actual owner subscriptions/reconnect open. |
| L11 cache/multiple widgets | Concurrent mounts and activity pending/cache scope mechanics tested. Real QueryClient/MST/IDB and different selected-record instance adoption open. |
| L12 anonymous/error/transport | Null inactive fields, unsupported revision, owner endpoint denial and unavailable global fallbacks tested. Actual public ceremonies/error notices/both transports open. |

| Verification | Disposition |
| --- | --- |
| V1 actual consumption | **Unperformed** real entries→providers→clients; local bound-init no-global fallback fixture only. |
| V2 actor/record | Partial structural/local fixture evidence; authenticated guardian supplier and real owner relationships unperformed. |
| V3 server authorization | **Unperformed** authenticated/unauthorized/restricted/wrong-role/cross-record/tenant/journal operation proof. |
| V4 organization | Partial local generation/clear mechanics; real reauth and deployed policy fixture unperformed. |
| V5 lifecycle | Partial helpers behavior tests; all real host/consumer lifetimes unperformed. |
| V6 async | Partial deterministic helpers races; real wards/claims/policy/domain requests unperformed. |
| V7 streams/cache | Partial urql/activity/lease mechanics; actual owner reconnect and all real stores unperformed. |
| V8 anonymous/continuation | Null anonymous mechanics only; real replay/expiry/tamper/target/customer/actor ceremonies unperformed. |
| V9 transport/compatibility | Legacy helper API fixtures/compile pass; real app@version/manifests/key joins and mount/update/unmount unperformed. |
| V10 browser/sensitive output | Safe snapshot allowlist and sanitized helper errors; actual browser/log/notice capture unperformed. |

Artifact remains frozen ESM-only; no qiankun restoration. Its eight missing joins and OPEN-001 remain gaps, both management URLs remain preserved, and no key is treated as dead merely because source consumers are missing. Other modules retain separately qualified operators.

Fresh readback read/hashed **all1325 source files /5,192,302 bytes** and all15 named module HEADs without drift. ASMA8339's separate HEAD remains `ceadb17833963514c38b189a1ce2de8a6605a78c`; canonical helpers remains `a0dfc9556977bc84c8332d3d2edb2265d5e52dbb`; pre-contribution ancestry was1/2 with merge-basea0df. No merge or combined-source proof occurred. Its collaboration work remains separate; the eventual combined additive root export must be reconciled by a qualified integrator.

## Process qualification and distinct effects

Read FULL receipt `/Users/igor/.local/state/asma/watchdogs/ASMA-8108/history/operator-core-scope-20261003/task08-qualified-process-hooks.json`, SHA256 **`52c2f23d53fc9b7b62dd1dc79bf003cfa9675d8da52b9381478c8192ae4635a9`**. The missing validator hash supplement was subsequently received/read FULL; its SHA is in the JSON. Canonical `validate-doc-refs.py` SHA **`62a5aa537cddace14bf6456f8aae25d0df3ffe7b2ef1df27a33972075bc9c7f3`**, `validate-commit-msg.py` SHA **`f13e67dd9dbf69ef8387a5212210b07b15856eea2a2dcde05a6290a1c1faeadb`**, match the independently qualified committed bytes.

Immediately before SOURCE, all four process hooks, pinned config **`1ed1c0b495efc6b6aa96457220b9474ead8a9838cebdedbb44840321f9a96a51`**, binary **`90e53a15be1630791dde4d802fe0a382fd2c93cbef3db1fbbfd33d62f2f6a0af`**, both canonical validators and all seven shared hooks/backups matched. Process config count was0; the wrapper safely appended core.hooksPath as entry0 and used `ASMA_DISABLE_AUTO_ROOT_PULL=1`, pinned LEFTHOOK_CONFIG and LEFTHOOK_BIN only in the process. No persistent configuration or validator bypass.

Explicit staging was11 own files only. The sandbox denied writing the external worktree index; the concrete scoped permission succeeded. ASMA dry-run exit0 resolved ONLY the task checkout; root pointer commit disabled. Final staged precommit printed **“doc refs OK (11 files)”**, exit0; commit-msg accepted `feat(context): ASMA-8342 Add revocable shared context`, exit0. Actual `asma git commit -m … --push --verbose` exit0 printed those real commit validators again and successful task-branch publication. Git's qualified prepare/commit/push hook route was active; pre-push is silent on success. This is not a broad Lefthook or QA pass, and ROOT's fixture validator checks are not substituted for these final staged checks.

The install had earlier synchronized the generated prepare hook; the immediate preinstall preimage is missing and global restoration remains separately owned. The current generated prepare975cec… copy, older replacement hooks/backups, foreign Cursor/adapters, `.pnpm-store` and task comment-only `lefthook.yml` are preserved and excluded. No blind restoration occurred. The JSON retains GitHub's default-branch vulnerability notice as received; no dependency/security audit verdict follows from it.

ASMA emitted advisory Paseo-direct `binding_unconfirmed` attestation `01a101a1-d74c-7b03-8edd-6c6acb20d221` and published successfully. This is one orchestration observation for the owner's Reports table, not a Kontor repair/containment obligation. No raw Git commit/push fallback, source integration, canonical product write, PR, default merge/push, Jira movement or reviewer dispatch.

## One consumed-plus-remaining ledger

Frozen cutoff **2026-10-03T12:08:47.208865Z**. Whole **8.18d mandatory /8.43d contingent** remains unchanged; no new allowance or role phase. Original M3 remains a separate original estimate, with disclosed5.18/5.43d forecast excess; this contribution cannot certify whole-task fit.

ROOT's authored `f1c8faffe576fcea0f80d6d9347ebd7e8f84dcbe` full report confirms .08 consumed +.05 remaining =.13 once. TPM's original .10+.20=.30 is retained once; ROOT's latest accounting attributes an additional **.01d TASK08 exclusivity/install routing inside that .30**, making known TPM .11 and remaining .19. The other .01 supportingASMA8343 and earlier Auth terminal recovery estimate are excluded. Architect authored consumed **.08 supersedes .06**, inside scope.75.

Own observed native turn start10:59:01.605Z→cutoff is4,185.603865s, an **elapsed proxy .145333…d at8h/day, rounded .15d**, not independently measured active engineering. Bootstrap **.03 is inside that .15**; only the additional .12 transfers from remaining, inside primitive/tests1.25. Results assembly/publication after this cutoff remains inside the retained allocation and is reconciled in the final callback.

| Retained component | Whole days | Known consumed model/proxy | Remaining before unknown-phase transfers |
| --- | ---: | ---: | ---: |
| ROOT | .13 | .08 | .05 |
| TPM | .30 | .11 | .19 |
| Architect scope/ADR | .75 | .08 | .67 |
| Shared primitive/tests, bootstrap included | 1.25 | .15 elapsed proxy | 1.10 |
| Shell/Advoca real binding/suppliers/lifecycle | 1.25 | Not performed by this Dev | 1.25 retained |
| Maintained provider adoption | 2.00 | Not performed | 2.00 retained |
| Frozen Artifact/legacy compatibility | .50 | Not performed | .50 retained |
| Independent QA | 1.00 | Not performed | 1.00 retained |
| Independent audit | .50 | Not performed | .50 retained |
| Engineering integration/frozen evidence | .50 | Retained; not charged again for this Dev's same contribution evidence | .50 retained |
| **Mandatory** | **8.18** | **.42 + U** | **7.76 − U** |
| Contingency | .25 | Retained | .25 retained |
| **Contingent whole** | **8.43** | **.42 + U** | **8.01 − U** |

**U remains unknown, not zero.** Retired codex-work native JSONL shows10:12:37.975→10:13:57.802Z and10:55:55.119→10:55:56.049Z turn envelopes, total80.757s (.0028040625d elapsed proxy). The43-minute idle-inclusive span is not consumption. This attributable observation refines evidence for U without certifying engineering time or charging it again automatically. Claude predecessors have null native sessions; management/recovery intervals are not independently measured. ROOT confirms no independent active-engineering ledger for retired Dev or later ROOT hook/recovery work. Allocate each actual unknown consumed interval once to its retained phase and subtract its remaining amount before certifying fit. No .02 management estimate is added above the whole; no bootstrap reset or new per-role days.

Reported net forecast expansion for this admitted contribution is **0d**. If reconciled actual unknowns or required adoption push any owning retained phase/whole mandatory forecast beyond the accepted bound, stop before affected effects and return the exact delta. No positive budget-fit conclusion is made from an unresolved U.

## Independent gates and next owners

QA/Audit currently share OpenAI with Dev. That vendor collision remains non-waivable; neither can issue independent PASS, regardless of rung depth. No qaPassed/auditPassed flag or task/epic closure is set. ROOT/TPM receive the complete frozen functional/source/test/effect/ledger return first, with SOURCE and results SHAs distinguished. Qualified host/supplier/consumer/transport/integration owners and admissible independent reviewers remain required before the exact Goal can close.
