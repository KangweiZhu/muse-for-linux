const {
  app, BrowserWindow, Menu, Tray, shell, session, nativeImage,
} = require('electron');
const fs = require('fs');
const path = require('path');

const HOME_URL = 'https://muse.ai/';
const PARTITION = 'persist:muse';

// Hosts that stay inside the app (the web app itself plus its login flows).
// Everything else opens in the system browser.
const IN_APP_HOSTS = [
  'muse.ai', 'meta.ai', 'meta.com', 'facebook.com', 'instagram.com',
  'accounts.google.com', 'appleid.apple.com',
];

const isInAppUrl = (url) => {
  try {
    const { protocol, hostname } = new URL(url);
    if (protocol !== 'https:') return false;
    return IN_APP_HOSTS.some((h) => hostname === h || hostname.endsWith(`.${h}`));
  } catch {
    return false;
  }
};

// Wayland-native rendering on KDE/GNOME; falls back to X11 automatically.
app.commandLine.appendSwitch('ozone-platform-hint', 'auto');
app.commandLine.appendSwitch('enable-features', 'WaylandWindowDecorations');
app.setName('Muse');

if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}

const iconPath = path.join(__dirname, '..', 'assets', 'icon.png');
const statePath = () => path.join(app.getPath('userData'), 'window-state.json');

let win = null;
let tray = null;
let quitting = false;

function loadBounds() {
  try {
    return JSON.parse(fs.readFileSync(statePath(), 'utf8'));
  } catch {
    return { width: 1200, height: 820 };
  }
}

function saveBounds() {
  if (!win || win.isMinimized() || win.isFullScreen()) return;
  try {
    fs.writeFileSync(statePath(), JSON.stringify({ ...win.getBounds(), maximized: win.isMaximized() }));
  } catch { /* non-fatal */ }
}

