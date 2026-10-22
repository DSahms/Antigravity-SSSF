> Historical record: this file describes an earlier implementation. Current product behavior and verification are in [CREW_IMPLEMENTATION_STATUS.md](CREW_IMPLEMENTATION_STATUS.md) and the latest [HANDOFF.md](HANDOFF.md). Preserve the history below; do not treat superseded findings as current.

# CREW Platform — Release Readiness Audit

**Date:** 2026-10-19  
**Branch:** `flow-and-onboarding` (HEAD `fb8583c`, large uncommitted working set)  
**Audit type:** live product audit, not a code review only

## Verdict

**Not ready for a full-build release.** A real **Plan Only** workflow and a real **Quality Gate** workflow complete through the UI/server. The flagship real build pipeline (`adw_simple_sdlc.py`) does **not** complete: at a 60,000-token cap it stopped during `build` after the planner consumed 61,362 tokens. No `app.js` was produced.

The shortest route to a usable release today is a **trustworthy plan-only demo** plus the four blocking UI/startup fixes below. The full generated-app path is a separate 3–5 hour milestone, not a configuration toggle.

**Post-audit remediation:** the four tractable P0 blockers were fixed and re-tested after this audit: startup port/origin, the New Job first click, session/phase navigation, and project checks. A real Plan Only workflow then completed in a clean project (26,672 tokens, one plan file, a `success` session). The remaining release blocker is the full generated-app pipeline (P0-5). See **Post-audit remediation evidence** at the end.

## Environment and evidence

- Windows, Bun 1.4.2, Node 22.22.3, Python 3.11.9, uv 0.12.17, `pi 0.87.1`.
- Existing FreeLLMAPI-compatible router at `http://127.0.0.1:31415/v1`, model `auto`; no new paid service or subscription used.
- `bun run build` and `vue-tsc --noEmit` pass.
- `studio/scripts/check.mjs` passes: 12 Bun tests, 3 Python permission tests, 3 Python workflow tests.
- `approval-enforcement.test.ts` and `tour-overlap.test.ts` pass: 9 tests.
- `studio/scripts/verify-ui.mjs` passes desktop/mobile manual, search, tour, quiz, and anchor checks.
- Real **Plan Only** run: success, 17,167 tokens, 16.0s, plan artifact written to `specs/<adw_id>_hello-crew-page.md`.
- Real **Quality Gate** run through the UI: success, 26.6s, 4/4 quality checks.
- Real **simple SDLC** attempts:
  - 12,000 cap: stopped during planning at 12,720.
  - 60,000 cap: planner finished at 61,362; stopped during `build`; no app produced.
- Restart test: project, run record, approval and SQLite session survived; live console logs did not.
- The audit harness, fixture project, copied credential stores, test approval/run and temporary scripts were removed afterwards. Tracked run history was restored.

## Definition-of-done matrix

| Step | Status | What was observed |
|---|---|---|
| Launch CREW | **Conditional failure** | With `STUDIO_PORT=4620` or no `PORT`, the service serves the UI. With the inherited `PORT=0`, it binds a random port while the launcher waits on `4620`; all UI POSTs then return 403. `Start-Crew.ps1` started the service at 4620 when `PORT` was unset, but the wrapper call did not return within 60s. |
| Configure agents | **Works** | Settings loads 10 roles; saved local router profile tested successfully; `/models` returned `auto` and the router catalog; server masks saved keys; roster preset save/apply tests pass. |
| Create a job | **Works with a blocking click bug** | The real interviewer reached `ready: true` after two clarification turns and produced a 5-section spec. The first click on **Read it back to me** after typing is swallowed by a layout shift; a second click or DOM click works. |
| Approve a plan | **Works** | UI confirm-all + final checkbox + approve created v1; server-side `assertApproved` rejects missing, bogus, wrong-workflow, withdrawn and unconfirmed approvals; 6/6 enforcement tests pass. |
| Execute the workflow | **Partial** | Plan Only and Quality Gate complete. The full build pipeline does not complete within the maximum tested cap. |
| Inspect results | **Partial/broken** | Results shows status, phases, approval and next steps. Sessions list cards do not open a trace; phase blocks change the hash but never open the detail panel. |
| Verify completion | **Partial** | Plan and quality checks exist in SQLite; the UI cannot open the gate/output/prompt detail. Results reports “Gates passed 0 / 0” for the Quality Gate because that workflow does not write `gate_results`. |
| Retrieve deliverables | **Partial** | Plan and quality artifacts exist on disk. Results has no changed-files, artifact, or open-folder control; the manual claims “changed files” but the screen does not show them. |
| Reopen the job later | **Partial** | Approval, run status, project and SQLite session survive restart. Run console logs are discarded (`loadHistory` sets `logs: []`), and stale `running` sessions are not reconciled. |

