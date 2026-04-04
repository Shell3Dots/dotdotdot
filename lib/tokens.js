'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// tokens.js — Token usage tracking & cumulative stats
// ─────────────────────────────────────────────────────────────────────────────

const fs   = require('fs');
const path = require('path');
const { CONFIG_DIR, ensureDirs } = require('./config');
const { dim, cyan, yellow, green, gray, bold, brightWhite, c256 } = require('./colors');

const TOKENS_FILE = path.join(CONFIG_DIR, 'token-usage.json');

// ─── Pricing per 1M tokens (USD) ───────────────────────────────────────────
// Format: { input: $/1M input tokens, output: $/1M output tokens }
// Prices sourced from provider pricing pages. Update as needed.

const PRICING = {
  // ── OpenRouter models ──
  'google/gemma-4-26b-a4b-it':                   { input: 0.10, output: 0.10 },
  'google/gemini-2.5-flash-preview:thinking':     { input: 0.15, output: 3.50 },
  'openai/gpt-4o-mini':                           { input: 0.15, output: 0.60 },
  'anthropic/claude-3.5-haiku':                   { input: 0.80, output: 4.00 },
  'meta-llama/llama-3.1-70b-instruct':            { input: 0.40, output: 0.40 },
  'google/gemini-2.0-flash-001':                  { input: 0.10, output: 0.40 },

  // ── Anthropic direct ──
  'claude-haiku-4-5-20251001':                    { input: 0.80, output: 4.00 },
  'claude-sonnet-4-20250514':                     { input: 3.00, output: 15.00 },
  'claude-3-5-haiku-20241022':                    { input: 0.80, output: 4.00 },

  // ── OpenAI direct ──
  'gpt-4o-mini':                                  { input: 0.15, output: 0.60 },
  'gpt-4o':                                       { input: 2.50, output: 10.00 },
  'gpt-4-turbo':                                  { input: 10.00, output: 30.00 },

  // ── Google Gemini direct ──
  'gemini-2.0-flash':                             { input: 0.10, output: 0.40 },
  'gemini-2.0-flash-lite':                        { input: 0.075, output: 0.30 },
  'gemini-1.5-pro':                               { input: 1.25, output: 5.00 },
};

// ─── User-defined pricing (from config.json) ───────────────────────────────

function loadUserPricing() {
  try {
    const { loadConfig } = require('./config');
    const config = loadConfig();
    return config.pricing || {};
  } catch { return {}; }
}

// Check user pricing first, then hardcoded, with fuzzy fallback
function getModelPricing(model) {
  // 1. User-defined exact match
  const userPricing = loadUserPricing();
  if (userPricing[model]) return userPricing[model];

  // 2. Hardcoded exact match
  if (PRICING[model]) return PRICING[model];

  // 3. Fuzzy match across both (user first, then hardcoded)
  for (const [key, val] of Object.entries(userPricing)) {
    if (key.includes(model) || model.includes(key)) return val;
  }
  for (const [key, val] of Object.entries(PRICING)) {
    if (key.includes(model) || model.includes(key)) return val;
  }
  return null;
}

function saveUserPricing(model, input, output) {
  const { loadConfig, saveConfig } = require('./config');
  const config = loadConfig();
  if (!config.pricing) config.pricing = {};
  config.pricing[model] = { input, output };
  saveConfig(config);
}

// ─── Estimate cost for a single request ─────────────────────────────────────

function estimateCost(tokenUsage, provider, model) {
  if (!tokenUsage) return null;
  const pricing = getModelPricing(model);
  if (!pricing) return null;
  const inputCost  = (tokenUsage.inputTokens / 1_000_000) * pricing.input;
  const outputCost = (tokenUsage.outputTokens / 1_000_000) * pricing.output;
  const total = inputCost + outputCost;
  if (total < 0.000001) return '0.000000';
  if (total < 0.01) return total.toFixed(6);
  if (total < 1) return total.toFixed(4);
  return total.toFixed(2);
}

// ─── Load / Save ────────────────────────────────────────────────────────────

function loadUsage() {
  try {
    const raw = fs.readFileSync(TOKENS_FILE, 'utf8');
    return JSON.parse(raw);
  } catch {
    return {
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalTokens: 0,
      requestCount: 0,
      history: [],        // last 50 entries
      firstUsed: null,
    };
  }
}

function saveUsage(data) {
  ensureDirs();
  fs.writeFileSync(TOKENS_FILE, JSON.stringify(data, null, 2), { mode: 0o600 });
}

// ─── Record a request ───────────────────────────────────────────────────────

function recordUsage(tokenUsage, provider, model) {
  if (!tokenUsage) return;

  const cost = estimateCost(tokenUsage, provider, model);
  const costNum = cost ? parseFloat(cost) : 0;

  const data = loadUsage();
  const entry = {
    inputTokens: tokenUsage.inputTokens || 0,
    outputTokens: tokenUsage.outputTokens || 0,
    totalTokens: tokenUsage.totalTokens || 0,
    estimated: !!tokenUsage.estimated,
    cost: costNum,
    provider,
    model,
    timestamp: new Date().toISOString(),
  };

  data.totalInputTokens  += entry.inputTokens;
  data.totalOutputTokens += entry.outputTokens;
  data.totalTokens       += entry.totalTokens;
  data.totalCost          = (data.totalCost || 0) + costNum;
  data.requestCount      += 1;
  if (!data.firstUsed) data.firstUsed = entry.timestamp;

  // Keep last 50 entries
  data.history.push(entry);
  while (data.history.length > 50) data.history.shift();

  saveUsage(data);
  return entry;
}

