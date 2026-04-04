'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// executor.js — Command execution, clipboard, interactive menu
// ─────────────────────────────────────────────────────────────────────────────

const { spawn, execSync } = require('child_process');
const { bold, dim, cyan, green, red, yellow, symbols } = require('./colors');
const { addEntry, getUserIntent } = require('./session');
const { commandBox, printError, printInfo, Spinner, subtle } = require('./renderer');
const { selectMenu } = require('./menu');
const { analyzeRisk } = require('./safety');
const { tokenLine, estimateCost } = require('./tokens');

// ─── Strip accidental shell wrappers from LLM output ────────────────────────
// LLMs sometimes wrap commands in "powershell -Command ..." when already in PS,
// or "bash -c ..." when already in bash. Only strip if it matches current shell.
function stripShellWrapper(cmd) {
  const { shell } = detectBestShell();
  const shellName = shell.toLowerCase().replace(/\.exe$/, '');
  const baseName = require('path').basename(shellName);

  let c = cmd;

  // Only strip PowerShell wrappers if we're running IN PowerShell
  if (baseName === 'pwsh' || baseName === 'powershell') {
    c = c.replace(/^powershell(?:\.exe)?\s+(?:-NoProfile\s+)?-Command\s+["']?/i, '').replace(/["']?\s*$/, '');
    c = c.replace(/^pwsh(?:\.exe)?\s+(?:-NoProfile\s+)?-Command\s+["']?/i, '').replace(/["']?\s*$/, '');
  }

  // Only strip bash wrappers if we're running IN bash
  if (baseName === 'bash' || baseName === 'sh' || baseName === 'zsh') {
    c = c.replace(/^bash\s+-c\s+["']/i, '').replace(/["']\s*$/, '');
    c = c.replace(/^sh\s+-c\s+["']/i, '').replace(/["']\s*$/, '');
  }

  // Only strip cmd wrappers if we're running IN cmd
  if (baseName === 'cmd') {
    c = c.replace(/^cmd(?:\.exe)?\s+\/c\s+["']?/i, '').replace(/["']?\s*$/, '');
  }

  return c;
}

// ─── Detect shell ───────────────────────────────────────────────────────────

function detectBestShell(config) {
  if (config?.preferredShell) return { shell: config.preferredShell, flag: '-c' };
  if (process.platform !== 'win32') return { shell: process.env.SHELL || '/bin/sh', flag: '-c' };

  // Git Bash / MINGW / MSYS — $SHELL is set to bash path only inside Git Bash
  const envShell = process.env.SHELL;
  if (envShell && (envShell.includes('bash') || envShell.includes('/sh'))) {
    return { shell: envShell, flag: '-c' };
  }

  try { execSync('pwsh -NoProfile -Command "exit"', { timeout: 2000, stdio: 'ignore' }); return { shell: 'pwsh', flag: '-Command' }; } catch {}
  try { execSync('powershell -NoProfile -Command "exit"', { timeout: 2000, stdio: 'ignore' }); return { shell: 'powershell', flag: '-Command' }; } catch {}
  return { shell: process.env.ComSpec || 'cmd.exe', flag: '/c' };
}

// ─── Run command ────────────────────────────────────────────────────────────

function runCommand(command, config, opts = {}) {
  const { shell, flag } = detectBestShell(config);
  const { silent = false, captureOnly = false, tokenUsage = null } = opts;

  return new Promise((resolve) => {
    if (!silent && !captureOnly) {
      console.log();
    }

    // For PowerShell, use -EncodedCommand to avoid $() string terminator issues.
    // Base64-encode the command as UTF-16LE (PowerShell's expected encoding).
    let spawnArgs;
    const shellBase = require('path').basename(shell).toLowerCase().replace(/\.exe$/, '');
    if (shellBase === 'powershell' || shellBase === 'pwsh') {
      const encoded = Buffer.from(command, 'utf16le').toString('base64');
      spawnArgs = ['-NoProfile', '-EncodedCommand', encoded];
    } else {
      spawnArgs = [flag, command];
    }

    const proc = spawn(shell, spawnArgs, {
      stdio: captureOnly ? ['pipe', 'pipe', 'pipe'] : ['inherit', 'pipe', 'pipe'],
      env: { ...process.env },
    });

    let output = '';
    let stderrIsClixml = false;
    proc.stdout?.on('data', (d) => { const t = d.toString(); output += t; if (!silent && !captureOnly) process.stdout.write(t); });
    proc.stderr?.on('data', (d) => {
      const t = d.toString();
      // Filter PowerShell CLIXML noise (progress bars, module loading messages).
      // Once we see the CLIXML header, all subsequent stderr is CLIXML until process ends.
      if (t.includes('#< CLIXML')) stderrIsClixml = true;
      if (stderrIsClixml) return;
      output += t;
      if (!silent && !captureOnly) process.stderr.write(t);
    });

    proc.on('close', (code) => {
      addEntry(command, output, code, getUserIntent());
      if (!silent && !captureOnly) {
        if (tokenUsage) {
          const tl = tokenLine(tokenUsage);
          const cost = estimateCost(tokenUsage, config.provider, config.model);
          const costStr = cost ? dim(` ~$${cost}`) : '';
          console.log(`\n  ${dim(tl)}${costStr}`);
        }
        const mark = code === 0 ? green(symbols.check) : red(symbols.cross);
        console.log(`  ${mark} ${dim(`exit ${code}`)}`);
      }
      resolve({ code, output });
    });

    proc.on('error', (err) => {
      addEntry(command, err.message, 1, getUserIntent());
      if (!silent && !captureOnly) console.error(`  ${red(symbols.cross)} ${err.message}`);
      resolve({ code: 1, output: err.message });
    });
  });
}

// ─── Clipboard ──────────────────────────────────────────────────────────────

function copyToClipboard(text) {
  try {
    const p = process.platform;
    if (p === 'win32') execSync('clip', { input: text, timeout: 3000 });
    else if (p === 'darwin') execSync('pbcopy', { input: text, timeout: 3000 });
    else { try { execSync('xclip -selection clipboard', { input: text, timeout: 3000 }); } catch { execSync('xsel --clipboard --input', { input: text, timeout: 3000 }); } }
    return true;
  } catch { return false; }
}

// ─── Interactive mode ───────────────────────────────────────────────────────

async function interactiveMode(result, config, context) {
  const { command: rawCommand, explanation, warning, _tokenUsage } = result;
  const command = stripShellWrapper(rawCommand);
  const risk = analyzeRisk(command);
  const warn = warning || (risk.level === 'high' ? risk.reasons[0] : null);

  console.log();
  console.log(commandBox(command, explanation, warn));

  const blocked = risk.level === 'high' && !config?.allowDangerous;
  const choice = await selectMenu([
    { label: 'Execute', key: 'e', disabled: blocked },
    { label: 'Copy', key: 'c' },
    { label: 'Insert', key: 'i' },
    { label: 'Cancel', key: 'q' },
  ]);

  switch (choice) {
    case 'e': {
      const { code, output } = await runCommand(command, config, { tokenUsage: _tokenUsage });
      if (code !== 0) {
        // ─── Error recovery ──────────────────────────────────────────
        const recovered = await handleFailedCommand(command, output, code, config, context);
        if (recovered) return; // successfully handled, don't exit with error
      }
      cleanExit(code);
      break;
    }
    case 'c': {
      if (copyToClipboard(command)) console.log(`  ${green(symbols.check)} ${dim('copied')}`);
      else console.log(`  ${dim(command)}`);
      break;
    }
    case 'i': console.log(`\n${command}\n`); break;
    default: console.log(`  ${dim('cancelled')}`); break;
  }
}

// ─── Clean exit helper ──────────────────────────────────────────────────────

function cleanExit(code) {
  // Ensure raw mode is off and cursor is visible before exiting
  try {
    if (process.stdin.isTTY && process.stdin.isRaw) {
      process.stdin.setRawMode(false);
    }
    process.stdin.pause();
    process.stdout.write('\x1b[?25h'); // show cursor
  } catch { /* ignore */ }
  process.exit(code);
}

// ─── Error recovery after failed command ────────────────────────────────────
// Returns true if the error was handled (user chose fix/retry), false otherwise

async function handleFailedCommand(command, output, code, config, context) {
  console.log();
  const recovery = await selectMenu([
    { label: 'Fix it', key: 'f' },
    { label: 'Retry', key: 'r' },
    { label: 'Copy error', key: 'c' },
    { label: 'Exit', key: 'q' },
  ]);

  if (recovery === 'f') {
    // Ask the LLM for a fix based on the error output
    const { queryLLM } = require('./llm');

    // Add the failure to session so LLM has context
    addEntry(command, output, code, 'auto-fix');

    const errorSnippet = output.length > 500 ? output.slice(-500) : output;
    const fixPrompt = `The previous command failed. Fix it.\nCommand: ${command}\nError (exit ${code}):\n${errorSnippet}`;

    const spin = new Spinner('fixing...').start();
    try {
      const fixResult = await queryLLM(fixPrompt, context, config, 'quick');
      spin.succeed('done');

      if (fixResult?.command) {
        // Recurse into interactive mode with the new suggestion
        await interactiveMode(fixResult, config, context);
        return true;
      } else {
        printError('Could not generate a fix. Try rephrasing your request.');
        return false;
      }
    } catch (err) {
      spin.fail(err.message);
      return false;
    }
  }

  if (recovery === 'r') {
    const { code: retryCode, output: retryOutput } = await runCommand(command, config);
    if (retryCode !== 0) {
      return await handleFailedCommand(command, retryOutput, retryCode, config, context);
    }
    cleanExit(retryCode);
    return true;
  }

  if (recovery === 'c') {
    const errorText = `$ ${command}\n${output}`;
    if (copyToClipboard(errorText)) {
      console.log(`  ${green(symbols.check)} ${dim('error copied')}`);
    } else {
      console.log(`  ${dim(output.slice(-300))}`);
    }
    return false;
  }

  // 'q' or null — just exit
  return false;
}

// ─── Auto-execute ───────────────────────────────────────────────────────────

async function executeMode(result, config) {
  const { command: rawCommand, explanation, warning, _tokenUsage } = result;
  const command = stripShellWrapper(rawCommand);
  const risk = analyzeRisk(command);

  console.log();
  console.log(commandBox(command, explanation, warning));

  if (risk.level === 'high' || warning) {
    console.log(`  ${red(symbols.warning)} ${bold('Blocked.')} Use interactive mode.`);
    cleanExit(1);
  }

  const { code } = await runCommand(command, config, { tokenUsage: _tokenUsage });
  cleanExit(code);
}

module.exports = { runCommand, copyToClipboard, interactiveMode, executeMode, handleFailedCommand, cleanExit, detectBestShell, stripShellWrapper };
