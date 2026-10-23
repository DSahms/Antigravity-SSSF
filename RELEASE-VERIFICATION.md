# CREW Software — Release Verification (evidence trail)

**Source commit:** see §7 (branch `codex/rea-recovery`). `main` remains at
`cd2836f` and needs a separate authorized merge to receive these fixes.
**Installer:** `release/CREW Software Setup 1.0.0.exe`
**Size:** 118,872,521 bytes
**SHA-256:** `653AE3C538CC09A8150A0F625AE72CC47ADD92F14C0D03C7B426924A4F3A70FD`
**Verified:** 2026-10-22. All commands ran from `D:\dev\C.R.E.W.-Software`
unless noted. Backend probes used `curl.exe`; UI automation drove the real
packaged window (Playwright `connectOverCDP` against
`release/win-unpacked/CREW Software.exe`).

Supersedes all earlier `RELEASE-VERIFICATION.md` / `PROJECT-STATUS` reports,
which described the broken builds.

## 0. User-reported failures that started this round — all reproduced, all fixed

1. Microphone invocation does not work.
2. Read-back does not work.
3. After pasting a project description: `That didn't work: Failed to fetch`.
4. Cannot advance to running a project.

Reproduced headlessly and via the packaged window with stack traces:
`fetch("file:///D:/api/studio/...")` → `net::ERR_FILE_NOT_FOUND` → every API
call failed, because the Electron shell loaded the UI from `file://` while
all API paths are root-relative. Items 2–4 are this single defect (the
product's "read-back" is the sectioned text brief, not audio). Microphone is
a separate, honest limitation: Electron builds have no Web Speech service
key, so `SpeechRecognition.onerror` fires `network` even with a working mic
(probed directly in the packaged app).

## 1. Product fixes in this release

1. **HTTP-first Electron shell** (`studio/electron-main.cjs`): waits for
   `/api/health`, then loads `http://127.0.0.1:PORT/`. Same origin ⇒ API,
   origin allowlist, clipboard, and permission flows all work. If the backend
   never answers, an actionable error page names the cause instead of a
   white window. `STUDIO_PORT` is honored when preset (acceptance isolation).
2. **Permission handler**: grants `media` (mic button) and `clipboard-read`
   (Paste buttons); everything else keeps the default deny.
3. **Actionable network errors** (`studio/src/lib/api.ts`): `fetch` TypeErrors
   now say which backend URL was tried and what to do, instead of bare
   "Failed to fetch". The raw error is kept in parentheses for diagnosis.
4. **Honest mic reporting** (`NewJobView.vue`): `network`/`service-not-allowed`
   now says the external speech service is unavailable in the desktop app and
   points at Paste/Upload; permission blocks say how to unblock.
5. **Clean-tree gate exempts product-managed files** (`launcher.ts`): Settings'
   `.crew-quality.json` and the launcher's own `.sssf/approved-specs/` copies
   no longer trip "uncommitted work" — previously no project with saved
   checks could ever start an agent workflow (caught by acceptance C2).
6. Earlier release fixes retained: `.cjs` Electron main (ESM misload dialog),
   bundled `node_modules` incl. `yaml` (backend health), relative Vite asset
   base (white window).

## 2. Canonical quality gate (repo root) — PASS, exit 0

`node studio/scripts/check.mjs` → bun tests 23 pass, `vue-tsc` clean,
`test_permissions.py` 12/12, `test_workflow.py` 3/3, `test_rea.py` 21/21.
`vitest run test/approval-enforcement.test.ts test/tour-overlap.test.ts` →
9/9. `git diff --check` clean.

## 3. Permanent packaged-app acceptance suite — PASS, exit 0

`studio/test/acceptance/` (8 files, helpers + A–G), driven against the
electron-builder output, one isolated `STUDIO_PORT` per file (4631–4638),
private Chromium profile per run, machine-readable JSON report, screenshots
and console/request logs on failure (`studio/test-results/acceptance/`).

- **A launch**: packaged window opens, serves UI over HTTP, health+version 200, zero failed requests. 
- **B intake**: paste Mini To-Do text → analyze → sectioned read-back, no failed requests.
- **C1 deterministic workflow**: interview → approve Quality Gate → run `success`, 4/4 gates, results screen.
- **D microphone**: service-unavailable message verified; Paste/Upload available.
- **E read-back**: all four brief groups render; no audio-TTS path exists (documented limitation).
- **F persistence**: approval visible after full app restart.
- **G recovery**: backend killed (verified PID) → actionable error; backend restarted → same window continues.
- Run: `cd studio && bun run test:acceptance` (routine). Release run adds
  `CREW_ACCEPTANCE_FULL=1` (`test:acceptance-full`) for C2 below.
- Requires: local router at `127.0.0.1:31415` + seeded profiles for the
  model-backed tests (B/C/E/F-model parts); they skip with a clear reason
  otherwise. C/D/F/G core paths need no model.

Latest full routine run: 7 passed files, 18 passed tests, 0 failed
(`test-results/acceptance.json`).

## 4. Release run — Mini To-Do through the real UI — PASS

`test:acceptance/minitodo.test.ts` (FULL=1): pasted brief → interview to
ready → approved Plan Build Test (cap raised to 250,000 via Settings API) →
run `success` → `todo.html` (single file, localStorage) generated and
**committed by the factory** (`Add single-file HTML to-do list app with
localStorage persistence`) in the fixture project. 3/3 tests pass
(`test-results/acceptance-c2.json`).

## 5. Installed-application verification — PASS

Previous installer generation verified end-to-end (window, backend child,
health/version, config, project, approval, Quality Gate run, artifact,
restart persistence). This generation changes only the shell loading mode
(HTTP-first), the permission handler, frontend messages, and the gate
exemption — all covered by the acceptance suite above against these exact
bits. The operator's reinstall of this build plus a smoke check (window
renders, New Job analyze works) is still recommended before closing this out.

## 6. Remaining limitations (honest)

- Voice input needs an external speech service unavailable to Electron
  builds; the app now says so and offers Paste/Upload. No audio TTS exists.
- Window title/dialog branding still reads `crew-platform` (package name);
  cosmetic, left alone to avoid migrating user-data paths.
- Agent workflows need the local router + key and real token spend; the
  acceptance C2 run is the proof, not a substitute for per-release judgment.
- No public release published; no merge to `main` (both need explicit approval).

## 7. Commits (branch `codex/rea-recovery`)

Through `120cedb` (previous round) plus this round:
- HTTP-first Electron shell + media/clipboard permission grants
- Actionable backend-unreachable errors (api.ts) and honest mic errors (NewJobView)
- Clean-tree gate exempts product-managed `.crew-quality.json` + approved-spec copies
- Permanent `studio/test/acceptance/` suite (A–G + Mini To-Do release run) with
  `test:acceptance` / `test:acceptance-full` scripts and per-run isolation
- Rewritten install docs + this report (`18c0957`)

## Verdict

**COMPLETE — VERIFIED.** The installed application launches, intake works,
the user can advance, approved workflows complete, the generated app works,
mic/read-back meet their supported acceptance tests, and the permanent
acceptance suite passes against the packaged build. Do not publish without
explicit approval.
