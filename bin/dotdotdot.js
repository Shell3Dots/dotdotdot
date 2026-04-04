#!/usr/bin/env node
'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// dotdotdot — plain English to terminal commands
// ─────────────────────────────────────────────────────────────────────────────

// ─── Global cleanup: restore terminal on any exit ───────────────────────────
function cleanup() {
  try {
    if (process.stdin.isTTY && process.stdin.isRaw) process.stdin.setRawMode(false);
    process.stdin.pause();
    process.stdout.write('\x1b[?25h'); // restore cursor
  } catch { /* ignore */ }
}
process.on('exit', cleanup);
process.on('SIGINT', () => { cleanup(); process.exit(130); });
process.on('SIGTERM', () => { cleanup(); process.exit(143); });

const args = process.argv.slice(2);

let userInput = '';
let flags = {
  task: false, help: false,
  config: false, debug: false, version: false, usage: false,
  resetTokens: false, clearSession: false,
  provider: null,
};

for (let i = 0; i < args.length; i++) {
  const a = args[i];
  switch (a) {
    case '-t': case '--task':    flags.task = true; break;
    case '-p': case '--provider': if (args[i+1]) flags.provider = args[++i]; break;
    case '-u': case '--usage':   flags.usage = true; break;
    case '-c': case '--config':  flags.config = true; break;
    case '-h': case '--help':    flags.help = true; break;
    case '-d': case '--debug':   flags.debug = true; break;
    case '-v': case '--version': flags.version = true; break;
     case '--reset-usage':        flags.resetTokens = true; break;
     case '--clear':              flags.clearSession = true; break;
    default: if (!a.startsWith('-')) userInput += (userInput ? ' ' : '') + a; break;
  }
}

(async () => {
  try {
    const pkg = require('../package.json');

    if (flags.version) { console.log(pkg.version); process.exit(0); }
    if (flags.resetTokens) {
      require('../lib/tokens').resetUsage();
      require('../lib/renderer').printSuccess('Token usage stats reset.');
      process.exit(0);
    }
    if (flags.clearSession) {
      require('../lib/session').clearSession();
      require('../lib/renderer').printSuccess('Session cleared. Context will be fresh on next run.');
      process.exit(0);
    }
    if (flags.usage) {
      await require('../lib/tokens').printTokenStatsInteractive();
      process.exit(0);
    }
    if (flags.help || !userInput.trim() && !flags.config) {
      require('../lib/ui').printHelp(); process.exit(0);
    }

    const { loadConfig, resolveProvider, getAllProviderIds } = require('../lib/config');
    const config = loadConfig();
    if (flags.provider) {
      const resolved = resolveProvider(flags.provider);
      if (!resolved) {
        require('../lib/renderer').printError(`Unknown provider "${flags.provider}". Use: ${getAllProviderIds().join(', ')}`);
        process.exit(1);
      }
      config.provider = resolved;
      const a = config.providers[resolved];
      if (a) { config.apiKey = a.apiKey; config.model = a.model; config.apiUrl = a.apiUrl; }
    }

    if (flags.config) { await require('../lib/ui').printConfig(config); process.exit(0); }

    if (!config.apiKey) {
      const { printError } = require('../lib/renderer');
      printError(`No API key for ${config.provider}. Run ${require('../lib/colors').cyan('... -c')}`);
      process.exit(1);
    }

    // ─── Gather context ───────────────────────────────────────────────────
    const { gatherContext } = require('../lib/context');
    const { Spinner } = require('../lib/renderer');
    const { detectMode, queryLLM } = require('../lib/llm');
    const { setUserIntent } = require('../lib/session');
    const { recordUsage } = require('../lib/tokens');

    const t0 = Date.now();
    const spin = new Spinner('...').start();
    const context = await gatherContext();
    const ctxMs = Date.now() - t0;

    // ─── Detect mode ──────────────────────────────────────────────────────
    const mode = flags.task ? 'task' : detectMode(userInput);

    if (flags.debug) {
      spin.succeed(`ctx ${ctxMs}ms | ${config.provider}/${config.model} | mode: ${mode}`);
    }

    // ─── Task mode ────────────────────────────────────────────────────────
    if (mode === 'task') {
      if (!flags.debug) spin.succeed('ready');
      setUserIntent(userInput);
      const { runTask } = require('../lib/planner');
      await runTask(userInput, context, config, { debug: flags.debug });
      return;
    }

    // ─── Quick mode ───────────────────────────────────────────────────────
    spin.update('thinking...');
    let result;
    try {
      result = await queryLLM(userInput, context, config, 'quick');
    } catch (err) {
      spin.fail(err.message);
      if (flags.debug && err.debugLog) {
        const { subtle } = require('../lib/renderer');
        process.stderr.write(`  ${subtle('log: ' + err.debugLog)}\n`);
      }
      process.exit(1);
    }

    const totalMs = Date.now() - t0;

    // Record token usage
    const tokenUsage = result?._tokenUsage;
    if (tokenUsage) {
      recordUsage(tokenUsage, config.provider, config.model);
    }

    if (flags.debug) {
      spin.succeed(`done ${totalMs}ms`);
      if (result?._debugLog) {
        const { subtle } = require('../lib/renderer');
        process.stderr.write(`  ${subtle('log: ' + result._debugLog)}\n`);
      }
    } else {
      spin.succeed('done');
    }

    if (!result?.command) {
      require('../lib/renderer').printError('No command generated. Try rephrasing.');
      process.exit(1);
    }

    setUserIntent(userInput);

    if (config.autoExec) {
      const { executeMode } = require('../lib/executor');
      await executeMode(result, config);
    } else {
      const { interactiveMode } = require('../lib/executor');
      await interactiveMode(result, config, context);
    }

  } catch (err) {
    require('../lib/renderer').printError(err.message || 'Unexpected error');
    if (flags.debug) console.error(err.stack);
    process.exit(1);
  }
})();
