'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// llm.js — Multi-provider LLM integration with two prompt modes:
//          1) Quick mode — single command generation
//          2) Task mode  — multi-step plan generation
// ─────────────────────────────────────────────────────────────────────────────

const https = require('https');
const fs    = require('fs');
const path  = require('path');
const { PROVIDERS, DEBUG_DIR, ensureDirs } = require('./config');
const { getHistory } = require('./session');

// ─── Debug logging ──────────────────────────────────────────────────────────

function debugLog(provider, input, response) {
  try {
    ensureDirs();
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const file = path.join(DEBUG_DIR, `${ts}.json`);
    fs.writeFileSync(file, JSON.stringify({ provider, input, response, ts }, null, 2));

    // Cleanup old logs (keep 20)
    const logs = fs.readdirSync(DEBUG_DIR).sort();
    while (logs.length > 20) {
      fs.unlinkSync(path.join(DEBUG_DIR, logs.shift()));
    }
    return file;
  } catch { return null; }
}

// ─── System Prompts ─────────────────────────────────────────────────────────

const IDENTITY = `You are dotdotdot (...), an LLM that lives in the terminal. You are an expert in shell commands across every OS and shell environment. You think in commands, not paragraphs. You are concise, precise, and never verbose. You always follow the rules below — no exceptions, no improvising outside the JSON format.`;

const QUICK_SYSTEM_PROMPT = `${IDENTITY}

Given a request and JSON context, output a single shell command.

Output ONLY valid JSON: {"command":"...","explanation":"...","warning":null}

Rules:
1. "sh" is the execution shell. Commands run DIRECTLY in it. NEVER wrap with "powershell -Command", "bash -c", or "cmd /c". Write raw shell code only.
2. Match the EXACT shell syntax. Check the [PowerShell]/[Bash]/[CMD] tag in "sh". Never mix syntaxes.
   - PowerShell: use foreach, Where-Object, Select-Object, Test-Connection, Invoke-RestMethod. NOT for/in, grep, ping, curl (use curl.exe if needed).
   - Bash: use for/in, grep, ping, curl. NOT PowerShell cmdlets.
   - CMD: use for /f, ping, findstr. NOT PowerShell or Bash syntax.
3. "os" tells you the platform. Bash on Windows (Git Bash/MINGW) uses Windows executables: use "ping -n" not "ping -c", "ipconfig" not "hostname -I", "curl.exe" not "curl" if conflicts exist.
4. Only use tools confirmed in the "tools" array.
5. Set "warning" to a non-null string for destructive commands (delete, format, kill, overwrite, chmod 777).
6. For questions or info requests: if answerable from context, use echo/Write-Host to display the answer. Do NOT run a command that will fail.
7. Use "hist" (session history) for follow-ups like "do the same for X" or "undo that".
8. Never reference files not in "dir" unless the user specifies a path.
9. Prefer concise one-liners. Use shell-appropriate syntax for pipes and chaining.
10. If "no_git" is true, do NOT suggest git commands. Instead, output a command that uses echo/Write-Host to tell the user this is not a git repo. You MUST still output valid JSON format.
11. If history shows a failed command, learn from the error. Never repeat the same failing command — suggest a fix or explain why it failed.

IMPORTANT: ALWAYS output valid JSON regardless of the situation. Never output plain text, markdown, or explanations outside of JSON. Even for errors, wrap the message in the JSON format.

NEVER do these:
- Write to files (no Out-File, Export-Csv, > file.txt, tee, etc.) unless the user explicitly asks to save to a file.
- Use emojis or unicode symbols in commands. Terminals may not render them.
- Use Linux-only commands on Windows (hostname -I, ifconfig, etc.) even in Bash — Git Bash on Windows still runs Windows executables for networking.
- Use associative arrays (declare -A) or complex bash features that may fail in minimal shells.
- Use ping -c on Windows or ping -n on Linux.`;

