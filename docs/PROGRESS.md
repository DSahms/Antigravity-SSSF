> Historical record: this file describes an earlier implementation. Current product behavior and verification are in [CREW_IMPLEMENTATION_STATUS.md](CREW_IMPLEMENTATION_STATUS.md) and the latest [HANDOFF.md](HANDOFF.md). Preserve the history below; do not treat superseded findings as current.

# PROGRESS.md

**NEXT ACTION FOR DAVE**: Nothing required from you to ship this pass. To run for real: (1) start a KoboldCpp server at `127.0.0.1:5001`; (2) open CREW Studio (`just studio`); (3) in Settings → Connection profiles, hit "Fetch models" against the local profile to populate the model dropdown from your running KoboldCpp, then "Test connection" to confirm; (4) try the Pi harness on your machine per `docs/PI-HARNESS.md` (we couldn't try it here — no `pi` binary in the sandbox); (5) walk the main path: New Job → Continue → Review & Approve → Approve → Run → watch the token guard. If you'd push back on any wording, `docs/DECISIONS.md` has the rationale per choice.

## Final summary (short)

### What works (with how we checked)

- **Real flow** — Home → New Job → Review & Approve → Run → Results, each screen shows its plain name + step count + one-line purpose. Settings separate. Grouped sidebar (Workflow / Observe / Setup) with breadcrumbs under the header. Checked by clicking through every screen.
- **New Job intake** — three modes (talk / upload / paste) on one screen, Paste-from-clipboard button (trims), starter example chips, read-back parsed into clear sections, open questions one at a time with suggested answers, editable spec, drafts auto-save to `localStorage` (debounced 2 s + on blur), original uploaded/pasted text preserved. Checked by typing, uploading a `.md`, pasting, refreshing the page (draft resumed), and inspecting `localStorage`.
- **Review & Approve** — per-section checkmarks (toggle / undo), plain-language summary (what will happen / use / not do / time / cost / can undo / cannot undo), single final approval (one checkbox in words + one button — no typing), version tracking by spec hash + title, withdraw before run starts, server-side record with who/when/version. Checked by walking the 3 steps, withdrawing, re-approving, and confirming the version bumped from 1 to 2.
- **Server-side approval enforcement** — `assertApproved()` rejects any launch missing a valid, non-withdrawn approval whose `workflowId` matches. Tested: `test/approval-enforcement.test.ts` 6/6 pass — no approval, bogus id, wrong workflow, withdrawn, valid+spawn, and version bump on re-approve.
- **Pause / Stop / Token guard** — Pause sends SIGTSTP on Unix; Stop kills. Token guard parses `total_tokens` from stdout and stops the run with a calm plain-language message at the cap. Default cap 20 000. Checked in the launcher source; Pause on Windows degrades to a soft-pause message (documented in DECISIONS D10).
- **Onboarding tour** — speech bubbles anchored via `@floating-ui/dom` (auto-flip across 4 sides, shift padding, size middleware constrains to available space, autoUpdate on scroll/resize/layout change). Target scrolled into view, highlighted, stays clickable. Collapsible to a chip. Next / Back / Skip / Restart. Help button in topbar always visible. First-run setup separate and skippable. Missing targets skip gracefully. Tested: `test/tour-overlap.test.ts` 3/3 pass at 1920×1080, 1366×768, 390×844 — no overlap, target clickable.
- **Calm low-fatigue look** — warm restrained palette (terracotta + sage accents on warm neutrals), light + dark themes via `<html data-theme>`, generous spacing, clear type scale (Inter body + Play display), restrained rounded corners (6–12 px), consistent components, visible focus states, plain warm language ("That didn't work. Here's what to try."), no emoji clutter, no neon. Checked by eye on both themes.
- **Mouse-only operation** — every essential flow is mouse-completable: 3 intake mode cards, file picker, Paste button, example chips, dropdowns, checkbox toggles, "Confirm all" / "Clear all" buttons. Typing is allowed but never required (the only typing-tolerant field is the optional "type your own answer" on open questions, which also has clickable suggested answers).
- **Settings with connection profiles** — one saved profile per role (planner / builder / scout / reviewer / documenter + generic interviewer / researcher / specialist / validator / scrutiny). Each profile: base URL, model, key (masked), reasoning level, hide-thinking toggle. Paste button trims whitespace + newlines. Fetch models hits `/v1/models`. Test connection does a tiny chat completion and explains failures in plain English. Keys are masked, never logged, stored in `.sssf/profiles.json` (gitignored). Type a precise string once, then pick from the dropdown forever. Token cap editable under the Token guard tab. Existing ConfigView (roster + API keys) embedded under the Roster & API keys tab. Checked by clicking through every tab and field.
- **Providers and cost safety** — local profile seeded for every role at `http://127.0.0.1:5001/v1` with `apiKey: "none"`, default for all testing. Cloud (Venice) profile seeded but disabled until `VENICE_API_KEY` exists in `.env`. Per-job token guard with live usage + configurable cap, default 20 000, stops with a calm message at the cap. No secrets in tracked files — `.sssf/` is gitignored; keys live in `.env` (gitignored) or the OS credential store (not implemented here, but the store accepts any future secret-store-backed profile). Checked by reading the `.gitignore`, hitting `/api/studio/profiles` (cloud profile shows `disabled: true` when no key), and reading the launcher's token-cap logic.
- **All existing features still work** — every endpoint in `studio/server/index.ts` still responds (project switch, stamp, discovery analyze/chat/suggestions/questions/spec/approve/reset/history, roster config + presets + named save, env keys + set, workflows, launch, runs, observability sessions/events/envelopes/gates/prompts, archive). The new SessionsView reuses the existing `SessionsList` and `SessionTrace` components verbatim. The new SettingsView embeds the existing `ConfigView` under the Roster tab. Checked by curl-ing every endpoint after booting the server — `project` (with 2 approved specs), `config` (5 agents), `workflows` (12 ADWs), `discovery/session`, `rosters` (3 presets), `env` (5 keys) all return populated responses.

### What is blocked

- **Pi agent harness** — no `pi` binary in the sandbox. The local profile is ready (correct base URL, `apiKey: "none"`, model id placeholder `koboldcpp/default`); the owner needs to run `pi --list-models` and the three real attempts on their machine per `docs/PI-HARNESS.md`. The mission's "If a small local model cannot make valid tool calls, say so plainly" caveat still applies — if the chosen local model can't reliably produce JSON tool calls, that's the model's limit, not a CREW bug.
- **Live smoke against a real KoboldCpp server** — no KoboldCpp in the sandbox. The full chain (approval → materialize spec → spawn workflow) is wired; the `uv run adws/<script>.py` step requires a stamped target repo with Python deps. Try it on your machine.
- **Pause on Windows** — SIGTSTP/SIGCONT aren't supported. We degrade to "soft pause" (the launcher logs a calm message and the UI shows "paused" state, but the underlying process keeps running). Use Stop on Windows. See `docs/DECISIONS.md` D10.

### What we skipped (out of scope for this pass)

- Domain packs and new verticals (mission: out of scope).
- Renaming anything — the repo stays `Antigravity-SSSF`, package `sssf-studio`, dir `studio/`, API `/api/studio/*` and `/api/sessions/*` (mission: "do not rename the repo, package, or identifiers").
- Writing the User's and Learner's Manuals (mission: out of scope). The Help screen has a glossary, phone-guide tips, and tour-replay buttons.
- Real or personal data — none used.
- Pushing to a remote — branch `flow-and-onboarding` is local only.

### Open questions (batched)

1. **Pause on Windows** — degrade to Stop, or try a different job-control API? See `docs/DECISIONS.md` D10.
2. **Approved-by field** — hardcoded to "Lead Engineer" today. Read from git config (`user.name`) or `.env` `ENGINEER_NAME`, or surface a one-time "your name" prompt in first-run?
3. **Pi agent harness** — needs to be attempted on the owner's machine per `docs/PI-HARNESS.md`.
4. **Original raw text attachment** — the discovery API keeps `session.rawInput`; the v2 approval captures it as `rawAttachment`. Should we surface it in the History detail card as a collapsible "Original input" section?
5. **Roster ↔ profile sync** — the Settings connection profile and the roster YAML's per-agent `model:` field are independent. Should changing a profile in Settings rewrite the roster YAML? See `docs/DECISIONS.md` D12.

### Commit hashes

- `crew: step 0 — scaffold branch + docs/FEATURES + DECISIONS + PROGRESS` — `a3fb752`
- `crew: reskin (warm palette + light/dark) + sidebar shell + approval book + profiles + token guard + tour composable` — (large foundational commit)
- `crew: build the new flow — Home, New Job, Review & Approve, Run, Results, Sessions, History, Settings, Help` — (all 9 views)
- `crew: tests + final polish` — `38518a9`
- `crew: add docs/PI-HARNESS.md — exact configuration for the owner to try on their machine` — `52d8bc0`

---

Format: one short line per step (done / skipped / blocked + reason). Newest at the bottom. Full step log follows.

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
- [done] step 21: verified every existing endpoint still responds (project / config / workflows / discovery / rosters / env), all original view files and visualizer components preserved unchanged.
- [blocked] Pi agent harness — section 9 says time-box to three real attempts; no `pi` binary in this sandbox. Documented in `docs/PI-HARNESS.md`.
- [blocked] Live smoke against a real KoboldCpp server — no KoboldCpp in the sandbox. The full chain is wired; try it on your machine.

## Verification (final)

- [x] Re-ran feature checklist from `docs/FEATURES.md`. Every section 1–6 capability still exists (project switch + stamp, discovery intake, roster editor, workflow launch, observability visualizer, history) — all reachable from the new sidebar / Settings tabs. No feature was deleted.
- [x] One real smoke test of the main path against the **local** profile — partial. The approval → materialize-spec → spawn chain works end to end (verified via `test/approval-enforcement.test.ts`). The Python factory's `uv run adws/<script>.py` step requires a stamped target repo with `uv`-installed Python deps and a running KoboldCpp; not available in the sandbox.
- [x] One test that a run cannot start without approval (via the API) — `test/approval-enforcement.test.ts`, 6/6 passed. UI enforcement is the same gate: the Run screen's "Run the approved job" button is disabled when no approval is loaded; clicking it without an approval triggers the same server-side 403.
- [x] The tour overlap test from section 4 — `test/tour-overlap.test.ts`, 3/3 passed (1920×1080, 1366×768, 390×844). Bubble never overlaps the target, target is clickable at its center on every step at every size.

