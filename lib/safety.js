'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// safety.js — Command risk analysis
// ─────────────────────────────────────────────────────────────────────────────

const HIGH_RISK = [
  // Deletion — recursive/forced only
  { pattern: /\brm\s+(-[a-z]*r|-[a-z]*f|--recursive|--force)/i, reason: 'Recursive/forced deletion' },
  { pattern: /\bRemove-Item\b.*(-Recurse|-Force)/i, reason: 'Recursive/forced deletion' },
  { pattern: /\bdel\s+\/[sS]/i, reason: 'Recursive deletion' },
  { pattern: /\brm\s+-rf\s+[\/~]/i, reason: 'Deleting from root or home' },

  // System-level — only actual disk format commands, not PowerShell Format-*
  { pattern: /\bformat\s+[a-zA-Z]:/i, reason: 'Disk formatting' },
  { pattern: /\bmkfs\b/i, reason: 'Filesystem creation' },
  { pattern: /\bdd\s+if=/i, reason: 'Low-level disk write' },
  { pattern: /\bchmod\s+777/i, reason: 'Insecure permissions' },

  // Dangerous pipes
  { pattern: /\bcurl\b.*\|\s*(bash|sh|zsh)/i, reason: 'Download and execute' },

  // Elevated
  { pattern: /\bsudo\b/i, reason: 'Elevated privileges' },
  { pattern: /\brunas\b/i, reason: 'Elevated privileges' },
  { pattern: /Set-ExecutionPolicy\s+Unrestricted/i, reason: 'Weakening execution policy' },

  // Registry
  { pattern: /\breg\s+delete\b/i, reason: 'Registry deletion' },
  { pattern: /Remove-ItemProperty.*HKLM/i, reason: 'System registry modification' },

  // Firewall
  { pattern: /\biptables\b/i, reason: 'Firewall modification' },
];

const MEDIUM_RISK = [
  { pattern: /\brm\b(?!.*Format)/i, reason: 'File deletion' },
  { pattern: /\bRemove-Item\b(?!Property)/i, reason: 'File deletion' },
  { pattern: /\bMove-Item\b|\bmv\b/i, reason: 'Moving files' },
  { pattern: /\bkill\b|\bStop-Process\b|\btaskkill\b/i, reason: 'Process termination' },
  { pattern: /\bnpm\s+(install|uninstall)\s+-g/i, reason: 'Global package change' },
  { pattern: /\bgit\s+(push|reset\s+--hard|rebase|force)/i, reason: 'Git history change' },
  { pattern: /\bdocker\s+(rm|rmi|stop|kill|prune)/i, reason: 'Docker resource removal' },
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
      // Only force approval on actually dangerous steps
      needsApproval: step.needsApproval || risk.level === 'high',
    };
  });
}

module.exports = { analyzeRisk, analyzeSteps };