const TASK_SYSTEM_PROMPT = `${IDENTITY}

Break a complex request into 2-5 sequential shell commands.

Output ONLY valid JSON: {"steps":[{"description":"...","command":"...","risk":"low|medium|high","needsApproval":true|false,"captureOutput":true|false}],"summary":"one sentence"}

Rules:
1. "sh" is the execution shell. Commands run DIRECTLY in it. NEVER wrap with "powershell -Command", "bash -c", or "cmd /c". Write raw shell code only.
2. Match the EXACT shell syntax. Check the [PowerShell]/[Bash]/[CMD] tag in "sh". Never mix syntaxes.
   - PowerShell: use foreach, Where-Object, Select-Object, Test-Connection, Invoke-RestMethod. NOT for/in, grep, ping, curl (use curl.exe if needed).
   - Bash: use for/in, grep, ping, curl. NOT PowerShell cmdlets.
   - CMD: use for /f, ping, findstr. NOT PowerShell or Bash syntax.
3. "os" tells you the platform. Bash on Windows (Git Bash/MINGW) uses Windows executables: use "ping -n" not "ping -c", "ipconfig" not "hostname -I".
4. CRITICAL: Each step runs in a SEPARATE process. Variables and state do NOT carry over. If step 2 needs data from step 1, COMBINE them into ONE step.
5. Keep steps to 2-5. Prefer FEWER, self-contained steps over many dependent ones. Descriptions must be under 10 words.
6. "needsApproval": true ONLY for steps that delete, move, or overwrite files.
7. "captureOutput": true ONLY if a later step depends on this step's output. The LAST step must ALWAYS have "captureOutput": false so the user sees the result.
8. "risk": "low" = read-only, "medium" = creates/modifies, "high" = deletes/destroys.
9. Only use tools confirmed in the "tools" array.
10. For "propose" or "suggest" tasks: output a clear list/table using real data from context. Do NOT hardcode.
11. Never reference paths not in "dir" unless the user specifies them.
12. If "no_git" is true, do NOT plan git commands. Instead, create a single step that uses echo/Write-Host to tell the user this is not a git repo. You MUST still output valid JSON format.
13. If history shows a failed command, do not repeat it. Fix or work around the failure.

IMPORTANT: ALWAYS output valid JSON regardless of the situation. Never output plain text, markdown, or explanations outside of JSON. Even for errors or refusals, wrap the message in the JSON format with an echo/Write-Host step.

NEVER do these:
- Write to files (no Out-File, Export-Csv, > file.txt, tee, /tmp/anything) unless the user explicitly asks to save. All output goes to the terminal.
- Use emojis or unicode symbols in commands. Terminals may not render them.
- Use Linux-only commands on Windows (hostname -I, ifconfig, etc.) even in Bash — Git Bash on Windows still runs Windows executables for networking.
- Use associative arrays (declare -A) or complex bash features that may fail in minimal shells.
- Share variables between steps — each step is isolated. Combine dependent operations into one step.
- Use ping -c on Windows or ping -n on Linux.`;

// ─── Build user message ─────────────────────────────────────────────────────

function buildUserMessage(userInput, context, mode = 'quick') {
  const { system, shell, cwd, dirListing, gitInfo, tools, projectInfo, environment } = context;

  // Build compact JSON context
  // Shell type tag helps LLMs distinguish syntax (PowerShell foreach vs bash for)
  const shellTag = shell.isPowerShell ? ' [PowerShell]' : shell.isCmd ? ' [CMD]' : shell.isBash ? ' [Bash]' : '';
  // OS tag: critical for "Bash on Windows" (Git Bash) which uses Windows networking tools
  const osTag = system.platform === 'win32' ? 'windows' : system.platform === 'darwin' ? 'macos' : 'linux';
  const ctx = {
    req: userInput,
    os: osTag,
    sh: shell.name + (shell.version ? ' ' + shell.version.split('\n')[0].replace(/^.*?(\d+\.\d+[\.\d]*).*$/, '$1') : '') + shellTag,
    cwd,
  };

  // Session history (compact)
  const history = getHistory();
  if (history) ctx.hist = history;

  // Dir listing (compact — just names, limit 30)
  if (dirListing) ctx.dir = dirListing;

  // Project info (compact)
  if (projectInfo?.name) {
    ctx.proj = projectInfo.name;
    if (projectInfo.type) ctx.proj_type = projectInfo.type;
    if (projectInfo.scripts?.length) ctx.scripts = projectInfo.scripts.slice(0, 10);
    if (projectInfo.deps?.deps?.length) ctx.deps = projectInfo.deps.deps.slice(0, 10);
    if (projectInfo.files?.length) ctx.proj_files = projectInfo.files;
  }

  // Git (compact)
  if (gitInfo) {
    ctx.git = { br: gitInfo.branch, dirty: gitInfo.isDirty };
    if (gitInfo.status) ctx.git.st = gitInfo.status;
  } else {
    ctx.no_git = true;
  }

  // Tools (just names — versions already known to be installed)
  if (tools?.length) ctx.tools = tools.map(t => t.name);

  // Environment flags (only if present)
  if (environment?.virtualEnv) ctx.venv = environment.virtualEnv;
  if (environment?.isWSL) ctx.wsl = true;
  if (environment?.isDocker) ctx.docker = true;

  return JSON.stringify(ctx);
}

