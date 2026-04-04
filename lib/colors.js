'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// colors.js — Zero-dependency ANSI color & styling system
// ─────────────────────────────────────────────────────────────────────────────

const isColorSupported = (() => {
  if (process.env.NO_COLOR) return false;
  if (process.env.FORCE_COLOR) return true;
  if (!process.stdout.isTTY) return false;
  if (process.platform === 'win32') return true; // Windows 10+ supports ANSI
  const term = process.env.TERM || '';
  return term !== 'dumb';
})();

const wrap = (open, close) => {
  if (!isColorSupported) return (s) => s;
  return (s) => `\x1b[${open}m${s}\x1b[${close}m`;
};

const rgb = (r, g, b) => {
  if (!isColorSupported) return (s) => s;
  return (s) => `\x1b[38;2;${r};${g};${b}m${s}\x1b[39m`;
};

const bgRgb = (r, g, b) => {
  if (!isColorSupported) return (s) => s;
  return (s) => `\x1b[48;2;${r};${g};${b}m${s}\x1b[49m`;
};

const c256 = (n) => {
  if (!isColorSupported) return (s) => s;
  return (s) => `\x1b[38;5;${n}m${s}\x1b[39m`;
};

const bg256 = (n) => {
  if (!isColorSupported) return (s) => s;
  return (s) => `\x1b[48;5;${n}m${s}\x1b[49m`;
};

// ─── Core styles ─────────────────────────────────────────────────────────────

const bold     = wrap(1, 22);
const dim      = wrap(2, 22);
const italic   = wrap(3, 23);
const underline = wrap(4, 24);
const inverse  = wrap(7, 27);
const strikethrough = wrap(9, 29);

// ─── Standard colors ─────────────────────────────────────────────────────────

const black   = wrap(30, 39);
const red     = wrap(31, 39);
const green   = wrap(32, 39);
const yellow  = wrap(33, 39);
const blue    = wrap(34, 39);
const magenta = wrap(35, 39);
const cyan    = wrap(36, 39);
const white   = wrap(37, 39);
const gray    = wrap(90, 39);

// ─── Bright colors ──────────────────────────────────────────────────────────

const brightRed     = wrap(91, 39);
const brightGreen   = wrap(92, 39);
const brightYellow  = wrap(93, 39);
const brightBlue    = wrap(94, 39);
const brightMagenta = wrap(95, 39);
const brightCyan    = wrap(96, 39);
const brightWhite   = wrap(97, 39);

// ─── Background colors ──────────────────────────────────────────────────────

const bgBlack   = wrap(40, 49);
const bgRed     = wrap(41, 49);
const bgGreen   = wrap(42, 49);
const bgYellow  = wrap(43, 49);
const bgBlue    = wrap(44, 49);
const bgMagenta = wrap(45, 49);
const bgCyan    = wrap(46, 49);
const bgWhite   = wrap(47, 49);

// ─── Semantic colors (for the ... UI) ────────────────────────────────────────

const themes = {
  default: {
    primary:    cyan,
    secondary:  blue,
    accent:     magenta,
    success:    green,
    warning:    yellow,
    danger:     red,
    info:       brightCyan,
    muted:      dim,
    highlight:  brightWhite,
    command:    (s) => bold(brightWhite(s)),
    step:       (s) => bold(cyan(s)),
    stepNum:    (s) => bold(brightCyan(s)),
    label:      (s) => bold(gray(s)),
    value:      brightWhite,
    separator:  (s) => gray(s),
    box: {
      border:   gray,
      bg:       bg256(236),
      title:    (s) => bold(cyan(s)),
    },
    spinner:    cyan,
    prompt:     (s) => bold(cyan(s)),
    selected:   (s) => bold(cyan(s)),
    unselected: gray,
  },
  midnight: {
    primary:    brightBlue,
    secondary:  magenta,
    accent:     brightMagenta,
    success:    brightGreen,
    warning:    brightYellow,
    danger:     brightRed,
    info:       brightCyan,
    muted:      dim,
    highlight:  brightWhite,
    command:    (s) => bold(brightWhite(s)),
    step:       (s) => bold(brightBlue(s)),
    stepNum:    (s) => bold(brightMagenta(s)),
    label:      (s) => bold(gray(s)),
    value:      brightWhite,
    separator:  (s) => gray(s),
    box: {
      border:   (s) => c256(60)(s),
      bg:       bg256(234),
      title:    (s) => bold(brightBlue(s)),
    },
    spinner:    brightMagenta,
    prompt:     (s) => bold(brightBlue(s)),
    selected:   (s) => bold(brightMagenta(s)),
    unselected: gray,
  },
  minimal: {
    primary:    white,
    secondary:  gray,
    accent:     white,
    success:    green,
    warning:    yellow,
    danger:     red,
    info:       white,
    muted:      dim,
    highlight:  bold,
    command:    (s) => bold(s),
    step:       (s) => bold(s),
    stepNum:    (s) => bold(s),
    label:      dim,
    value:      (s) => s,
    separator:  dim,
    box: {
      border:   dim,
      bg:       (s) => s,
      title:    bold,
    },
    spinner:    white,
    prompt:     bold,
    selected:   bold,
    unselected: dim,
  },
};

