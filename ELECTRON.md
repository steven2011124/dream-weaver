# SARVIS as a native desktop app

The Lovable preview runs in a browser tab. To get a real .exe/.app/.AppImage you
package the same Vite build with Electron.

## One-time setup on your own machine

```bash
git pull
npm install
npm install --save-dev electron @electron/packager
```

`vite.config.ts` must build with `base: './'` so the bundle works from
`file://`. (Already set in this repo.)

## Run as a desktop window (dev)

```bash
npm run build
SARVIS_DEV=1 npm run electron   # loads http://localhost:8080
```

Or production-style (loads dist/):

```bash
npm run build
npm run electron
```

## Build an installable bundle

```bash
npm run electron:pack
```

The output is in `electron-release/` — copy the folder anywhere and run the
`SARVIS` binary inside it. Cross-compile by passing `--platform=darwin` or
`--platform=win32` to `@electron/packager` (see script in `package.json`).

## Run on startup

There is a **Run on startup** toggle inside SARVIS → Settings. When you flip it
on, Electron registers the app with your OS login items via
`app.setLoginItemSettings({ openAtLogin: true })`. Toggle it off to remove.

This only works inside the packaged Electron build — in the browser preview the
checkbox is hidden.

## Local keys viewer

```bash
npm run dev:keys
```

Opens http://localhost:4747 with every key from `.env` in a styled panel
(Supabase, Google OAuth, Lovable, HF, News API, Discord…). Edit and save — the
file is rewritten in place. Restart `npm run dev` afterwards.

## Discord bridge (optional)

The `pc_agent.py` script you provided runs alongside the desktop app and bridges
your phone via Discord channels. Put it in any folder and run:

```bash
pip install discord.py psutil aiohttp requests
export DISCORD_TOKEN=...        # bot token
export DISCORD_GUILD_ID=...     # server ID
python pc_agent.py
```

Point `AI_BASE_URL` in the script at `http://localhost:3001` so it hits the
SARVIS backend bridge, not Vite.
