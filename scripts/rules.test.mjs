// Firestore security-rules probe for Loot Box Creator.
//
// Runs the canonical firestore.rules against the local Firestore emulator
// and asserts each access path allows/denies what it should. Focus is the
// two hardening fixes (meta writes + boxTemplates curation/ownership), plus
// regression coverage on the sharedBoxes create/update/delete paths.
//
// Run it (needs Java for the emulator):
//   npm run test:rules
// which is: firebase emulators:exec --only firestore --project demo-lootbox
//           "node scripts/rules.test.mjs"
// emulators:exec sets FIRESTORE_EMULATOR_HOST, which the test env reads.

import { readFileSync } from 'node:fs';
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from '@firebase/rules-unit-testing';
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
} from 'firebase/firestore';

// Must match an entry in isAdmin() inside firestore.rules.
const ADMIN_UID = 'DOGDrkNIyTcL7HxZwtthNHM4v7k1';
const CREATOR_UID = 'creator-uid';
const OTHER_UID = 'other-uid';

const testEnv = await initializeTestEnvironment({
  projectId: 'demo-lootbox',
  firestore: { rules: readFileSync('firestore.rules', 'utf8') },
});

// Firestore contexts for each identity.
const creator = testEnv.authenticatedContext(CREATOR_UID).firestore();
const other = testEnv.authenticatedContext(OTHER_UID).firestore();
const admin = testEnv.authenticatedContext(ADMIN_UID).firestore();
const anon = testEnv.unauthenticatedContext().firestore();

// ---- tiny assertion runner (collects results, never throws early) ----
let passed = 0;
const failures = [];
async function check(name, kind, promise) {
  try {
    await (kind === 'allow' ? assertSucceeds(promise) : assertFails(promise));
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failures.push(name);
    console.log(`  ✗ ${name}  (expected ${kind === 'allow' ? 'SUCCESS' : 'DENY'})`);
  }
}
const allow = (name, p) => check(name, 'allow', p);
const deny = (name, p) => check(name, 'deny', p);

// Seed docs bypassing rules.
async function seed(fn) {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await fn(ctx.firestore());
  });
}

const validBox = (creatorUid) => ({
  name: 'Party Box',
  items: [{ id: '1', name: 'Prize', percentage: 100 }],
  creatorUid,
  creatorDeviceId: 'device-abc',
  pullHistory: [],
});
const validTemplate = (extra = {}) => ({
  name: 'Template',
  items: [{ id: '1', name: 'Prize', percentage: 100 }],
  ...extra,
});

console.log('\n== sharedBoxes: create ==');
await allow('creator creates valid box with own uid',
  setDoc(doc(creator, 'sharedBoxes/ABC123'), validBox(CREATOR_UID)));
await deny('create stamping someone else’s uid',
  setDoc(doc(other, 'sharedBoxes/ABC124'), validBox(CREATOR_UID)));
await deny('unauthenticated create',
  setDoc(doc(anon, 'sharedBoxes/ABC125'), validBox(CREATOR_UID)));
await deny('create with non-conforming doc id',
  setDoc(doc(creator, 'sharedBoxes/lower1'), validBox(CREATOR_UID)));
await deny('create with empty items',
  setDoc(doc(creator, 'sharedBoxes/ABC126'), { ...validBox(CREATOR_UID), items: [] }));

console.log('\n== sharedBoxes: update (pull append + settings) ==');
await seed(async (db) => {
  await setDoc(doc(db, 'sharedBoxes/BOX001'),
    { ...validBox(CREATOR_UID), pullHistory: [{ item: 'a' }] });
});
// Deny case first: it must not mutate the doc, so the allow case below
// still sees the seeded length-1 history and grows it by exactly one.
await deny('append that grows history by two',
  updateDoc(doc(other, 'sharedBoxes/BOX001'),
    { pullHistory: [{ item: 'a' }, { item: 'b' }, { item: 'c' }], updatedAt: Date.now() }));
await allow('any signed-in user appends exactly one pull',
  updateDoc(doc(other, 'sharedBoxes/BOX001'),
    { pullHistory: [{ item: 'a' }, { item: 'b' }], updatedAt: Date.now() }));
