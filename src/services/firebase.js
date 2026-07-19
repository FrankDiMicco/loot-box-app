import { BOX_SOURCES, getDefaultBoxImages } from '../lib/catalog.js';
import { generateShareCode, getDeviceId } from '../lib/utils.js';
import { getUserSettings, saveBox } from '../lib/storage.js';
// ========== FIREBASE CONFIGURATION ==========

// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyCo5QnH9iEZL7fprJxs96y9WMq5dk1uxd8",
  authDomain: "lootbox-app-dd5fa.firebaseapp.com",
  projectId: "lootbox-app-dd5fa",
  storageBucket: "lootbox-app-dd5fa.firebasestorage.app",
  messagingSenderId: "16386037455",
  appId: "1:16386037455:web:df2ef3eb25929357dfc9ba",
  measurementId: "G-3KSR19L05G"
};

// Initialize Firebase (only if config is valid)
let db = null;
let storage = null;
let auth = null;
let firebaseEnabled = false;

try {
  if (firebaseConfig.apiKey !== "YOUR_API_KEY") {
    firebase.initializeApp(firebaseConfig);
    db = firebase.firestore();
    storage = firebase.storage();
    auth = firebase.auth();
    firebaseEnabled = true;
  } else {
    console.warn('Firebase not configured - using local-only mode');
  }
} catch (error) {
  console.error('Firebase initialization failed:', error);
}

// ========== ANONYMOUS AUTH ==========

// Firebase persists the anonymous user in IndexedDB, so the uid is stable
// per browser profile across visits. If the Anonymous provider is disabled
// or the network is down, the app degrades to its old unauthenticated
// behavior (resolves null) instead of blocking.
let _uid = null;
let _authReady = null;

const ensureSignedIn = () => {
  if (!firebaseEnabled || !auth) return Promise.resolve(null);
  if (!_authReady) {
    _authReady = new Promise((resolve) => {
      const unsub = auth.onAuthStateChanged(async (user) => {
        unsub();
        if (user) {
          _uid = user.uid;
          resolve(_uid);
          return;
        }
        try {
          const cred = await auth.signInAnonymously();
          _uid = cred.user.uid;
          resolve(_uid);
        } catch (e) {
          console.warn('Anonymous sign-in unavailable:', e.code || e.message);
          resolve(null);
        }
      });
    });
  }
  return _authReady;
};

const getUid = () => _uid;


// ========== FIREBASE BOX CATALOG SERVICE ==========

// Fetch default boxes from Firebase
const fetchDefaultBoxes = async () => {
  if (!firebaseEnabled || !db) return [];
  try {
    // Single-field query to avoid needing a composite Firestore index.
    // Filter out inactive boxes client-side instead.
    const snapshot = await db.collection('boxCatalog')
      .where('source', '==', BOX_SOURCES.DEFAULT)
      .get();
    return snapshot.docs
      .map(doc => ({
        id: doc.id,
        ...doc.data()
      }))
      .filter(box => box.active !== false);  // Include boxes where active is true, undefined, or missing
  } catch (error) {
    console.error('Error fetching default boxes:', error);
    return [];
  }
};

// Fetch seasonal boxes from Firebase
const fetchSeasonalBoxes = async () => {
  if (!firebaseEnabled || !db) return [];

  try {
    const snapshot = await db.collection('boxCatalog')
      .where('source', '==', BOX_SOURCES.SEASONAL)
      .get();

    const now = Date.now();

    // Filter expired boxes client-side to avoid needing a Firestore index
    return snapshot.docs
      .map(doc => ({
        id: doc.id,
        ...doc.data()
      }))
      .filter(box => {
        // Only show boxes that haven't expired
        return !box.seasonalInfo?.endDate || box.seasonalInfo.endDate > now;
      });
  } catch (error) {
    console.error('Error fetching seasonal boxes:', error);
    return [];
  }
};

// Get all available box images (unified loader)
const getAllAvailableBoxImages = async () => {
  let defaults = [];
  let seasonal = [];

  if (firebaseEnabled) {
    const results = await Promise.all([
      fetchDefaultBoxes(),
      fetchSeasonalBoxes(),
    ]);

    defaults = results[0];
    seasonal = results[1];

  }

  // Fall back to hardcoded defaults ONLY if Firebase
  // returned nothing (offline, not configured, etc.)
  if (defaults.length === 0) {
    defaults = getDefaultBoxImages();
  }

  return {
    defaults,
    seasonal,
    all: [...defaults, ...seasonal]
  };
};

