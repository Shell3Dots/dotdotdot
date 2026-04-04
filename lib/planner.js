'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// planner.js — Multi-step task orchestrator (compact, minimal output)
// ─────────────────────────────────────────────────────────────────────────────

const { bold, dim, cyan, green, red, yellow, symbols } = require('./colors');
const { Spinner, stepLine, taskPlan, printError, printWarning, printInfo, commandBox, truncate } = require('./renderer');
const { runCommand, copyToClipboard, stripShellWrapper } = require('./executor');
const { selectMenu, confirm } = require('./menu');
const { analyzeSteps } = require('./safety');
const { queryLLM } = require('./llm');
const { setUserIntent, addEntry } = require('./session');
const { recordUsage, tokenLine, estimateCost } = require('./tokens');

async function runTask(userInput, context, config, opts = {}) {
  const debug = opts.debug || false;
  // ─── Plan ─────────────────────────────────────────────────────────────
  const spinner = new Spinner('planning...').start();

  let plan;
  try {
    plan = await queryLLM(userInput, context, config, 'task');
  } catch (err) {
    spinner.fail(err.message);
    if (err.debugLog) {
      const { subtle } = require('./renderer');
      process.stderr.write(`  ${subtle('log: ' + err.debugLog)}\n`);
    }
    process.exit(1);
  }

  if (!plan?.steps?.length) {
    // Show the summary if the LLM explained why (e.g. "no_git is true")
    const reason = plan?.summary || 'No steps generated. Try rephrasing.';
    spinner.fail(reason);
    if (plan?._debugLog) {
      const { subtle } = require('./renderer');
      process.stderr.write(`  ${subtle('log: ' + plan._debugLog)}\n`);
    }
    process.exit(1);
  }

  // Record and display token usage
  const tokenUsage = plan._tokenUsage;
  if (tokenUsage) {
    recordUsage(tokenUsage, config.provider, config.model);
  }

  const steps = analyzeSteps(plan.steps);
  const cost = estimateCost(tokenUsage, config.provider, config.model);
  const costStr = cost ? dim(` ~$${cost}`) : '';
  spinner.succeed(`${steps.length} steps planned | ${tokenLine(tokenUsage)}${costStr}`);

  if (debug && plan._debugLog) {
    const { subtle } = require('./renderer');
    process.stderr.write(`  ${subtle('log: ' + plan._debugLog)}\n`);
  }

  // ─── Show plan ────────────────────────────────────────────────────────
  if (plan.summary) printInfo(plan.summary);
  console.log();
  console.log(taskPlan(steps));

  const hasRisk = steps.some(s => s.computedRisk === 'high');
  if (hasRisk) printWarning('has destructive steps — will ask before those');

  console.log();
  const proceed = await selectMenu([
    { label: 'Run', key: 'a' },
    { label: 'Step by step', key: 's' },
    { label: 'Copy', key: 'c' },
    { label: 'Cancel', key: 'q' },
  ]);

  if (!proceed || proceed === 'q') { console.log(`  ${dim('cancelled')}`); return; }

  if (proceed === 'c') {
    const all = steps.map((s, i) => `# ${i+1}. ${s.description}\n${s.command}`).join('\n\n');
    if (copyToClipboard(all)) console.log(`  ${green(symbols.check)} ${dim('copied')}`);
    else console.log('\n' + all + '\n');
    return;
  }

  const stepByStep = proceed === 's';

  // ─── Execute ──────────────────────────────────────────────────────────
  const states = new Array(steps.length).fill('pending'); // done, fail, skip, pending
  let aborted = false;

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    states[i] = 'current';

    // Print current step header
    console.log();
    console.log(stepLine(i, steps.length, step.description, 'current'));
    if (step.command) {
      const w = (process.stdout.columns || 80) - 12;
      console.log(`    ${dim('$')} ${dim(truncate(step.command, w))}`);
    }

    // Only pause if: step-by-step mode, or this specific step is high-risk
    const needsOk = stepByStep || step.computedRisk === 'high';

    if (needsOk) {
      const action = await selectMenu([
        { label: 'Run', key: 'e' },
        { label: 'Skip', key: 's' },
        { label: 'Abort', key: 'q' },
      ]);

      if (!action || action === 'q') { aborted = true; states[i] = 'skip'; break; }
      if (action === 's') { states[i] = 'skip'; continue; }
    }

    // Execute
    setUserIntent(`${userInput} [${i+1}/${steps.length}]`);

    // Safety: strip shell wrappers if the LLM accidentally added them
    // (e.g. "powershell -Command ..." when already running in PowerShell)
    const cmd = stripShellWrapper(step.command);

    // Always show output to the user — never use captureOnly in task mode.
    // Output is captured via the returned string regardless.
    const { code, output } = await runCommand(cmd, config, {
      silent: false,
      captureOnly: false,
    });

    if (code === 0) {
      states[i] = 'done';
    } else {
      states[i] = 'fail';

      // In "Run" mode, auto-continue on failure (user chose to run all steps).
      // In "Step by step" mode, ask what to do.
      if (stepByStep) {
        const next = await selectMenu([
          { label: 'Continue', key: 'c' },
          { label: 'Retry', key: 'r' },
          { label: 'Abort', key: 'q' },
        ]);
        if (!next || next === 'q') { aborted = true; break; }
        if (next === 'r') { states[i] = 'pending'; i--; continue; }
      }
      // In "Run" mode, just continue to next step automatically
    }

    if (step.captureOutput && output) {
      addEntry(step.command, output, code, `step ${i+1}`);
    }
  }

  // ─── Summary (one line) ───────────────────────────────────────────────
  const ok = states.filter(s => s === 'done').length;
  const fail = states.filter(s => s === 'fail').length;
  const skip = states.filter(s => s === 'skip').length;

  console.log();
  let line = `  ${ok === steps.length ? green(symbols.check) : yellow(symbols.warning)} ${ok}/${steps.length} done`;
  if (fail) line += `  ${red(fail + ' failed')}`;
  if (skip) line += `  ${yellow(skip + ' skipped')}`;
  console.log(line);

  process.exit(fail > 0 ? 1 : 0);
}

module.exports = { runTask };