// ─── JSON extraction ────────────────────────────────────────────────────────

function extractJSON(text) {
  // Strip markdown code fences
  let cleaned = text.replace(/```json?\s*/gi, '').replace(/```/g, '').trim();

  // Find first { and match balanced braces
  const start = cleaned.indexOf('{');
  if (start === -1) return null;

  let depth = 0;
  for (let i = start; i < cleaned.length; i++) {
    if (cleaned[i] === '{') depth++;
    else if (cleaned[i] === '}') {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(cleaned.slice(start, i + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

// ─── Provider-specific request builders ─────────────────────────────────────

function buildAnthropicRequest(systemPrompt, userMessage, config, maxTokens = 512) {
  const url = new URL(config.apiUrl);
  const body = JSON.stringify({
    model: config.model,
    max_tokens: maxTokens,
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }],
  });

  return {
    body,
    options: {
      hostname: url.hostname,
      port: 443,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': config.apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Length': Buffer.byteLength(body),
      },
    },
    parseResponse: (data) => {
      const json = JSON.parse(data);
      const text = json.content?.[0]?.text || '';
      const usage = json.usage ? {
        inputTokens: json.usage.input_tokens || 0,
        outputTokens: json.usage.output_tokens || 0,
        totalTokens: (json.usage.input_tokens || 0) + (json.usage.output_tokens || 0),
      } : null;
      return { text, usage };
    },
  };
}

function buildOpenAIRequest(systemPrompt, userMessage, config, maxTokens = 512) {
  const url = new URL(config.apiUrl);
  const body = JSON.stringify({
    model: config.model,
    max_tokens: maxTokens,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ],
    temperature: 0.1,
  });

  return {
    body,
    options: {
      hostname: url.hostname,
      port: 443,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Length': Buffer.byteLength(body),
      },
    },
    parseResponse: (data) => {
      const json = JSON.parse(data);
      const text = json.choices?.[0]?.message?.content || '';
      const usage = json.usage ? {
        inputTokens: json.usage.prompt_tokens || 0,
        outputTokens: json.usage.completion_tokens || 0,
        totalTokens: json.usage.total_tokens || (json.usage.prompt_tokens || 0) + (json.usage.completion_tokens || 0),
      } : null;
      return { text, usage };
    },
  };
}

function buildOpenRouterRequest(systemPrompt, userMessage, config, maxTokens = 512) {
  const url = new URL(config.apiUrl);
  const body = JSON.stringify({
    model: config.model,
    max_tokens: maxTokens,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ],
    temperature: 0.1,
  });

  return {
    body,
    options: {
      hostname: url.hostname,
      port: 443,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
        'HTTP-Referer': 'https://github.com/Shell3Dots/dotdotdot',
        'X-Title': 'dotdotdot',
        'Content-Length': Buffer.byteLength(body),
      },
    },
    parseResponse: (data) => {
      const json = JSON.parse(data);
      const text = json.choices?.[0]?.message?.content || '';
      const usage = json.usage ? {
        inputTokens: json.usage.prompt_tokens || 0,
        outputTokens: json.usage.completion_tokens || 0,
        totalTokens: json.usage.total_tokens || (json.usage.prompt_tokens || 0) + (json.usage.completion_tokens || 0),
      } : null;
      return { text, usage };
    },
  };
}

function buildGoogleRequest(systemPrompt, userMessage, config, maxTokens = 512) {
  const url = new URL(`${config.apiUrl}/${config.model}:generateContent?key=${config.apiKey}`);
  const body = JSON.stringify({
    system_instruction: { parts: [{ text: systemPrompt }] },
    contents: [{ parts: [{ text: userMessage }] }],
    generationConfig: { maxOutputTokens: maxTokens, temperature: 0.1 },
  });

  return {
    body,
    options: {
      hostname: url.hostname,
      port: 443,
      path: url.pathname + url.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    },
    parseResponse: (data) => {
      const json = JSON.parse(data);
      const text = json.candidates?.[0]?.content?.parts?.[0]?.text || '';
      const meta = json.usageMetadata;
      const usage = meta ? {
        inputTokens: meta.promptTokenCount || 0,
        outputTokens: meta.candidatesTokenCount || 0,
        totalTokens: meta.totalTokenCount || (meta.promptTokenCount || 0) + (meta.candidatesTokenCount || 0),
      } : null;
      return { text, usage };
    },
  };
}

// ─── Friendly error messages ────────────────────────────────────────────────