**End-to-end:** one complete real workflow (Plan Only) and one complete deterministic workflow (Quality Gate) are demonstrable. A complete real **generated app** is not.

## P0 — must fix today

### P0-1. Startup port and origin mismatch — FIXED

**Fix applied:** `studio/server/index.ts` no longer reads generic `PORT`; it validates `STUDIO_PORT` (default 4620) and matches the origin against the actually bound port. `Start-Crew.ps1` pins `STUDIO_PORT=4620`. Verified with `PORT=0`: the server bound 4620, a same-origin POST returned 200, and a foreign origin returned 403.

**Files:** `studio/server/index.ts:10`, `studio/server/index.ts:87-88`, `Start-Crew.ps1:4-18`

`const PORT = Number(process.env.STUDIO_PORT ?? process.env.PORT ?? 4620)` accepts a generic `PORT`. In this environment `PORT=0`: Bun bound `54428`, while the origin allowlist still compared against `http://…:0`. The UI loaded, but every POST returned `403 This request must come from Crew Platform.` `Start-Crew` then waited on `4620` and would report startup failure.

**Original recommendation:** stop reading generic `PORT`; use `STUDIO_PORT` or a fixed 4620. Set `$env:STUDIO_PORT = '4620'` in `Start-Crew.ps1` (and clear/ignore inherited `PORT`). Derive the origin allowlist from the actual `server.port`, or allow only loopback origins and rely on `Sec-Fetch-Site` for cross-site rejection.

**Dependencies:** none. **Effort:** 15–30 min. A regression test that boots with `PORT=0` and asserts a POST from the real origin succeeds is still recommended.

### P0-2. First click after typing is swallowed in New Job — FIXED

**Fix applied:** the draft chip now occupies its space even when empty (`visibility: hidden`), so showing “Draft saved” on blur cannot move the analyze button. Verified with a Playwright mouse click immediately after typing; the `/analyze` request fired on the first click.

**Files:** `studio/src/views/NewJobView.vue:66-78`, `:284-287`, `:314-319`

Blurring the talk textarea calls `saveDraft()`, which sets `draftSavedAt`; the `v-if` draft chip above the mode grid is inserted between mousedown and mouseup. The button moves down, so the browser does not produce a click on **Read it back to me**. Playwright reproduced: first mouse click produced no `/api/studio/discovery/analyze` request; a DOM click did.

**Original recommendation:** keep the draft indicator out of the click path (fixed/absolute position, or below the action row), or save the draft without inserting a layout-shifting node. A browser regression test that fills the textarea and clicks **Read it back to me** once is still recommended.

**Dependencies:** none. **Effort:** 15 min.

### P0-3. Sessions and phase detail are unreachable — FIXED

**Fix applied:** `SessionsList` forwards a `select` event; `SessionCard` selects instead of relying on hashchange; `SessionsView` mirrors the hash route into `currentAdwId`/`currentPhaseId`. Verified in the browser: a card click opened the trace, and a phase block opened `.detail` at `#/<adw>/<phase>`.

**Files:** `studio/src/views/SessionsView.vue:14-30`, `:66-68`; `studio/src/components/visualizer/SessionsList.vue:59-65`; `studio/src/components/visualizer/SessionCard.vue:7`, `:190`; `studio/src/components/visualizer/SessionTrace.vue:424-426`

`SessionsView` renders `<SessionsList @select="selectSession">`, but `SessionsList` declares no `select` emit and never forwards a click. `SessionCard` is a bare anchor to `#/<adw_id>`; changing the hash does not update `nav.adwId`, so the list stays on screen. `currentPhaseId` is always `null`, so clicking a phase block changes the hash but never opens the detail panel. Clicking a card changed the URL but left the Sessions list visible; clicking a phase changed `#/<adw>/<phase>` but `.detail` stayed absent.

**Original recommendation:** add `defineEmits` and a click handler in `SessionsList` that forwards `SessionCard` selection to `SessionsView`; sync `currentAdwId` and `currentPhaseId` from the hash (`hashchange`/`useRoute`) so deep links and the phase blocks work. This restores gates, outputs and prompts for verification.

**Dependencies:** none. **Effort:** 30–60 min.

### P0-4. New projects cannot pass the recommended workflow — FIXED

**Fix applied:** Settings now has a **Project checks** tab that reads/writes `.crew-quality.json`; the launcher refuses Quality Gate and build workflows when that file is missing, with a direct instruction to configure it. The check is project-specific, not a copy of the factory's own config. Verified with a throwaway clean project: the preflight error fired, then a saved `test` command round-tripped.

**Files:** `studio/server/project.ts:22-42` (creation), `adws/adw_modules/quality.py:56-62`

