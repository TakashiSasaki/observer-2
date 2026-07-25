import { assertSucceeds, assertFails, initializeTestEnvironment, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { runTransaction } from 'firebase/firestore';
import { getTestEnv, seedOwnedEndpoints, authenticatedFirestore, ids, membershipDocument, OWNER_UID } from './testSupport';

describe('Transaction test', () => {
  let testEnv: RulesTestEnvironment;

  beforeAll(async () => {
    testEnv = await getTestEnv();
  });

  afterEach(async () => {
    await testEnv.clearFirestore();
  });

  afterAll(async () => {
    await testEnv.cleanup();
  });

  test('membership write within transaction with gets', async () => {
    await seedOwnedEndpoints(ids.observationSetA, ids.observationA, OWNER_UID);
    const db = authenticatedFirestore(OWNER_UID);
    
    await assertSucceeds(runTransaction(db, async (t) => {
      const setRef = db.doc(`observationSets/${ids.observationSetA}`);
      const obsRef = db.doc(`observations/${ids.observationA}`);
      const memRef = db.doc(`observationSetMemberships/${ids.observationSetA}__${ids.observationA}`);
      await t.get(setRef);
      await t.get(obsRef);
      await t.get(memRef);
      
      t.set(
        memRef,
        membershipDocument(ids.observationSetA, ids.observationA, OWNER_UID)
      );
    }));
  });
});
