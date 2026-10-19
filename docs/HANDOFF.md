# HANDOFF — C.R.E.W. Software

**Canonical:** `D:\dev\C.R.E.W.-Software`, branch `flow-and-onboarding`
**GitHub:** `DSahms/crew-software` (`main` default), origin updated and fetched
**Backup:** `D:\_crew-backup-2026-10-19` (verified bundles + files)
**Archive:** `D:\_crew-archive-2026-10-19` (5 folders moved; `crew-platform` was a junction to Super Simple, archive repaired with real copy)

## Status

Stage 1 consolidation committed + pushed (`759edd8`). Stage 2 fixes below are the next commit (pending at write time).

## Decisions

- Base = former `C.R.E.W.-Technologies` `flow-and-onboarding` (audited, evidence-backed)
- No architecture merge: Next.js `src/` lineage preserved as reference only
- Rename (not new repo) for `crew-software`; no force-push, no default-branch merge without approval
- Planner bounded instead of raising caps: subagents + bash removed from planner tools, ~8-read budget + literal-path guard in prompts (plan run: 44,250 tokens, success — was 61k + stall)
- Windows UTF-8 hardening: `agent_pi.py` raw trace + `quality.py` subprocess output decode with `errors="replace"`; `output_tail` None-guarded. Same fix mirrored to `.claude` template copies.

## Verification evidence

- Baseline from canonical: `bun run build` ok, `vue-tsc --noEmit` pass, `node scripts/check.mjs` pass, `vitest` 9/9 pass
- Real model-backed Plan Only (`adw_plan.py`, local router `freellmapi-local/auto`, adw `c0ffee11`): **success** 2/2 phases, gates pass, spec written then removed as debris; 44,250 tokens, $0.00
- Real full SDLC attempt (`adw_simple_sdlc.py`, adw `d00f00d1`): plan + build passed; test phase crashed in *harness* (cp1252 decode + None concat) while the underlying suite exited 0 — fixed above. Retry pending.
- New regression `studio/test/health.test.ts` (agent-written, human-verified): boots real server, asserts `/api/health` contract — **1 pass**
- Secret review: no keys in source; `.env` ignored; `.freebuff/` now gitignored and untracked

## Blockers

- None for local commit. Remote auth as DSahms works.

## Next concrete action

1. Commit Stage 2 fixes + health test, push `flow-and-onboarding` (no force)
2. Re-run full SDLC proof after harness fixes; then UI-journey proof (approval → run → results → restart) and manuals staleness pass
