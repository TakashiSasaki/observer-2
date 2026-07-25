const fs = require('fs');
let code = fs.readFileSync('tests/emulator/firestoreRules.test.ts', 'utf8');
if (!code.includes("membership write within transaction with gets")) {
  code = code + `
test('membership write within transaction with gets', async () => {
  await seedOwnedEndpoints(ids.observationSetA, ids.observationA, OWNER_UID);
  const db = authenticatedFirestore(OWNER_UID);
  
  await assertSucceeds(runTransaction(db, async (t) => {
    const setRef = db.doc(\`observationSets/\${ids.observationSetA}\`);
    const obsRef = db.doc(\`observations/\${ids.observationA}\`);
    const memRef = db.doc(\`observationSetMemberships/\${ids.observationSetA}__\${ids.observationA}\`);
    await t.get(setRef);
    await t.get(obsRef);
    await t.get(memRef).catch(() => {});
    
    t.set(
      memRef,
      membershipDocument(ids.observationSetA, ids.observationA, OWNER_UID)
    );
  }));
});
`;
  fs.writeFileSync('tests/emulator/firestoreRules.test.ts', code);
}
