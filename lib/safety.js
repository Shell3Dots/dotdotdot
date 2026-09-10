'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// safety.js — Command risk analysis (heuristic denylist, not a sandbox)
// ─────────────────────────────────────────────────────────────────────────────

const HIGH_RISK = [
  // Deletion — recursive/forced
  { pattern: /\brm\s+(-[a-zA-Z]*[rfRF]|--recursive|--force)/, reason: 'Recursive/forced deletion' },
  { pattern: /\bRemove-Item\b.*(-Recurse|-Force|-r\b)/i, reason: 'Recursive/forced deletion' },
  { pattern: /\bri\s+[^\n]*(-[rR]\b|-Recurse|-Force)/i, reason: 'Recursive/forced deletion (ri)' },
  { pattern: /\b(rd|rmdir)\s+[^\n]*(-[rR]\b|-Recurse|-Force|\/[sS])/i, reason: 'Recursive directory deletion' },
  { pattern: /\bdel\s+\/[sS]/i, reason: 'Recursive deletion' },
  { pattern: /\brm\s+-rf\s+[\/~]/i, reason: 'Deleting from root or home' },
  { pattern: /\bfind\b[^\n]*\s-delete\b/, reason: 'find -delete' },

  // System-level
  { pattern: /\bformat\s+[a-zA-Z]:/i, reason: 'Disk formatting' },
  { pattern: /\bmkfs\b/i, reason: 'Filesystem creation' },
  { pattern: /\bdd\s+if=/i, reason: 'Low-level disk write' },
  { pattern: /\bchmod\s+(-R\s+)?0?777\b/, reason: 'Insecure permissions' },
  { pattern: /\b(shutdown|reboot|halt|poweroff|Stop-Computer|Restart-Computer)\b/i, reason: 'System power action' },

  // Download and execute / eval
  { pattern: /\b(curl|wget)\b[^\n]*\|\s*(sudo\s+)?(bash|sh|zsh|fish|cmd|powershell|pwsh|iex)\b/i, reason: 'Download and execute' },
  { pattern: /\b(iex|Invoke-Expression)\b/i, reason: 'Dynamic expression execution' },
  { pattern: /\beval\b/, reason: 'eval' },

  // Elevated
  { pattern: /\bsudo\b/i, reason: 'Elevated privileges' },
  { pattern: /\brunas\b/i, reason: 'Elevated privileges' },
  { pattern: /Set-ExecutionPolicy\s+Unrestricted/i, reason: 'Weakening execution policy' },

  // Registry / firewall
  { pattern: /\breg\s+delete\b/i, reason: 'Registry deletion' },
  { pattern: /Remove-ItemProperty.*HKLM/i, reason: 'System registry modification' },
  { pattern: /\biptables\b/i, reason: 'Firewall modification' },
];

const MEDIUM_RISK = [
  // Require rm to be used as a command with an argument, not a substring (e.g. firmware)
  { pattern: /(^|[;&|]\s*)rm\s+\S/, reason: 'File deletion' },
  { pattern: /\bRemove-Item\b(?!Property)/i, reason: 'File deletion' },
  { pattern: /\b(Move-Item|mv)\s+/i, reason: 'Moving files' },
  { pattern: /(^|[;&|]\s*)(kill|taskkill)\b|\bStop-Process\b/i, reason: 'Process termination' },
  { pattern: /\bnpm\s+(install|uninstall|rm)\s+-g\b/i, reason: 'Global package change' },
  { pattern: /\bgit\s+(push|rm|reset\s+--hard|rebase|force)/i, reason: 'Git history or tree change' },
  { pattern: /\bdocker\s+(rm|rmi|stop|kill|prune)\b/i, reason: 'Docker resource removal' },
];

function analyzeRisk(command) {
  if (!command) return { level: 'low', reasons: [] };

  for (const { pattern, reason } of HIGH_RISK) {
    if (pattern.test(command)) return { level: 'high', reasons: [reason] };
  }
  for (const { pattern, reason } of MEDIUM_RISK) {
    if (pattern.test(command)) return { level: 'medium', reasons: [reason] };
  }
  return { level: 'low', reasons: [] };
}

function analyzeSteps(steps) {
  return steps.map(step => {
    const risk = analyzeRisk(step.command);
    return {
      ...step,
      computedRisk: risk.level,
      riskReasons: risk.reasons,
      needsApproval: step.needsApproval || risk.level === 'high',
    };
  });
}

/**
 * How to handle a generated command given TTY / flags.
 * --yes and autoExec skip confirmation; high risk still needs --allow-dangerous.
 * Non-TTY without those flags never executes (insert/print only).
 */
function decideRunPolicy({ isTty, yes, autoExec, allowDangerous, riskLevel }) {
  const skipConfirm = !!(yes || autoExec);
  const highBlocked = riskLevel === 'high' && !allowDangerous;

  if (skipConfirm) {
    return highBlocked ? 'block' : 'execute';
  }
  if (!isTty) return 'insert';
  return 'menu';
}

function highRiskBlocked(riskLevel, allowDangerous) {
  return riskLevel === 'high' && !allowDangerous;
}

module.exports = {
  analyzeRisk,
  analyzeSteps,
  decideRunPolicy,
  highRiskBlocked,
  HIGH_RISK,
  MEDIUM_RISK,
};
