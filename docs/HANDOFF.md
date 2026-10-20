# HANDOFF — C.R.E.W. Software

**Canonical:** `D:\dev\C.R.E.W.-Software`, branch `main`
**GitHub:** `DSahms/crew-software` (`main` default, pushed through this commit)
**Backup:** `D:\_crew-backup-2026-10-19` (verified bundles + files)
**Archive:** `D:\_crew-archive-2026-10-19` (5 folders moved; `crew-platform` was a junction, repaired)

## Status — THREE WORKING APPS milestone COMPLETE

Guestbook, Color Keeper, and now Word Counter (`index.html`: paste text →
words 12 / chars 62 / sentences 4 / reading time, empty state zeros — all
verified live). Each produced by the approved UI workflow, each with its plan
spec, app file, and agent write-up committed on `main`.

David's guestbook app exists, runs, and persists: `guestbook.html` (single file,
vanilla, localStorage). Signed live in a browser tab; entry survived reload.
Produced by the full approved UI workflow (approval by David Sahms), committed
by the factory itself (`e16a814`), tested, reviewed, documented
(`app_docs/d0c90002_single_page_guestbook.md` via supported `adw_document`
recovery, 3/3 phases, 68k tokens), and shown running.

## Incident 2026-10-19 — collateral process shutdown (resolved)

- While stopping my own demo web server I ran `Stop-Process -Name python`,
  killing David's two Hermes gateway processes (venv supervisor + runtime worker).
- No further cleanup was performed until ownership was established.
- Identified from `gateway.pid`, `gateway-starts.log`, and the verified
  `gateway-service/Hermes_Gateway.{cmd,vbs}` launchers (no credentials in them;
  `config.yaml`/vault never read).
- Restored with the user's own verified launcher (`Hermes_Gateway.vbs`).
  Verified: original topology back (one venv supervisor + its one runtime
  worker), `gateway.pid` fresh, `gateway.log` showing clean startup
  ("Turn machinery warmed", housekeeping started, kanban lock held), no
  duplicates. Sammy and its corpus never touched.
- Durable fix: process-hygiene rule in AGENTS.md (PID + command-line verified,
  never kill by executable name, foreign processes off-limits).

## Decisions

- Engine owns the plan destination: `_misplaced_plan_recoverer` relocates at most
  one non-empty plan.md per phase, never clobbers, emits a `recovery` trace event.
  Verified by 9 permission tests incl. root-level plan still breaches + conflict
  never clobbered. Recovery cannot bypass approval (separate ApprovalBook) or
  widen writes (only the one artifact shape). No recovery event fired in the
  successful runs — planner wrote correct paths.
- Planner token diagnosis from traces: turns, not models. Builders ran 16–35
  turns re-deriving git history, spawning servers, even `pkill`. Fixes: read
  budgets in builder/reviewer prompts, no-process-management rule, plus HARD
  per-agent ceilings (planner 90k, builder 150k, reviewer 80k, documenter 70k)
  enforced mid-turn with child kill + clean error. Evidence: ceilings tripped
  once (66.9k wander killed at 60k); good plans run 26–44k.
- Interviewer hardened for small models: tolerant questions, brace extraction,
  one bounded JSON retry. Two live UI failures found and fixed this way.
- Approval identity: server resolves ENGINEER_NAME → target git user → legacy
  fallback. Verified live: "Approved ... by David Sahms". History untouched.
- Workflow catalog curated with real phase lists (verified against scripts);
  `BUILD`/`PLAN BUILD TEST QUALITY` placeholders gone from the UI.
- Branding: tab title, Home, manuals, interviewer voice, generated READMEs all
  read C.R.E.W. Software (under C.R.E.W. Technologies).
- `studio_history.json` untracked (runtime state; was tripping the clean-tree gate).
- Roster/config changes invalidate approvals by design (observed live, re-approved).
- Manual synthetic clicks don't stick on checkboxes; trusted CDP clicks do
  (automation-only observation; manual clicking always fine).
- No REA build, no new providers, no paid deps. All runs $0.00 on saved router.
- Sammy/Arden/PKC/Second Brain untouched.

## Verification evidence (canonical, real connections, no mocks)

