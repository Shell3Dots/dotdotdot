<h1 align="center">
  <br>
  <code>...</code>
  <br>
</h1>

<p align="center">
  <code>npm install -g dotdotdot</code>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/dotdotdot"><img src="https://img.shields.io/npm/v/dotdotdot?color=blue&label=npm" alt="npm version" /></a>
  <img src="https://img.shields.io/badge/dependencies-0-brightgreen" alt="zero dependencies" />
  <img src="https://img.shields.io/badge/node-%3E%3D18-green" alt="node version" />
  <img src="https://img.shields.io/badge/license-MIT-blue" alt="license" />
  <img src="https://img.shields.io/badge/windows%20%7C%20macos%20%7C%20linux-supported-lightgrey" alt="platforms" />
</p>

<br>

<p align="center">
  You know what you want. You just don't know the command.
  <br>
  <code>...</code> takes plain English and gives you the exact terminal command for your OS, your shell, your setup. Execute it, copy it, or just look at it. Nothing runs without your say-so.
</p>

<br>

**Quick mode** &mdash; say it, get it

```bash
... show my public IP
... find all files over 100MB
... undo my last git commit
... what's eating my RAM
```

<p align="center">
  <img src="demo/quick.gif" alt="dotdotdot quick mode demo" width="700" />
</p>

**Task mode** &mdash; chain steps together

```bash
... find all .tmp files then delete them
... check node version, scaffold a new app
... build the project then deploy to staging
... ping popular DNS and show the fastest
```

<p align="center">
  <img src="demo/task.gif" alt="dotdotdot task mode demo" width="700" />
</p>

<br>

---

## Setup

```bash
npm install -g dotdotdot
... -c                # add your API key (you need at least one)
... show my disk usage
```

<details>
<summary><strong>Or use environment variables</strong></summary>

```bash
export DOT_OPENROUTER_KEY=sk-or-...
export DOT_ANTHROPIC_KEY=sk-ant-...
export DOT_OPENAI_KEY=sk-...
export DOT_GOOGLE_KEY=AIza...
export DOT_CUSTOM_KEY=sk-...
```
</details>

---

## Contents

