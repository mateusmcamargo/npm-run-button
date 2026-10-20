# Changelog

## 0.5.0

### Fixed
- The browser did not open when the server address could not be read from the terminal and the server was not on port 5173 (for example with shell integration off or slow to start). Newly listening ports are now detected.
- Slow servers: the URL reading and the port wait no longer have separate fixed budgets. A single deadline (`startupTimeoutSeconds`) now covers both.
- `localhost` is checked on both IPv4 and IPv6, so servers listening on only one of them are found.
- A server already running on the usual port is no longer mistaken for the new one.
- Shell integration is waited for up to 10 s (4 s before) and not at all when it is disabled in settings.
- If the command exits before the server is ready, a warning with the exit code is shown.
- A failure to launch the browser is reported instead of being silent.
- `.vscode/launch.json` had a trailing comma and now runs with `--disable-extensions`.

### Added
- `NPM Dev Button` output channel and the **NPM Dev: Show Log** command.
- `capabilities`: the extension is disabled in Restricted Mode and in virtual workspaces.
- `startupTimeoutSeconds` has a minimum of 5.
