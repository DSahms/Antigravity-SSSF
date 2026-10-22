// C.R.E.W. Software — Electron entry point (packaged desktop container).
//
// Starts the embedded Bun server and presents the prebuilt frontend.
// Layout inside the installed app (asar disabled so Bun can read sources):
//   <install>/resources/app/electron-main.cjs   (this file, .cjs so the
//   "type": "module" app package cannot misload it as ESM)
//   <install>/resources/app/server/index.ts    (Bun server, needs ./node_modules)
//   <install>/resources/app/dist/index.html    (prebuilt UI)
//   <install>/resources/app/node_modules/yaml  (production deps, auto-included)
//   <install>/resources/adws, docs, .crew-quality.json (factory tree, extraResources)
//   <install>/resources/bun.exe                (embedded runtime, extraResources)
//
// Factory root resolves to <install>/resources, so new projects land in
// resources/.sssf/projects and the initial target carries adws/ + checks.

const { app, BrowserWindow } = require('electron');
const path = require('path');
const { spawn, execSync } = require('child_process');
const fs = require('fs');

let mainWindow = null;
let serverProcess = null;

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
    return false;
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
    return false;
  }

  console.log('[crew-electron] Starting server at:', serverScript, 'cwd:', serverCwd);

  try {
    const env = Object.assign({}, process.env, {
      STUDIO_PORT: '4620',
    });

    serverProcess = spawn(bunPath, ['run', serverScript], {
      cwd: serverCwd,
      env: env,
      stdio: 'ignore',
      detached: true,
    });

    serverProcess.unref();
    console.log('[crew-electron] Server spawned with PID:', serverProcess.pid);
    return true;
  } catch (error) {
    console.error('[crew-electron] Failed to spawn server:', error);
    return false;
  }
}

function findFrontendPath() {
  const candidates = [
    path.join(__dirname, 'dist', 'index.html'),
    path.join(__dirname, 'studio', 'dist', 'index.html'),
  ];

  for (const p of candidates) {
    if (fs.existsSync(p)) {
      return p;
    }
  }
  return null;
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

  const distPath = findFrontendPath();
  if (distPath) {
    console.log('[crew-electron] Loading frontend from file:', distPath);
    mainWindow.loadFile(distPath);
  } else {
    console.log('[crew-electron] Dist not found, attempting HTTP fallback on port 4620');
    mainWindow.loadURL('http://127.0.0.1:4620').catch(() => {
      console.error('[crew-electron] Could not reach HTTP server');
    });
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
    if (serverProcess && typeof serverProcess.kill === 'function') {
      try {
        serverProcess.kill();
      } catch {}
    }
  });
}

app.whenReady().then(() => {
  const serverStarted = startServer();
  createWindow();

  if (!serverStarted && mainWindow) {
    mainWindow.webContents.on('did-finish-load', () => {
      mainWindow.webContents.executeJavaScript(
        'console.warn("CREW backend server did not auto-start. Check that bun is available.");',
      );
    });
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
