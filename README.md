# NPM Dev Button

A convenient and lightweight status bar button for VS Code inspired by [Live Server](https://marketplace.visualstudio.com/items?itemName=ritwickdey.LiveServer), that starts your development server with one click.

## What it does

1. Shows <code><img src="./icons/play.png" width="12" height="12" alt="▶" /> npm run dev</code> on the **right side** of the *status bar* when the workspace contains a `package.json`.
2. On click, **opens a bash terminal** with a customizable name, icon and color and runs the command.
3. Reads the terminal output to find the server URL (Vite, Next.js, CRA, etc.), waits until the server responds and **opens it in your default browser**.
4. The button turns into a magenta <code><img src="./icons/debug-stop.png" width="12" height="12" alt="■" /> Stop Dev</code>. Clicking it again closes the terminal and stops the server.
5. If the process ends on its own (Ctrl + C, error) or you close the terminal, the button goes back to its initial state.

It also works in WSL, Remote SSH and Codespaces (the URL goes through `asExternalUri`).

## Usage

- Click the button in the status bar, or
- Open the Command Palette (`Ctrl+Shift+P`) and run **NPM Dev: Start / Stop server**.

In multi-root workspaces, the extension asks which folder to run in.

## Settings

All under `Settings > Extensions > NPM Dev Button` (or in `settings.json`).

| Setting | Default | Description |
|---|---|---|
| `npmDevButton.command` | `npm run dev` | Command to run. Use `pnpm dev`, `yarn dev`, `bun dev`, etc. |
| `npmDevButton.workingDirectory` | `""` | Subfolder to run in (monorepos), e.g. `apps/web`. |
| `npmDevButton.terminalName` | `Dev` | Terminal name. |
| `npmDevButton.terminalIcon` | <code><img src="./icons/play.png" width="12" height="12" alt="developer-tools"/></code> | ID of a [codicon](https://microsoft.github.io/vscode-codicons/dist/codicon.html). |
| `npmDevButton.terminalColor` | <code><span style="color: #D946EF;">■</span> #D946E</code> <code>terminal.ansiMagenta</code> | Theme color ID (`terminal.ansiGreen`, `terminal.ansiCyan`, ...). |
| `npmDevButton.shellPath` | `""` | Path to bash. Empty = `bash` on Linux/macOS and the default profile on Windows. |
| `npmDevButton.fallbackUrl` | `http://localhost:5173` | URL used if it cannot be detected from the output. |
| `npmDevButton.openBrowser` | `true` | Open the browser when the server is up. |
| `npmDevButton.startupTimeoutSeconds` | `60` | Maximum time to wait for the server to respond. |

Example:

```json
{
    "npmDevButton.command": "pnpm dev",
    "npmDevButton.workingDirectory": "apps/web",
    "npmDevButton.terminalColor": "terminal.ansiCyan",
    "npmDevButton.shellPath": "C:\\Program Files\\Git\\bin\\bash.exe"
}
```

## Notes

- **Windows:** without `shellPath`, the default profile is used (usually PowerShell). To force Git Bash, point it to Git's `bash.exe`. Avoid the WSL `bash.exe`, which changes the working directory.
- **URL detection:** relies on VS Code's *shell integration* (version 1.93+). Without it, the extension sends the command and probes `fallbackUrl`.
- **Browser:** opens the system default browser, not necessarily Chrome.
- **Button color:** VS Code only allows warning/error background colors on status bar items, so the running state is highlighted with magenta text instead of a magenta background.

## Troubleshooting

- **Icon or color did not change:** values set in your own `settings.json` (or workspace settings) override the extension defaults. Search for `npmDevButton` in Settings and reset the ones you do not want. If you installed the extension from a `.vsix`, uninstall the old version and install the new one, then reload the window.
- **Duplicated button when pressing F5:** an installed copy of the extension is running next to the development copy. Uninstall the installed one while developing.
- **Browser did not open:** the server URL could not be detected or did not respond in time. Set `npmDevButton.fallbackUrl` to the right address and increase `npmDevButton.startupTimeoutSeconds` if needed.
- **Button not visible:** it only appears when a `package.json` exists somewhere in the workspace (outside `node_modules`).

## Development

```bash
# run in development mode:
# open this folder in VS Code and press F5 (the "Run Extension" configuration)

# build the .vsix
npx @vscode/vsce package --allow-missing-repository

# install it
code --install-extension npm-dev-button-0.3.0.vsix
```

## License

This project is licensed under the [MIT License](./LICENSE).