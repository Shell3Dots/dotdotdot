#!/usr/bin/env node
'use strict';

const G = '\x1b[32m';  // green
const C = '\x1b[36m';  // cyan
const D = '\x1b[2m';   // dim
const B = '\x1b[1m';   // bold
const W = '\x1b[97m';  // bright white
const R = '\x1b[0m';   // reset

console.log();
console.log(`  ${G}\u2714${R} ${B}${W}dotdotdot${R} installed`);
console.log();
console.log(`  ${B}Get started:${R}`);
console.log(`    ${C}... -c${R}                         ${D}Configure your API key${R}`);
console.log(`    ${C}... list all png files${R}          ${D}Try a quick command${R}`);
console.log(`    ${C}... find tmp files then delete${R}  ${D}Try a multi-step task${R}`);
console.log();
console.log(`  ${D}Zero dependencies. 5 providers. Your terminal, your way.${R}`);
console.log();
