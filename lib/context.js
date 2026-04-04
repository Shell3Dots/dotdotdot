'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// context.js — Rich environment context gathering for LLM prompts
// ─────────────────────────────────────────────────────────────────────────────

const os   = require('os');
const path = require('path');
const fs   = require('fs');
const { execSync, exec } = require('child_process');
const { promisify }      = require('util');
const { CACHE_DIR }      = require('./config');

const execAsync = promisify(exec);
const CACHE_FILE = path.join(CACHE_DIR, 'context-cache.json');
const CACHE_TTL  = 3600000; // 1 hour

// ─── Safe exec wrappers ─────────────────────────────────────────────────────

function safeExec(cmd, fallback = '') {
  try {
    const suppress = process.platform === 'win32' ? ' 2>nul' : ' 2>/dev/null';
    return execSync(cmd + suppress, { timeout: 2000, encoding: 'utf8' }).trim();
  } catch {
    return fallback;
  }
}

async function safeExecAsync(cmd, fallback = '') {
  try {
    const suppress = process.platform === 'win32' ? ' 2>nul' : ' 2>/dev/null';
    const { stdout } = await execAsync(cmd + suppress, { timeout: 2000 });
    return stdout.trim();
  } catch {
    return fallback;
  }
}

// ─── Cache management ───────────────────────────────────────────────────────

function loadCache() {
  try {
    const raw = fs.readFileSync(CACHE_FILE, 'utf8');
    const data = JSON.parse(raw);
    if (Date.now() - data._ts < CACHE_TTL) return data;
  } catch { /* miss */ }
  return null;
}

function saveCache(data) {
  try {
    fs.writeFileSync(CACHE_FILE, JSON.stringify({ ...data, _ts: Date.now() }));
  } catch { /* ignore */ }
}

// ─── Shell detection ────────────────────────────────────────────────────────

function detectShell(cache) {
  // NEVER use cached shell — user may switch between PowerShell, Git Bash, CMD.
  // Shell detection is fast (<50ms), so always detect fresh.

  const platform = process.platform;
  let name, shellPath, version, isPowerShell = false, isCmd = false, isBash = false;

  if (platform === 'win32') {
    // Check for Git Bash / MINGW / MSYS FIRST.
    // Key: $SHELL is set to a bash path (e.g. '/usr/bin/bash') only inside Git Bash.
    // MSYSTEM alone is unreliable — it leaks into PowerShell on systems with Git installed.
    const envShell = process.env.SHELL;  // '/usr/bin/bash' in Git Bash, undefined in PS
    const isMingwBash = envShell && (envShell.includes('bash') || envShell.includes('/sh'));

    if (isMingwBash) {
      name = 'bash'; shellPath = envShell; isBash = true;
      version = safeExec('bash --version');
      if (version.length > 80) version = version.split('\n')[0].slice(0, 80);
    } else {
      // Check for PowerShell 7+ first
      const pwshVer = safeExec('pwsh -NoProfile -Command "$PSVersionTable.PSVersion.ToString()"');
      if (pwshVer) {
        name = 'pwsh'; shellPath = 'pwsh'; version = pwshVer; isPowerShell = true;
      } else {
        const psVer = safeExec('powershell -NoProfile -Command "$PSVersionTable.PSVersion.ToString()"');
        if (psVer) {
          name = 'powershell'; shellPath = 'powershell'; version = psVer; isPowerShell = true;
        } else {
          name = 'cmd'; shellPath = process.env.ComSpec || 'cmd.exe'; isCmd = true;
          version = safeExec('ver');
        }
      }
    }
  } else {
    shellPath = process.env.SHELL || '/bin/sh';
    name = path.basename(shellPath);
    version = safeExec(`${shellPath} --version`);
    if (version.length > 80) version = version.slice(0, 80);
  }

  return { name, path: shellPath, version, isPowerShell, isCmd, isBash, platform };
}

// ─── Directory listing ──────────────────────────────────────────────────────

function getDirectoryListing(dir) {
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    const items = [];
    let count = 0;
    const MAX = 30; // reduced from 50 — saves tokens

    for (const entry of entries) {
      if (count >= MAX) {
        items.push(`+${entries.length - MAX} more`);
        break;
      }
      // Skip hidden files except useful ones
      if (entry.name.startsWith('.') && !['.env', '.gitignore', '.dockerignore', '.nvmrc'].includes(entry.name)) continue;
      if (entry.name === 'node_modules') { items.push('node_modules/'); count++; continue; }

      // Just name + trailing slash for dirs. No file sizes — saves tokens.
      items.push(entry.isDirectory() ? entry.name + '/' : entry.name);
      count++;
    }
    return items.join(',');
  } catch {
    return '';
  }
}

// ─── Git info ───────────────────────────────────────────────────────────────