function getTheme(name) {
  return themes[name] || themes.default;
}

// ─── Utility: strip ANSI ────────────────────────────────────────────────────

function stripAnsi(s) {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\x1b\[[0-9;]*m/g, '');
}

function visibleLength(s) {
  return stripAnsi(s).length;
}

// ─── Symbols (with fallback for non-Unicode terminals) ──────────────────────

const isUnicode = (() => {
  const enc = (process.env.LANG || '').toLowerCase();
  return process.platform === 'win32' || enc.includes('utf') || enc.includes('unicode');
})();

const symbols = {
  dot:       isUnicode ? '\u2022' : '*',       // bullet
  ellipsis:  isUnicode ? '\u2026' : '...',
  arrow:     isUnicode ? '\u276F' : '>',        // ❯
  arrowDown: isUnicode ? '\u25BC' : 'v',
  arrowRight:isUnicode ? '\u25B6' : '>',
  check:     isUnicode ? '\u2714' : '+',        // check mark
  cross:     isUnicode ? '\u2718' : 'x',        // cross mark
  warning:   isUnicode ? '\u26A0' : '!',        // warning sign
  info:      isUnicode ? '\u2139' : 'i',        // info sign
  star:      isUnicode ? '\u2605' : '*',
  play:      isUnicode ? '\u25B6' : '>',
  pause:     isUnicode ? '\u23F8' : '||',
  gear:      isUnicode ? '\u2699' : '#',
  lightning: isUnicode ? '\u26A1' : '!',
  folder:    isUnicode ? '\uD83D\uDCC1' : '[D]',
  file:      isUnicode ? '\uD83D\uDCC4' : '[F]',
  lock:      isUnicode ? '\uD83D\uDD12' : '[L]',
  rocket:    isUnicode ? '\uD83D\uDE80' : '=>',
  // Box drawing
  topLeft:    isUnicode ? '\u256D' : '+',
  topRight:   isUnicode ? '\u256E' : '+',
  bottomLeft: isUnicode ? '\u2570' : '+',
  bottomRight:isUnicode ? '\u256F' : '+',
  horizontal: isUnicode ? '\u2500' : '-',
  vertical:   isUnicode ? '\u2502' : '|',
  teeRight:   isUnicode ? '\u251C' : '|',
  teeLeft:    isUnicode ? '\u2524' : '|',
  // Spinner frames
  spinnerFrames: isUnicode
    ? ['\u280B','\u2819','\u2839','\u2838','\u283C','\u2834','\u2826','\u2827','\u2807','\u280F']
    : ['-', '\\', '|', '/'],
  // Step indicators
  stepDone:    isUnicode ? '\u25C9' : '(x)',   // ◉
  stepCurrent: isUnicode ? '\u25CB' : '( )',   // ○
  stepPending: isUnicode ? '\u25CC' : '(.)',   // ◌
  stepSkipped: isUnicode ? '\u25CB' : '(-)',
};

module.exports = {
  // Core
  isColorSupported,
  wrap, rgb, bgRgb, c256, bg256,
  // Styles
  bold, dim, italic, underline, inverse, strikethrough,
  // Colors
  black, red, green, yellow, blue, magenta, cyan, white, gray,
  brightRed, brightGreen, brightYellow, brightBlue, brightMagenta, brightCyan, brightWhite,
  // Backgrounds
  bgBlack, bgRed, bgGreen, bgYellow, bgBlue, bgMagenta, bgCyan, bgWhite,
  // Theming
  themes, getTheme,
  // Utility
  stripAnsi, visibleLength,
  // Symbols
  symbols,
};