// ─── Format token count for display ─────────────────────────────────────────

function formatTokens(n) {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
  return String(n);
}

// ─── Inline display (after a request) ───────────────────────────────────────

const subtle = c256(240);
const tokenColor = c256(39);

function tokenLine(tokenUsage) {
  if (!tokenUsage) return '';
  const est = tokenUsage.estimated ? ' ~' : '';
  const input  = formatTokens(tokenUsage.inputTokens);
  const output = formatTokens(tokenUsage.outputTokens);
  const total  = formatTokens(tokenUsage.totalTokens);
  return `${subtle('tokens:')} ${tokenColor(input)}${subtle(' in')} ${tokenColor(output)}${subtle(' out')} ${subtle('(')}${tokenColor(total)}${subtle(' total')}${est}${subtle(')')}`;
}

// ─── Full stats display (for --tokens flag) ─────────────────────────────────

function formatCost(cost) {
  if (!cost || cost === 0) return '$0.00';
  if (cost < 0.01) return `$${cost.toFixed(6)}`;
  if (cost < 1) return `$${cost.toFixed(4)}`;
  return `$${cost.toFixed(2)}`;
}

function printTokenStats() {
  const { printBanner } = require('./renderer');
  const data = loadUsage();

  printBanner();

  if (data.requestCount === 0) {
    console.log();
    console.log(`  ${subtle('No usage recorded yet. Start with:')} ${brightWhite('... <your request>')}`);
    console.log();
    return;
  }

  const avgInput  = Math.round(data.totalInputTokens / data.requestCount);
  const avgOutput = Math.round(data.totalOutputTokens / data.requestCount);
  const avgTotal  = Math.round(data.totalTokens / data.requestCount);
  const totalCost = data.totalCost || 0;
  const avgCost   = totalCost / data.requestCount;
  const costColor = c256(220); // gold
  const headerColor = c256(39); // bright blue
  const lineChar = '\u2500';
  const w = 44;

  console.log();

  // ── Totals ──
  console.log(`  ${headerColor(bold('Totals'))}`);
  console.log(`  ${subtle(lineChar.repeat(w))}`);
  console.log(`    ${subtle('Requests')}       ${brightWhite(String(data.requestCount))}`);
  console.log(`    ${subtle('Input')}          ${tokenColor(formatTokens(data.totalInputTokens))} ${subtle('tokens')}`);
  console.log(`    ${subtle('Output')}         ${tokenColor(formatTokens(data.totalOutputTokens))} ${subtle('tokens')}`);
  console.log(`    ${subtle('Combined')}       ${tokenColor(formatTokens(data.totalTokens))} ${subtle('tokens')}`);
  console.log(`    ${subtle('Cost')}           ${costColor(formatCost(totalCost))}`);
  console.log();

  // ── Averages ──
  console.log(`  ${headerColor(bold('Per Request'))}`);
  console.log(`  ${subtle(lineChar.repeat(w))}`);
  console.log(`    ${subtle('Input')}          ${tokenColor(formatTokens(avgInput))}`);
  console.log(`    ${subtle('Output')}         ${tokenColor(formatTokens(avgOutput))}`);
  console.log(`    ${subtle('Combined')}       ${tokenColor(formatTokens(avgTotal))}`);
  console.log(`    ${subtle('Cost')}           ${costColor(formatCost(avgCost))}`);

  // ── Recent ──
  if (data.history.length > 0) {
    console.log();
    console.log(`  ${headerColor(bold('Recent'))}`);
    console.log(`  ${subtle(lineChar.repeat(w))}`);
    const recent = data.history.slice(-5);
    for (let i = 0; i < recent.length; i++) {
      const entry = recent[i];
      const date = new Date(entry.timestamp);
      const ts = `${(date.getMonth()+1).toString().padStart(2,'0')}/${date.getDate().toString().padStart(2,'0')} ${date.getHours().toString().padStart(2,'0')}:${date.getMinutes().toString().padStart(2,'0')}`;
      const model = entry.model.split('/').pop();
      const est = entry.estimated ? subtle('~') : '';
      const entryCost = entry.cost ? costColor(formatCost(entry.cost)) : subtle('—');
      console.log(`    ${subtle(ts)}  ${tokenColor(formatTokens(entry.totalTokens))}${est} ${subtle('tokens')}  ${entryCost}  ${subtle(model)}`);
    }
  }

  // ── Footer ──
  if (data.firstUsed) {
    console.log();
    console.log(`  ${subtle('tracking since ' + new Date(data.firstUsed).toLocaleDateString())}`);
  }
  console.log();
}

async function printTokenStatsInteractive() {
  const { selectMenu } = require('./menu');
  const { printSuccess } = require('./renderer');

  printTokenStats();

  const choice = await selectMenu([
    { label: 'Exit', key: 'q' },
    { label: 'Reset usage', key: 'r' },
  ]);

  if (choice === 'r') {
    resetUsage();
    printSuccess('Usage stats reset.');
    console.log();
  }
}

// ─── Reset stats ────────────────────────────────────────────────────────────

function resetUsage() {
  try {
    fs.unlinkSync(TOKENS_FILE);
  } catch { /* ignore */ }
}

module.exports = {
  recordUsage,
  tokenLine,
  estimateCost,
  getModelPricing,
  saveUserPricing,
  printTokenStats,
  printTokenStatsInteractive,
  resetUsage,
  formatTokens,
  formatCost,
  loadUsage,
  PRICING,
};