async function getGitInfo() {
  const branch = await safeExecAsync('git branch --show-current');
  if (!branch) return null;
  const status = await safeExecAsync('git status --short');
  return {
    branch,
    isDirty: status.length > 0,
    // Limit to 5 lines max — just enough for LLM context
    status: status ? status.split('\n').slice(0, 5).join('\n') : '',
  };
}

// ─── Installed tools ────────────────────────────────────────────────────────

async function getInstalledTools(cache) {
  if (cache?.tools) return cache.tools;

  const checks = [
    { name: 'node',   cmd: 'node --version' },
    { name: 'npm',    cmd: 'npm --version' },
    { name: 'python', cmd: process.platform === 'win32' ? 'python --version' : 'python3 --version' },
    { name: 'git',    cmd: 'git --version' },
    { name: 'docker', cmd: 'docker --version' },
    { name: 'go',     cmd: 'go version' },
    { name: 'cargo',  cmd: 'cargo --version' },
    { name: 'pip',    cmd: process.platform === 'win32' ? 'pip --version' : 'pip3 --version' },
  ];

  const results = await Promise.all(
    checks.map(async ({ name, cmd }) => {
      const ver = await safeExecAsync(cmd);
      // Just store the tool name — version detail wastes tokens, LLM just needs to know it's available
      return ver ? { name } : null;
    })
  );

  const tools = results.filter(Boolean);

  // Detect package manager
  const cwd = process.cwd();
  if (fs.existsSync(path.join(cwd, 'pnpm-lock.yaml')))    tools.push({ name: 'pnpm', version: await safeExecAsync('pnpm --version') || 'installed' });
  if (fs.existsSync(path.join(cwd, 'yarn.lock')))          tools.push({ name: 'yarn', version: await safeExecAsync('yarn --version') || 'installed' });
  if (fs.existsSync(path.join(cwd, 'bun.lockb')))          tools.push({ name: 'bun',  version: await safeExecAsync('bun --version') || 'installed' });

  return tools;
}

// ─── Project info ───────────────────────────────────────────────────────────

function getProjectInfo() {
  const cwd = process.cwd();
  const info = { type: null, name: null, scripts: null, deps: null, files: [] };

  // package.json
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(cwd, 'package.json'), 'utf8'));
    info.type = 'node';
    info.name = pkg.name;
    info.scripts = pkg.scripts ? Object.keys(pkg.scripts).slice(0, 10) : [];
    const deps = Object.keys(pkg.dependencies || {}).slice(0, 10);
    const devDeps = Object.keys(pkg.devDependencies || {}).slice(0, 5);
    info.deps = { deps, devDeps };
  } catch { /* not a node project */ }

  // Project indicator files
  const indicators = [
    'Cargo.toml', 'pyproject.toml', 'setup.py', 'go.mod',
    'Makefile', 'CMakeLists.txt', 'Dockerfile', 'docker-compose.yml',
    'docker-compose.yaml', 'tsconfig.json', '.eslintrc.json',
    'vite.config.ts', 'vite.config.js', 'next.config.js', 'next.config.mjs',
    'webpack.config.js', 'tailwind.config.js', 'tailwind.config.ts',
    '.env', '.env.local', 'Procfile', 'vercel.json', 'netlify.toml',
    'wrangler.toml', 'fly.toml',
  ];

  for (const f of indicators) {
    if (fs.existsSync(path.join(cwd, f))) info.files.push(f);
  }

  return info;
}

// ─── Environment ────────────────────────────────────────────────────────────

function getEnvironment() {
  return {
    virtualEnv:  process.env.VIRTUAL_ENV || process.env.CONDA_DEFAULT_ENV || null,
    isSSH:       !!process.env.SSH_CLIENT || !!process.env.SSH_TTY,
    isDocker:    fs.existsSync('/.dockerenv'),
    isWSL:       process.platform === 'linux' && safeExec('uname -r').toLowerCase().includes('microsoft'),
    user:        os.userInfo().username,
  };
}

// ─── Main gather function ───────────────────────────────────────────────────

async function gatherContext() {
  const cache = loadCache();

  const shell = detectShell(cache);
  const [gitInfo, tools] = await Promise.all([
    getGitInfo(),
    getInstalledTools(cache),
  ]);

  const context = {
    system: {
      platform: process.platform,
      osName: `${os.type()} ${os.release()}`,
      arch: os.arch(),
    },
    shell,
    cwd: process.cwd(),
    dirListing: getDirectoryListing(process.cwd()),
    gitInfo,
    tools,
    projectInfo: getProjectInfo(),
    environment: getEnvironment(),
  };

  // Save to cache (tools only — shell must never be cached, user switches terminals)
  if (!cache) {
    saveCache({ tools });
  }

  return context;
}

module.exports = {
  gatherContext,
  detectShell,
  getDirectoryListing,
  safeExec,
  safeExecAsync,
};