A project created by the UI contains `adws/`, `.env`, `.gitignore`, `README.md`, and copied profiles, but **no `.crew-quality.json`**. Running Quality Gate in `audit-fixture` failed immediately:

> `RuntimeError: No real validation configured. Add .crew-quality.json with test, lint, typecheck, and build argv lists before running verification.`

The recommended full workflow includes the same quality stage. The UI never asks for checks, and copying the root `.crew-quality.json` would be wrong because its commands target `studio/`, not the new project.

**Original recommendation:** add a “Checks” step to project creation (or a Settings/Project tab) that writes a project-specific `.crew-quality.json`; disable or warn on Quality Gate/full SDLC until at least `test` is configured. Generate sensible defaults only after the project type is known. Do **not** copy the factory’s own quality config.

**Dependencies:** none. **Effort:** 30–60 min for a minimal checks editor; 2h for a polished setup flow.

### P0-5. The real full-build path does not complete — OPEN

**Files:** `studio/server/launcher.ts:208`, `:376-385`; `studio/server/profiles.ts` default cap; `studio/server/runtime.ts:24-26`; `adws/adw_data/prompt_engineering/planner/*`

Evidence: the 60k run’s planner produced a 1.2KB plan after **60,805 input + 557 output tokens** across 13 usage events. `adw_simple_sdlc` then stopped at 61,362/60,000 during `build`; no app existed. A 12k run stopped at 12,720 during planning. Plan Only with a smaller scope succeeded at 17,167.

**Fix options, in order of practicality:**
1. **For today:** make **Plan Only** the default first-run demo and label the full build as “token-heavy / needs checks configured.” Do not present the recommended full pipeline as the primary path until it completes.
2. **Short-term:** raise the default cap only with an explicit warning; add a preflight estimate based on workflow phases and planner history. The cap is a reporting threshold, not a hard ceiling.
3. **Real fix:** reduce planner rounds (fewer tools/repo exploration, write the plan after a bounded number of turns), and check the DB’s cumulative usage after every agent turn rather than only on the 500ms timer. Re-run the isolated simple SDLC until `app.js` exists and its tests pass.

**Dependencies:** existing router/Pi only. **Effort:** 30 min for the UX/default change; 3–5h for planner-cost reduction and a full proof.

## P1 — should fix today

1. **Token usage is underreported and the cap overshoots — FIXED (final total).** `run.tokenUsage` was 13,661 while SQLite recorded 17,167; the 60k run stopped at 61,362. The launcher never refreshes the final total on `proc.exited` and only checks the cap on a timer/console line. Fix `launcher.ts:300-385`: on exit, read `SUM(events.tokens)`, update `tokenUsage`, and refuse to start the next phase if the cap is already exceeded. **Effort:** 1–2h.
2. **Run logs do not survive restart — FIXED (bounded tail persisted).** `loadHistory` sets `logs: []` at `launcher.ts:129-136`; `saveRunHistory` omits logs at `:504-527`. Fix: persist a bounded log tail or rehydrate from `events` when the Run/Results screen opens. **Effort:** 1h.
3. **Interrupted jobs are not reconciled.** A 10-day-old session (`213e1bf8`) still shows `running`; `loadHistory` ignores running records. On startup, mark sessions with no live child as `fail`/`stopped`, close open phases/processes, and show the reason. **Effort:** 1–2h.
4. **Results has no deliverables/changed-files view — FIXED.** `ResultsView.vue:100-169` shows status, phases, gates, tokens and approval only. Add `git status --porcelain`/`git diff --stat`, artifact paths, and an “Open project folder” action; the User’s Manual already promises “changed files.” **Effort:** 2–3h.
5. **The review summary does not follow the selected workflow — FIXED.** `ReviewApproveView.vue:107-118` is prefilled once; selecting Quality Gate still says “plan, build, test, review, and document.” Recompute on workflow change and include the actual phase list. **Effort:** 30 min.
6. **`approvedBy` is hardcoded to “Lead Engineer.”** `ReviewApproveView.vue:138`. Use `git config user.name`, `ENGINEER_NAME`, or a one-time local name. **Effort:** 20 min.
7. **No free-form follow-up chat in New Job.** `doChatSend` and `chatInput` exist (`NewJobView.vue:204-209`) but are not rendered; the user can only answer suggested questions or edit the spec. Also, editing the spec sets `ready=false` (`discovery.ts:155-160`) with no “re-check” button. Add a chat input/history and a re-check action. **Effort:** 1h.
8. **Workflow catalog is uncurated.** `listWorkflows` at `launcher.ts:143-171` exposes `BUILD` and `PLAN BUILD TEST QUALITY` with generic metadata, alongside the curated list. Filter to workflows with metadata or add metadata for every exposed script. **Effort:** 30 min.
9. **Broken/stale docs — PARTIALLY FIXED.** `README.md:25` and `studio/README.md:7` link `docs/CREW_IMPLEMENTATION_STATUS.md`, which does not exist. `docs/PROGRESS.md` says Pi is unavailable, says Windows pause soft-degrades, and recommends a local KoboldCpp setup that no longer matches the saved-router flow. Fix the links and refresh status. **Effort:** 30–60 min.
10. **Launcher has no preflight for required tools.** `Start-Crew.ps1:4-13` checks Bun and the built frontend only. If `uv`, `git`, `node` or `pi` is missing, startup succeeds and the job fails later. Add a visible preflight check with the exact missing tool and manual link. **Effort:** 1h.

