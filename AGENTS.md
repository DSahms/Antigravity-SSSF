# Project: C.R.E.W. Software

Parent brand: **C.R.E.W. Technologies** (Coordinated Research, Expertise & Workflows).
Product: **C.R.E.W. Software** — Intake → Lock → Build → Verify for software via conversational spec, explicit approval, deterministic Python workflows.

Canonical folder: `D:\dev\C.R.E.W.-Software`. Preferred GitHub name: `crew-software`.
Owner: David. Expect dictation errors, short-hand names, run-on sentences. Infer from context; ask only when ambiguity changes the result.

## How to work with David

- Working software over repeated planning. Inspect, decide, implement, verify, carry through.
- Plain language, concise updates. No keyboard-dependent routine steps for him: prefer choices, dropdowns, paste buttons, one-time saved profiles.
- Independent judgment: if a suggestion is obsolete or counterproductive, choose better within scope and say why briefly.
- Requirements vs suggestions: preserve Intake → Lock → Build → Verify and enforced approval. Never weaken acceptance to claim done.
- Routine reversible decisions: autonomous. Ask only when choice changes product, adds cost, risks work loss, or needs missing access.
- No new paid providers for convenience. Use existing connections. Never print or commit secrets. `.env` is gitignored.

## Repo structure (authoritative base: former C.R.E.W.-Technologies, branch flow-and-onboarding)

- `studio/` — Vue + Bun server (`server/index.ts`, `server/launcher.ts`, `server/discovery.ts`, `server/project.ts`, `server/approvals.ts`). UI on :4620. Keep `studio/`, `/api/studio/*`, `/api/sessions/*` identifiers.
- `adws/` — deterministic Python engine + `adw_modules/`, prompt templates, `adw_simple_sdlc.py` full build, `adw_plan.py` plan-only.
- `docs/` — `CREW_RELEASE_AUDIT.md` (release findings), `CREW_SOFTWARE_FACTORY_ENHANCEMENT_NOTES.md` (F1-F7 research), `REPOSITORY_CONSOLIDATION.md`, `HANDOFF.md`, manuals under `users-manual/` + `learners-manual/`.
- `docs/preserved-crew-platform/` — reference copies from superseded folders, not live.
- Root launchers: `Start-Crew.cmd`, `Start-Crew.ps1` (pin `STUDIO_PORT=4620`).
- `.crew-quality.json` — factory's own checks. New target projects need their own file via Settings → Project checks.

## Launch and verification (from canonical folder)

- First build: `Set-Location studio; bun install; bun run build`
- Launch: double-click `Start-Crew.cmd` or `.\Start-Crew.ps1`, opens http://127.0.0.1:4620. Needs Bun, Node, Git, uv, Pi CLI + router at http://127.0.0.1:31415/v1 model `auto`.
- Checks: `bun run build`, `vue-tsc --noEmit` (via `bun run build`), `node scripts/check.mjs` (12 Bun + 3 perm + 3 workflow), `vitest run` (9 approval + tour).
- Python: `uv run adws/adw_prompt.py --help` for engine smoke.

## Approval boundaries

- Approval is server-enforced (`ApprovalBook`). Agent confidence or cross-model agreement is never user approval.
- No force-push, no merge to default without separate authorization. Work on working branches.
- No public release / deploy without explicit approval.
- New project Quality Gate / full SDLC refused without project-specific `.crew-quality.json`.
- Token caps are reporting thresholds; check cumulative SQLite usage after every agent turn, not only timer.
