#!/usr/bin/env node
'use strict';

/**
 * Smoke tests: safety classification, provider resolution, shell helpers,
 * CLI parsing/exit codes (help, version, invalid provider), and error paths
 * without calling the network.
 */

const assert = require('assert');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..');
const cli = path.join(root, 'bin', 'dotdotdot.js');

const { analyzeRisk, analyzeSteps } = require('../lib/safety');
const { resolveProvider, getAllProviderIds } = require('../lib/config');
const { detectBestShell, stripShellWrapper } = require('../lib/executor');

// ─── Safety classification ─────────────────────────────────────────────────
assert.strictEqual(analyzeRisk('').level, 'low');
assert.strictEqual(analyzeRisk('ls -la').level, 'low');
assert.strictEqual(analyzeRisk('sudo apt update').level, 'high');
assert.strictEqual(analyzeRisk('rm file.txt').level, 'medium');

const stepped = analyzeSteps([
  { command: 'echo ok', needsApproval: false },
  { command: 'sudo reboot', needsApproval: false },
]);
assert.strictEqual(stepped[0].computedRisk, 'low');
assert.strictEqual(stepped[1].computedRisk, 'high');
assert.strictEqual(stepped[1].needsApproval, true);

// ─── Provider handling ─────────────────────────────────────────────────────
assert.strictEqual(resolveProvider('claude'), 'anthropic');
assert.strictEqual(resolveProvider('or'), 'openrouter');
assert.strictEqual(resolveProvider('not-a-real-provider-id-xyz'), null);
assert.ok(getAllProviderIds().includes('google'));

// ─── Shell behavior (strip wrappers matches current shell) ─────────────────
const sh = detectBestShell({});
assert.ok(sh.shell && typeof sh.shell === 'string');
assert.ok(sh.flag);
const stripped = stripShellWrapper('echo hello');
assert.ok(typeof stripped === 'string');

// ─── CLI: help / version (no API key) ──────────────────────────────────────
function runCli(args) {
  return spawnSync(process.execPath, [cli, ...args], {
    cwd: root,
    encoding: 'utf8',
  });
}

let r = runCli(['--help']);
assert.strictEqual(r.status, 0, 'help should exit 0');
assert.ok(r.stdout.includes('dotdotdot') || r.stdout.includes('Usage'), 'help output');

r = runCli(['--version']);
assert.strictEqual(r.status, 0);
const verLine = r.stdout.split(/\r?\n/).map((l) => l.trim()).find((l) => /^\d+\.\d+\.\d+$/.test(l));
assert.ok(verLine, 'version line in stdout');

// Invalid provider → exit 1 before any LLM call
r = runCli(['-p', '__invalid_provider__', 'noop']);
assert.strictEqual(r.status, 1);
assert.ok(
  (r.stderr + r.stdout).includes('Unknown'),
  'expected unknown provider message',
);

// Missing input after flags → help (exit 0), same as current CLI behavior
r = runCli([]);
assert.strictEqual(r.status, 0);

console.log('smoke tests passed');
