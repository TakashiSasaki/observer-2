const fs = require('fs');
let rules = fs.readFileSync('firestore.rules', 'utf8');
rules = rules.replace(/&& data\.position is int \|\| data\.position is number.+/, "&& (data.position is int || data.position is number)");
fs.writeFileSync('firestore.rules', rules);
