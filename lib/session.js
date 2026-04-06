'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// session.js — Session history for conversational follow-ups & multi-step tasks
// ─────────────────────────────────────────────────────────────────────────────

const fs   = require('fs');
const path = require('path');
const os   = require('os');

const { CONFIG_DIR, ensureDirs } = require('./config');

// User-specific config dir (not world-writable shared temp) + non-guessable filename vs tmp root
const SESSION_FILE = path.join(CONFIG_DIR, 'session.json');
const LEGACY_SESSION_FILE = path.join(os.tmpdir(), 'dotdotdot-session.json');

function migrateLegacySessionIfNeeded() {
  try {
    if (fs.existsSync(SESSION_FILE)) return;
    if (!fs.existsSync(LEGACY_SESSION_FILE)) return;
    ensureDirs();
    fs.copyFileSync(LEGACY_SESSION_FILE, SESSION_FILE);
    fs.unlinkSync(LEGACY_SESSION_FILE);
    try {
      fs.chmodSync(SESSION_FILE, 0o600);
    } catch { /* ignore (e.g. Windows) */ }
  } catch { /* ignore migration errors */ }
}

function tightenSessionFilePerms() {
  try {
    if (fs.existsSync(SESSION_FILE)) fs.chmodSync(SESSION_FILE, 0o600);
  } catch { /* ignore */ }
}
const MAX_ENTRIES  = 20;
const SESSION_TTL  = 30 * 60 * 1000; // 30 minutes
const MAX_OUTPUT   = 2000; // max chars of output to store (reduced from 4000)

// Terminal session ID — detect new shell sessions to clear stale context.
// Uses parent PID + shell PID as a fingerprint. New terminal = new session.
function getTerminalSessionId() {
  try {
    return `${process.ppid || 0}`;
  } catch { return '0'; }
}

// ─── Load session ───────────────────────────────────────────────────────────

function loadSession() {
  migrateLegacySessionIfNeeded();
  tightenSessionFilePerms();
  const empty = { entries: [], previousSummary: null, taskId: null, taskSteps: null, terminalId: null };
  try {
    const raw = fs.readFileSync(SESSION_FILE, 'utf8');
    const session = JSON.parse(raw);
    
    // Guard against malformed/old session files
    if (!session || !Array.isArray(session.entries)) {
      return empty;
    }

    // Clear on new terminal session — user unlikely wants old context
    const currentTerminal = getTerminalSessionId();
    if (session.terminalId && session.terminalId !== currentTerminal) {
      return { ...empty, terminalId: currentTerminal };
    }

    // Check timeout
    if (session.entries.length > 0) {
      const lastTime = session.entries[session.entries.length - 1].time;
      if (Date.now() - lastTime > SESSION_TTL) {
        return { ...empty, terminalId: currentTerminal };
      }
    }
    
    return { ...empty, ...session, entries: session.entries, terminalId: currentTerminal };
  } catch {
    return empty;
  }
}

// ─── Save session ───────────────────────────────────────────────────────────

function saveSession(session) {
  try {
    ensureDirs();
    // Trim entries
    if (session.entries.length > MAX_ENTRIES) {
      session.entries = session.entries.slice(-MAX_ENTRIES);
    }
    fs.writeFileSync(SESSION_FILE, JSON.stringify(session), { mode: 0o600 });
    tightenSessionFilePerms();
  } catch { /* ignore write errors */ }
}

// ─── Add entry ──────────────────────────────────────────────────────────────

function addEntry(command, output, exitCode, intent) {
  const session = loadSession();
  session.entries.push({
    command,
    output: output ? output.slice(0, MAX_OUTPUT) : '',
    exitCode,
    intent: intent || '',
    time: Date.now(),
  });
  saveSession(session);
  return session;
}

// ─── Get session history formatted for LLM ──────────────────────────────────

function getHistory() {
  const session = loadSession();
  if (!session.entries.length) return null;

  // Return compact array — only last 5 entries, minimal data
  const compact = session.entries.slice(-5).map(e => {
    const h = { cmd: e.command, ok: e.exitCode === 0 };
    if (e.intent) h.q = e.intent;
    // Include output snippet — follow-ups need prior output (e.g. "delete those files")
    if (e.output) {
      const maxOut = e.exitCode !== 0 ? 300 : 300;
      h.out = e.output.length > maxOut ? e.output.slice(0, maxOut) + '…' : e.output;
    }
    return h;
  });

  return compact;
}

// ─── Task state management (for multi-step tasks) ───────────────────────────

function setTaskState(taskId, steps, currentStep) {
  const session = loadSession();
  session.taskId = taskId;
  session.taskSteps = steps;
  session.taskCurrentStep = currentStep || 0;
  saveSession(session);
}

function getTaskState() {
  const session = loadSession();
  return {
    taskId: session.taskId,
    steps: session.taskSteps,
    currentStep: session.taskCurrentStep || 0,
  };
}

function clearTaskState() {
  const session = loadSession();
  session.taskId = null;
  session.taskSteps = null;
  session.taskCurrentStep = 0;
  saveSession(session);
}

// ─── Set user intent for next entry ─────────────────────────────────────────

let _pendingIntent = '';

function setUserIntent(intent) {
  _pendingIntent = intent;
}

function getUserIntent() {
  const i = _pendingIntent;
  _pendingIntent = '';
  return i;
}

// ─── Clear entire session ───────────────────────────────────────────────────

function clearSession() {
  try {
    fs.unlinkSync(SESSION_FILE);
  } catch { /* ignore if already gone */ }
}

module.exports = {
  loadSession,
  saveSession,
  addEntry,
  getHistory,
  setTaskState,
  getTaskState,
  clearTaskState,
  clearSession,
  setUserIntent,
  getUserIntent,
};
