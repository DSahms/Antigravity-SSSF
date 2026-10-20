# HANDOFF — C.R.E.W. Software

**Canonical:** `D:\dev\C.R.E.W.-Software`, branch `main`
**GitHub:** `DSahms/crew-software` (`main` default, pushed through this commit)
**Backup:** `D:\_crew-backup-2026-10-19` (verified bundles + files)
**Archive:** `D:\_crew-archive-2026-10-19` (5 folders moved; `crew-platform` was a junction, repaired)

## Status — WORKING GENERATED SOFTWARE milestone COMPLETE

David's guestbook app exists, runs, and persists: `guestbook.html` (single file,
vanilla, localStorage). Signed live in a browser tab; entry survived reload.
Produced by the full approved UI workflow (approval by David Sahms), committed
by the factory itself (`e16a814`), tested, reviewed, and shown running.

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
  full SDLC 8/9 phases green (plan→build→test→review→commits), exit via
  documenter budget trip (40k→70k on evidence). App committed by factory.
- Guestbook acceptance, live tab: signed "David", entry rendered with timestamp,
  reload → entry persisted from localStorage. Spec items verified in source:
  single file, maxlengths 50/200, ISO timestamps, demo notice, no frameworks.
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
4. Documenter write-up for the guestbook run never completed (budget trip at
   40k); app + review + commits are complete without it.

## Next concrete action

1. David: open `guestbook.html` and sign it; try your own job end to end
2. Then: stronger planner model? UI full-build re-run for the write-up? dead-view removal?
3. Release only with David's approval (nothing published)
