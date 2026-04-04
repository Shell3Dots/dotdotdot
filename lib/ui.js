'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// ui.js — Help, config display, setup wizard
// ─────────────────────────────────────────────────────────────────────────────

const path = require('path');
const { bold, dim, cyan, gray, green, yellow, red, brightWhite, brightCyan, symbols, c256 } = require('./colors');
const { loadConfig, saveConfig, maskKey, PROVIDERS, getAllProviderIds, CONFIG_FILE } = require('./config');
const { textInput, selectMenu } = require('./menu');
const { printBanner, keyValue, printError, printSuccess, accent, subtle, mid, dot1, dot2, dot3 } = require('./renderer');
const { getModelPricing, PRICING } = require('./tokens');

const pkg = require(path.join(__dirname, '..', 'package.json'));

// ─── Help ───────────────────────────────────────────────────────────────────

function printHelp() {
  printBanner();
  console.log(`  ${subtle('say what you need. it handles the rest.')}`);
  console.log();
  const pad = (s, w) => s + ' '.repeat(Math.max(0, w - s.length));
  console.log(`  ${subtle('$')} ${pad('... kill node', 26)} ${subtle('$')} ... find .tmp then delete`);
  console.log(`  ${subtle('$')} ${pad('... show disk usage', 26)} ${subtle('$')} ... read desktop, reorganize`);
  console.log(`  ${subtle('$')} ${pad('... compress this folder', 26)} ${subtle('$')} ... build then deploy`);
  console.log();
  console.log(`  ${accent('-t')} ${subtle('task')}  ${accent('-p')} ${subtle('provider')}  ${accent('-u')} ${subtle('usage')}  ${accent('-c')} ${subtle('config')}  ${accent('-d')} ${subtle('debug')}`);
  console.log();
}

// ─── Provider list helper ───────────────────────────────────────────────────

function printProviderList(config) {
  const providerIds = getAllProviderIds();
  for (let i = 0; i < providerIds.length; i++) {
    const id = providerIds[i];
    const prov = config.providers[id];
    const info = PROVIDERS[id];
    const isActive = id === config.provider;
    const hasKey = !!prov.apiKey;
    const num = subtle(`${i + 1}`);
    const mark = isActive ? green(symbols.check) : hasKey ? subtle(symbols.check) : subtle(symbols.cross);
    const name = isActive ? brightWhite(info.name) : hasKey ? mid(info.name) : subtle(info.name);
    const key = hasKey ? subtle(' ' + maskKey(prov.apiKey)) : '';
    console.log(`    ${mark} ${num} ${name}${key}`);
  }
}

// ─── Config ─────────────────────────────────────────────────────────────────

function showConfig(config) {
  printBanner();
  console.log();
  console.log(keyValue('provider ', `${config.provider} ${subtle('(' + config.model + ')')}`));
  console.log(keyValue('api key  ', maskKey(config.apiKey)));
  console.log(keyValue('auto-exec', config.autoExec ? green('on') : subtle('off')));
  console.log(keyValue('config   ', CONFIG_FILE));
  console.log();
  printProviderList(config);
  console.log();
}

async function printConfig(config) {
  showConfig(config);

  const choice = await selectMenu([
    { label: 'Exit', key: 'q' },
    { label: 'Edit', key: 'e' },
  ]);

  if (choice === 'e') {
    await runSetup();
  }
}

// ─── Setup wizard ───────────────────────────────────────────────────────────

