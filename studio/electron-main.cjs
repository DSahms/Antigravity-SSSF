// C.R.E.W. Software — Electron entry point (packaged desktop container).
//
// Starts the embedded Bun server and presents the prebuilt frontend.
// The UI is served over HTTP from the embedded backend (same origin), NEVER
// from file:// — root-relative /api calls and the origin allowlist only work
// over http://127.0.0.1. Loading from file:// renders the shell but every
// backend call fails with "Failed to fetch".
//
// Layout inside the installed app (asar disabled so Bun can read sources):
//   <install>/resources/app/electron-main.cjs   (this file, .cjs so the
//   "type": "module" app package cannot misload it as ESM)
//   <install>/resources/app/server/index.ts    (Bun server, needs ./node_modules)
//   <install>/resources/app/dist/index.html    (prebuilt UI, also served over HTTP)
//   <install>/resources/app/node_modules/yaml  (production deps, auto-included)
//   <install>/resources/adws, docs, .crew-quality.json (factory tree, extraResources)
//   <install>/resources/bun.exe                (embedded runtime, extraResources)
//
// Factory root resolves to <install>/resources, so new projects land in
// resources/.sssf/projects and the initial target carries adws/ + checks.
//
// STUDIO_PORT: honored when already set (automated acceptance uses a private
// port to stay clear of a live install); defaults to 4620.

const { app, BrowserWindow, session } = require('electron');
const path = require('path');
const http = require('http');
const { spawn, execSync } = require('child_process');
const fs = require('fs');

let mainWindow = null;
let serverProcess = null;

const PORT = (() => {
  const raw = process.env.STUDIO_PORT;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 && n < 65536 ? n : 4620;
})();
const BASE_URL = `http://127.0.0.1:${PORT}`;

function findBunExecutable() {
  const candidates = [
    // Embedded runtime shipped by electron-builder (extraResources).
    path.join(process.resourcesPath || '', 'bun.exe'),
    // Sibling of the app dir (portable/dev layouts).
    path.join(__dirname, '..', 'bun.exe'),
    // Dev fallback: repo-local Bun install.
    path.join(__dirname, '..', '..', '.bun', 'bin', 'bun.exe'),
  ];

  for (const p of candidates) {
    try {
      if (p && fs.existsSync(p)) {
        console.log('[crew-electron] Found Bun at:', p);
        return p;
      }
    } catch {}
  }

  // Fallback: PATH
  try {
    const result = execSync('where bun.exe 2>nul', { encoding: 'utf8', timeout: 5000 }).trim();
    if (result) {
      const firstLine = result.split('\n')[0].trim();
      if (fs.existsSync(firstLine)) {
        console.log('[crew-electron] Found Bun on PATH:', firstLine);
        return firstLine;
      }
    }
  } catch {}

  console.error('[crew-electron] Bun executable not found in any candidate location');
  return null;
}

function startServer() {
  const bunPath = findBunExecutable();
  if (!bunPath) {
    console.error('[crew-electron] Bun executable not found. Cannot start server.');
    return { ok: false, reason: 'Bun runtime not found. Reinstall the application.' };
  }

  // With asar disabled the server sources are plain files next to this entry.
  const candidateServerPaths = [
    path.join(__dirname, 'server', 'index.ts'),
    path.join(__dirname, 'studio', 'server', 'index.ts'),
  ];

  let serverScript = null;
  let serverCwd = null;

  for (const sp of candidateServerPaths) {
    if (fs.existsSync(sp)) {
      serverScript = sp;
      serverCwd = path.dirname(path.dirname(sp));
      break;
    }
  }

  if (!serverScript) {
    console.error('[crew-electron] Server entry script not found');
    return { ok: false, reason: 'Server files missing from the install. Reinstall the application.' };
  }

  console.log('[crew-electron] Starting server at:', serverScript, 'cwd:', serverCwd);

  try {
    const env = Object.assign({}, process.env, { STUDIO_PORT: String(PORT) });

    serverProcess = spawn(bunPath, ['run', serverScript], {
      cwd: serverCwd,
      env: env,
      stdio: 'ignore',
      detached: true,
    });

    serverProcess.unref();
    console.log('[crew-electron] Server spawned with PID:', serverProcess.pid);
    return { ok: true };
  } catch (error) {
    console.error('[crew-electron] Failed to spawn server:', error);
    return { ok: false, reason: `Could not start the backend: ${error && error.message}` };
  }
}

function checkHealth() {
  return new Promise((resolve) => {
    const req = http.get(`${BASE_URL}/api/health`, { timeout: 4000 }, (res) => {
      res.resume();
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}

async function waitForBackend(deadlineMs) {
  const start = Date.now();
  for (;;) {
    if (await checkHealth()) return true;
    if (Date.now() - start > deadlineMs) return false;
    await new Promise((r) => setTimeout(r, 750));
  }
}

function errorPage(reason) {
  const safe = String(reason).replace(/</g, '&lt;');
  return 'data:text/html;charset=utf-8,' + encodeURIComponent(`<!DOCTYPE html>
<html><head><title>C.R.E.W. Software — backend unavailable</title></head>
<body style="font-family:sans-serif;max-width:640px;margin:48px auto;padding:0 16px">
<h1>C.R.E.W. Software backend did not start</h1>
<p>${safe}</p>
<ol>
<li>Close this window and start the app again — the backend needs a few seconds on first launch.</li>
<li>Check that nothing else uses port ${PORT}.</li>
<li>Reinstall from the release installer if files are missing.</li>
</ol>
<p>Backend URL: ${BASE_URL}/api/health</p>
</body></html>`);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 850,
    title: 'C.R.E.W. Software',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  // Permissions the product genuinely needs, granted on explicit user action:
  // microphone (voice input button) and clipboard-read (Paste buttons).
  // Everything else keeps Electron's default (deny).
  const ses = session.defaultSession;
  ses.setPermissionRequestHandler((webContents, permission, callback, details) => {
    if (permission === 'media' || permission === 'clipboard-read') {
      console.log(`[crew-electron] permission granted: ${permission}`);
      callback(true);
      return;
    }
    console.log(`[crew-electron] permission denied: ${permission}`);
    callback(false);
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
    if (serverProcess && typeof serverProcess.kill === 'function') {
      try {
        serverProcess.kill();
      } catch {}
    }
  });

  return mainWindow;
}

app.whenReady().then(async () => {
  const started = startServer();
  const win = createWindow();

  if (!started.ok) {
    await win.loadURL(errorPage(started.reason));
    return;
  }
  // Same-origin HTTP: the only loading mode in which /api works.
  const ready = await waitForBackend(90000);
  if (ready) {
    console.log('[crew-electron] Backend healthy, loading UI from', BASE_URL);
    await win.loadURL(`${BASE_URL}/`);
  } else {
    console.error('[crew-electron] Backend never became healthy');
    await win.loadURL(errorPage(`The backend did not answer at ${BASE_URL}/api/health within 90 seconds. It may still be starting — close and reopen the app. If this persists, check that port ${PORT} is free and reinstall if files are missing.`));
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

process.on('uncaughtException', (error) => {
  console.error('[crew-electron] Uncaught exception:', error);
});
