const fs = require('fs');
let rules = fs.readFileSync('firestore.rules', 'utf8');

rules = rules.replace(
  'let setDoc = existsAfter(setPath) ? getAfter(setPath) : get(setPath);',
  'let setDoc = existsAfter(setPath) ? getAfter(setPath) : null;'
);

rules = rules.replace(
  'let obsDoc = existsAfter(obsPath) ? getAfter(obsPath) : get(obsPath);',
  'let obsDoc = existsAfter(obsPath) ? getAfter(obsPath) : null;'
);

fs.writeFileSync('firestore.rules', rules);