// ========== FIRESTORE FUNCTIONS FOR SHARED BOXES ==========

// ---- Shared-box item images live in a sibling doc ----
// Item photos (data: URIs) are moved out of the main sharedBoxes doc into
// sharedBoxes/{code}/meta/images. The main doc is rewritten on every pull
// and re-broadcast to all listeners, so keeping images out of it avoids
// re-sending ~KB of image data per pull. The images doc is fetched once.

// Split a box into a main box (item images stripped) + an itemId->dataURI
// map. Clones so the caller's box object keeps its images. imagesMap is
// null when there is no items array (an update that shouldn't touch images).
const splitItemImages = (box) => {
  if (!Array.isArray(box.items)) return { mainBox: { ...box }, imagesMap: null };
  const imagesMap = {};
  const items = box.items.map(item => {
    if (item && typeof item.imageUrl === 'string' && item.imageUrl.startsWith('data:')) {
      imagesMap[item.id] = item.imageUrl;
      return { ...item, imageUrl: null };
    }
    return { ...item };
  });
  const mainBox = { ...box, items };
  // A custom (uploaded) box image also moves to the sibling doc under a
  // reserved key so it isn't re-broadcast on every pull. Catalog ids /
  // http URLs are tiny and stay inline.
  // Key can't be wrapped in double underscores (Firestore reserves those);
  // item ids are numeric strings, so 'boxCover' can't collide with one.
  if (typeof box.boxImageId === 'string' && box.boxImageId.startsWith('data:')) {
    imagesMap.boxCover = box.boxImageId;
    mainBox.boxImageId = null;
  }
  return { mainBox, imagesMap };
};

// Write the images sibling doc. Returns true if the images are safely
// stored (or there was nothing to store), false if the write was rejected
// (e.g. the meta subcollection rule isn't deployed yet) — in which case
// the caller keeps the images inline in the main doc so no photo is lost.
const writeSharedImages = async (shareCode, imagesMap) => {
  if (imagesMap === null) return true; // update not touching item images
  try {
    const ref = db.collection('sharedBoxes').doc(shareCode).collection('meta').doc('images');
    if (Object.keys(imagesMap).length === 0) {
      await ref.delete().catch(() => {});
    } else {
      await ref.set({ images: imagesMap, updatedAt: Date.now() });
    }
    return true;
  } catch (e) {
    console.warn('Could not write shared item images — keeping them inline (deploy firestore.rules to optimize):', e);
    return false;
  }
};

const readSharedImages = async (shareCode) => {
  try {
    const snap = await db.collection('sharedBoxes').doc(shareCode)
      .collection('meta').doc('images').get();
    return snap.exists ? (snap.data().images || {}) : {};
  } catch (e) {
    return {};
  }
};

// Reattach images to a box's items by id (images doc wins; falls back to
// any inline image on the item, so legacy boxes still render).
const mergeItemImages = (box, imagesMap) => {
  if (!box || !imagesMap || Object.keys(imagesMap).length === 0) return box;
  const merged = { ...box };
  if (Array.isArray(box.items)) {
    merged.items = box.items.map(item =>
      imagesMap[item.id] ? { ...item, imageUrl: imagesMap[item.id] } : item
    );
  }
  // Restore a custom box image moved to the sibling doc
  if (imagesMap.boxCover && !merged.boxImageId) {
    merged.boxImageId = imagesMap.boxCover;
  }
  return merged;
};

// Save a shared box to Firestore
const saveSharedBox = async (box) => {
  if (!firebaseEnabled || !db) {
    throw new Error('Firebase not available');
  }
  try {
    const uid = await ensureSignedIn();
    const { mainBox, imagesMap } = splitItemImages(box);
    // Move images to the sibling doc first; if that's rejected, fall back
    // to writing the original box with images kept inline (no photo lost).
    const metaOk = await writeSharedImages(box.shareCode, imagesMap);
    const docToWrite = metaOk ? mainBox : box;
    await db.collection('sharedBoxes').doc(box.shareCode).set({
      ...docToWrite,
      ...(uid ? { creatorUid: uid } : {}),
      updatedAt: Date.now()
    });
    return true;
  } catch (error) {
    console.error('Error saving shared box:', error);
    throw error;
  }
};

