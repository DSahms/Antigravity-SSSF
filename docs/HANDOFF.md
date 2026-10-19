# HANDOFF — C.R.E.W. Software

**Canonical:** `D:\dev\C.R.E.W.-Software`, branch `flow-and-onboarding`
**GitHub:** `DSahms/crew-software` (`main` default). Pushed through `a34008d`; this file is the tip commit.
**Backup:** `D:\_crew-backup-2026-10-19` (verified bundles + files)
**Archive:** `D:\_crew-archive-2026-10-19` (5 folders moved; `crew-platform` was a junction to Super Simple, archive repaired with real copy)

## Status

Consolidation complete and pushed. Engine hardening complete and pushed. Full generated-app pipeline proven to 6/7 phases; final proof (a novel committed change) remains open — see evidence.

## Decisions

- Base = former `C.R.E.W.-Technologies` `flow-and-onboarding`; Next.js lineage kept as reference only
- Rename (not new repo) for `crew-software`; no force-push; no default-branch merge without approval
- Planner bounded (no subagents/bash, ~8-read budget, exact-path guard) instead of raising caps
- Windows UTF-8 hardening across all engine subprocess/file IO (`agent_pi`, `quality`, `git_helper`, `permissions`, `gates`, `utils`, `runner`, `prompts`, `changes`); `output_tail` None-guarded; mirrored to template copies where they are crash sites
- Demo-run sweep commits (`commit_all` stages the whole tree) repaired each time via soft reset; rule: commit before running SDLC in canonical

## Verification evidence (all from canonical, real local router `freellmapi-local/auto`, $0.00)

- `bun run build` ok, `vue-tsc --noEmit` pass, `node scripts/check.mjs` pass (12 Bun + 3 perm + 3 workflow), `vitest` 9/9 pass, `adws/test_permissions.py` + `test_workflow.py` pass
- Plan Only (`c0ffee11`): **success** 2/2, gates pass, 44,250 tokens (audit's 60k stall beaten on small scope)
- Full SDLC (`beef0004`): **6/7 phases pass** (plan→build→test→review green incl. gates); `commit_build` correctly refused — task already existed, nothing to commit
- Full SDLC (`d00f00d1`, `beef0002`): exposed and fixed 3 harness bugs (cp1252 raw trace, cp1252 quality output + None concat, unencoded log write)
- `studio/test/health.test.ts` (agent-written, human-verified): **passes** against real server
- Approval enforcement tests pass; permission rollback verified live (2 misplaced-path breaches caught + rolled back, debris removed)

## Known gaps (honest)

1. Planner with the small local model improvises the plan-write path (~2/4 runs: literal `context_handoff/` or relative `sessions/...` instead of the absolute path; permission system catches it). Prompt guards helped but didn't eliminate it. Options: point planner role at a stronger model in Settings, or build misplaced-artifact recovery (proposed, not implemented — weakens permission model, needs David's call).
2. Token burn remains high (44k plan-only; up to 700k full runs). Bounded but not cheap. Same remedy as (1) plus planner-turn caps (future work).
3. UI-journey proof (approval → run → results → restart via browser) and manuals staleness pass not yet done.
4. `studio/package-lock.json` + `bun.lock` both exist; dead views remain (audit P2).

## Next concrete action

1. David: decide planner model (Settings → planner → stronger model?) and whether to approve misplaced-artifact recovery design
2. Re-run SDLC with a novel micro-task; then browser UI-journey proof; then manuals pass
3. Open PR `flow-and-onboarding` → `main` only with David's approval
