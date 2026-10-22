# CREW Software — Installation & Usage

## System requirements

- Windows 10 or 11 (x64)
- No admin rights needed for the default per-user install
- For agent workflows: `uv`, `git`, and the `pi` CLI on PATH, plus the
  existing local model router at `http://127.0.0.1:31415/v1` (model `auto`).
  Bun and the production JS dependencies ship inside the installer.

## Install

1. Run `release/CREW Software Setup 1.0.0.exe` from this repository
   (SHA-256 `F803BAB99BF55F3AECC38757A09F5CB2AD7A44449C87A06031C1038A610CE390`).
2. Take the default location (per-user, no elevation), or pick another folder.
3. Launch **CREW Software** from the Start Menu shortcut.

No separate Bun/Node download is needed: `resources/bun.exe` and the
production `node_modules` (notably `yaml`, required by the backend) are
bundled and verified present after install.

## First run

1. The window opens on the Home view. The backend starts automatically and
   serves `http://127.0.0.1:4620` — check
   `curl http://127.0.0.1:4620/api/health` returns `{"ok":true,...}`.
2. Open **Settings → Connection profiles** and confirm the `local` provider
   entries (base `http://127.0.0.1:31415/v1`, model `auto`). Keys are stored
   server-side in `.sssf/profiles.json` and never displayed in full.
3. Open **Settings → Project checks** after creating a project and save the
   real `test`/`lint`/`typecheck`/`build` commands. Quality Gate and full
   builds refuse to run without them — that refusal is the product working
   as designed, not an error.
4. Closing the application window stops the backend too (standard Electron
   behavior). Restart the app to serve again.

## Recommended first job (no token spend)

1. **New Job** → describe something small → **Read it back to me**.
2. **Review & Approve** → confirm sections → Approve (workflow **Quality Gate**).
3. **Run** → watch phases go green → **Results** shows the 4 gate results.
4. Reopen the job later: approvals, runs, and traces persist across restarts.

## Reproducible build (developers)

From a clean checkout on Windows with Bun, Node, and Git:

```
cd studio
bun install
bun run build            # vue-tsc typecheck + vite build (relative asset base)
node scripts/check.mjs   # canonical quality gate (must exit 0)
bun run electron:dist    # -> ../release/CREW Software Setup 1.0.0.exe
```

Before rebuilding, stop any server running from `release/win-unpacked`
(or delete that directory) — the packager must be able to replace it.

## Troubleshooting

- **Blank white window**: fixed in 1.0.0 (relative asset base). Older
  installs need the new installer.
- **`require is not defined in ES module scope` dialog**: fixed in 1.0.0
  (Electron main is `.cjs`). Older installs need the new installer.
- **Health check refuses connection**: the window was closed (which stops
  the server), or another copy holds port 4620. Relaunch the app.
- **"Approval required" on launch**: by design. Approve the spec first.
- **Quality Gate refuses "no .crew-quality.json"**: by design. Save real
  project checks in Settings → Project checks.