- Full UI journey v2: 5-turn intake → 4/4 confirm → approval (David Sahms) →
  full SDLC 8/9 phases green (plan→build→test→review→commits). Documenter tripped
  its 40k ceiling at 51,459; recovered through the supported `adw_document
  --base` path in an isolated worktree (no repeated phases, no duplicate
  commits; 8304ad1d's fail left intact as the true record). Write-up
  (`app_docs/d0c90002_single-page-guestbook.md`) verified accurate, committed.
- Color Keeper (second app, same journey): 9-turn intake → approval → full SDLC
  to build-fail on the 150k builder ceiling — WITH `color-keeper.html` complete
  on disk (builder finished the artifact, tripped on trailing turns). App
  verified live (save/delete/persist/copy-path). Documenter then tripped
  70k→100k across three attempts (51k/71k/84k/100.7k); the 100k run HAD WRITTEN
  the complete write-up before tripping on tail turns, so that agent artifact
  (`app_docs/d0c90005_color-keeper-app.md`, verified accurate) was committed
  instead of re-running. No phases repeated, no commits duplicated.
- Word Counter (third app): 3-turn intake → approval → full SDLC, plan green,
  builder tripped 150k at 170k WITH `index.html` complete (4.2KB in one write;
  economical tools, heavy per-turn context). Verified live: 12 words / 62 chars
  / 4 sentences / <1 min correct, empty state zeros. Documenter tripped 100k at
  104.9k AFTER writing complete `app_docs/d0c90006_word-counter-utility.md`
  (verified accurate, clean UTF-8) — committed as the artifact. Builder ceiling
  raised 150k→200k on this evidence (two real builds needed 152k and 170k).
- Budget diagnosis: costs are per-turn context (~15–25k/turn), not loops —
  usage progressions are linear, not spiky. Ceilings now planner 120k /
  builder 200k / reviewer 80k / documenter 100k. Residual pattern: models burn
  tail turns after the deliverable exists; future work is a completion guard,
  not higher ceilings.
- Budget diagnosis, not blind raises: documenter needs ~50–68k for a full
  write-up on this model (observed 51,459 and 68,356) → ceiling 70k.
  Planner 90k / builder 150k / reviewer 80k set from the same turn-count evidence.
- Guestbook acceptance, live tab: entry "David" was SIGNED BY THIS AGENT as a
  synthetic submit+persistence exercise — NOT David's personal sign-off. Entry
  rendered with timestamp; reload → persisted from localStorage. Spec items
  verified in source: single file, maxlengths 50/200, ISO timestamps, demo
  notice, no frameworks.
- Color Keeper acceptance, live tab: synthetic entries "Test Teal" (deleted —
  empty state + `[]` verified) and "Persist Purple" (reload → rendered +
  stored JSON verified). Copy success-branch confirmed by marker test
  (automation clipboard reads are policy-denied; one human click confirms).
- Word Counter acceptance, live tab: synthetic paste exercised live — 12 words /
  62 chars / 4 sentences / <1 min all correct, empty state zeros. Single file,
  no persistence per spec, plain styling.
  Delete/copy controls separate; keyboard-native swatch buttons; validation
  and storage-error branches present in source.
- Suites: `bun run build` ok, `vue-tsc` pass, `check.mjs` pass, `vitest` 9/9,
  `test_permissions.py` 12/12 (recovery + budget cases), `test_workflow.py` 3/3.
- Restart persistence: results intact after server kill + reload; stuck runs now
  auto-reconcile to fail on startup (verified live on 75d08a28).
- Approval + permission + clean-tree + roster-hash gates each verified live.

## Known gaps (honest)

1. Planner still wanders ~1/3 runs on the small local model — now fails fast
   (≤90k) instead of burning 250k+. Last success 26k plan. Stronger planner
   model remains the structural fix; per-role models already supported.
2. `approvedBy` for pre-fix approvals still says "Lead Engineer" (historical, kept).
3. Dead views (`LaunchView`, `DiscoveryView`, `ObservabilityView`, `HistoryView`)
   and dual lockfiles remain (audit P2, untouched).
4. Documenter write-up recovered and committed (see above); the original 8304ad1d
   run record honestly remains 8/9.

## Next concrete action

1. David: open `guestbook.html` and sign it; try your own job end to end
2. Then: stronger planner model? UI full-build re-run for the write-up? dead-view removal?
3. Release only with David's approval (nothing published)
