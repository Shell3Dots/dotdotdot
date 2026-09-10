'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// planner.js — Multi-step task orchestrator (compact, minimal output)
// ─────────────────────────────────────────────────────────────────────────────

const { dim, green, red, yellow, symbols } = require('./colors');
const { Spinner, stepLine, taskPlan, printWarning, printInfo, truncate } = require('./renderer');
const { runCommand, copyToClipboard, stripShellWrapper } = require('./executor');
const { selectMenu } = require('./menu');
const { analyzeSteps, decideRunPolicy, highRiskBlocked } = require('./safety');
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
  if (hasRisk) {
    if (config.allowDangerous) printWarning('has destructive steps — --allow-dangerous is set');
    else printWarning('has destructive steps — will ask before those (or skip with --yes)');
  }

  const policy = decideRunPolicy({
    isTty: !!(process.stdin.isTTY && process.stdout.isTTY),
    yes: config.yes,
    autoExec: config.autoExec,
    allowDangerous: config.allowDangerous,
    riskLevel: hasRisk ? 'high' : 'low',
  });

  let stepByStep = false;

  if (policy === 'insert') {
    console.log();
    process.stderr.write(`  ${dim('not a TTY — printed plan, did not run. Pass --yes to execute.')}\n`);
    const all = steps.map((s, i) => `# ${i + 1}. ${s.description}\n${s.command}`).join('\n\n');
    process.stdout.write(all + '\n');
    process.exit(0);
  }

  const skipPlanConfirm = policy === 'execute' || !!(config.yes || config.autoExec);

  if (!skipPlanConfirm) {
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

    stepByStep = proceed === 's';
  }

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

    const skipConfirm = skipPlanConfirm;
    const stepBlocked = highRiskBlocked(step.computedRisk, config.allowDangerous);

    if (skipConfirm && stepBlocked) {
      printWarning(`skipped high-risk step ${i + 1} (pass --allow-dangerous to run)`);
      states[i] = 'skip';
      continue;
    }

    // Pause if: step-by-step, or this step is high-risk in interactive mode
    const needsOk = !skipConfirm && (stepByStep || step.computedRisk === 'high');

    if (needsOk) {
      const action = await selectMenu([
        { label: 'Run', key: 'e', disabled: stepBlocked && !config.allowDangerous },
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
      if (stepByStep && process.stdin.isTTY && !config.yes) {
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
