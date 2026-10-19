
const vscode = require('vscode');
const http = require('http');
const https = require('https');

const ANSI_RE = /\u001b\[[0-?]*[ -/]*[@-~]|\u001b\][^\u0007]*(?:\u0007|\u001b\\)/g;
const URL_RE = /https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(?::\d+)?[^\s'")<>]*/i;
const DETECT_TIMEOUT_MS = 30000;

let statusItem;
let terminal;
let running = false;
let abortController;
let currentExecution;

const cfg = () => vscode.workspace.getConfiguration('npmDevButton');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function updateStatusBar() {
    if (running) {
        statusItem.text = '$(debug-stop) Stop Dev';
        statusItem.tooltip = 'Stop the server and close the terminal';
        // status bar items only allow warning/error background colors,
        // so the magenta highlight is applied to the text instead.
        statusItem.color = new vscode.ThemeColor('terminal.ansiMagenta');
        statusItem.backgroundColor = undefined;
    } else {
        statusItem.text = `$(play) ${cfg().get('command')}`;
        statusItem.tooltip = 'Start the development server';
        statusItem.color = undefined;
        statusItem.backgroundColor = undefined;
    }
}

// show the button only when a package.json exists in the workspace
async function refreshVisibility() {
    if (running) {
        statusItem.show();
        return;
    }
    try {
        const found = await vscode.workspace.findFiles('**/package.json', '**/node_modules/**', 1);
        if (found.length > 0) statusItem.show();
        else statusItem.hide();
    } catch {
        statusItem.show();
    }
}

function resetState() {
    running = false;
    currentExecution = undefined;
    abortController?.abort();
    abortController = undefined;
    updateStatusBar();
}

function stop() {
    const t = terminal;
    terminal = undefined;
    resetState();
    t?.dispose();
}

function waitForShellIntegration(t, ms, signal) {
    if (t.shellIntegration) return Promise.resolve(t.shellIntegration);
    if (signal.aborted) return Promise.resolve(undefined);

    return new Promise((resolve) => {
        let sub;
        let timer;

        const finish = (integration) => {
            clearTimeout(timer);
            sub?.dispose();
            signal.removeEventListener('abort', onAbort);
            resolve(integration);
        };

        const onAbort = () => finish(undefined);

        timer = setTimeout(() => finish(undefined), ms);
        sub = vscode.window.onDidChangeTerminalShellIntegration((e) => {
            if (e.terminal === t) finish(e.shellIntegration);
        });

        signal.addEventListener('abort', onAbort, { once: true });

        if (t.shellIntegration) finish(t.shellIntegration);
        else if (signal.aborted) finish(undefined);
    });
}

// read the command output until a local url appears
// shouldStop() lets us abort the read when we give up waiting.
function watchForUrl(execution, shouldStop) {
    return new Promise((resolve) => {
        (async () => {
            let buf = '';
            for await (const chunk of execution.read()) {
                if (shouldStop()) break;
                buf = (buf + chunk.replace(ANSI_RE, '')).slice(-4000);
                const m = buf.match(URL_RE);
                if (m) return resolve(m[0].replace('0.0.0.0', 'localhost'));
            }
            resolve(undefined);
        })().catch(() => resolve(undefined));
    });
}

// race between detecting the url and a timeout, clearing the timer at the end
async function detectUrl(execution, signal) {
    let giveUp = false;
    let timer;
    const timeout = new Promise((resolve) => {
        timer = setTimeout(() => {
            giveUp = true;
            resolve(undefined);
        }, DETECT_TIMEOUT_MS);
    });
    const result = await Promise.race([
        watchForUrl(execution, () => giveUp || signal.aborted),
        timeout,
    ]);
    clearTimeout(timer);
    giveUp = true;
    return result;
}

function isUp(url) {
    return new Promise((resolve) => {
        const lib = url.startsWith('https') ? https : http;
        const req = lib.get(url, { timeout: 1500 }, (res) => {
            res.resume();
            resolve(true); // any http response means the server is up
        });
        req.on('timeout', () => req.destroy());
        req.on('error', () => resolve(false));
    });
}

async function waitUntilUp(url, signal, timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline && !signal.aborted) {
        if (await isUp(url)) return true;
        await sleep(500);
    }
    return false;
}