function showWindow() {
  if (!win) return createWindow();
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

function setupSession() {
  const ses = session.fromPartition(PARTITION);

  // Present as plain Chrome; some login providers reject Electron user agents.
  ses.setUserAgent(ses.getUserAgent().replace(/\s(Electron|muse-for-linux|Muse)\/\S+/g, ''));

  const allowed = new Set(['notifications', 'media', 'clipboard-read', 'clipboard-sanitized-write', 'fullscreen']);
  ses.setPermissionRequestHandler((wc, permission, cb, details) => {
    cb(allowed.has(permission) && isInAppUrl(details.requestingUrl || wc.getURL()));
  });
  ses.setPermissionCheckHandler((wc, permission, origin) => allowed.has(permission) && isInAppUrl(origin));
  return ses;
}

function errorPage(desc, url) {
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
  return `<!doctype html><title>Muse</title>
<style>body{font:15px system-ui,sans-serif;display:grid;place-items:center;height:100vh;margin:0;color:#222}
@media(prefers-color-scheme:dark){body{background:#1c1c1e;color:#eee}}
a{display:inline-block;margin-top:12px;padding:8px 18px;border-radius:8px;background:#0064e0;color:#fff;text-decoration:none}
code{opacity:.6}</style>
<div style="text-align:center"><h2>Can't reach Muse</h2>
<p>Check your network or proxy.</p><p><code>${esc(desc)}</code></p>
<a href="${esc(url)}">Retry</a></div>`;
}

// Connector/login flows often open a blank popup first and set its location
// once the auth URL is ready, so about:blank must be allowed too.
function popupHandler({ url }) {
  if (isInAppUrl(url) || url === 'about:blank' || url === '') {
    return {
      action: 'allow',
      overrideBrowserWindowOptions: { width: 600, height: 760, autoHideMenuBar: true, parent: win },
    };
  }
  if (/^(https?|mailto):/.test(url)) shell.openExternal(url);
  return { action: 'deny' };
}

function createWindow() {
  const bounds = loadBounds();
  win = new BrowserWindow({
    ...bounds,
    minWidth: 480,
    minHeight: 400,
    title: 'Muse',
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
    autoHideMenuBar: true,
    backgroundColor: '#ffffff',
    webPreferences: {
      partition: PARTITION,
      contextIsolation: true,
      sandbox: true,
      spellcheck: true,
    },
  });
  if (bounds.maximized) win.maximize();

  const wc = win.webContents;
  wc.setWindowOpenHandler(popupHandler);
  // Popups (login, connector OAuth) keep their opener and session, and may
  // navigate to any provider (Google, Granola, ...) before redirecting back.
  wc.on('did-create-window', (child) => {
    child.webContents.setWindowOpenHandler(popupHandler);
  });
  wc.on('will-navigate', (e, url) => {
    if (!isInAppUrl(url)) {
      e.preventDefault();
      if (/^(https?|mailto):/.test(url)) shell.openExternal(url);
    }
  });
  // Flaky proxies/networks drop connections now and then; a failed main-frame
  // load would otherwise leave a blank white window. Retry with backoff, then
  // show an error page with a retry button.
  let retries = 0;
  wc.on('did-fail-load', (e, code, desc, url, isMainFrame) => {
    if (!isMainFrame || code === -3 /* ERR_ABORTED */) return;
    if (retries < 5) {
      const delay = 1000 * 2 ** retries++;
      setTimeout(() => !wc.isDestroyed() && wc.loadURL(url), delay);
      return;
    }
    retries = 0;
    wc.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(errorPage(desc, url))}`);
  });
  // Chromium's own error pages also "finish loading", so only a real HTTP
  // response counts as success.
  wc.on('did-navigate', (e, url, httpResponseCode) => {
    if (httpResponseCode > 0) retries = 0;
  });
  wc.on('page-title-updated', (e, title) => {
    e.preventDefault();
    win.setTitle(title && title !== 'Muse' ? `${title} — Muse` : 'Muse');
  });

  for (const ev of ['resize', 'move', 'close']) win.on(ev, saveBounds);
  win.on('close', (e) => {
    // Muse keeps working in the background; closing hides to tray like the Mac app.
    if (!quitting && tray) {
      e.preventDefault();
      win.hide();
    }
  });
  win.on('closed', () => { win = null; });

  win.loadURL(HOME_URL);
}

function createTray() {
  if (!fs.existsSync(iconPath)) return;
  tray = new Tray(nativeImage.createFromPath(iconPath).resize({ width: 22, height: 22 }));
  tray.setToolTip('Muse');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Show Muse', click: showWindow },
    { label: 'Reload', click: () => win && win.webContents.reload() },
    { type: 'separator' },
    { label: 'Quit', click: () => { quitting = true; app.quit(); } },
  ]));
  tray.on('click', () => (win && win.isVisible() && win.isFocused() ? win.hide() : showWindow()));
}

function createMenu() {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    {
      label: 'Muse',
      submenu: [
        { label: 'Home', accelerator: 'CmdOrCtrl+Shift+H', click: () => win && win.loadURL(HOME_URL) },
        { label: 'Back', accelerator: 'Alt+Left', click: () => win && win.webContents.navigationHistory.goBack() },
        { label: 'Forward', accelerator: 'Alt+Right', click: () => win && win.webContents.navigationHistory.goForward() },
        { type: 'separator' },
        { label: 'Quit', accelerator: 'CmdOrCtrl+Q', click: () => { quitting = true; app.quit(); } },
      ],
    },
    { role: 'editMenu' },
    {
      label: 'View',
      submenu: [
        { role: 'reload' }, { role: 'forceReload' }, { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
  ]));
}

app.on('second-instance', showWindow);
app.on('before-quit', () => { quitting = true; });
app.on('window-all-closed', () => { if (!tray) app.quit(); });

app.whenReady().then(() => {
  setupSession();
  createMenu();
  createWindow();
  createTray();
});
