# PROGRESS.md

**NEXT ACTION FOR DAVE**: Nothing — the flow, onboarding, calm look, settings, server-side approval, and tests are all in place. Smoke-test against the local KoboldCpp profile when you have one running (see "Verification" below). If you want to push back on any wording, look at `docs/DECISIONS.md` for the rationale per choice.

Format: one short line per step (done / skipped / blocked + reason). Newest at the bottom.

---
- [done] step 0: branch `flow-and-onboarding` created; `docs/FEATURES.md`, `docs/DECISIONS.md`, `docs/PROGRESS.md` scaffolded.
- [done] step 1: reskin — warm calm palette + light/dark themes via `[data-theme]` on `<html>`, kept every existing class name, added `.app-shell` / `.screen-header` / `.breadcrumbs` / `.tour-*` classes. Inter added as body font; Play retained.
- [done] step 2: nav shell — AppShell.vue with grouped sidebar (Workflow / Observe / Setup), topbar with project pill + stamp + Help + theme toggle. ScreenHeader.vue with plain name + step badge + one-line purpose. Breadcrumbs under the header. Sidebar items always carry `data-tour` attributes so the tour selectors resolve on every screen.
- [done] step 3: theme store + nav store. Theme flips `<html data-theme>` and persists. Nav persists across reloads so you land where you left off.
- [done] step 4: server-side approval book (`studio/server/approvals.ts`) — version tracking by spec hash + title, per-section toggling, withdraw, `assertApproved()` hard gate. Recorded in `<target>/.sssf/approvals.json` (gitignored).
- [done] step 5: connection profile store (`studio/server/profiles.ts`) — local (KoboldCpp at 127.0.0.1:5001) + cloud (Venice, disabled until `VENICE_API_KEY`). Per-role profiles. `fetchModels()` hits `/v1/models`. `testConnection()` does a tiny chat completion with plain-English errors (key rejected, can't reach URL, model not found).
- [done] step 6: launcher enforces approval — `launchWorkflow` rejects any request without a valid, non-withdrawn approval whose workflowId matches; materializes the approved spec as `requests/approved-vN-<id>.md` for the factory to consume. Added Pause/Resume (SIGTSTP/SIGCONT on Unix; documented fallback on Windows). Added per-job token guard: parses `total_tokens` lines from stdout and stops at the cap with a calm message.
- [done] step 7: server routes — `/api/studio/approvals/*` (create / withdraw / section / get / list) and `/api/studio/profiles/*` (list / save / set-default-cap / fetch-models / test). `/api/studio/runs/:id/pause` and `/resume`. 403 vs 500 error mapping for approval gate errors.
- [done] step 8: HomeView — main path cards (New Job → Review & Approve → Run → Results), draft chip with saved-at, recent runs + approvals, first-run nudge.
- [done] step 9: NewJobView — 3 intake modes (talk/upload/paste), Paste-from-clipboard button, starter example chips, read-back parsed into clear sections, open questions one at a time with suggested answers, editable spec, draft autosave to `localStorage` (debounced 2 s + on blur). Original upload text preserved.
- [done] step 10: ReviewApproveView — per-section checkmarks (toggle/undo), plain-language summary (what will happen / use / not do / time / cost / can undo / cannot undo), single final approval (one checkbox in words + one button, no typing), version tracking, withdraw before run starts, server-side record.
- [done] step 11: RunView — approval banner, run button gated on approval, live console, Pause/Resume/Stop, live token guard with cap bar + cap-overrun message.
- [done] step 12: ResultsView — status banner, stats grid (exit code, phases, gates, tokens, cost), phase list, approval reference, next-steps.
- [done] step 13: SessionsView wraps the existing visualizer (`SessionsList` + `SessionTrace`) — every feature in section 5 of FEATURES.md preserved.
- [done] step 14: HistoryView2 — dual-pane list (v2 + legacy) with detail preview.
- [done] step 15: SettingsView — 3 tabs: Connection profiles / Token guard / Roster & API keys. Per-role cards, local + cloud, base URL, model dropdown filled by Fetch models, masked key with Paste-trim button + show/hide, reasoning level, hide-thinking toggle, Test connection with plain-English errors, Save. Token cap editable. Existing ConfigView embedded under Roster tab.
- [done] step 16: HelpView — replay main/first-run tour, phone-guide tips, glossary, where-things-live.
- [done] step 17: OnboardingTour composable + component using `@floating-ui/dom` — anchored bubbles, auto-flip (4 fallback placements), shift padding, size middleware constrains bubble to available space, autoUpdate keeps it positioned on scroll/resize/layout change. Target is scrolled into view, highlighted, and stays clickable. Bubble can be collapsed to a chip. Restart/Skip/Back/Next controls. First-run setup separate and skippable. Help button in topbar always visible. Missing targets skip gracefully.
- [done] step 18: Vitest + Playwright installed. Wrote `test/approval-enforcement.test.ts` (6 cases: no approval / bogus / wrong workflow / withdrawn / valid + version bump) and `test/tour-overlap.test.ts` (3 sizes × ≥4 steps × no-overlap × clickable). Both pass:
  - `approval-enforcement`: 6/6 passed.
  - `tour-overlap` at 1920×1080, 1366×768, 390×844: 3/3 passed.
- [done] step 19: typecheck + build clean. Server boots and serves the new endpoints.
- [done] step 20: smoke-tested the API directly: `/api/health`, `/api/studio/profiles`, `/api/studio/approvals` (empty), launch without approval (403 "Approval required…"), launch with wrong workflow (403 "Approval authorizes workflow X, not Y."), launch with withdrawn approval (403 "Approval was withdrawn before the run started."), create + launch + withdraw all work.
- [skipped] Pi agent harness — section 9 says time-box to three real attempts; no `pi` binary in this sandbox, so we did not attempt the `models.json` write. The connection profile model is ready for `pi` to be wired in: `local/koboldcpp-default` is the seeded model id; the user can run "Fetch models" against `http://127.0.0.1:5001/v1` and the exact model id will populate. See `docs/DECISIONS.md` D12.
- [skipped] Live smoke against a real KoboldCpp server — no KoboldCpp running in this sandbox. The local profile is seeded correctly (`http://127.0.0.1:5001/v1`, `apiKey: "none"`) so when you have one running, "Test connection" should succeed and "Fetch models" should populate the dropdown.

## Verification

- [x] Re-ran feature checklist from `docs/FEATURES.md`. Every section 1–6 capability still exists (project switch + stamp, discovery intake, roster editor, workflow launch, observability visualizer, history) — all reachable from the new sidebar / Settings tabs. No feature was deleted.
- [x] One real smoke test of the main path against the **local** profile — partial. The approval → materialize-spec → spawn chain works end to end. The Python factory's `uv run adws/<script>.py` step could not actually execute here because no real workflow (with `uv`-installed Python deps) was set up in the sandbox; the spawn fails with the workflow's own error. To run for real: have a stamped target repo with `adws/` and `.env`, start a KoboldCpp server at `127.0.0.1:5001`, then go New Job → Continue → Review & Approve → Approve → Run. The token cap will guard you.
- [x] One test that a run cannot start without approval (via the API) — `test/approval-enforcement.test.ts`, 6/6 passed. UI enforcement is the same gate: the Run screen's "Run the approved job" button is disabled when no approval is loaded; clicking it without an approval triggers the same server-side 403.
- [x] The tour overlap test from section 4 — `test/tour-overlap.test.ts`, 3/3 passed (1920×1080, 1366×768, 390×844). Bubble never overlaps the target, target is clickable at its center on every step at every size.

## Open questions (batched)

1. **Pause on Windows**: SIGTSTP/SIGCONT aren't supported on Windows. We degrade to "soft pause" (stop streaming output) but the process keeps running. Should we add a hard Stop on Windows instead, or try job-control via a different API? See `docs/DECISIONS.md` D10.
2. **Approved-by field**: today the approval records `approvedBy: "Lead Engineer"` hardcoded. The mission says "the record of who approved, when, and which version will be saved" — should we read the engineer from git config (`user.name`) or `.env` `ENGINEER_NAME`, or surface a tiny one-time "your name" prompt in first-run?
3. **Pi agent harness**: not attempted in this sandbox (no `pi` binary). The local profile is ready; we just need to try `pi --list-models` and a trivial prompt with the `models.json` from the mission spec. Should be tried on the owner's machine.
4. **Original raw text attachment**: the discovery API keeps the raw input in `session.rawInput`, which the approval record captures as `rawAttachment`. We did not surface the raw attachment in the History view detail. Should we show it as a collapsible "Original input" section in the v2 detail card?
5. **Roster editor under Settings**: we kept the existing ConfigView intact and embedded it as the "Roster & API keys" tab. The mission section 7 talks about connection profiles per role; the roster editor is a separate thing (model id per agent in sssf.config.yaml). We did not auto-sync the two — changing a profile in Settings does not rewrite the roster YAML. Should it? See `docs/DECISIONS.md` D12.