// ask which folder to use in a multi-root workspace
async function pickFolder() {
    const folders = vscode.workspace.workspaceFolders ?? [];
    if (folders.length <= 1) return folders[0];
    const pick = await vscode.window.showQuickPick(
        folders.map((f) => ({ label: f.name, description: f.uri.fsPath, folder: f })),
        { placeHolder: 'Which folder should the server run in?' }
    );
    return pick?.folder;
}

async function start() {
    if (!vscode.workspace.workspaceFolders?.length) {
        vscode.window.showErrorMessage('Open a project folder before starting the server.');
        return;
    }
    const folder = await pickFolder();
    if (!folder) return;

    // clean up the previous terminal (e.g. the command died but the terminal stayed open)
    if (terminal) {
        const old = terminal;
        terminal = undefined;
        old.dispose();
    }

    let myTerminal;

    try {
        const c = cfg();
        const command = c.get('command');
        const shellPath = c.get('shellPath') || (process.platform === 'win32' ? undefined : 'bash');
        const subdir = c.get('workingDirectory');
        const cwd = subdir ? vscode.Uri.joinPath(folder.uri, subdir) : folder.uri;

        terminal = vscode.window.createTerminal({
            name: c.get('terminalName'),
            cwd,
            shellPath,
            iconPath: new vscode.ThemeIcon(c.get('terminalIcon')),
            color: new vscode.ThemeColor(c.get('terminalColor')),
        });
        myTerminal = terminal;
        terminal.show();

        running = true;
        abortController = new AbortController();
        const { signal } = abortController;
        updateStatusBar();

        let url = c.get('fallbackUrl');
        const si = await waitForShellIntegration(myTerminal, 4000, signal);
        if (signal.aborted) return;

        if (si) {
            const execution = si.executeCommand(command);
            currentExecution = execution;
            const detected = await detectUrl(execution, signal);
            if (detected) url = detected;
        } else {
            // without shell integration, send the command and rely on the fallback url
            myTerminal.sendText(command);
        }
        if (signal.aborted) return;

        if (!c.get('openBrowser')) return;

        const up = await waitUntilUp(url, signal, c.get('startupTimeoutSeconds') * 1000);
        if (signal.aborted) return;

        if (up) {
            // resolve remote urls for wsl, remote ssh and codespaces
            const external = await vscode.env.asExternalUri(vscode.Uri.parse(url));
            await vscode.env.openExternal(external);
        } else {
            vscode.window.showWarningMessage(
                `The server did not respond at ${url}. Adjust "npmDevButton.fallbackUrl" if it uses a different port.`
            );
        }
    } catch (error) {
        if (terminal === myTerminal) stop();
        else resetState();

        const message = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`NPM Dev Button: ${message}`);
    }
}

function activate(context) {
    statusItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusItem.command = 'npmDevButton.toggle';
    updateStatusBar();

    const watcher = vscode.workspace.createFileSystemWatcher('**/package.json');

    const subscriptions = [
        statusItem,
        watcher,
        vscode.commands.registerCommand('npmDevButton.toggle', () => (running ? stop() : start())),

        // reset the button when the user closes the terminal manually
        vscode.window.onDidCloseTerminal((t) => {
            if (t === terminal) {
                terminal = undefined;
                resetState();
            }
        }),

        vscode.workspace.onDidChangeConfiguration((e) => {
            if (e.affectsConfiguration('npmDevButton')) updateStatusBar();
        }),

        // keep button visibility in sync with package.json files
        vscode.workspace.onDidChangeWorkspaceFolders(refreshVisibility),
        watcher.onDidCreate(refreshVisibility),
        watcher.onDidDelete(refreshVisibility),
    ];

    // reset the button when the process ends but the terminal stays open
    // this api is only available in recent vscode versions, so register it conditionally
    if (typeof vscode.window.onDidEndTerminalShellExecution === 'function') {
        subscriptions.push(
            vscode.window.onDidEndTerminalShellExecution((e) => {
                if (e.terminal === terminal && e.execution === currentExecution) resetState();
            })
        );
    }

    context.subscriptions.push(...subscriptions);
    refreshVisibility();
}

function deactivate() {
    abortController?.abort();
}

module.exports = { activate, deactivate };