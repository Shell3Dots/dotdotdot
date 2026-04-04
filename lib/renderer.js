'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// renderer.js — Premium terminal UI
// ─────────────────────────────────────────────────────────────────────────────

const { bold, dim, cyan, gray, green, yellow, red, brightWhite, brightCyan,
        stripAnsi, visibleLength, symbols, c256, rgb, bg256 } = require('./colors');

const termWidth = () => Math.min(process.stdout.columns || 80, 90);

// ─── Accent colors ──────────────────────────────────────────────────────────

const dot1 = c256(39);   // bright blue
const dot2 = c256(44);   // teal
const dot3 = c256(49);   // mint
const accent = c256(39);  // bright blue
const subtle = c256(240); // dark gray
const mid = c256(245);    // medium gray

// ─── Truncate ───────────────────────────────────────────────────────────────

function truncate(str, max) {
  if (!str) return str;
  if (str.length <= max) return str;
  return str.slice(0, max - 1) + '\u2026';
}

function wordWrap(str, max, indent = '  ') {
  if (!str || str.length <= max) return indent + str;
  const words = str.split(' ');
  const lines = [];
  let line = '';
  for (const word of words) {
    if (line && (line.length + 1 + word.length) > max) {
      lines.push(indent + line);
      line = word;
    } else {
      line = line ? line + ' ' + word : word;
    }
  }
  if (line) lines.push(indent + line);
  return lines.join('\n');
}

// ─── Command display ────────────────────────────────────────────────────────

function commandBox(command, explanation, warning) {
  const w = termWidth() - 6;
  const out = [];
  if (warning) out.push(`  ${yellow(symbols.warning)} ${dim(warning)}`);
  out.push(`  ${accent('\u276F')} ${bold(brightWhite(truncate(command, w)))}`);
  if (explanation) out.push(subtle(wordWrap(explanation, w)));
  return out.join('\n');
}

// ─── Step line ──────────────────────────────────────────────────────────────

function stepLine(i, total, label, state) {
  const num = subtle(`${i+1}/${total}`);
  if (state === 'done')    return `  ${green(symbols.check)} ${num} ${mid(label)}`;
  if (state === 'current') return `  ${accent(symbols.arrowRight)} ${num} ${brightWhite(label)}`;
  if (state === 'skip')    return `  ${yellow('-')} ${num} ${subtle(label)}`;
  if (state === 'fail')    return `  ${red(symbols.cross)} ${num} ${subtle(label)}`;
  return `  ${subtle('\u2500')} ${num} ${subtle(label)}`;
}

// ─── Spinner ────────────────────────────────────────────────────────────────

class Spinner {
  constructor(message = '', color = accent) {
    this.message = message;
    this.color = color;
    this.frameIndex = 0;
    this.interval = null;
    this.stream = process.stderr;
  }

  start() {
    if (!this.stream.isTTY) return this;
    this.stream.write('\x1b[?25l');
    this.interval = setInterval(() => {
      const f = symbols.spinnerFrames[this.frameIndex];
      this.frameIndex = (this.frameIndex + 1) % symbols.spinnerFrames.length;
      this.stream.write(`\r\x1b[2K  ${this.color(f)} ${subtle(this.message)}`);
    }, 80);
    return this;
  }

  update(msg) { this.message = msg; }

  succeed(msg) {
    this._end();
    this.stream.write(`\r\x1b[2K  ${green(symbols.check)} ${subtle(msg || this.message)}\n`);
  }

  fail(msg) {
    this._end();
    this.stream.write(`\r\x1b[2K  ${red(symbols.cross)} ${msg || this.message}\n`);
  }

  stop() { this._end(); this.stream.write('\r\x1b[2K'); }

  _end() {
    if (this.interval) { clearInterval(this.interval); this.interval = null; }
    if (this.stream.isTTY) this.stream.write('\x1b[?25h');
  }
}

// ─── Banner ─────────────────────────────────────────────────────────────────

function printBanner() {
  console.log();
  console.log(`  ${dot1('\u25CF')} ${dot2('\u25CF')} ${dot3('\u25CF')}  ${bold(brightWhite('dotdotdot'))}`);
}

// ─── Task plan ──────────────────────────────────────────────────────────────

function taskPlan(steps) {
  const w = termWidth() - 12;
  const lines = [];
  for (let i = 0; i < steps.length; i++) {
    const s = steps[i];
    const risk = s.computedRisk === 'high' ? red('!') : s.computedRisk === 'medium' ? yellow('~') : subtle('\u2500');
    lines.push(`  ${risk} ${subtle(`${i+1}.`)} ${truncate(s.description, w)}`);
    if (s.command) lines.push(`    ${subtle('$')} ${subtle(truncate(s.command, w - 4))}`);
  }
  return lines.join('\n');
}

// ─── One-liners ─────────────────────────────────────────────────────────────

function printError(msg)   { console.error(`  ${red(symbols.cross)} ${msg}`); }
function printWarning(msg) { console.error(`  ${yellow(symbols.warning)} ${msg}`); }
function printSuccess(msg) { console.log(`  ${green(symbols.check)} ${msg}`); }
function printInfo(msg)    { console.log(`  ${subtle(msg)}`); }
function keyValue(label, value, indent = 4) {
  return `${' '.repeat(indent)}${subtle(label)} ${brightWhite(value)}`;
}

module.exports = {
  commandBox, stepLine, Spinner, printBanner, taskPlan, truncate,
  printError, printWarning, printSuccess, printInfo, keyValue, termWidth,
  accent, subtle, mid, dot1, dot2, dot3,
};