async function runSetup() {
  const config = loadConfig();

  printBanner();
  console.log();
  printProviderList(config);
  console.log();

  const providerIds = getAllProviderIds();
  const total = providerIds.length;
  const selection = await textInput(
    `Configure which? ${subtle(`(1-${total}, all, or name)`)}`,
    'all'
  );

  let selectedIds;
  if (selection.toLowerCase() === 'all') {
    selectedIds = providerIds;
  } else {
    selectedIds = selection.split(/[,\s]+/).map(s => {
      const num = parseInt(s);
      if (num >= 1 && num <= providerIds.length) return providerIds[num - 1];
      if (providerIds.includes(s)) return s;
      return null;
    }).filter(Boolean);
  }

  if (!selectedIds.length) { printError('No valid provider.'); return; }

  const enterHint = subtle('enter to keep current');

  for (const id of selectedIds) {
    const info = PROVIDERS[id];
    const prov = config.providers[id];
    const isCustom = id === 'custom';

    console.log(`\n  ${bold(info.name)}`);

    // API key — masked, never exposed
    const newKey = await textInput(`  Key ${enterHint}`, prov.apiKey, {
      displayDefault: prov.apiKey ? maskKey(prov.apiKey) : 'not set',
    });
    if (newKey) config.providers[id].apiKey = newKey;

    // Custom provider needs API URL
    if (isCustom) {
      const urlChoice = await textInput(`  API URL ${enterHint}`, prov.apiUrl || '', {
        displayDefault: prov.apiUrl || 'https://your-api.com/v1/chat/completions',
      });
      if (urlChoice) config.providers[id].apiUrl = urlChoice;
    }

    // Model
    const modelChoice = await textInput(`  Model ${enterHint}`, prov.model);
    if (modelChoice) config.providers[id].model = modelChoice;

    // Pricing — simple "set or skip"
    const activeModel = config.providers[id].model;
    const existing = getModelPricing(activeModel);

    const inputPrice = await textInput(
      `  Price $/1M input ${subtle('enter to skip')}`,
      '', { displayDefault: existing ? `current: ${existing.input}` : '' }
    );
    if (inputPrice) {
      const outputPrice = await textInput(
        `  Price $/1M output ${subtle('enter to skip')}`,
        '', { displayDefault: existing ? `current: ${existing.output}` : '' }
      );
      const inP = parseFloat(inputPrice);
      const outP = parseFloat(outputPrice);
      if (!isNaN(inP) && outP && !isNaN(outP)) {
        if (!config.pricing) config.pricing = {};
        config.pricing[activeModel] = { input: inP, output: outP };
      } else if (!isNaN(inP)) {
        if (!config.pricing) config.pricing = {};
        config.pricing[activeModel] = { input: inP, output: existing ? existing.output : 0 };
      }
    }
  }

  // ─── Default provider ───────────────────────────────────────────────
  const configured = providerIds.filter(id => config.providers[id].apiKey);
  if (configured.length > 0) {
    console.log(`\n  ${bold('Default Provider')}`);
    for (let i = 0; i < configured.length; i++) {
      const id = configured[i];
      const info = PROVIDERS[id];
      const isActive = id === config.provider;
      const mark = isActive ? green(symbols.check) : subtle(symbols.check);
      const name = isActive ? brightWhite(info.name) : mid(info.name);
      console.log(`    ${mark} ${subtle(String(i + 1))} ${name}`);
    }
    console.log();
    const choice = await textInput(
      `Set default ${enterHint}`,
      '', { displayDefault: config.provider }
    );
    if (choice) {
      const num = parseInt(choice);
      if (num >= 1 && num <= configured.length) config.provider = configured[num - 1];
      else if (configured.includes(choice)) config.provider = choice;
    }
  } else if (configured.length === 1) {
    config.provider = configured[0];
  }

  // ─── Auto-execute ───────────────────────────────────────────────────
  console.log();
  const autoChoice = await textInput(
    `Auto-execute ${subtle('skip menu, run commands directly')}`,
    config.autoExec ? 'on' : 'off'
  );
  const lower = autoChoice.toLowerCase();
  config.autoExec = (lower === 'on' || lower === 'yes' || lower === 'y' || lower === 'true' || lower === '1');

  // ─── Save ───────────────────────────────────────────────────────────
  const active = config.providers[config.provider];
  config.apiKey = active?.apiKey || '';
  config.model = active?.model || '';
  config.apiUrl = active?.apiUrl || '';
  saveConfig(config);

  console.log();
  const provName = PROVIDERS[config.provider]?.name || config.provider;
  printSuccess(`Saved. Using ${bold(provName)} (${config.model})${config.autoExec ? bold(' auto-exec on') : ''}`);
  console.log();
}

module.exports = { printHelp, printConfig, runSetup };
