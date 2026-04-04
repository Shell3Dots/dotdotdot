'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// config.js — Configuration management with multi-provider support
// ─────────────────────────────────────────────────────────────────────────────

const fs   = require('fs');
const path = require('path');
const os   = require('os');

const CONFIG_DIR  = path.join(os.homedir(), '.dotdotdot');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');
const CACHE_DIR   = path.join(CONFIG_DIR, 'cache');
const DEBUG_DIR   = path.join(CONFIG_DIR, 'debug');
const SESSION_DIR = path.join(CONFIG_DIR, 'sessions');

// ─── Provider Defaults ──────────────────────────────────────────────────────

const PROVIDERS = {
  openrouter: {
    name: 'OpenRouter',
    apiUrl: 'https://openrouter.ai/api/v1/chat/completions',
    model: 'google/gemma-4-26b-a4b-it',
    envKeys: ['DOT_OPENROUTER_KEY'],
    models: [
      'google/gemma-4-26b-a4b-it',
      'google/gemini-2.5-flash-preview:thinking',
      'openai/gpt-4o-mini',
      'anthropic/claude-3.5-haiku',
      'meta-llama/llama-3.1-70b-instruct',
      'google/gemini-2.0-flash-001',
    ],
  },
  anthropic: {
    name: 'Anthropic',
    apiUrl: 'https://api.anthropic.com/v1/messages',
    model: 'claude-haiku-4-5-20251001',
    envKeys: ['DOT_ANTHROPIC_KEY'],
    models: [
      'claude-haiku-4-5-20251001',
      'claude-sonnet-4-20250514',
      'claude-3-5-haiku-20241022',
    ],
  },
  openai: {
    name: 'OpenAI',
    apiUrl: 'https://api.openai.com/v1/chat/completions',
    model: 'gpt-4o-mini',
    envKeys: ['DOT_OPENAI_KEY'],
    models: [
      'gpt-4o-mini',
      'gpt-4o',
      'gpt-4-turbo',
    ],
  },
  google: {
    name: 'Google Gemini',
    apiUrl: 'https://generativelanguage.googleapis.com/v1beta/models',
    model: 'gemini-2.0-flash',
    envKeys: ['DOT_GOOGLE_KEY'],
    models: [
      'gemini-2.0-flash',
      'gemini-2.0-flash-lite',
      'gemini-1.5-pro',
    ],
  },
  custom: {
    name: 'Custom',
    apiUrl: '',
    model: '',
    envKeys: ['DOT_CUSTOM_KEY'],
    models: [],
  },
};

// ─── Ensure directories exist ────────────────────────────────────────────────

function ensureDirs() {
  for (const dir of [CONFIG_DIR, CACHE_DIR, DEBUG_DIR, SESSION_DIR]) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
}

// ─── Load config ────────────────────────────────────────────────────────────

function loadConfig() {
  ensureDirs();

  let fileData = {};
  try {
    const raw = fs.readFileSync(CONFIG_FILE, 'utf8');
    fileData = JSON.parse(raw);
  } catch { /* no config file yet */ }

  // Migrate old flat format
  if (fileData.apiKey && !fileData.providers) {
    fileData = {
      provider: 'anthropic',
      providers: {
        anthropic: {
          apiKey: fileData.apiKey,
          model: fileData.model || PROVIDERS.anthropic.model,
          apiUrl: fileData.apiUrl || PROVIDERS.anthropic.apiUrl,
        },
      },
    };
    _saveRaw(fileData);
  }

  // Build config
  const config = {
    provider:  fileData.provider || 'openrouter',
    autoExec:  fileData.autoExec || false,
    providers: {},
    pricing:   fileData.pricing || {},
  };

  // Merge provider configs
  for (const [id, defaults] of Object.entries(PROVIDERS)) {
    const saved = (fileData.providers || {})[id] || {};
    config.providers[id] = {
      apiKey: saved.apiKey || '',
      model:  saved.model  || defaults.model,
      apiUrl: saved.apiUrl || defaults.apiUrl,
    };
  }

  // Environment variable overrides
  if (process.env.DOT_PROVIDER) {
    config.provider = process.env.DOT_PROVIDER;
  }

  for (const [id, defaults] of Object.entries(PROVIDERS)) {
    for (const envKey of defaults.envKeys) {
      if (process.env[envKey]) {
        config.providers[id].apiKey = process.env[envKey];
        break;
      }
    }
  }

  if (process.env.DOT_MODEL) {
    config.providers[config.provider].model = process.env.DOT_MODEL;
  }

  // Resolve active provider's values to top-level for convenience
  const active = config.providers[config.provider] || {};
  config.apiKey  = active.apiKey || '';
  config.model   = active.model  || '';
  config.apiUrl  = active.apiUrl || '';

  return config;
}

// ─── Save config ────────────────────────────────────────────────────────────

function saveConfig(config) {
  ensureDirs();
  const data = {
    provider:  config.provider,
    autoExec:  config.autoExec || false,
    providers: {},
    pricing:   config.pricing || {},
  };
  for (const [id, prov] of Object.entries(config.providers)) {
    data.providers[id] = {
      apiKey: prov.apiKey || '',
      model:  prov.model  || '',
      apiUrl: prov.apiUrl || '',
    };
  }
  _saveRaw(data);
}

function _saveRaw(data) {
  ensureDirs();
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(data, null, 2), { mode: 0o600 });
}

// ─── Utility ────────────────────────────────────────────────────────────────

function maskKey(key) {
  if (!key) return '(not set)';
  if (key.length <= 8) return '****';
  return key.slice(0, 4) + '...' + key.slice(-4);
}

function getProviderInfo(id) {
  return PROVIDERS[id] || null;
}

function getAllProviderIds() {
  return Object.keys(PROVIDERS);
}

// Resolve short names / aliases to provider id
// e.g. "anthropic" "claude" "ant" → "anthropic"
const ALIASES = {
  or: 'openrouter', router: 'openrouter', openrouter: 'openrouter',
  ant: 'anthropic', claude: 'anthropic', anthropic: 'anthropic',
  oai: 'openai', gpt: 'openai', openai: 'openai',
  gem: 'google', gemini: 'google', google: 'google',
  custom: 'custom',
};

function resolveProvider(name) {
  if (!name) return null;
  const lower = name.toLowerCase().trim();
  return ALIASES[lower] || (PROVIDERS[lower] ? lower : null);
}

module.exports = {
  CONFIG_DIR, CONFIG_FILE, CACHE_DIR, DEBUG_DIR, SESSION_DIR,
  PROVIDERS,
  loadConfig,
  saveConfig,
  ensureDirs,
  maskKey,
  getProviderInfo,
  getAllProviderIds,
  resolveProvider,
};
