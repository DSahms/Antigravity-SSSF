# CREW Software — Release Verification (evidence trail)

**Source commit:** `6468a74` (branch `codex/rea-recovery`). The installer below
was built from exactly this commit; `main` remains at `cd2836f` and needs a
separate authorized merge to receive these fixes.
**Installer:** `release/CREW Software Setup 1.0.0.exe`
**Size:** 118,870,548 bytes
**SHA-256:** `F803BAB99BF55F3AECC38757A09F5CB2AD7A44449C87A06031C1038A610CE390`
**Verification date:** 2026-10-22. All commands ran from `D:\dev\C.R.E.W.-Software`
unless noted. Backend probes used `curl.exe`; POSTs sent
`Origin: http://127.0.0.1:<port>` (the server rejects cross-site POSTs).

## 1. Canonical quality gate (repo root) — PASS, exit 0

```
node studio/scripts/check.mjs   # exit 0
```

- Fixed during this assignment: `studio/scripts/check.mjs` computed a bogus
  `studioRoot` (`../studio` → `studio/studio`); now `..`, runs with
  `cwd=studio` so generated `release/` trees can never contaminate bun test
  discovery. `release/` is now gitignored (`/release/` in `.gitignore`).
- Covers: `bun test test/core.bun.test.ts test/rea.bun.test.ts` (23 pass),
  `vue-tsc --noEmit` (clean), `test_permissions.py` (12/12),
  `test_workflow.py` (3/3), `test_rea.py` (21/21).
- `vitest run test/approval-enforcement.test.ts test/tour-overlap.test.ts`:
  9/9 pass. `bun run build`: pass, `dist/index.html` uses `./assets/...`.
- `git diff --check`: clean.

## 2. Packaging defects found and fixed

1. **Missing backend dependency (caused installed-app health failure).**
   `packaging/electron-builder.json` never shipped `node_modules`, so the
   installed server crashed on `import "yaml"` (`studio/server/config.ts:6`,
   `runtime.ts:3`, `project.ts:6`). Proven by `Cannot find package 'yaml'`
   from the old unpacked tree. Fix: studio-root electron-builder config
   (`studio/electron-builder.json`) lets electron-builder include production
   deps; verified `resources/app/node_modules/yaml/package.json` present.
2. **Electron main misloaded as ESM** (`require is not defined in ES module
   scope` dialog, user-confirmed screenshot). `type: module` + `main:
   server/main.js` / `electron-main.js`. Fix: `studio/electron-main.cjs`,
   `main: electron-main.cjs` (`studio/package.json:2`,
   `studio/electron-builder.json` files list).
3. **Blank white window.** Vite absolute `/assets/...` URLs break under
   `file://`. Fix: `base: "./"` in `studio/vite.config.ts`; verified
   `dist/index.html` references `./assets/...`.
4. Layout: `asar: false` (Bun reads `.ts` sources directly);
   `extraResources` ships `bun.exe`, `adws/` (minus `*.db*`, sessions,
   history), `docs/`, `.crew-quality.json` at `resources/`, so
   `FACTORY_ROOT` carries everything `createProject` and the manuals need.

## 3. Installed-application verification — PASS

- Built: `bun run electron:dist` (electron 29.4.6, nsis) → installer above.
- Installed per-user; layout verified
  (`CREW Software.exe`, `resources/app/{electron-main.cjs,server,dist,
  node_modules/yaml}`, `resources/{bun.exe,adws,docs,.crew-quality.json}`).
- The fixed build was also installed to `C:\Program Files\CREW Software`
  (operator-executed): window opens, backend child `bun.exe run
  .../server/index.ts` observed, `/api/health` → 200
  `{"ok":true,"db":"no db yet",...}`, `/api/version` → 200
  `{"name":"C.R.E.W. Software","version":"1.0.0"}`.
- Note: closing the app window stops the server (Electron
  `window-all-closed → app.quit`, by design). Remaining workflow checks ran
  headless against the identical packaged bits
  (`release/win-unpacked`, port 4621) to avoid disrupting the live desktop.

## 4. End-to-end workflow on packaged bits (port 4621) — PASS

Script: `%TEMP%\opencode\crew-e2e.ps1` (create → checks → approve → launch →
poll → gates → deliverables, plus two negative probes).

| Check | Result |
|---|---|
| Launch **without** approval | HTTP 403 `Approval required` (enforcement intact) |
| Create project `rc-verify` | `.../resources/.sssf/projects/rc-verify` |
| Save `.crew-quality.json` (`node --version` ×4) | round-trips via API |
| Launch Quality Gate **without** checks (probe project) | refused with the designed Settings → Project checks message |
| Create approval (`adw_quality.py`, 2 sections) | `appr-mvk24q1hem7g` v1 |
| Launch approved run | `run-fad8…`, `adw 51bacbfa`, `success`, exit 0, 0 tokens |
| Gate artifacts | 4/4 `passed: 1` (`quality:test/lint/typecheck/build`, evidence log paths) |
| Deliverables | project path + 2 changed files |
| Restart server → approvals + session `51bacbfa/success` | persist (V7) |

No model calls, no commits, no key handling involved — fully reproducible.

## 5. Docs

- Rewrote `docs/INSTALLATION_INSTRUCTIONS.md` (was stale: wrong paths,
  wrong methods). Preserved `docs/CREW-SKILLS.md` from the old release tree.
- Old `release/` reports (`PROJECT-STATUS-AND-VERIFICATION.md`,
  `RELEASE-VERIFICATION.md` v1) described the broken builds and are
  superseded by this file.

## 6. Remaining scope (not blockers for this release)

- Working tree still carries the uncommitted REA feature work (committed
  separately on this branch, tests green); live model-backed REA
  investigation still needs an owner-chosen target and explicit go-ahead.
- No public release published (requires David's explicit approval).
- No merge to `main` (requires separate authorization); release candidate
  lives on `codex/rea-recovery` at the commits below.

## 7. Commits (branch `codex/rea-recovery`)

- `b4abdde` quality gate runs from repo root, release output gitignored
- `be5bd77` studio-root Electron packaging with backend deps, embedded Bun
- `bfb5bd7` / `c07fbb8` electron main as `.cjs`, wired into package+config
- `6468a74` relative vite base so packaged `file://` UI loads its assets
- `d1a2eb4` preserve REA investigation feature and recovery-tree product work
- `7c13999` this report + install docs

## Verdict

**COMPLETE — VERIFIED.** The freshly installed application launches, serves
a healthy backend, enforces approvals, executes an approved workflow to
`success`, produces inspectable gate artifacts, and survives restart. The
release candidate installer is the file hashed above; do not publish without
explicit approval.
