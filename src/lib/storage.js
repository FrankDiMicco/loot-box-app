// ========== STORAGE ==========

const APP_VERSION = 'V1.1.0';

const STORAGE_KEYS = {
  BOXES: 'lootBoxes',
  USER_SETTINGS: 'userSettings',
  FAVORITES: 'lootBoxFavorites',
  DEVICE_ID: 'lootBoxDeviceId',
  USER_NAMES: 'lootBoxUserNames',
  LAST_NAME: 'lootBoxLastName',
  SEEN_BOXES: 'lootBoxSeenBoxes',
  LAST_SEEN_PULLS: 'lootBoxLastSeenPulls',
  HAS_SEEN_WELCOME: 'lootBoxHasSeenWelcome',
};

const AppStorage = {
  get: (key) => {
    try { return localStorage.getItem(key); }
    catch { return null; }
  },
  set: (key, value) => {
    try { localStorage.setItem(key, value); }
    catch {}
  },
  remove: (key) => {
    try { localStorage.removeItem(key); }
    catch {}
  },
  getJSON: (key, fallback = null) => {
    try {
      const data = localStorage.getItem(key);
      return data ? JSON.parse(data) : fallback;
    } catch { return fallback; }
  },
  setJSON: (key, value) => {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; }
    catch { return false; }
  },
  keys: () => {
    try { return Object.keys(localStorage); }
    catch { return []; }
  },
};

const getFavorites = () => {
  return AppStorage.getJSON(STORAGE_KEYS.FAVORITES, []);
};

const toggleFavorite = (boxId) => {
  const favs = getFavorites();
  const index = favs.indexOf(boxId);
  if (index > -1) {
    favs.splice(index, 1);
  } else {
    favs.push(boxId);
  }
  AppStorage.setJSON(STORAGE_KEYS.FAVORITES, favs);
  return favs;
};

const isFavorite = (boxId) => {
  return getFavorites().includes(boxId);
};

const getAllBoxes = () => {
  return AppStorage.getJSON(STORAGE_KEYS.BOXES, []);
};

const saveBox = (box) => {
  const boxes = getAllBoxes();
  const existingIndex = boxes.findIndex(b => b.id === box.id);

  if (existingIndex >= 0) {
    boxes[existingIndex] = box;
  } else {
    boxes.push(box);
  }

  // Returns false if the write failed (e.g. localStorage quota exceeded),
  // so callers embedding item images can surface it instead of losing data.
  return AppStorage.setJSON(STORAGE_KEYS.BOXES, boxes);
};

const getSeenBoxes = () => AppStorage.getJSON(STORAGE_KEYS.SEEN_BOXES, []);

const markBoxAsSeen = (boxId) => {
  const seen = getSeenBoxes();
  if (!seen.includes(boxId)) {
    seen.push(boxId);
    AppStorage.setJSON(STORAGE_KEYS.SEEN_BOXES, seen);
  }
};

const getLastSeenPullCounts = () => AppStorage.getJSON(STORAGE_KEYS.LAST_SEEN_PULLS, {});

const markPullsSeen = (shareCode, count) => {
  const counts = getLastSeenPullCounts();
  counts[shareCode] = count;
  AppStorage.setJSON(STORAGE_KEYS.LAST_SEEN_PULLS, counts);
};

const hasSeenWelcome = () => AppStorage.get(STORAGE_KEYS.HAS_SEEN_WELCOME) === 'true';

const markWelcomeSeen = () => AppStorage.set(STORAGE_KEYS.HAS_SEEN_WELCOME, 'true');

const deleteBox = (boxId) => {
  const boxes = getAllBoxes();
  const filtered = boxes.filter(box => box.id !== boxId);
  AppStorage.setJSON(STORAGE_KEYS.BOXES, filtered);
  return true;
};

const getBoxById = (boxId) => {
  const boxes = getAllBoxes();
  return boxes.find(box => box.id === boxId) || null;
};

const getUserSettings = () => {
  return AppStorage.getJSON(STORAGE_KEYS.USER_SETTINGS, null) || {
    localBoxCount: 0,
    displayName: '',
    soundEnabled: true,
    hapticEnabled: true,
    theme: 'dark',
    uid: null,
  };
};

const saveUserSettings = (settings) => {
  AppStorage.setJSON(STORAGE_KEYS.USER_SETTINGS, settings);
  return true;
};

// Get display name for a specific box
const getBoxUserName = (shareCode) => {
  const names = AppStorage.getJSON(STORAGE_KEYS.USER_NAMES, {});
  return names[shareCode] || '';
};

// Save display name for a specific box
const setBoxUserName = (shareCode, name) => {
  const names = AppStorage.getJSON(STORAGE_KEYS.USER_NAMES, {});
  names[shareCode] = name;
  AppStorage.setJSON(STORAGE_KEYS.USER_NAMES, names);
};

// Get the most recently used name (for pre-filling)
const getLastUsedName = () => AppStorage.get(STORAGE_KEYS.LAST_NAME) || '';

// Save the most recently used name
const setLastUsedName = (name) => AppStorage.set(STORAGE_KEYS.LAST_NAME, name);

// One-time migration of old global name
const migrateOldName = () => {
  const oldName = AppStorage.get('lootBoxUserName');
  if (oldName && !AppStorage.get(STORAGE_KEYS.LAST_NAME)) {
    AppStorage.set(STORAGE_KEYS.LAST_NAME, oldName);
    const settings = getUserSettings();
    if (!settings.displayName) {
      saveUserSettings({ ...settings, displayName: oldName });
    }
    AppStorage.remove('lootBoxUserName');
  }
};


export {
  APP_VERSION,
  STORAGE_KEYS,
  AppStorage,
  getFavorites,
  toggleFavorite,
  isFavorite,
  getAllBoxes,
  saveBox,
  getSeenBoxes,
  markBoxAsSeen,
  getLastSeenPullCounts,
  markPullsSeen,
  hasSeenWelcome,
  markWelcomeSeen,
  deleteBox,
  getBoxById,
  getUserSettings,
  saveUserSettings,
  getBoxUserName,
  setBoxUserName,
  getLastUsedName,
  setLastUsedName,
  migrateOldName,
};
