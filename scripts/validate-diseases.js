const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '..', 'lib', 'knowledge', 'diseases');
const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));

let valid = 0;
let invalid = 0;
const errors = [];

for (const f of files) {
  try {
    const data = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    const required = ['id', 'name', 'symptoms', 'diagnosticCriteria', 'prevalence', 'demographics', 'systemsAffected'];
    const missing = required.filter(k => !data[k]);
    if (missing.length > 0) {
      errors.push(f + ': missing ' + missing.join(', '));
      invalid++;
    } else {
      valid++;
    }
  } catch (e) {
    errors.push(f + ': parse error - ' + e.message);
    invalid++;
  }
}

console.log(`Validation: ${valid} valid / ${files.length} total`);
if (invalid > 0) {
  console.log(`${invalid} invalid files:`);
  errors.forEach(e => console.log('  - ' + e));
}
