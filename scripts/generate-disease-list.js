#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '..', 'lib', 'knowledge', 'diseases');
const outFile = path.join(__dirname, '..', 'DISEASE-LIST.md');
const files = fs.readdirSync(dir).filter(f => f.endsWith('.json')).sort();

const domains = {};

for (const file of files) {
  const data = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf-8'));
  const name = data.name || file.replace('.json', '');
  const prevalence = data.prevalence ? data.prevalence.classification : 'unknown';
  const specialists = (data.specialistType || []).join(', ');
  const primary = (data.systemsAffected || ['other'])[0] || 'other';

  if (!domains[primary]) domains[primary] = [];
  domains[primary].push({ name, id: data.id, prevalence, specialists });
}

let output = '# SecondLook Disease Knowledge Base\n\n';
output += '**Total diseases: ' + files.length + '**  \n';
output += 'Last updated: 2026-02-19\n\n';

// Summary table
output += '## Coverage by Primary Body System\n\n';
output += '| Body System | Count |\n';
output += '|-------------|-------|\n';
const sortedSystems = Object.entries(domains).sort((a, b) => b[1].length - a[1].length);
for (const [system, diseases] of sortedSystems) {
  output += '| ' + system.charAt(0).toUpperCase() + system.slice(1) + ' | ' + diseases.length + ' |\n';
}
output += '| **Total** | **' + files.length + '** |\n';
output += '\n---\n\n';

// Full list grouped by system
output += '## Complete Disease List\n\n';
for (const [system, diseases] of sortedSystems) {
  output += '### ' + system.charAt(0).toUpperCase() + system.slice(1) + ' (' + diseases.length + ')\n\n';
  output += '| Disease | Prevalence | Specialists |\n';
  output += '|---------|------------|-------------|\n';
  diseases.sort((a, b) => a.name.localeCompare(b.name));
  for (const d of diseases) {
    const safeName = d.name.replace(/\|/g, '/');
    const safeSpec = d.specialists.replace(/\|/g, '/');
    output += '| ' + safeName + ' | ' + d.prevalence + ' | ' + safeSpec + ' |\n';
  }
  output += '\n';
}

fs.writeFileSync(outFile, output);
console.log('Wrote ' + outFile + ' (' + files.length + ' diseases)');
