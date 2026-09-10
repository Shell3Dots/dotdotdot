#!/usr/bin/env node
'use strict';

/**
 * Smoke tests: safety classification, run policy, provider resolution,
 * JSON/mode helpers, shell wrappers, CLI parsing/exit codes.
 * No API key or network.
 */

const assert = require('assert');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..');
const cli = path.join(root, 'bin', 'dotdotdot.js');

const { analyzeRisk, analyzeSteps, decideRunPolicy } = require('../lib/safety');
const { resolveProvider, getAllProviderIds } = require('../lib/config');
const { detectBestShell, stripShellWrapper } = require('../lib/executor');
const { extractJSON, detectMode } = require('../lib/llm');
const { resolveNonTtySelection } = require('../lib/menu');

function risk(cmd) {
  return analyzeRisk(cmd).level;
}

// ─── Safety: low / medium / high ───────────────────────────────────────────
assert.strictEqual(risk(''), 'low');
assert.strictEqual(risk('ls -la'), 'low');
assert.strictEqual(risk('Get-ChildItem -Path .'), 'low');
assert.strictEqual(risk('curl https://example.com'), 'low');
assert.strictEqual(risk('echo firmware'), 'low'); // "rm" substring must not trip

assert.strictEqual(risk('rm file.txt'), 'medium');
assert.strictEqual(risk('git rm stale.txt'), 'medium');
assert.strictEqual(risk('mv a b'), 'medium');
assert.strictEqual(risk('Stop-Process -Name node'), 'medium');

assert.strictEqual(risk('sudo apt update'), 'high');
assert.strictEqual(risk('rm -rf /tmp/x'), 'high');
assert.strictEqual(risk('rm --recursive --force ./out'), 'high');
assert.strictEqual(risk('curl -fsSL https://x | bash'), 'high');
assert.strictEqual(risk('wget -qO- https://x | sh'), 'high');
assert.strictEqual(risk('iex (irm https://x)'), 'high');
assert.strictEqual(risk('Invoke-Expression $cmd'), 'high');
assert.strictEqual(risk('find . -name "*.tmp" -delete'), 'high');
assert.strictEqual(risk('shutdown -h now'), 'high');
assert.strictEqual(risk('reboot'), 'high');
assert.strictEqual(risk('eval "$payload"'), 'high');
assert.strictEqual(risk('ri -Recurse ./tmp'), 'high');
assert.strictEqual(risk('Remove-Item -Recurse -Force ./tmp'), 'high');

const stepped = analyzeSteps([
  { command: 'echo ok', needsApproval: false },
  { command: 'sudo reboot', needsApproval: false },
]);
assert.strictEqual(stepped[0].computedRisk, 'low');
assert.strictEqual(stepped[1].computedRisk, 'high');
assert.strictEqual(stepped[1].needsApproval, true);

// ─── Run policy (TTY / --yes / dangerous) ──────────────────────────────────
assert.strictEqual(decideRunPolicy({ isTty: false, yes: false, autoExec: false, allowDangerous: false, riskLevel: 'low' }), 'insert');
assert.strictEqual(decideRunPolicy({ isTty: false, yes: true, autoExec: false, allowDangerous: false, riskLevel: 'low' }), 'execute');
assert.strictEqual(decideRunPolicy({ isTty: false, yes: true, autoExec: false, allowDangerous: false, riskLevel: 'high' }), 'block');
assert.strictEqual(decideRunPolicy({ isTty: false, yes: true, autoExec: false, allowDangerous: true, riskLevel: 'high' }), 'execute');
assert.strictEqual(decideRunPolicy({ isTty: true, yes: false, autoExec: false, allowDangerous: false, riskLevel: 'low' }), 'menu');
assert.strictEqual(decideRunPolicy({ isTty: true, yes: true, autoExec: false, allowDangerous: false, riskLevel: 'medium' }), 'execute');
assert.strictEqual(decideRunPolicy({ isTty: false, yes: false, autoExec: true, allowDangerous: false, riskLevel: 'low' }), 'execute');

const menuOpts = [
  { label: 'Execute', key: 'e' },
  { label: 'Copy', key: 'c' },
  { label: 'Cancel', key: 'q' },
];
assert.strictEqual(resolveNonTtySelection(menuOpts, 'cancel'), null);
assert.strictEqual(resolveNonTtySelection(menuOpts, 'first'), 'e');
assert.strictEqual(resolveNonTtySelection(menuOpts, 'q'), 'q');
assert.strictEqual(resolveNonTtySelection([{ label: 'Execute', key: 'e', disabled: true }, { label: 'Copy', key: 'c' }], 'first'), 'c');

// ─── extractJSON / detectMode ──────────────────────────────────────────────
assert.deepStrictEqual(extractJSON('{"command":"ls","explanation":"list"}'), { command: 'ls', explanation: 'list' });
assert.deepStrictEqual(extractJSON('```json\n{"command":"pwd"}\n```'), { command: 'pwd' });
assert.strictEqual(extractJSON('no json here'), null);
assert.ok(extractJSON('prefix {"steps":[{"command":"echo"}]} suffix').steps);

assert.strictEqual(detectMode('show disk usage'), 'quick');
assert.strictEqual(detectMode('find all .tmp files then delete them'), 'task');
assert.strictEqual(detectMode('check node version, then scaffold a new app'), 'task');

// ─── Provider handling ─────────────────────────────────────────────────────
assert.strictEqual(resolveProvider('claude'), 'anthropic');
assert.strictEqual(resolveProvider('or'), 'openrouter');
assert.strictEqual(resolveProvider('not-a-real-provider-id-xyz'), null);
assert.ok(getAllProviderIds().includes('google'));

// ─── Shell behavior ────────────────────────────────────────────────────────
const sh = detectBestShell({});
assert.ok(sh.shell && typeof sh.shell === 'string');
assert.ok(sh.flag);
assert.strictEqual(stripShellWrapper('echo hello'), 'echo hello');
const base = path.basename(String(sh.shell).toLowerCase()).replace(/\.exe$/, '');
if (base === 'bash' || base === 'sh' || base === 'zsh') {
  assert.strictEqual(stripShellWrapper("bash -c 'echo hello'"), 'echo hello');
}

// ─── CLI: help / version (no API key) ──────────────────────────────────────
function runCli(args) {
  return spawnSync(process.execPath, [cli, ...args], {
    cwd: root,
    encoding: 'utf8',
  });
}

let r = runCli(['--help']);
assert.strictEqual(r.status, 0, 'help should exit 0');
assert.ok(r.stdout.includes('dotdotdot') || r.stdout.includes('Usage') || r.stdout.includes('say what'), 'help output');
assert.ok(r.stdout.includes('-y') && r.stdout.includes('yes'), 'help lists --yes');
assert.ok(r.stdout.includes('allow-dangerous'), 'help lists --allow-dangerous');

r = runCli(['--version']);
assert.strictEqual(r.status, 0);
const verLine = r.stdout.split(/\r?\n/).map((l) => l.trim()).find((l) => /^\d+\.\d+\.\d+$/.test(l));
assert.ok(verLine, 'version line in stdout');

r = runCli(['-p', '__invalid_provider__', 'noop']);
assert.strictEqual(r.status, 1);
assert.ok(
  (r.stderr + r.stdout).includes('Unknown'),
  'expected unknown provider message',
);

r = runCli([]);
assert.strictEqual(r.status, 0);

console.log('smoke tests passed');