// Update a shared box's settings WITHOUT touching pullHistory.
// Used when the creator edits a box: the local pullHistory copy may be
// stale, and a full .set() would wipe pulls made since the last sync.
const updateSharedBox = async (shareCode, updates) => {
  if (!firebaseEnabled || !db) {
    throw new Error('Firebase not available');
  }
  await ensureSignedIn();
  // Strip creatorUid along with pullHistory: a stale local copy must never
  // overwrite the owner recorded on the server.
  const { pullHistory, creatorUid, ...safeUpdates } = updates;
  const { mainBox, imagesMap } = splitItemImages(safeUpdates);
  const metaOk = await writeSharedImages(shareCode, imagesMap);
  const docToWrite = metaOk ? mainBox : safeUpdates;
  await db.collection('sharedBoxes').doc(shareCode).update({
    ...docToWrite,
    updatedAt: Date.now()
  });
  return true;
};

// Fetch a shared box by share code. Pass includeImages=false to skip the
// extra images read when the caller only needs box metadata (e.g. the
// home feed's cards, which don't show item images).
// Legacy boxes predate anonymous auth: they carry creatorDeviceId but no
// creatorUid. When the creator's own device next loads one, stamp the
// current uid on it so ownership rules can apply. Fire-and-forget.
// NOTE: takes the shareCode explicitly — box.id is the box's LOCAL id
// (doc.data() carries an `id` field that shadows doc.id in the spread).
const backfillCreatorUid = async (box, shareCode) => {
  try {
    if (!box || box.creatorUid || !box.creatorDeviceId || !shareCode) return;
    if (box.creatorDeviceId !== getDeviceId()) return;
    const uid = await ensureSignedIn();
    if (!uid) return;
    await db.collection('sharedBoxes').doc(shareCode).update({ creatorUid: uid });
  } catch (e) { /* best-effort; retried on next load */ }
};

const fetchSharedBox = async (shareCode, includeImages = true) => {
  if (!firebaseEnabled || !db) return null;
  try {
    const doc = await db.collection('sharedBoxes').doc(shareCode).get();
    if (!doc.exists) return null;
    const box = { id: doc.id, ...doc.data() };
    backfillCreatorUid(box, shareCode);
    if (!includeImages) return box;
    const imagesMap = await readSharedImages(shareCode);
    return mergeItemImages(box, imagesMap);
  } catch (error) {
    console.error('Error fetching shared box:', error);
    return null;
  }
};

// Add a pull to a shared box in Firestore
const addPullToSharedBox = async (shareCode, pull) => {
  if (!firebaseEnabled || !db) {
    throw new Error('Firebase not available');
  }
  try {
    await ensureSignedIn();
    const boxRef = db.collection('sharedBoxes').doc(shareCode);

    await db.runTransaction(async (transaction) => {
      const doc = await transaction.get(boxRef);
      if (!doc.exists) {
        throw new Error('Shared box not found');
      }

      const data = doc.data();
      const history = data.pullHistory || [];

      // Server-side total limit check
      if (data.maxPulls && history.length >= data.maxPulls) {
        throw new Error('Box has reached maximum opens');
      }

      // Server-side per-user limit check
      if (data.maxPullsPerUser && pull.deviceId) {
        const userPulls = history.filter(p => p.deviceId === pull.deviceId).length;
        if (userPulls >= data.maxPullsPerUser) {
          throw new Error('You have reached your open limit for this box');
        }
      }

      // Name collision check: the same display name from a different
      // device would make the history ambiguous / allow impersonation
      if (pull.userName && pull.deviceId) {
        const nameTaken = history.some(p =>
          p.deviceId && p.deviceId !== pull.deviceId &&
          (p.userName || '').trim().toLowerCase() === pull.userName.trim().toLowerCase()
        );
        if (nameTaken) {
          throw new Error(`The name "${pull.userName}" is already taken in this box`);
        }
      }

      // All checks passed - append the pull
      transaction.update(boxRef, {
        pullHistory: [...history, pull],
        updatedAt: Date.now()
      });
    });

    return true;
  } catch (error) {
    console.error('Error adding pull:', error);
    throw error;
  }
};

// Listen to real-time updates on a shared box
const subscribeToSharedBox = (shareCode, callback, onError) => {
  if (!firebaseEnabled || !db) return () => {};
  return db.collection('sharedBoxes').doc(shareCode).onSnapshot((doc) => {
    if (doc.exists) {
      callback({ id: doc.id, ...doc.data() });
    } else {
      callback(null);
    }
  }, (err) => {
    console.error('Error in shared box listener:', err);
    if (onError) onError(err);
  });
};