function friendlyError(statusCode, provider) {
  const providerName = PROVIDERS[provider]?.name || provider;
  switch (statusCode) {
    case 401: case 403:
      return `Invalid API key for ${providerName}. Run: ... -c`;
    case 429:
      return `Rate limited by ${providerName}. Wait a moment and try again.`;
    case 404:
      return `Model not found on ${providerName}. Check your model setting.`;
    case 500: case 502: case 503:
      return `${providerName} is having issues. Try again in a moment.`;
    default:
      return `${providerName} returned HTTP ${statusCode}.`;
  }
}

// ─── HTTP request helper ────────────────────────────────────────────────────

function makeRequest(options, body, timeout = 30000) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => resolve({ statusCode: res.statusCode, data }));
    });

    req.on('error', (err) => reject(err));
    req.setTimeout(timeout, () => {
      req.destroy();
      reject(new Error('Request timed out'));
    });

    req.write(body);
    req.end();
  });
}

// ─── Main query function ────────────────────────────────────────────────────

async function queryLLM(userInput, context, config, mode = 'quick') {
  const systemPrompt = mode === 'task' ? TASK_SYSTEM_PROMPT : QUICK_SYSTEM_PROMPT;
  const userMessage = buildUserMessage(userInput, context, mode);
  const provider = config.provider;
  const maxTokens = mode === 'task' ? 1024 : 512;

  // Select builder (custom uses OpenAI-compatible format)
  let builder;
  switch (provider) {
    case 'anthropic':   builder = buildAnthropicRequest; break;
    case 'openai':      builder = buildOpenAIRequest; break;
    case 'openrouter':  builder = buildOpenRouterRequest; break;
    case 'google':      builder = buildGoogleRequest; break;
    case 'custom':      builder = buildOpenAIRequest; break;
    default:
      throw new Error(`Unknown provider: ${provider}. Run: ... -c`);
  }

  const { body, options, parseResponse } = builder(systemPrompt, userMessage, config, maxTokens);

  try {
    const { statusCode, data } = await makeRequest(options, body);

    if (statusCode !== 200) {
      debugLog(provider, userMessage, { statusCode, data });
      throw new Error(friendlyError(statusCode, provider));
    }

    const { text, usage } = parseResponse(data);
    const debugFile = debugLog(provider, userMessage, { text, usage });

    const result = extractJSON(text);
    if (!result) {
      const err = new Error('Failed to parse LLM response. The model may need a different prompt format.');
      err.debugLog = debugFile;
      throw err;
    }

    // Estimate input tokens from message size if not provided by API
    const estimatedInput = Math.ceil((systemPrompt.length + userMessage.length) / 4);

    // Attach token usage to result
    result._tokenUsage = usage || {
      inputTokens: estimatedInput,
      outputTokens: Math.ceil(text.length / 4),
      totalTokens: estimatedInput + Math.ceil(text.length / 4),
      estimated: true,
    };

    // Attach debug log path
    if (debugFile) result._debugLog = debugFile;

    return result;
  } catch (err) {
    if (err.code === 'ENOTFOUND') {
      throw new Error('Network error. Check your internet connection.');
    }
    if (err.message === 'Request timed out') {
      throw new Error('Request timed out. The LLM provider may be slow. Try again.');
    }
    throw err;
  }
}

// ─── Detect if input needs task mode ────────────────────────────────────────

function detectMode(input) {
  const lower = input.toLowerCase();

  // Task mode indicators: multiple verbs, "then", "and then", commas separating actions,
  // words like "organize", "deploy", "setup", "migrate", "refactor"
  const taskPatterns = [
    /\bthen\b/,
    /\band\s+(then\s+)?(?:run|start|serve|deploy|move|copy|delete|create|build|install|open|read|write|find|list|locate|organize|setup|migrate|refactor)\b/i,
    /,\s*(then\s+)?(?:run|start|serve|deploy|move|copy|delete|create|build|install|open|read|write|find|list|locate|organize|setup|migrate|refactor)\b/i,
    /\bstep\s*\d/i,
    /\bfirst\b.*\bthen\b/i,
    /\blocate\b.*\bread\b/i,
    /\bfind\b.*\b(delete|remove|move|copy|organize)\b/i,
    /\bpropose\b/i,
    /\breorganize\b/i,
    /\bsetup\b.*\b(and|then|,)\b/i,
    /\bdeploy\b.*\b(to|at|on|via)\b/i,
  ];

  for (const pattern of taskPatterns) {
    if (pattern.test(lower)) return 'task';
  }

  return 'quick';
}

module.exports = {
  queryLLM,
  buildUserMessage,
  extractJSON,
  detectMode,
  QUICK_SYSTEM_PROMPT,
  TASK_SYSTEM_PROMPT,
};
