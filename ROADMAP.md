# Roadmap

## Now
- Fix EAS build upload failure (~180MB) — ensure node_modules is properly
  excluded via .easignore/eas.json rather than the manual
  `mv node_modules ~/tmp/nm_backup` workaround.
- Add basic pytest coverage for pc_agent.py's Discord command handlers
  (currently untested).
- Audit App.js for the expo-router vs `"main": "App.js"` workaround —
  document why it's needed or find a permanent structural fix.

## Later
- Polish VNC-over-SSH (x11vnc) screen-sharing flow.
- Review PC Shell / Phone Shell tabs for command injection risk (anything
  that passes user/Discord input into a shell command should be
  parameterized, not string-concatenated).

## Done
- (populated automatically by the agent's memory over time)
