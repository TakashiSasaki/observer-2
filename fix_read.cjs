const fs = require('fs');
let rules = fs.readFileSync('firestore.rules', 'utf8');
rules = rules.replace('allow read: if canReadMembership(resource.data);', 'allow read: if resource == null || canReadMembership(resource.data);');
fs.writeFileSync('firestore.rules', rules);
