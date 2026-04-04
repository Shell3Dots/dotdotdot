'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// menu.js — Compact keyboard-driven menus
// ─────────────────────────────────────────────────────────────────────────────

const { bold, dim, cyan, gray, green, yellow, brightWhite, symbols, c256 } = require('./colors');

const accent = c256(39);
const subtle = c256(240);

// ─── Select menu ────────────────────────────────────────────────────────────

function selectMenu(options) {
  return new Promise((resolve) => {
    if (!process.stdin.isTTY) {
      const first = options.find(o => !o.disabled);
      return resolve(first ? first.key : null);
    }

    let sel = options.findIndex(o => !o.disabled);
    if (sel === -1) sel = 0;

    const draw = () => options.map((o, i) => {
      const active = i === sel;
      const pre = active ? accent('\u276F') : ' ';
      const key = subtle(o.key);
      if (o.disabled) return `  ${pre} ${subtle(o.label)} ${subtle('blocked')}`;
      return active ? `  ${pre} ${bold(brightWhite(o.label))} ${key}` : `  ${pre} ${subtle(o.label)} ${key}`;
    }).join('\n');

    process.stdout.write('\n' + draw() + '\n');
    const lc = options.length + 1;

    process.stdin.setRawMode(true);
    process.stdin.resume();

    const done = () => {
      try { process.stdin.setRawMode(false); } catch { /* ignore */ }
      process.stdin.pause();
      process.stdin.removeListener('data', onKey);
    };
    const redraw = () => { process.stdout.write(`\x1b[${lc}A\x1b[0J\n${draw()}\n`); };

    const onKey = (buf) => {
      const k = buf.toString();
      if (k === '\x03') { done(); process.stdout.write('\n'); return resolve(null); }

      if (k === '\r' || k === '\n') {
        const o = options[sel];
        if (o && !o.disabled) { done(); process.stdout.write(`\x1b[${lc}A\x1b[0J  ${green(symbols.check)} ${subtle(o.label)}\n`); return resolve(o.key); }
        return;
      }

      if (k === '\x1b[A' || k === 'k') { let n = sel - 1; while (n >= 0 && options[n].disabled) n--; if (n >= 0) { sel = n; redraw(); } }
      else if (k === '\x1b[B' || k === 'j') { let n = sel + 1; while (n < options.length && options[n].disabled) n++; if (n < options.length) { sel = n; redraw(); } }

      const sc = options.find(o => o.key === k && !o.disabled);
      if (sc) { done(); process.stdout.write(`\x1b[${lc}A\x1b[0J  ${green(symbols.check)} ${subtle(sc.label)}\n`); return resolve(sc.key); }
    };

    process.stdin.on('data', onKey);
  });
}

// ─── Confirm ────────────────────────────────────────────────────────────────

function confirm(message, defaultYes = false) {
  return new Promise((resolve) => {
    if (!process.stdin.isTTY) return resolve(defaultYes);
    const hint = defaultYes ? 'Y/n' : 'y/N';
    process.stdout.write(`  ${accent('\u276F')} ${message} ${subtle(hint)} `);
    process.stdin.setRawMode(true);
    process.stdin.resume();
    const onKey = (buf) => {
      const k = buf.toString().toLowerCase();
      try { process.stdin.setRawMode(false); } catch { /* ignore */ }
      process.stdin.pause(); process.stdin.removeListener('data', onKey);
      if (k === '\x03') { process.stdout.write('\n'); return resolve(false); }
      if (k === '\r' || k === '\n') { process.stdout.write(defaultYes ? 'y\n' : 'n\n'); return resolve(defaultYes); }
      process.stdout.write(k === 'y' ? 'y\n' : 'n\n');
      resolve(k === 'y');
    };
    process.stdin.on('data', onKey);
  });
}

// ─── Text input ─────────────────────────────────────────────────────────────

function textInput(message, defaultValue = '', opts = {}) {
  const readline = require('readline');
  const displayDefault = opts.displayDefault !== undefined ? opts.displayDefault : defaultValue;
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const prompt = `  ${accent('\u276F')} ${message}${displayDefault ? subtle(` (${displayDefault})`) : ''}: `;
    rl.question(prompt, (ans) => { rl.close(); resolve(ans.trim() || defaultValue); });
  });
}

module.exports = { selectMenu, confirm, textInput };
