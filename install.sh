#!/usr/bin/env bash
# ─────────────────────────────────────────────────
#  dotdotdot installer
#  Usage: curl -fsSL https://raw.githubusercontent.com/Shell3Dots/dotdotdot/main/install.sh | bash
# ─────────────────────────────────────────────────
set -e

CYAN='\033[36m'
GREEN='\033[32m'
RED='\033[31m'
DIM='\033[2m'
BOLD='\033[1m'
RESET='\033[0m'

echo ""
echo -e "  ${BOLD}${CYAN}... dotdotdot installer${RESET}"
echo -e "  ────────────────────────"
echo ""

# ── Check Node.js ──
if ! command -v node &>/dev/null; then
  echo -e "  ${RED}✖ Node.js is required (v18+).${RESET}"
  echo -e "  ${DIM}Install it: https://nodejs.org${RESET}"
  exit 1
fi

NODE_VER=$(node -v | sed 's/v//' | cut -d. -f1)
if [ "$NODE_VER" -lt 18 ]; then
  echo -e "  ${RED}✖ Node.js v18+ required (you have v$NODE_VER).${RESET}"
  exit 1
fi

echo -e "  ${GREEN}✔${RESET} Node.js $(node -v) detected"

# ── Check npm ──
if ! command -v npm &>/dev/null; then
  echo -e "  ${RED}✖ npm not found.${RESET}"
  exit 1
fi

echo -e "  ${GREEN}✔${RESET} npm $(npm -v) detected"

# ── Install ──
echo ""
echo -e "  ${DIM}Installing dotdotdot-cli globally (dotdotdot / ... on PATH)...${RESET}"
npm install -g dotdotdot-cli

echo ""
echo -e "  ${BOLD}${GREEN}✔ Done!${RESET}"
echo ""
echo -e "  ${BOLD}Next steps:${RESET}"
echo -e "    ${GREEN}... -c${RESET}                       ${DIM}# add your API key${RESET}"
echo -e "    ${GREEN}... show my disk usage${RESET}       ${DIM}# try it out${RESET}"
echo -e "    ${DIM}(use 'dotdotdot' if '...' doesn't work in your shell)${RESET}"
echo ""
