const fs = require('fs');
let code = fs.readFileSync('tests/emulator/firestoreRules.test.ts', 'utf8');
code = `import { runTransaction } from 'firebase/firestore';\n` + code;
fs.writeFileSync('tests/emulator/firestoreRules.test.ts', code);
