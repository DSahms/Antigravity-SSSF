# HANDOFF — C.R.E.W. Software

**Canonical:** `D:\dev\C.R.E.W.-Software`, branch `main`
**GitHub:** `DSahms/crew-software` (`main` default, pushed through this commit)
**Backup:** `D:\_crew-backup-2026-10-19` (verified bundles + files)
**Archive:** `D:\_crew-archive-2026-10-19` (5 folders moved; `crew-platform` was a junction, repaired)

## Status — customer-journey milestone COMPLETE

David's next usable thing: open C.R.E.W. Software at http://127.0.0.1:4620 and run
a real job end to end — describe, clarify, approve, run, open results. Proven
tonight with a guestbook app (spec: `specs/732f41d2_single_page_guestbook.md`).

Also live on `main`: factory-built `/api/version` + regression test, planner
recovery, interview hardening, README intake requirement, Research Engineer design.

## Decisions

- Engine owns the plan destination: `_misplaced_plan_recoverer` relocates at most
  one non-empty plan.md per phase into `context_handoff/`, never clobbers, emits
  a `recovery` trace event. All other breaches roll back + raise as before.
- Interviewer hardened for small models: tolerant question parsing, brace
  extraction, one bounded JSON retry. Found + fixed via live UI journey.
- `studio_history.json` untracked (runtime state; was tripping the clean-tree
  gate). SQLite remains the durable record.
- Synthetic JS clicks don't stick on approval checkboxes; trusted CDP clicks do.
  (Manual clicking was always fine — automation-only observation.)
- No REA build, no new providers, no paid deps. All runs $0.00 on saved router.

## Verification evidence (canonical, real connections, no mocks)

- Full UI journey: 5-turn intake → 4/4 confirm → approval v2 → Plan Only run
  exit 0, 2/2 phases, 2/2 gates, 33.4k/60k tokens → Results with deliverables →
  server restart + reload → results intact (persistence proven)
- CLI proofs: Plan Only success (44k); full SDLC 6/7 then 8/8 phases with
  review-gated fail; factory-built `/api/version` + `version.test.ts` + `health.test.ts` all pass
- Suites: `bun run build` ok, `vue-tsc` pass, `check.mjs` pass, `vitest` 9/9,
  `test_permissions.py` 8/8 (5 new recovery cases), `test_workflow.py` 3/3
- Approval + permission + clean-tree gates each verified live (refusals observed, then satisfied properly)
- Manuals inspected: complete lesson structure, correct port, no stale claims

## Known gaps (honest)

1. Planner with the small local model still improvises paths (~1/3 runs) — now
   recovered automatically; token burn high (33–700k). Remedy: stronger planner
   model in Settings, and/or planner-turn caps (future work).
2. `approvedBy` still records "Lead Engineer" (audit P1) — use git user / one-time name.
3. Workflow catalog still lists uncurated entries (`BUILD`, `PLAN BUILD TEST QUALITY`) — filter or add metadata (audit P1).
4. Browser tab title still says "Crew Platform" — user-visible branding leftover.
5. Full SDLC with review-accept (committed generated app via UI run) not yet demonstrated; CLI reached 8/8 phases with review reject.

## Next concrete action

1. David: try the guestbook journey yourself; optionally set planner to a stronger model
2. Then: UI full-build run → `approvedBy` name → catalog curation → title string
3. Open PR `main` → release only with David's approval (no public release done)
