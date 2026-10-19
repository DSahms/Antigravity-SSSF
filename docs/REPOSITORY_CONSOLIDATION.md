# Repository Consolidation — C.R.E.W. Software

**Date:** 2026-10-19
**Canonical:** `D:\dev\C.R.E.W.-Software` (branch `flow-and-onboarding`)
**GitHub:** `https://github.com/DSahms/crew-software` (renamed from `C.R.E.W.-Technologies`, formerly `Antigravity-SSSF`), default branch `main`
**Backup:** `D:\_crew-backup-2026-10-19` (file copies excl. node_modules/.next/.git + `CREW-Technologies.bundle`, `crew-platform.bundle`, `SFS.bundle` — all verified)
**Archive:** `D:\_crew-archive-2026-10-19` (moved, not deleted)

## Roles determined from evidence

- `C.R.E.W.-Technologies` — authoritative base. Branch `flow-and-onboarding` (HEAD `fb8583c`), remote `Antigravity-SSSF`, large uncommitted working set + untracked `docs/CREW_RELEASE_AUDIT.md`, manuals, Vue studio, Python ADWs. Audited implementation.
- `crew-platform` — **junction** to `Super Simple Software Factory` (same physical folder), not a second copy. Remote `DSahms/crew-platform` returns Repository not found; 9 local commits ahead are unpushed Next.js lineage work. Unique value: `CREW_Software_Factory_Enhancement_Notes.md` (untracked F1–F7 research), `AGENTS.md`, `docs/{ARCHITECTURE,CREW_VISION,PROGRESS}.md`, `NOTES.md`.
- `Super Simple Software Factory` — the real folder behind the junction. Same commit `4622507`, same stale remote. Archived as superseded once research preserved.
- `Software Factory Suite` — separate Next.js lineage, local-only history (`bb5bc10`, no remote), 29MB. UX/flow/docs source reference per old AGENTS.md. Not merged (different architecture; no rewrite). `worklog.md` preserved; full tree in backup + archive.
- `Antigravity Software Factory` — empty folder, no `.git`. Archived as placeholder.

## Kept (authoritative base copied with .git + working tree)

Full `C.R.E.W.-Technologies` tree including `.git` (branches `main`, `flow-and-onboarding`), modified + untracked working set, `.env` (local only, gitignored), `.crew-quality.json`, `studio/`, `adws/`, `docs/CREW_RELEASE_AUDIT.md`, manuals, launchers.

## Incorporated from others (no blind overwrites)

- `docs/CREW_SOFTWARE_FACTORY_ENHANCEMENT_NOTES.md` ← `crew-platform/CREW_Software_Factory_Enhancement_Notes.md` (suggestions file, required present)
- `docs/preserved-crew-platform/` ← `ARCHITECTURE.md`, `CREW_VISION.md`, `PROGRESS-crew-platform.md`, `NOTES-2026-10-08.md`, `README-crew-platform.md`, SFS `worklog-SFS.md`
- New root `AGENTS.md` (product identity C.R.E.W. Software under C.R.E.W. Technologies, working prefs, structure, launch/verify, approval boundaries)
- Branding: `README.md` → `# C.R.E.W. Software / Under C.R.E.W. Technologies`; technical identifiers (`studio/`, `/api/studio/*`, package internals) preserved
- Remote: renamed GitHub `C.R.E.W.-Technologies` → `crew-software` (history preserved, no duplicate repo); local `origin` updated and fetched

## Archived (reversible moves)

`D:\_crew-archive-2026-10-19\{crew-platform, Super Simple Software Factory, Software Factory Suite, Antigravity Software Factory, C.R.E.W.-Technologies}`. Archive junction fixed: broken `crew-platform` junction replaced with real file copy from verified backup (history for that lineage in `crew-platform.bundle` + archived Super Simple `.git`).

## Verified

- Bundles verify complete; backup contains `.env`, `.crew-quality.json`, enhancement notes
- Canonical `git status` shows base working set intact; `git fetch origin` works against `crew-software`; `origin/main` (`9a34888`) and `origin/flow-and-onboarding` (`fb8583c`) visible
- Secret review: no `sk-` keys in `studio/server`; `.env` ignored and unstaged; `.freebuff/project-id` excluded as generated artifact
- Suggestions file + release audit present in canonical `docs/`

## Left unresolved

- `crew-platform`'s 9 ahead commits were never pushed (remote missing) and belong to a different (Next.js `src/`) architecture; preserved in backup bundle, not merged
- `studio/package-lock.json` + `studio/bun.lock` both exist; dead views (`LaunchView`, `DiscoveryView`, `ObservabilityView`, `HistoryView`) remain — noted in audit P2, not changed here
- `docs/CREW_IMPLEMENTATION_STATUS.md` link target still missing (audit P1-9); manuals present but staleness pass is Stage 2 work
- No commit/push done yet at time of writing — see HANDOFF for next action