## P2 — later

- Legacy History “Launch” goes to Run with `specPath`; `RunView` only reads `approvalId`, so legacy approvals cannot launch. Either remove the legacy action or support the path.
- Runtime hardcodes every model to `contextWindow: 128000`, `maxTokens: 8192` (`runtime.ts:24-26`); real router limits may differ.
- API-key masks expose the first and last four characters (`config.ts:469-478`, Settings). Prefer “set / not set” or a shorter mask.
- `executionHash` covers profiles and `sssf.config.yaml`, but not workflow scripts or prompt files; changing those after approval does not force re-approval.
- Dead views remain (`LaunchView.vue`, `DiscoveryView.vue`, `ObservabilityView.vue`, `HistoryView.vue`); both `bun.lock` and `package-lock.json` exist.
- No installer, shortcut, updater, or background-service stop control. This is acceptable for a prepared folder, but not a general release.
- Vertical/job-type abstraction, grants/permits, and generalized cases remain future work and should not displace the core fixes.

## Post-audit remediation evidence

All checks below were run after the fixes, against the built frontend and the local Bun server.

| Check | Result |
|---|---|
| `vue-tsc --noEmit` | pass |
| `bun run build` | pass |
| `node scripts/check.mjs` | pass (12 Bun tests, 3 permission tests, 3 workflow tests) |
| `vitest run` | 9/9 pass (approval enforcement + tour overlap) |
| `PORT=0` startup | server bound 4620; `/api/health` 200; same-origin POST 200; foreign origin 403 |
| New Job first click | `/api/studio/discovery/analyze` fired on the first mouse click after typing |
| Sessions and phase detail | card opened `.trace`; phase opened `.detail` at `#/555fefa6/555fefa6_01_request` |
| Settings → Project checks | configured commands loaded and rendered |
| Results deliverables | project path, plan files, and changed files rendered |
| Quality preflight | clean project refused Quality Gate with the Settings → Project checks message; saved config round-tripped |
| Real Plan Only workflow | **success**, 26,672 / 30,000 tokens, `specs/10541670_release-proof.md`, session `success` |

Remaining open items are P0-5 (real full build), P1 approved-by, free-form follow-up chat, workflow catalog, tool preflight, interrupted-run reconciliation, and the remaining stale progress text. The application still has no packaged installer.

## Recommended path to a usable release today

1. **15 min:** fix P0-1 (fixed `STUDIO_PORT`, actual-origin allowlist, launcher env).
2. **15 min:** fix P0-2 (draft chip must not shift the analyze button) and add the one-click test.
3. **30–60 min:** fix P0-3 (session card selection + phase detail via hash route).
4. **30–60 min:** make new projects demand a real `.crew-quality.json` before Quality Gate/full SDLC (P0-4).
5. **20 min:** make **Plan Only** the default first-run proof, with a clear “Full build (token-heavy)” label; keep the 20k cap for Plan Only.
6. **45 min:** add a Results deliverables panel (project path, plan/artifact files, changed files) and fix the live/final token total.
7. **30 min:** repair the docs link/status and remove the stale “Pi unavailable” instructions.
8. **Proof run:** Start-Crew → configure → Plan Only → approve → run → Results → open artifact → restart → reopen the job. Record the exact commands and output.

If the release gate genuinely requires a generated app, add **P0-5** (planner cost reduction and a full SDLC proof) and treat the plan-only demo as an interim milestone. Do not claim full-build readiness until `app.js` (or the equivalent) exists, its checks pass, and the UI can show the files.

## What already works well

- The Vue shell, navigation, themes, tour, manuals and responsive layout are coherent and tested.
- Connection profiles, model fetch, test connection and named roster presets are functional.
- The interviewer can produce a valid, ready spec with real model calls.
- Approval is server-enforced, versioned, withdrawable, and covered by tests.
- Deterministic Quality Gate and real Plan Only execution work.
- SQLite sessions, phases, events, approvals and run status persist across restart.
- Plain-language failures for bad connections, missing quality config, approval rejection and token-cap stops.
