#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const testFile = path.resolve(__dirname, '../apps/api/test/contract/provider.spec.ts');
const orig = fs.readFileSync(testFile, 'utf8');
let mutated = orig;
let allCaught = true;

function run(label) {
  fs.writeFileSync(testFile, mutated);
  let fails = 0;
  let tests = '';
  try {
    const out = execSync('npx jest --config jest-contract.config.js --forceExit 2>&1', { 
      cwd: path.resolve(__dirname, '../apps/api'), 
      maxBuffer: 10*1024*1024 
    }).toString();
    tests = (out.match(/Tests:\s+(.*)/) || ['',''])[1];
    fails = (out.match(/● /g) || []).length;
  } catch (e) {
    const out = e.stdout?.toString() || '';
    tests = (out.match(/Tests:\s+(.*)/) || ['',''])[1];
    fails = (out.match(/● /g) || []).length;
  }
  console.log(`${label}: fails=${fails} ${tests}`);
  if (fails === 0) { console.log('  ✗ MISSED — gate did NOT catch this mutation'); allCaught = false; }
  else { console.log('  ✓ CAUGHT'); }
  fs.writeFileSync(testFile, orig);
}

// MUTATION A: change username type to integer — User validation should reject real string response
mutated = orig.replace("username: { type: 'string' }", "username: { type: 'integer' }");
run('MUT A (username integer)');

// MUTATION B: remove 'id' from required — server sends id, but schema no longer requires it, so ADDITIONAL data?
// Actually this tests: if we remove a field from schema, the server still sends it → additionalProperties should catch
// This won't catch since additionalProperties=false but the field IS in properties. Need different approach.
// MUTATION B revised: remove createdAt from User properties altogether
mutated = orig.replace("    createdAt: { type: 'string', format: 'date-time' },\n", "");
run('MUT B (createdAt removed from User — server still sends it)');

// MUTATION C: remove serverLayout from User properties
mutated = orig.replace("    serverLayout: {}, // arbitrary JSON — no shape constraint\n", "");
run('MUT C (serverLayout removed — server sends it)');

if (!allCaught) process.exit(1);
console.log('\n=== All three mutations CAUGHT. Gate is proven. ===');