// Delete a shared box from Firestore
const deleteSharedBox = async (shareCode) => {
  if (!firebaseEnabled || !db) return false;
  try {
    await ensureSignedIn();
    // Remove the item-images sibling doc too (Firestore doesn't cascade).
    // Best-effort: never block box deletion on it.
    await db.collection('sharedBoxes').doc(shareCode)
      .collection('meta').doc('images').delete().catch(() => {});
    await db.collection('sharedBoxes').doc(shareCode).delete();
    return true;
  } catch (error) {
    console.error('Error deleting shared box from Firestore:', error);
    return false;
  }
};

// ========== BOX TEMPLATES ==========

const saveBoxTemplate = async (box, options = {}) => {
  if (!firebaseEnabled || !db) return null;
  try {
    const uid = await ensureSignedIn();
    const shareCode = options.existingCode || generateShareCode();
    const templateData = {
      templateId: shareCode,
      ...(uid ? { creatorUid: uid } : {}),
      name: box.name,
      items: (box.items || []).map(item => ({
        id: item.id,
        name: item.name,
        percentage: item.percentage,
        color: item.color,
        maxQuantity: item.maxQuantity || null,
        imageUrl: item.imageUrl || null,
      })),
      boxImageId: box.boxImageId || null,
      hideContents: box.hideContents || false,
      hideOdds: box.hideOdds || false,
      maxPulls: box.maxPulls || null,
      createdBy: getUserSettings().displayName || 'Anonymous',
      createdAt: Date.now(),
      shareCode: shareCode,
      expiresAt: null,
      description: options.description || '',
      category: options.category || 'General',
      curated: options.curated || false,
      pullRechargeEnabled: box.pullRechargeEnabled || false,
      pullRechargeAmount: box.pullRechargeAmount || 1,
      pullRechargePeriod: box.pullRechargePeriod || 'day',
      pullRechargeMax: box.pullRechargeMax || 3,
      pullRechargeUnlimited: box.pullRechargeUnlimited !== false,
      pullRechargeCycles: box.pullRechargeCycles || 5,
    };
    await db.collection('boxTemplates').doc(shareCode).set(templateData);
    return shareCode;
  } catch (error) {
    console.error('Error saving box template:', error);
    return null;
  }
};

const fetchBoxTemplate = async (shareCode) => {
  if (!firebaseEnabled || !db) return null;
  try {
    const doc = await db.collection('boxTemplates').doc(shareCode).get();
    if (doc.exists) {
      return doc.data();
    }
    return null;
  } catch (error) {
    console.error('Error fetching box template:', error);
    return null;
  }
};

const fetchCuratedTemplates = async () => {
  if (!firebaseEnabled || !db) return [];
  try {
    const snapshot = await db.collection('boxTemplates')
      .where('curated', '==', true)
      .get();
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.error('Error fetching curated templates:', error);
    return [];
  }
};

const importBoxFromTemplate = (templateData) => {
  const newBox = {
    id: Date.now().toString(),
    name: templateData.name,
    items: templateData.items || [],
    boxImageId: templateData.boxImageId || null,
    hideContents: templateData.hideContents || false,
    hideOdds: templateData.hideOdds || false,
    maxPulls: templateData.maxPulls || null,
    pullHistory: [],
    type: 'local',
    createdAt: Date.now(),
    templateSource: {
      name: templateData.createdBy,
      shareCode: templateData.shareCode,
    },
    pullRechargeEnabled: templateData.pullRechargeEnabled || false,
    pullRechargeAmount: templateData.pullRechargeAmount || 1,
    pullRechargePeriod: templateData.pullRechargePeriod || 'day',
    pullRechargeMax: templateData.pullRechargeMax || 3,
  };
  saveBox(newBox);
  return newBox;
};


export {
  firebaseConfig,
  db,
  storage,
  auth,
  firebaseEnabled,
  ensureSignedIn,
  getUid,
  fetchDefaultBoxes,
  fetchSeasonalBoxes,
  getAllAvailableBoxImages,
  splitItemImages,
  writeSharedImages,
  readSharedImages,
  mergeItemImages,
  saveSharedBox,
  updateSharedBox,
  fetchSharedBox,
  addPullToSharedBox,
  subscribeToSharedBox,
  deleteSharedBox,
  saveBoxTemplate,
  fetchBoxTemplate,
  fetchCuratedTemplates,
  importBoxFromTemplate,
};
