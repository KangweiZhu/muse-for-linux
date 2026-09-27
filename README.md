# Muse for Linux

An **unofficial** Linux desktop app for [Muse](https://muse.ai), Meta's personal AI agent.
It is a thin Electron shell around the muse.ai web app — Meta only ships Muse for macOS, iOS, Android and the web.

> Not affiliated with, endorsed by, or supported by Meta. "Muse" and its icon are trademarks of Meta Platforms, Inc.
> Muse availability (currently US-only) and account rules are Meta's; this app just loads the website.

## Features

- Persistent login (stored in `~/.config/Muse`)
- Closes to the system tray so Muse keeps working in the background
- Single instance, remembers window size/position
- Login and connector (Gmail, Google Calendar, …) popups work in-app; other links open in your browser
- Notifications and microphone (voice) allowed for muse.ai / Meta domains only
- Auto-retry when the network drops, instead of a blank white window
- Native Wayland on KDE/GNOME
- Shows up in KRunner / app launchers after install

Not supported: the Mac app's local integrations (Mail, Calendar, Messages, Files). The Mac app is native SwiftUI, not Electron, so it can't be ported.

## Install

### AppImage (prebuilt)

Download `Muse-x.y.z.AppImage` from [Releases](https://github.com/KangweiZhu/muse-for-linux/releases), then:

```bash
chmod +x Muse-*.AppImage
./Muse-*.AppImage
```

### Build from source

Requires Node.js 22+ and npm.

```bash
git clone https://github.com/KangweiZhu/muse-for-linux.git
cd muse-for-linux
npm ci
npm start                 # run directly
```

Build and install for the current user (adds a launcher entry so KRunner finds it):

```bash
npm run dist:appimage     # builds dist/Muse-*.AppImage and installs it to ~/.local
npm run uninstall:local   # remove it again
```

Arch Linux package:

```bash
npm run dist:pacman
sudo pacman -U dist/muse-for-linux-*.pacman
```

### Behind a proxy

Node doesn't read `http(s)_proxy` by default, so downloading Electron fails behind a proxy. Set this first:

```bash
export NODE_USE_ENV_PROXY=1
```

The app itself uses your system proxy settings.

## Usage notes

- Closing the window hides it to the tray; quit with **Ctrl+Q** or the tray menu.
- `muse` is available on your `PATH` after `npm run dist:appimage`.
- DevTools: View → Toggle Developer Tools (press **Alt** to show the menu bar).

## License

[MIT](LICENSE), except the Muse name and icon, which belong to Meta.