await allow('creator edits settings (no pullHistory change)',
  updateDoc(doc(creator, 'sharedBoxes/BOX001'), { name: 'Renamed', updatedAt: Date.now() }));
await deny('non-creator edits settings',
  updateDoc(doc(other, 'sharedBoxes/BOX001'), { name: 'Hijacked', updatedAt: Date.now() }));
await deny('creator reassigns ownership',
  updateDoc(doc(creator, 'sharedBoxes/BOX001'), { creatorUid: OTHER_UID, updatedAt: Date.now() }));

console.log('\n== sharedBoxes: delete ==');
await deny('non-creator deletes box',
  deleteDoc(doc(other, 'sharedBoxes/BOX001')));
await allow('creator deletes own box',
  deleteDoc(doc(creator, 'sharedBoxes/BOX001')));

console.log('\n== sharedBoxes/meta: image writes (FIX #1) ==');
await seed(async (db) => {
  await setDoc(doc(db, 'sharedBoxes/BOX010'), validBox(CREATOR_UID));
});
await allow('creator writes meta on own box',
  setDoc(doc(creator, 'sharedBoxes/BOX010/meta/images'), { images: {} }));
await deny('non-creator writes meta on someone else’s box',
  setDoc(doc(other, 'sharedBoxes/BOX010/meta/images'), { images: { evil: 'x' } }));
await allow('admin writes meta on any box',
  setDoc(doc(admin, 'sharedBoxes/BOX010/meta/images'), { images: {} }));
await allow('meta write during creation window (parent box absent)',
  setDoc(doc(creator, 'sharedBoxes/NOBOX9/meta/images'), { images: {} }));

console.log('\n== boxTemplates: create/update (FIX #2) ==');
await allow('user creates template with own uid, no curated flag',
  setDoc(doc(creator, 'boxTemplates/TMPL01'), validTemplate({ creatorUid: CREATOR_UID })));
await deny('non-admin creates a curated template',
  setDoc(doc(other, 'boxTemplates/TMPL02'), validTemplate({ creatorUid: OTHER_UID, curated: true })));
await allow('admin creates a curated template',
  setDoc(doc(admin, 'boxTemplates/TMPL03'), validTemplate({ creatorUid: ADMIN_UID, curated: true })));
await deny('create stamping someone else’s uid',
  setDoc(doc(other, 'boxTemplates/TMPL04'), validTemplate({ creatorUid: CREATOR_UID })));

await seed(async (db) => {
  await setDoc(doc(db, 'boxTemplates/OWNED1'),
    validTemplate({ creatorUid: CREATOR_UID }));
});
await allow('creator re-shares (updates) own template',
  setDoc(doc(creator, 'boxTemplates/OWNED1'),
    validTemplate({ creatorUid: CREATOR_UID, name: 'Updated' })));
await deny('non-creator overwrites someone else’s template',
  setDoc(doc(other, 'boxTemplates/OWNED1'),
    validTemplate({ creatorUid: OTHER_UID, name: 'Stolen' })));
await deny('non-admin flips an existing template to curated',
  setDoc(doc(creator, 'boxTemplates/OWNED1'),
    validTemplate({ creatorUid: CREATOR_UID, curated: true })));
await deny('template delete is always refused',
  deleteDoc(doc(creator, 'boxTemplates/OWNED1')));

console.log('\n== boxCatalog: admin-only writes ==');
await deny('non-admin writes catalog',
  setDoc(doc(creator, 'boxCatalog/CAT1'), { source: 'default', name: 'x' }));
await allow('admin writes catalog',
  setDoc(doc(admin, 'boxCatalog/CAT1'), { source: 'default', name: 'x' }));

// ---- summary ----
const total = passed + failures.length;
console.log(`\n${passed}/${total} checks passed`);
if (failures.length) {
  console.log('FAILED:');
  for (const f of failures) console.log(`  - ${f}`);
}
await testEnv.cleanup();
process.exit(failures.length ? 1 : 0);