- [How It Works](#how-it-works)
- [Quick Mode](#quick-mode)
- [Task Mode](#task-mode)
- [Examples](#examples)
- [Context Awareness](#context-awareness)
- [Session Memory](#session-memory)
- [Safety](#safety)
- [Providers](#providers)
- [Token Tracking & Cost](#token-tracking--cost)
- [Flags](#flags)
- [Config](#config)
- [Shell Aliases](#shell-aliases)
- [Why `...`](#why-)
- [Project Structure](#project-structure)

---

## How It Works

```
  you type something in plain english
       ↓
  ... gathers context ─── OS, shell, cwd, git, tools, project info
       ↓
  sends it to your chosen LLM
       ↓
  you get back a command (or a multi-step plan)
       ↓
  you decide: execute ─ copy ─ skip
```

You always choose. `...` never runs anything behind your back.

---

## Quick Mode

One request. One command. The right one.

```bash
... compress this folder into a zip
... show running docker containers
... make a new react project called my-app
... list all open ports
... what version of python do I have
```

You pick what happens:

| Key | Action |
|:---:|--------|
| **e** | Execute the command |
| **c** | Copy to clipboard |
| **i** | Insert (print to stdout) |
| **q** | Cancel |

---

## Task Mode

Chain actions with `-t`, or just use natural words like *"then"*, *"and"*, or commas.
`...` breaks it into steps, shows you the full plan, and runs them one at a time.

```bash
... find all .tmp files then delete them
... read my desktop files and propose a new organization
... locate project my-site, install deps, then start dev server
```

Before anything executes, you see everything. You can:
- **Run all** at once
- Go **step by step**
- **Skip** or **abort** any step
- **Retry** if something fails

Dangerous steps always pause and ask first.

---

## Examples

Real terminal sessions. Debug mode (`-d`) shows timing, provider, and token cost.

### Quick Mode

<table><tr><td><strong>List files in the current directory</strong></td></tr></table>

<details>
<summary>Session</summary>

```
$ ... -d list files
  ✔ ctx 688ms | openrouter/google/gemma-4-31b-it | mode: quick
  ✔ done

  ❯ Get-ChildItem -Path .
  Lists all files and directories in the current working directory.
  ✔ Execute

    Directory: C:\Users\you\Projects\my-app

Mode                 LastWriteTime         Length Name
----                 -------------         ------ ----
d-----          4/4/2026   4:22 PM                src
d-----          4/4/2026   4:22 PM                node_modules
-a----          4/4/2026   3:17 PM           1157 package.json
-a----          4/4/2026   5:38 PM          14098 README.md

  tokens: 711 in 43 out (754 total) ~$0.000117
  ✔ exit 0
```
</details>

---

<table><tr><td><strong>What's my public IP address?</strong></td></tr></table>

<details>
<summary>Session</summary>

```
$ ... -d what is my public ip address
  ✔ ctx 209ms | openrouter/google/gemma-4-31b-it | mode: quick
  ✔ done

  ❯ (Invoke-RestMethod -Uri 'https://api.ipify.org').Trim()
  Uses Invoke-RestMethod to query the ipify API and retrieve the public IP address.
  ✔ Execute

203.0.113.42

  tokens: 715 in 57 out (772 total) ~$0.000123
  ✔ exit 0
```
</details>

---

<table><tr><td><strong>Show disk usage</strong></td></tr></table>

<details>
<summary>Session</summary>

```
$ ... -d show me the disk usage
  ✔ ctx 211ms | openrouter/google/gemma-4-31b-it | mode: quick
  ✔ done

  ❯ Get-PSDrive C | Select-Object Name, @{Name='Used(GB)';Expression={...}}, ...
  Retrieves disk usage statistics for the C drive, converting bytes to
  gigabytes and rounding to two decimal places.
  ✔ Execute

Name Used(GB) Free(GB) Total(GB)
---- -------- -------- ---------
C      256.36   218.36    474.72

  tokens: 714 in 135 out (849 total) ~$0.000154
  ✔ exit 0
```
</details>

---

### Task Mode

<table><tr><td><strong>Find the fastest DNS provider</strong></td></tr></table>

<details>
<summary>Session</summary>

```
$ ... -d -t find the best dns provider by pinging popular ones and show me the fastest
  ✔ ctx 213ms | openrouter/google/gemma-4-31b-it | mode: task
  ✔ 1 steps planned | tokens: 837 in 256 out (1.1k total) ~$0.000220
  Pings Google, Cloudflare, OpenDNS, and Quad9 to determine the fastest DNS provider.

  ─ 1. Ping DNS providers and sort by response time
    $ $dns = @{ 'Google'='8.8.8.8'; 'Cloudflare'='1.1.1.1'; 'OpenDNS'=...

  ✔ Run

  ▶ 1/1 Ping DNS providers and sort by response time
    $ $dns = @{ 'Google'='8.8.8.8'; 'Cloudflare'='1.1.1.1'; 'OpenDNS'='208.67.222.222'; ...

Provider   IP             AvgResponse
--------   --             -----------
Cloudflare 1.1.1.1                 20
Quad9      9.9.9.9               35.5
OpenDNS    208.67.222.222        47.5
Google     8.8.8.8               80.5

  ✔ exit 0
  ✔ 1/1 done
```
</details>

---

<table><tr><td><strong>Check Node version, then scaffold a new project</strong></td></tr></table>

<details>
<summary>Session</summary>

```
$ ... -d check my node version, then create a new folder called test-app and initialize a new npm project in it
  ✔ ctx 214ms | openrouter/google/gemma-4-31b-it | mode: task
  ✔ 2 steps planned | tokens: 844 in 173 out (1.0k total) ~$0.000187
  Checks the Node.js version and initializes a new npm project in 'test-app'.

  ─ 1. Check Node.js version
    $ node -v
  ─ 2. Create folder and initialize npm project
    $ New-Item -ItemType Directory -Name 'test-app'; Set-Location -Path 'test-app'; npm init -y

  ✔ Run

  ▶ 1/2 Check Node.js version
    $ node -v
v22.0.0
  ✔ exit 0

  ▶ 2/2 Create folder and initialize npm project
    $ New-Item -ItemType Directory -Name 'test-app'; Set-Location -Path 'test-app'; npm init -y

Wrote to C:\Users\you\Projects\test-app\package.json:
{
  "name": "test-app",
  "version": "1.0.0",
  ...
}

  ✔ exit 0
  ✔ 2/2 done
```
</details>

---

<table><tr><td><strong>System diagnostics with Claude &mdash; top CPU and memory hogs</strong></td></tr></table>

<details>
<summary>Session</summary>

```
$ ... -d -p claude show me the top 5 processes using the most CPU, then show the top 5 using the most memory
  ✔ ctx 209ms | anthropic/claude-haiku-4-5 | mode: task
  ✔ 2 steps planned | tokens: 869 in 287 out (1.2k total) ~$0.002304
  Display top 5 CPU-consuming and top 5 memory-consuming processes.

  ─ 1. Get top 5 processes by CPU usage
    $ Get-Process | Sort-Object -Property CPU -Descending | Select-Object -First 5 ...
  ─ 2. Get top 5 processes by memory usage
    $ Get-Process | Sort-Object -Property WorkingSet -Descending | Select-Object -First 5 ...

  ✔ Run

  ▶ 1/2 Get top 5 processes by CPU usage
    $ Get-Process | Sort-Object -Property CPU -Descending | Select-Object -First 5 ...

Name                     CPU MemoryMB
----                     --- --------
Code              2519.78125  1118.19
Code             1688.984375    191.6
RemotePCViewerUI    1034.375    54.03
Code              582.546875   333.34
Cursor             559.28125   435.31

  ✔ exit 0

  ▶ 2/2 Get top 5 processes by memory usage
    $ Get-Process | Sort-Object -Property WorkingSet -Descending | Select-Object -First 5 ...

Name               MemoryMB CPU
----               -------- ---
Memory Compression  1654.66
Code                1117.14 2520.31
kilo                 697.46 241.05
chrome                629.8 339.38
Cursor               435.32 559.28

  ✔ exit 0
  ✔ 2/2 done
```
</details>

---

<table><tr><td><strong>Git branch cleanup &mdash; find merged branches and delete stale ones</strong></td></tr></table>

<details>
<summary>Session</summary>

```
$ ... -d -p claude find all merged git branches, show them, then delete the stale ones
  ✔ ctx 48ms | anthropic/claude-haiku-4-5 | mode: task
  ✔ 3 steps planned | tokens: 853 in 397 out (1.3k total) ~$0.002838
  Identify merged branches, list them with last commit info, then clean up.

  ─ 1. List all branches merged into main with last commit date
    $ git for-each-ref --merged=main --format='%(refname:short) %(committerdate:short) ...
  ─ 2. Count how many stale branches will be removed
    $ git branch --merged main | Select-String -NotMatch -Pattern '^\s*[*+]|^\s*(main|master)$' ...
  ! 3. Delete all merged branches except main/master
    $ git branch --merged main | Select-String -NotMatch -Pattern '^\s*[*+]|^\s*(main|master)$' ...

  ✔ Run

  ▶ 1/3 List all branches merged into main with last commit date
    $ git for-each-ref --merged=main --format='%(refname:short) %(committerdate:short) %(subject)' refs/heads/

  feature/dark-mode       2024-08-12  feat: add dark mode toggle
  fix/login-redirect      2024-11-03  fix: redirect loop on expired session
  chore/deps-update       2025-01-19  chore: bump dependencies
  feature/user-export     2025-03-28  feat: csv export for user data

  ▶ 2/3 Count how many stale branches will be removed
    $ git branch --merged main | Select-String -NotMatch ... | Measure-Object

  4

  ▶ 3/3 Delete all merged branches except main/master
    $ git branch --merged main | Select-String -NotMatch ... | ForEach-Object { git branch -d $_.Trim() }

  Deleted branch feature/dark-mode (was a3f291c).
  Deleted branch fix/login-redirect (was 88d0e4f).
  Deleted branch chore/deps-update (was c41b7a2).
  Deleted branch feature/user-export (was 1f9d3bb).

  ✔ 3/3 done
```
</details>

---

<table><tr><td><strong>Check system uptime, then show free memory</strong></td></tr></table>

<details>
<summary>Session</summary>

```
$ ... -d show system uptime, then show free memory in GB
  ✔ ctx 208ms | openrouter/google/gemma-4-31b-it | mode: task
  ✔ 2 steps planned | tokens: 836 in 173 out (1.0k total) ~$0.000186
  Retrieves system uptime and free physical memory in GB.

  ─ 1. Get system uptime
    $ (Get-Date) - (Get-CimInstance Win32_OperatingSystem).LastBootUpTime
  ─ 2. Get free memory in GB
    $ (Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory / 1MB

  ✔ Run

  ▶ 1/2 Get system uptime
    $ (Get-Date) - (Get-CimInstance Win32_OperatingSystem).LastBootUpTime

Days              : 0
Hours             : 15
Minutes           : 36
Seconds           : 23

  ✔ exit 0

  ▶ 2/2 Get free memory in GB
    $ (Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory / 1MB

3.65
  ✔ exit 0
  ✔ 2/2 done
```
</details>

---

## Context Awareness

`...` isn't guessing. It knows where it's running.

| | What it detects |
|:---|:---|
| **OS** | Windows, macOS, Linux &mdash; auto-detected |
| **Shell** | PowerShell, CMD, Bash, Zsh, Fish |
| **Tools** | node, npm, python, git, docker, etc. |
| **Project** | package.json, Cargo.toml, pyproject.toml |
| **Git** | Branch, dirty status, remote |
| **Environment** | WSL, Docker, SSH, virtualenv |
| **History** | What you just ran (session memory) |

It won't suggest `brew` on Windows or `apt` on macOS. It adapts to you.

---

## Session Memory

Follow-ups just work.

```
$ ... find all log files
  ❯ Get-ChildItem -Recurse -Filter *.log

$ ... now delete them
  ❯ Get-ChildItem -Recurse -Filter *.log | Remove-Item

$ ... actually undo that
  ❯ well...
```

---

## Safety

Every command is checked for risk **before** it touches anything.

| | Risk | What happens |
|:---:|:---|:---|
| **low** | Read-only, harmless | Runs freely (auto-exec if enabled) |
| **medium** | Creates or modifies files | Runs with your OK |
| **high** | Destructive (`rm -rf`, `sudo`, `dd`, etc.) | Blocked in auto-mode. Always asks. |

---

## Providers

Pick your LLM. Five providers out of the box. Switch on the fly with `-p`.

```bash
... -p claude explain this error
... -p gpt    list my largest files
... -p gemini what does this cron do
```

| Provider | Default Model | Flag |
|:---------|:--------------|:-----|
| **OpenRouter** | `gemma-4-26b-a4b-it` | `-p router` |
| **Anthropic** | `claude-haiku-4-5` | `-p claude` |
| **OpenAI** | `gpt-4o-mini` | `-p gpt` |
| **Google Gemini** | `gemini-2.0-flash` | `-p gemini` |
| **Custom** | *(you set it)* | `-p custom` |

**Custom** works with any OpenAI-compatible API &mdash; LM Studio, Ollama, vLLM, Together, etc.

Change models anytime: `... -c`

---

## Token Tracking & Cost

Every request shows token count and cost inline:

```
  tokens: 1.3k in 93 out (1.4k total) ~$0.000203
```

Check cumulative usage with `... -u`:

```
  ● ● ●  dotdotdot

  Totals
  ────────────────────────────────────────────
    Requests       9
    Input          12.3k tokens
    Output         763 tokens
    Combined       13.1k tokens
    Cost           $0.001696

  Per Request
  ────────────────────────────────────────────
    Input          1.4k
    Output         85
    Combined       1.5k
    Cost           $0.000188

  Recent
  ────────────────────────────────────────────
    04/04 18:32  1.1k tokens  $0.000220  gemma-4-31b-it
    04/04 18:35  1.0k tokens  $0.000187  gemma-4-31b-it
    04/04 18:41  1.2k tokens  $0.002304  claude-haiku-4-5

  tracking since 4/1/2026

  ❯ Exit  q
    Reset usage  r
```

Reset from the menu, or directly: `... --reset-usage`

<details>
<summary><strong>Custom pricing</strong></summary>

`...` ships with pricing for all default models. For custom models, set pricing during `... -c`:

```
  ❯ Price $/1M input enter to skip (current: 0.10):
  ❯ Price $/1M output enter to skip (current: 0.10):
```

Custom pricing overrides built-in defaults.
</details>

---

## Flags

| Flag | What it does |
|:-----|:-------------|
| `-t` `--task` | Force task mode |
| `-p` `--provider` `<name>` | Switch provider for this request |
| `-u` `--usage` | Token usage and cost stats |
| `-c` `--config` | View and edit config |
| `-d` `--debug` | Timing, provider info, debug log path |
| `-v` `--version` | Print version |
| `-h` `--help` | Help |
| `--clear` | Clear session history (fresh start, keeps OS/shell context) |
| `--reset-usage` | Clear all token tracking data |

---

## Config

Everything lives in `~/.dotdotdot/config.json`:

```bash
... -c          # view config, then exit or edit
```

```json
{
  "provider": "openrouter",
  "autoExec": false,
  "providers": {
    "openrouter": { "apiKey": "sk-or-...", "model": "google/gemma-4-26b-a4b-it" },
    "anthropic":  { "apiKey": "sk-ant-...", "model": "claude-haiku-4-5-20251001" },
    "custom":     { "apiKey": "sk-...", "model": "my-model", "apiUrl": "https://..." }
  },
  "pricing": {
    "my-model": { "input": 1.00, "output": 3.00 }
  }
}
```

---

## Shell Aliases

`...` works as a command in most shells. If yours doesn't like it, use `dotdotdot` instead:

<details>
<summary><strong>PowerShell</strong></summary>

```powershell
# Add to $PROFILE
function ... { dotdotdot @args }
```
</details>

<details>
<summary><strong>Bash / Zsh</strong></summary>

```bash
# Add to ~/.bashrc or ~/.zshrc
alias ...='dotdotdot'
```
</details>

<details>
<summary><strong>Fish</strong></summary>

```fish
# Add to ~/.config/fish/config.fish
alias ... 'dotdotdot'
```
</details>

---

## Why `...`

Nobody should have to memorize:

- `tar -xvzf` vs `tar -xvf` &mdash; seriously, which one
- every `docker` flag combo
- `ffmpeg` syntax &mdash; literally impossible
- PowerShell's `Select-String` vs `grep` vs `findstr`
- 47 ways to check disk usage across 3 operating systems
- `find` syntax differences between macOS and Linux

**You know what you want. `...` knows how to say it.**

---

## Project Structure

```
bin/
  dotdotdot.js          CLI entry point & arg parser
lib/
  colors.js             Zero-dep ANSI color system
  config.js             Multi-provider config management
  context.js            OS, shell, git, tools detection
  executor.js           Command runner & error recovery
  index.js              Public API exports
  llm.js                5 LLM providers, 2 prompt modes
  menu.js               Keyboard-driven selection menus
  planner.js            Multi-step task orchestrator
  postinstall.js        Post-install welcome message
  renderer.js           Spinners, boxes, step indicators
  safety.js             Command risk analysis engine
  session.js            Session history & follow-ups
  tokens.js             Token usage tracking & cost estimates
  ui.js                 Help screen, config view, setup wizard
```

---

<p align="center">
  <strong>Zero dependencies.</strong> Nothing to break, nothing to conflict.<br>
  <strong>Cross-platform.</strong> Windows, macOS, Linux &mdash; detects your shell and adapts.<br>
  <strong>Transparent.</strong> You always see the command before it runs.<br>
  <strong>Safe.</strong> Dangerous commands are flagged and blocked in auto-mode.
</p>

<p align="center">
  MIT &mdash; do whatever you want with it.
</p>
