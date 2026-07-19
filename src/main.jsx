import React from 'react';
import ReactDOM from 'react-dom';
import { createRoot } from 'react-dom/client';
import './styles.css';

    const { useState, useEffect, useRef } = React;

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

    // ========== BOX SOURCE TYPES ==========

    const BOX_SOURCES = {
      DEFAULT: 'default',      // Hardcoded, always available
      SEASONAL: 'seasonal',    // Time-limited from Firebase
      LOCAL: 'local',         // User-created locally (current system)
    };

    // ========== BOX IMAGE CATALOG ==========

    // Default boxes - always available and free for all users
    const DEFAULT_BOX_IMAGES = [
      {
        id: 'chest',
        name: 'Classic Chest',
        file: 'chest.png',
        source: BOX_SOURCES.DEFAULT,
        seasonalInfo: null,
        imageUrl: 'assets/images/boxes/free/chest.png'
      },
      {
        id: 'skull_bone',
        name: 'Skull Chest',
        file: 'skull_bone.png',
        source: BOX_SOURCES.DEFAULT,
        seasonalInfo: null,
        imageUrl: 'assets/images/boxes/free/skull_bone.png'
      },
      {
        id: 'metal',
        name: 'Metal Chest',
        file: 'metal.png',
        source: BOX_SOURCES.DEFAULT,
        seasonalInfo: null,
        imageUrl: 'assets/images/boxes/free/metal.png'
      },
    ];

    // Get default images
    const getDefaultBoxImages = () => {
      return DEFAULT_BOX_IMAGES;
    };

    // Get all images as flat array (legacy compatibility)
    const getAllBoxImages = () => {
      return DEFAULT_BOX_IMAGES;
    };

    // Get image URL (supports both local and Firebase URLs)
    // Normalises paths so they work under Capacitor's different base URL.
    const getBoxImageUrl = (imageId, boxCatalog = null) => {
      // A custom uploaded box image is stored inline as a data: URI
      if (imageId && imageId.startsWith('data:')) return imageId;
      // If imageId is already a full URL, return it directly
      if (imageId && imageId.startsWith('http')) return imageId;

      // Try to find in provided catalog first (includes Firebase boxes)
      if (boxCatalog) {
        const box = boxCatalog.all?.find(img => img.id === imageId);
        if (box) return normalizeAssetPath(box.imageUrl);
      }

      // Fallback to hardcoded default images
      const image = DEFAULT_BOX_IMAGES.find(img => img.id === imageId);
      if (image) return normalizeAssetPath(image.imageUrl);

      return null;
    };

    // Strip leading './' from asset paths so they resolve correctly
    // under both the dev server and Capacitor's file:// base URL.
    const normalizeAssetPath = (path) => {
      if (!path || path.startsWith('http')) return path;
      return path.replace(/^\.\//, '');
    };

    // ========== UTILITIES ==========

    // Derive rarity tier from item odds percentage (drives reveal animation only)
    function getRarityTier(oddsPercent) {
      if (oddsPercent >= 50) return 'common';
      if (oddsPercent >= 20) return 'rare';
      if (oddsPercent >= 5)  return 'epic';
      if (oddsPercent >= 1)  return 'legendary';
      return 'mythic';
    }

    // One coherent accent hue per rarity tier — drives flash, particles, rays,
    // and card border/glow so the whole reveal reads as a single color.
    // Mythic keeps a rainbow spread as the deliberate outlier.
    function getTierAccent(tier) {
      switch (tier) {
        case 'rare':      return { accent: '#3b82f6', particles: ['#60a5fa', '#3b82f6'] };
        case 'epic':      return { accent: '#8b5cf6', particles: ['#a78bfa', '#8b5cf6', '#c4b5fd'] };
        case 'legendary': return { accent: '#f59e0b', particles: ['#fbbf24', '#f59e0b', '#fcd34d'] };
        case 'mythic':    return { accent: '#f0abfc', particles: ['#fbbf24', '#f0abfc', '#60a5fa', '#34d399', '#f87171'] };
        case 'common':
        default:          return { accent: '#94a3b8', particles: ['#cbd5e1', '#94a3b8'] };
      }
    }

    // Calculate dynamic odds
    const calculateDynamicOdds = (items, pullHistory) => {
      const remainingItems = items.map(item => {
        const pulledCount = pullHistory.filter(p => p.itemId === item.id).length;
        const remaining = item.maxQuantity 
          ? Math.max(0, item.maxQuantity - pulledCount) 
          : Infinity;
        return { ...item, remaining };
      }).filter(item => item.remaining > 0);

      if (remainingItems.length === 0) return [];

      const totalPercentage = remainingItems.reduce((sum, item) => sum + item.percentage, 0);
      
      return remainingItems.map(item => ({
        ...item,
        adjustedPercentage: (item.percentage / totalPercentage) * 100
      }));
    };

    // Validate percentages
    const validatePercentages = (items) => {
      if (items.length === 0) {
        return { valid: false, total: 0, message: 'Add at least one item' };
      }

      const total = items.reduce((sum, item) => sum + parseFloat(item.percentage || 0), 0);
      const rounded = Math.round(total * 100) / 100;
      
      if (rounded === 100) {
        return { valid: true, total: rounded, message: 'Perfect!' };
      } else if (rounded < 100) {
        return { 
          valid: false, 
          total: rounded, 
          message: `Missing ${(100 - rounded).toFixed(2)}%` 
        };
      } else {
        return { 
          valid: false, 
          total: rounded, 
          message: `Over by ${(rounded - 100).toFixed(2)}%` 
        };
      }
    };

    // Get remaining percentage
    const getRemainingPercentage = (items) => {
      const total = items.reduce((sum, item) => sum + parseFloat(item.percentage || 0), 0);
      return Math.max(0, 100 - total);
    };

    // Generate share code
    const generateShareCode = () => {
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
      let code = '';
      for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      return code;
    };

    const getDeviceId = () => {
      let deviceId = AppStorage.get(STORAGE_KEYS.DEVICE_ID);
      if (!deviceId) {
        deviceId = 'device_' + Date.now().toString(36) + '_' +
          Math.random().toString(36).substring(2, 10);
        AppStorage.set(STORAGE_KEYS.DEVICE_ID, deviceId);
      }
      if (!deviceId) {
        // Fallback for private browsing -- generate per-session ID
        return 'session_' + Date.now().toString(36) + '_' +
          Math.random().toString(36).substring(2, 10);
      }
      return deviceId;
    };

    // Format expiration countdown
    const formatExpirationCountdown = (expiresAt) => {
      const now = Date.now();
      const diff = expiresAt - now;
      
      if (diff <= 0) return 'Expired';
      
      const hours = Math.floor(diff / (1000 * 60 * 60));
      const days = Math.floor(hours / 24);
      const remainingHours = hours % 24;
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      
      if (days > 0) return `${days}d ${remainingHours}h`;
      if (hours > 0) return `${hours}h ${minutes}m`;
      if (minutes > 0) return `${minutes}m`;
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);
      return `${seconds}s`;
    };

    // Check if expiring soon
    const isExpiringSoon = (expiresAt) => {
      const now = Date.now();
      const diff = expiresAt - now;
      const hoursRemaining = diff / (1000 * 60 * 60);
      return hoursRemaining > 0 && hoursRemaining <= 24;
    };

    // ========== PULL RECHARGE UTILITIES ==========

    // Returns milliseconds per recharge period
    const getRechargeIntervalMs = (period) => {
      switch (period) {
        case 'hour': return 60 * 60 * 1000;
        case 'day': return 24 * 60 * 60 * 1000;
        case 'week': return 7 * 24 * 60 * 60 * 1000;
        case 'month': return 30 * 24 * 60 * 60 * 1000;
        default: return 24 * 60 * 60 * 1000;
      }
    };

    // Calculate current available recharge opens for a box+user
    const getRechargeOpensAvailable = (box, userPullTimestamps) => {
      if (!box.pullRechargeEnabled) return Infinity;

      const intervalMs = getRechargeIntervalMs(box.pullRechargePeriod);
      const now = Date.now();

      // If unlimited (default for backward compat), use existing logic
      if (box.pullRechargeUnlimited !== false) {
        const lastPullTime = userPullTimestamps.length > 0
          ? Math.max(...userPullTimestamps)
          : (box.createdAt || now);

        const elapsed = now - lastPullTime;
        const periodsElapsed = Math.floor(elapsed / intervalMs);

        const currentPeriodStart = now - (elapsed % intervalMs);
        const pullsInCurrentPeriod = userPullTimestamps.filter(
          t => t >= currentPeriodStart
        ).length;

        const bankedFromPrevious = Math.min(
          periodsElapsed * box.pullRechargeAmount,
          box.pullRechargeMax
        );
        const availableThisPeriod = Math.max(
          0,
          box.pullRechargeAmount - pullsInCurrentPeriod
        );

        return Math.min(
          availableThisPeriod + bankedFromPrevious,
          box.pullRechargeMax
        );
      }

      // Limited cycles logic
      const maxCycles = box.pullRechargeCycles || 5;
      const totalPeriodsSinceCreation = Math.floor(
        (now - (box.createdAt || now)) / intervalMs
      );
      const cyclesElapsed = Math.min(totalPeriodsSinceCreation, maxCycles);

      // Grand total opens ever possible = (cyclesElapsed + 1) * amount
      // The +1 accounts for the initial period before any recharge cycle fires
      const grandTotalPossible = (cyclesElapsed + 1) * box.pullRechargeAmount;
      const totalPulls = userPullTimestamps.length;

      const remaining = Math.min(
        Math.max(0, grandTotalPossible - totalPulls),
        box.pullRechargeMax
      );

      return remaining;
    };

    // Calculate time until next recharge open becomes available
    // Returns -1 when cycles are exhausted (no more recharges)
    const getTimeUntilNextRecharge = (box, userPullTimestamps) => {
      if (!box.pullRechargeEnabled) return 0;

      const intervalMs = getRechargeIntervalMs(box.pullRechargePeriod);
      const now = Date.now();

      // If NOT unlimited, check if all cycles consumed
      if (box.pullRechargeUnlimited === false) {
        const maxCycles = box.pullRechargeCycles || 5;
        const totalPeriodsSinceCreation = Math.floor(
          (now - (box.createdAt || now)) / intervalMs
        );
        if (totalPeriodsSinceCreation >= maxCycles) {
          return -1; // No more recharges
        }
      }

      const lastPullTime = userPullTimestamps.length > 0
        ? Math.max(...userPullTimestamps)
        : (box.createdAt || now);

      const elapsed = now - lastPullTime;
      const timeInCurrentPeriod = elapsed % intervalMs;
      const timeUntilNext = intervalMs - timeInCurrentPeriod;

      return timeUntilNext;
    };

    // Format remaining time as human-readable string
    const formatRechargeTimeRemaining = (ms) => {
      if (ms <= 0) return 'Now';
      const hours = Math.floor(ms / (1000 * 60 * 60));
      const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((ms % (1000 * 60)) / 1000);

      if (hours > 24) {
        const days = Math.floor(hours / 24);
        const remainHours = hours % 24;
        return `${days}d ${remainHours}h`;
      }
      if (hours > 0) return `${hours}h ${minutes}m`;
      if (minutes > 0) return `${minutes}m ${seconds}s`;
      return `${seconds}s`;
    };

    // Get user's pull timestamps for recharge calculations
    const getUserPullTimestamps = (box) => {
      const myDeviceId = getDeviceId();
      return (box.pullHistory || [])
        .filter(p => p.deviceId === myDeviceId)
        .map(p => p.timestamp);
    };

    // Get remaining recharge cycles for a box (returns null if unlimited)
    const getRechargeCyclesRemaining = (box) => {
      if (!box.pullRechargeEnabled || box.pullRechargeUnlimited !== false) return null;
      const maxCycles = box.pullRechargeCycles || 5;
      const intervalMs = getRechargeIntervalMs(box.pullRechargePeriod);
      const totalPeriodsSinceCreation = Math.floor(
        (Date.now() - (box.createdAt || Date.now())) / intervalMs
      );
      return Math.max(0, maxCycles - totalPeriodsSinceCreation);
    };

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
        const { mainBox, imagesMap } = splitItemImages(box);
        // Move images to the sibling doc first; if that's rejected, fall back
        // to writing the original box with images kept inline (no photo lost).
        const metaOk = await writeSharedImages(box.shareCode, imagesMap);
        const docToWrite = metaOk ? mainBox : box;
        await db.collection('sharedBoxes').doc(box.shareCode).set({
          ...docToWrite,
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
      const { pullHistory, ...safeUpdates } = updates;
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
    const fetchSharedBox = async (shareCode, includeImages = true) => {
      if (!firebaseEnabled || !db) return null;
      try {
        const doc = await db.collection('sharedBoxes').doc(shareCode).get();
        if (!doc.exists) return null;
        const box = { id: doc.id, ...doc.data() };
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
        const shareCode = options.existingCode || generateShareCode();
        const templateData = {
          templateId: shareCode,
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

    // ========== COMPONENTS - COMMON ==========
    
    // Button Component
    const Button = ({ children, onClick, variant = 'primary', size = 'md', disabled = false, fullWidth = false, style = {} }) => {
      const [isHovered, setIsHovered] = useState(false);

      const variants = {
        primary: {
          background: 'linear-gradient(135deg, #1e40af 0%, #3b82f6 100%)',
          color: '#ffffff',
          boxShadow: '0 4px 16px rgba(30, 64, 175, 0.4)',
        },
        secondary: {
          background: 'linear-gradient(135deg, #2563eb 0%, #60a5fa 100%)',
          color: '#ffffff',
          boxShadow: '0 4px 16px rgba(37, 99, 235, 0.4)',
        },
        ghost: {
          background: 'rgba(26, 31, 53, 0.6)',
          color: '#cbd5e1',
          border: '1px solid rgba(59, 130, 246, 0.2)',
        },
      };

      const sizes = {
        sm: { padding: '0.5rem 1rem', fontSize: '0.875rem' },
        md: { padding: '0.75rem 1.5rem', fontSize: '1rem' },
        lg: { padding: '1rem 2rem', fontSize: '1.125rem' },
      };

      const baseStyles = {
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '0.5rem',
        border: 'none',
        borderRadius: '12px',
        fontFamily: 'inherit',
        fontWeight: 600,
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'all 0.25s ease',
        width: fullWidth ? '100%' : 'auto',
        opacity: disabled ? 0.6 : 1,
        filter: disabled ? 'saturate(0.5)' : 'none',
        ...variants[variant],
        ...sizes[size],
        ...(isHovered && !disabled ? { transform: 'translateY(-2px)' } : {}),
        ...style,
      };

      return (
        <button
          style={baseStyles}
          onClick={disabled ? undefined : onClick}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          disabled={disabled}
        >
          {children}
        </button>
      );
    };

    // Input Component  
    const Input = ({ type = 'text', value, onChange, placeholder = '', label = '', fullWidth = false, ...props }) => {
      const [isFocused, setIsFocused] = useState(false);

      const containerStyles = {
        display: 'flex',
        flexDirection: 'column',
        gap: '0.5rem',
        width: fullWidth ? '100%' : 'auto',
      };

      const inputStyles = {
        width: '100%',
        padding: '12px 16px',
        fontSize: '1rem',
        fontFamily: 'inherit',
        color: '#e2e8f0',
        background: 'rgba(30, 41, 59, 0.8)',
        border: `1.5px solid ${isFocused ? 'rgba(65, 105, 225, 0.6)' : 'rgba(65, 105, 225, 0.35)'}`,
        borderRadius: '12px',
        outline: 'none',
        transition: 'all 0.2s ease',
        boxShadow: isFocused
          ? '0 0 12px rgba(65, 105, 225, 0.25), inset 0 1px 2px rgba(0, 0, 0, 0.2)'
          : '0 0 8px rgba(65, 105, 225, 0.1), inset 0 1px 2px rgba(0, 0, 0, 0.2)',
      };

      return (
        <div style={containerStyles}>
          {label && <label style={{ fontSize: '0.875rem', fontWeight: 500, color: '#cbd5e1' }}>{label}</label>}
          <input
            type={type}
            value={value}
            onChange={onChange}
            placeholder={placeholder}
            style={inputStyles}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            {...props}
          />
        </div>
      );
    };

    // Card Component
    const Card = ({ children, hover = false, onClick, style = {} }) => {
      const [isHovered, setIsHovered] = useState(false);

      const baseStyles = {
        background: 'rgba(26, 31, 53, 0.6)',
        backdropFilter: 'blur(12px)',
        border: '1px solid rgba(59, 130, 246, 0.2)',
        borderRadius: '16px',
        padding: '1.5rem',
        transition: 'all 0.3s ease',
        cursor: onClick ? 'pointer' : 'default',
        ...(hover && isHovered ? {
          transform: 'translateY(-4px)',
          borderColor: '#3b82f6',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
        } : {}),
        ...style,
      };

      return (
        <div
          style={baseStyles}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          onClick={onClick}
        >
          {children}
        </div>
      );
    };

    // Toast Component
    const Toast = ({ message, type = 'info', duration = 3000, onClose, show = false }) => {
      if (!show) return null;

      const types = {
        success: { background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.9) 0%, rgba(5, 150, 105, 0.9) 100%)', icon: '✓' },
        error: { background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.9) 0%, rgba(220, 38, 38, 0.9) 100%)', icon: '✕' },
        info: { background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.9) 0%, rgba(37, 99, 235, 0.9) 100%)', icon: 'ℹ' },
      };

      const typeStyle = types[type] || types.info;

      const containerStyles = {
        position: 'fixed',
        bottom: 'calc(2rem + env(safe-area-inset-bottom))',
        left: '50%',
        transform: 'translate(-50%, 0)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        gap: '1rem',
        padding: '1rem 1.5rem',
        background: typeStyle.background,
        backdropFilter: 'blur(12px)',
        borderRadius: '12px',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
        color: '#ffffff',
        fontWeight: 500,
        minWidth: '300px',
        animation: 'toastSlideUp 0.4s ease',
      };

      return (
        <div style={containerStyles}>
          <span style={{ fontSize: '1.25rem' }}>{typeStyle.icon}</span>
          <span>{message}</span>
          <button
            style={{
              marginLeft: 'auto',
              background: 'none',
              border: 'none',
              color: '#ffffff',
              fontSize: '1.25rem',
              cursor: 'pointer',
              opacity: 0.7,
            }}
            onClick={onClose}
          >
            ×
          </button>
        </div>
      );
    };

    // useIsMobile Hook
    const useIsMobile = (breakpoint = 768) => {
      const [isMobile, setIsMobile] = useState(window.innerWidth < breakpoint);
      useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth < breakpoint);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
      }, [breakpoint]);
      return isMobile;
    };

    // useToast Hook
    const useToast = () => {
      const [toast, setToast] = useState(null);
      const toastTimeoutRef = useRef(null);
      const toastKeyRef = useRef(0);

      const showToast = (message, type = 'info', duration = 3000) => {
        if (toastTimeoutRef.current) {
          clearTimeout(toastTimeoutRef.current);
        }
        setToast(null);
        requestAnimationFrame(() => {
          toastKeyRef.current += 1;
          setToast({ message, type, duration, key: toastKeyRef.current });
          toastTimeoutRef.current = setTimeout(() => {
            setToast(null);
          }, duration);
        });
      };

      const toastElement = toast ? (
        <Toast
          key={toast.key}
          message={toast.message}
          type={toast.type}
          duration={toast.duration}
          show={true}
          onClose={() => {
            if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
            setToast(null);
          }}
        />
      ) : null;

      return {
        showToast,
        toastElement,
        success: (message, duration) => showToast(message, 'success', duration),
        error: (message, duration) => showToast(message, 'error', duration),
        info: (message, duration) => showToast(message, 'info', duration),
      };
    };

    // ========== COMPONENTS - LAYOUT ==========

    // AboutModal
    const AboutModal = ({ show, onClose }) => {
      if (!show) return null;
      return (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
          zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 'calc(1rem + env(safe-area-inset-top)) calc(1rem + env(safe-area-inset-right)) calc(1rem + env(safe-area-inset-bottom)) calc(1rem + env(safe-area-inset-left))',
        }} onClick={onClose}>
          <div style={{
            background: 'linear-gradient(180deg, #0f172a 0%, #1e293b 100%)',
            border: '1px solid rgba(59, 130, 246, 0.2)',
            borderRadius: '16px',
            padding: '2rem',
            maxWidth: '360px',
            width: '100%',
            textAlign: 'center',
          }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#e2e8f0', marginBottom: '0.25rem' }}>
              Loot Box Creator
            </div>
            <div style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: '1rem' }}>{APP_VERSION}</div>
            <div style={{ fontSize: '0.9rem', color: '#a0aec0', marginBottom: '1.5rem', lineHeight: 1.5 }}>
              Create, customize, and share loot boxes with friends. Built with love.
            </div>
            <div style={{ height: '1px', background: 'rgba(59, 130, 246, 0.15)', marginBottom: '1rem' }} />
            <div style={{ fontSize: '0.8rem', color: '#64748b', marginBottom: '0.5rem' }}>Powered by Firebase</div>
            <button onClick={onClose} style={{
              marginTop: '1rem', padding: '0.75rem 2rem',
              background: 'linear-gradient(135deg, #1e40af 0%, #3b82f6 100%)',
              border: 'none', borderRadius: '10px', color: '#fff',
              fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.9rem',
            }}>Close</button>
          </div>
        </div>
      );
    };

    // SideDrawer
    const SideDrawer = ({ isOpen, onClose, userSettings, activeScreen, boxes = [], onNavigate, onDisplayNameChange }) => {
      const firstMenuItemRef = React.useRef(null);
      const prevOpenRef = React.useRef(false);
      const nameInputRef = React.useRef(null);
      const [editingName, setEditingName] = useState(false);
      const [nameValue, setNameValue] = useState('');

      // Header stat line — real, from existing data
      const ownBoxes = boxes.filter(b => !b.isVisitor);
      const boxCount = ownBoxes.length;
      const totalOpens = boxes.reduce((sum, b) => sum + ((b.pullHistory && b.pullHistory.length) || 0), 0);

      const startNameEdit = () => {
        setNameValue(userSettings?.displayName || '');
        setEditingName(true);
        setTimeout(() => nameInputRef.current && nameInputRef.current.focus(), 60);
      };

      const commitNameEdit = () => {
        const trimmed = nameValue.trim();
        if (trimmed && trimmed !== (userSettings?.displayName || '')) {
          onDisplayNameChange && onDisplayNameChange(trimmed);
        }
        setEditingName(false);
      };

      // Which menu key corresponds to the screen currently showing
      const keyToScreen = { myBoxes: 'home', templates: 'discover', stats: 'stats', settings: 'settings' };

      useEffect(() => {
        if (isOpen && !prevOpenRef.current) {
          // Drawer just opened — focus first menu item
          setTimeout(() => {
            if (firstMenuItemRef.current) firstMenuItemRef.current.focus();
          }, 100);
        } else if (!isOpen && prevOpenRef.current) {
          // Drawer just closed — return focus to hamburger
          if (hamburgerRef.current) hamburgerRef.current.focus();
        }
        prevOpenRef.current = isOpen;
      }, [isOpen]);

      const menuItems = [
        { key: 'myBoxes', label: 'My Boxes', icon: (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
            <rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" />
          </svg>
        )},
        { key: 'templates', label: 'Discover', icon: (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
            <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
          </svg>
        )},
        { key: 'stats', label: 'Stats', icon: (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="20" x2="12" y2="10" /><line x1="18" y1="20" x2="18" y2="4" />
            <line x1="6" y1="20" x2="6" y2="16" />
          </svg>
        )},
        'divider',
        { key: 'settings', label: 'Settings', icon: (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09a1.65 1.65 0 00-1-1.51 1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09a1.65 1.65 0 001.51-1 1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06a1.65 1.65 0 001.82.33h.09a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82v.09a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
          </svg>
        )},
        'divider',
        { key: 'shareApp', label: 'Share the App', icon: (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
            <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
            <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
          </svg>
        )},
        { key: 'about', label: 'About', icon: (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" />
          </svg>
        )},
      ];

      const displayName = userSettings?.displayName || 'Loot Box User';

      return (
        <>
          {/* Overlay */}
          <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0, 0, 0, 0.6)',
            backdropFilter: 'blur(4px)',
            zIndex: 9998,
            opacity: isOpen ? 1 : 0,
            pointerEvents: isOpen ? 'auto' : 'none',
            transition: 'opacity 0.3s ease',
          }} onClick={onClose} />

          {/* Drawer */}
          <div style={{
            position: 'fixed', top: 0, left: 0, bottom: 0,
            width: 'min(280px, 80%)',
            maxWidth: '320px',
            background: 'linear-gradient(180deg, #0f172a 0%, #1e293b 100%)',
            borderRight: '1px solid rgba(65, 105, 225, 0.2)',
            zIndex: 9999,
            transform: isOpen ? 'translateX(0)' : 'translateX(-100%)',
            transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
            overflowY: 'auto',
            boxShadow: isOpen ? '4px 0 24px rgba(0, 0, 0, 0.5)' : 'none',
            display: 'flex',
            flexDirection: 'column',
            paddingTop: 'env(safe-area-inset-top)',
            paddingBottom: 'env(safe-area-inset-bottom)',
            paddingLeft: 'env(safe-area-inset-left)',
          }}>
            {/* Header */}
            <div style={{
              padding: '24px 20px',
              borderBottom: '1px solid rgba(65, 105, 225, 0.15)',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              position: 'relative',
            }}>
              <div style={{
                width: '44px', height: '44px', borderRadius: '50%',
                background: 'linear-gradient(135deg, #4169e1, #1e40af)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '18px', fontWeight: 700, color: '#fff',
                flexShrink: 0,
              }}>
                {displayName.charAt(0).toUpperCase()}
              </div>
              <div style={{ flex: 1, minWidth: 0, paddingRight: '28px' }}>
                <div
                  onClick={startNameEdit}
                  title="Tap to change your name"
                  style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}
                >
                  <span style={{ fontWeight: 700, color: '#e2e8f0', fontSize: '1rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {displayName}
                  </span>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                    <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                    <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                  </svg>
                </div>
                <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '3px' }}>
                  {!userSettings?.displayName
                    ? 'Tap to set your name'
                    : `${boxCount} ${boxCount === 1 ? 'box' : 'boxes'} · ${totalOpens} ${totalOpens === 1 ? 'open' : 'opens'}`}
                </div>
              </div>
              <button onClick={onClose} aria-label="Close menu" style={{
                position: 'absolute', top: '16px', right: '16px',
                background: 'none', border: 'none', cursor: 'pointer', padding: '4px',
                color: '#64748b', display: 'flex',
              }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            {/* Create New Box — primary action */}
            <div style={{ padding: '14px 16px 6px' }}>
              <button
                ref={firstMenuItemRef}
                onClick={() => onNavigate('create')}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                  width: '100%', padding: '12px', fontFamily: 'inherit',
                  fontSize: '0.9rem', fontWeight: 700, color: '#ffffff',
                  background: 'linear-gradient(135deg, #1e40af 0%, #3b82f6 100%)',
                  border: 'none', borderRadius: '12px', cursor: 'pointer',
                  boxShadow: '0 4px 16px rgba(37, 99, 235, 0.35)',
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                Create New Box
              </button>
            </div>

            {/* Menu Items */}
            <div style={{ flex: 1, padding: '8px 0' }}>
              {menuItems.map((item, i) => {
                if (item === 'divider') {
                  return <div key={`div-${i}`} style={{ height: '1px', background: 'rgba(255,255,255,0.06)', margin: '8px 20px' }} />;
                }
                const isActive = keyToScreen[item.key] === activeScreen;
                return (
                  <button key={item.key} onClick={() => onNavigate(item.key)} style={{
                    display: 'flex', alignItems: 'center', gap: '14px',
                    width: '100%', padding: '14px 20px',
                    background: isActive ? 'rgba(59, 130, 246, 0.14)' : 'none',
                    border: 'none',
                    borderLeft: isActive ? '3px solid #3b82f6' : '3px solid transparent',
                    color: isActive ? '#60a5fa' : '#a0aec0', cursor: 'pointer', fontFamily: 'inherit',
                    transition: 'background 0.15s ease',
                    textAlign: 'left',
                  }}
                  onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'rgba(65, 105, 225, 0.1)'; }}
                  onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'none'; }}
                  >
                    <span style={{ display: 'flex', flexShrink: 0 }}>{item.icon}</span>
                    <span style={{ flex: 1, color: isActive ? '#60a5fa' : '#e2e8f0', fontSize: '0.95rem', fontWeight: isActive ? 700 : 500 }}>{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Name edit — mini modal (avoids the input overlapping the close X) */}
          {editingName && ReactDOM.createPortal(
            <div
              onClick={() => setEditingName(false)}
              style={{
                position: 'fixed', inset: 0, zIndex: 10001,
                background: 'rgba(0, 0, 0, 0.6)', backdropFilter: 'blur(4px)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: '1rem', animation: 'fadeIn 0.15s ease',
              }}
            >
              <div
                onClick={(e) => e.stopPropagation()}
                role="dialog"
                aria-label="Change your name"
                style={{
                  width: '100%', maxWidth: '320px',
                  background: 'linear-gradient(180deg, #0f172a 0%, #1e293b 100%)',
                  border: '1px solid rgba(99, 102, 241, 0.3)', borderRadius: '16px',
                  padding: '1.25rem', boxShadow: '0 8px 40px rgba(0, 0, 0, 0.5)',
                  animation: 'slideUp 0.2s ease',
                }}
              >
                <div style={{ fontSize: '1rem', fontWeight: 700, color: '#e2e8f0', marginBottom: '0.75rem' }}>
                  Your Name
                </div>
                <input
                  ref={nameInputRef}
                  value={nameValue}
                  onChange={(e) => setNameValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitNameEdit();
                    if (e.key === 'Escape') setEditingName(false);
                  }}
                  maxLength={30}
                  placeholder="What should we call you?"
                  style={{
                    width: '100%', padding: '12px 14px', fontSize: '1rem', fontWeight: 600,
                    fontFamily: 'inherit', color: '#e2e8f0', background: 'rgba(30, 41, 59, 0.8)',
                    border: '1.5px solid rgba(65, 105, 225, 0.6)', borderRadius: '10px',
                    outline: 'none', boxSizing: 'border-box', marginBottom: '1rem',
                  }}
                />
                <div style={{ display: 'flex', gap: '0.75rem' }}>
                  <button onClick={() => setEditingName(false)} style={{
                    flex: 1, padding: '0.7rem', fontSize: '0.9rem', fontWeight: 600, fontFamily: 'inherit',
                    color: '#a0aec0', background: 'rgba(15, 23, 42, 0.6)',
                    border: '1px solid rgba(148, 163, 184, 0.2)', borderRadius: '10px', cursor: 'pointer',
                  }}>Cancel</button>
                  <button onClick={commitNameEdit} style={{
                    flex: 1, padding: '0.7rem', fontSize: '0.9rem', fontWeight: 700, fontFamily: 'inherit',
                    color: '#ffffff', background: 'linear-gradient(135deg, #1e40af 0%, #3b82f6 100%)',
                    border: 'none', borderRadius: '10px', cursor: 'pointer',
                  }}>Save</button>
                </div>
              </div>
            </div>,
            document.body
          )}
        </>
      );
    };

    // ========== SOUND ENGINE (Web Audio API, zero audio files) ==========
    let soundEnabled = getUserSettings().soundEnabled !== false;
    let hapticEnabled = getUserSettings().hapticEnabled !== false;
    let _audioCtx = null;

    let _masterGain = null;
    let _reverb = null;

    const _ensureAudio = () => {
      if (!_audioCtx) {
        _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      }
      // Always try to resume - this is the key for iOS
      if (_audioCtx.state === 'suspended') {
        _audioCtx.resume();
      }
      // Master bus + generated reverb, so synthesized sounds get a roomy
      // tail instead of sounding like dry oscillator beeps
      if (!_masterGain) {
        const ctx = _audioCtx;
        _masterGain = ctx.createGain();
        _masterGain.gain.value = 0.9;
        _masterGain.connect(ctx.destination);
        const len = Math.floor(ctx.sampleRate * 1.8);
        const impulse = ctx.createBuffer(2, len, ctx.sampleRate);
        for (let ch = 0; ch < 2; ch++) {
          const data = impulse.getChannelData(ch);
          for (let i = 0; i < len; i++) {
            data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.4);
          }
        }
        _reverb = ctx.createConvolver();
        _reverb.buffer = impulse;
        const wet = ctx.createGain();
        wet.gain.value = 0.4;
        _reverb.connect(wet);
        wet.connect(_masterGain);
      }
      return _audioCtx;
    };

    // Route a node to the dry master bus plus the reverb send
    const _routeOut = (node, reverbAmount = 1) => {
      node.connect(_masterGain);
      if (_reverb && reverbAmount > 0) {
        const send = _audioCtx.createGain();
        send.gain.value = reverbAmount;
        node.connect(send);
        send.connect(_reverb);
      }
    };

    const _noiseBuffer = (ctx, seconds) => {
      const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      return buffer;
    };

    // Warm up audio on any user interaction (belt and suspenders)
    const _warmUpAudio = () => {
      const ctx = _ensureAudio();
      // Play a silent buffer to fully unlock iOS audio
      try {
        const buffer = ctx.createBuffer(1, 1, 22050);
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(ctx.destination);
        source.start(0);
      } catch(e) {}
    };

    // Cinematic buildup: sub-bass rumble + swelling noise + detuned riser
    const playBuildUpSound = () => {
      if (!soundEnabled) return;
      try {
        const ctx = _ensureAudio();
        const now = ctx.currentTime;
        const DUR = 1.2;

        // Sub rumble swelling underneath
        const sub = ctx.createOscillator();
        sub.type = 'triangle';
        sub.frequency.setValueAtTime(42, now);
        sub.frequency.linearRampToValueAtTime(64, now + DUR);
        const subGain = ctx.createGain();
        subGain.gain.setValueAtTime(0.0001, now);
        subGain.gain.exponentialRampToValueAtTime(0.3, now + DUR * 0.85);
        subGain.gain.linearRampToValueAtTime(0.0001, now + DUR);
        sub.connect(subGain);
        _routeOut(subGain, 0.3);
        sub.start(now); sub.stop(now + DUR);

        // Rumbling noise through an opening lowpass filter
        const noise = ctx.createBufferSource();
        noise.buffer = _noiseBuffer(ctx, DUR);
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.setValueAtTime(140, now);
        lp.frequency.exponentialRampToValueAtTime(2400, now + DUR);
        const noiseGain = ctx.createGain();
        noiseGain.gain.setValueAtTime(0.0001, now);
        noiseGain.gain.exponentialRampToValueAtTime(0.22, now + DUR * 0.9);
        noiseGain.gain.linearRampToValueAtTime(0.0001, now + DUR);
        noise.connect(lp);
        lp.connect(noiseGain);
        _routeOut(noiseGain, 0.6);
        noise.start(now); noise.stop(now + DUR);

        // Detuned riser pair for tension
        [-9, 9].forEach(cents => {
          const osc = ctx.createOscillator();
          osc.type = 'sawtooth';
          osc.detune.value = cents;
          osc.frequency.setValueAtTime(110, now);
          osc.frequency.exponentialRampToValueAtTime(880, now + DUR);
          const bp = ctx.createBiquadFilter();
          bp.type = 'bandpass';
          bp.Q.value = 1.2;
          bp.frequency.setValueAtTime(300, now);
          bp.frequency.exponentialRampToValueAtTime(2600, now + DUR);
          const g = ctx.createGain();
          g.gain.setValueAtTime(0.0001, now);
          g.gain.exponentialRampToValueAtTime(0.07, now + DUR * 0.9);
          g.gain.linearRampToValueAtTime(0.0001, now + DUR);
          osc.connect(bp);
          bp.connect(g);
          _routeOut(g, 0.8);
          osc.start(now); osc.stop(now + DUR);
        });
      } catch(e) { console.warn('Sound error:', e); }
    };

    // Rising hum while holding to charge a box open. Frequency, brightness,
    // and volume ramp with the hold progress (0..1); stopped on release.
    let _chargeNodes = null;
    const startChargeHum = () => {
      if (!soundEnabled) return;
      try {
        const ctx = _ensureAudio();
        const now = ctx.currentTime;
        // Two detuned sines a fifth apart — a smooth, shimmering "gathering
        // energy" swell (replaces the earlier buzzy sawtooth hum).
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(70, now);
        const osc2 = ctx.createOscillator();
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(105, now);
        osc2.detune.setValueAtTime(7, now);
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.setValueAtTime(500, now);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, now);
        g.gain.linearRampToValueAtTime(0.07, now + 0.15);
        osc.connect(lp); osc2.connect(lp); lp.connect(g);
        _routeOut(g, 0.4);
        osc.start(now); osc2.start(now);
        _chargeNodes = { osc, osc2, lp, g };
      } catch (e) {}
    };
    const updateChargeHum = (progress) => {
      if (!_chargeNodes || !_audioCtx) return;
      try {
        const now = _audioCtx.currentTime;
        _chargeNodes.osc.frequency.linearRampToValueAtTime(70 + progress * 180, now + 0.05);
        if (_chargeNodes.osc2) _chargeNodes.osc2.frequency.linearRampToValueAtTime(105 + progress * 270, now + 0.05);
        _chargeNodes.lp.frequency.linearRampToValueAtTime(500 + progress * 2200, now + 0.05);
        _chargeNodes.g.gain.linearRampToValueAtTime(0.07 + progress * 0.05, now + 0.05);
      } catch (e) {}
    };
    const stopChargeHum = () => {
      if (!_chargeNodes || !_audioCtx) { _chargeNodes = null; return; }
      try {
        const now = _audioCtx.currentTime;
        const { osc, osc2, g } = _chargeNodes;
        g.gain.cancelScheduledValues(now);
        g.gain.setValueAtTime(g.gain.value, now);
        g.gain.linearRampToValueAtTime(0.0001, now + 0.12);
        osc.stop(now + 0.16);
        if (osc2) osc2.stop(now + 0.16);
      } catch (e) {}
      _chargeNodes = null;
    };

    // Short downward whoosh punctuating a charged release (carries the hold's
    // energy into the shake instead of restarting with the slow build-up riser)
    const playChargeRelease = () => {
      if (!soundEnabled) return;
      try {
        const ctx = _ensureAudio();
        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(420, now);
        osc.frequency.exponentialRampToValueAtTime(80, now + 0.28);
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.setValueAtTime(2200, now);
        lp.frequency.exponentialRampToValueAtTime(500, now + 0.28);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.13, now);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.32);
        osc.connect(lp); lp.connect(g);
        _routeOut(g, 0.5);
        osc.start(now); osc.stop(now + 0.32);
      } catch (e) {}
    };

    // Reveal: impact thump + crack + lush layered bell arpeggio
    const playRevealSound = () => {
      if (!soundEnabled) return;
      try {
        const ctx = _ensureAudio();
        const now = ctx.currentTime;

        // Impact thump at the moment of opening
        const thump = ctx.createOscillator();
        thump.type = 'sine';
        thump.frequency.setValueAtTime(150, now);
        thump.frequency.exponentialRampToValueAtTime(42, now + 0.18);
        const thumpGain = ctx.createGain();
        thumpGain.gain.setValueAtTime(0.5, now);
        thumpGain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
        thump.connect(thumpGain);
        _routeOut(thumpGain, 0.25);
        thump.start(now); thump.stop(now + 0.4);

        // Crack of high noise
        const crack = ctx.createBufferSource();
        crack.buffer = _noiseBuffer(ctx, 0.2);
        const hp = ctx.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.value = 1200;
        const crackGain = ctx.createGain();
        crackGain.gain.setValueAtTime(0.25, now);
        crackGain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
        crack.connect(hp);
        hp.connect(crackGain);
        _routeOut(crackGain, 1);
        crack.start(now); crack.stop(now + 0.2);

        // Bell arpeggio, each note layered with a soft octave
        [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
          const t = now + 0.05 + i * 0.055;
          [[freq, 'triangle', 0.12], [freq * 2, 'sine', 0.05]].forEach(([f, type, vol]) => {
            const osc = ctx.createOscillator();
            osc.type = type;
            osc.frequency.value = f;
            const g = ctx.createGain();
            g.gain.setValueAtTime(0.0001, t);
            g.gain.exponentialRampToValueAtTime(vol, t + 0.02);
            g.gain.exponentialRampToValueAtTime(0.001, t + 1.1);
            osc.connect(g);
            _routeOut(g, 1);
            osc.start(t); osc.stop(t + 1.1);
          });
        });
      } catch(e) { console.warn('Sound error:', e); }
    };

    // Epic rare item fanfare (for items with <10% chance):
    // heavy impact, brassy rising stabs, sustained chord + shimmer tail
    const playRareSound = () => {
      if (!soundEnabled) return;
      try {
        const ctx = _ensureAudio();
        const now = ctx.currentTime;

        // Heavy impact
        const boom = ctx.createOscillator();
        boom.type = 'sine';
        boom.frequency.setValueAtTime(180, now);
        boom.frequency.exponentialRampToValueAtTime(36, now + 0.25);
        const boomGain = ctx.createGain();
        boomGain.gain.setValueAtTime(0.6, now);
        boomGain.gain.exponentialRampToValueAtTime(0.001, now + 0.7);
        boom.connect(boomGain);
        _routeOut(boomGain, 0.3);
        boom.start(now); boom.stop(now + 0.7);

        // Rising fanfare stabs (detuned saw pairs sound brassy)
        [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
          const t = now + 0.1 + i * 0.11;
          [-7, 7].forEach(cents => {
            const osc = ctx.createOscillator();
            osc.type = 'sawtooth';
            osc.detune.value = cents;
            osc.frequency.value = freq;
            const lp = ctx.createBiquadFilter();
            lp.type = 'lowpass';
            lp.frequency.value = 3200;
            const g = ctx.createGain();
            g.gain.setValueAtTime(0.0001, t);
            g.gain.exponentialRampToValueAtTime(0.09, t + 0.03);
            g.gain.setValueAtTime(0.09, t + 0.1);
            g.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
            osc.connect(lp);
            lp.connect(g);
            _routeOut(g, 0.9);
            osc.start(t); osc.stop(t + 0.45);
          });
        });

        // Sustained victory chord
        const chordAt = now + 0.55;
        [523.25, 659.25, 783.99, 1046.5].forEach(freq => {
          [['triangle', 0.09, 1], ['sine', 0.04, 2]].forEach(([type, vol, mult]) => {
            const osc = ctx.createOscillator();
            osc.type = type;
            osc.frequency.value = freq * mult;
            const g = ctx.createGain();
            g.gain.setValueAtTime(0.0001, chordAt);
            g.gain.exponentialRampToValueAtTime(vol, chordAt + 0.05);
            g.gain.exponentialRampToValueAtTime(0.001, chordAt + 1.8);
            osc.connect(g);
            _routeOut(g, 1);
            osc.start(chordAt); osc.stop(chordAt + 1.8);
          });
        });

        // Shimmer tail
        const shimmer = ctx.createBufferSource();
        shimmer.buffer = _noiseBuffer(ctx, 1.6);
        const shimmerHp = ctx.createBiquadFilter();
        shimmerHp.type = 'highpass';
        shimmerHp.frequency.value = 5200;
        const shimmerGain = ctx.createGain();
        shimmerGain.gain.setValueAtTime(0.0001, chordAt);
        shimmerGain.gain.exponentialRampToValueAtTime(0.05, chordAt + 0.2);
        shimmerGain.gain.exponentialRampToValueAtTime(0.001, chordAt + 1.6);
        shimmer.connect(shimmerHp);
        shimmerHp.connect(shimmerGain);
        _routeOut(shimmerGain, 1);
        shimmer.start(chordAt); shimmer.stop(chordAt + 1.6);
      } catch(e) { console.warn('Sound error:', e); }
    };

    // Common: understated — a soft thump and one gentle two-note bell
    const playCommonSound = () => {
      if (!soundEnabled) return;
      try {
        const ctx = _ensureAudio();
        const now = ctx.currentTime;

        const thump = ctx.createOscillator();
        thump.type = 'sine';
        thump.frequency.setValueAtTime(120, now);
        thump.frequency.exponentialRampToValueAtTime(60, now + 0.12);
        const tg = ctx.createGain();
        tg.gain.setValueAtTime(0.3, now);
        tg.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
        thump.connect(tg);
        _routeOut(tg, 0.2);
        thump.start(now); thump.stop(now + 0.25);

        [[659.25, 0], [987.77, 0.08]].forEach(([f, dt]) => {
          const t = now + 0.02 + dt;
          const osc = ctx.createOscillator();
          osc.type = 'triangle';
          osc.frequency.value = f;
          const g = ctx.createGain();
          g.gain.setValueAtTime(0.0001, t);
          g.gain.exponentialRampToValueAtTime(0.1, t + 0.02);
          g.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
          osc.connect(g);
          _routeOut(g, 0.8);
          osc.start(t); osc.stop(t + 0.6);
        });
      } catch(e) { console.warn('Sound error:', e); }
    };

    // Epic: brighter, higher bell run over a warm sustained chord (no brass)
    const playEpicSound = () => {
      if (!soundEnabled) return;
      try {
        const ctx = _ensureAudio();
        const now = ctx.currentTime;

        const thump = ctx.createOscillator();
        thump.type = 'sine';
        thump.frequency.setValueAtTime(160, now);
        thump.frequency.exponentialRampToValueAtTime(40, now + 0.2);
        const tg = ctx.createGain();
        tg.gain.setValueAtTime(0.5, now);
        tg.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
        thump.connect(tg);
        _routeOut(tg, 0.3);
        thump.start(now); thump.stop(now + 0.5);

        // Ascending bright arpeggio
        [587.33, 739.99, 880, 1108.73, 1318.51].forEach((freq, i) => {
          const t = now + 0.05 + i * 0.06;
          [[freq, 'triangle', 0.11], [freq * 2, 'sine', 0.04]].forEach(([f, type, vol]) => {
            const osc = ctx.createOscillator();
            osc.type = type;
            osc.frequency.value = f;
            const g = ctx.createGain();
            g.gain.setValueAtTime(0.0001, t);
            g.gain.exponentialRampToValueAtTime(vol, t + 0.02);
            g.gain.exponentialRampToValueAtTime(0.001, t + 1.0);
            osc.connect(g);
            _routeOut(g, 1);
            osc.start(t); osc.stop(t + 1.0);
          });
        });

        // Warm sustained chord underneath
        const chordAt = now + 0.4;
        [293.66, 369.99, 440].forEach(freq => {
          const osc = ctx.createOscillator();
          osc.type = 'triangle';
          osc.frequency.value = freq;
          const g = ctx.createGain();
          g.gain.setValueAtTime(0.0001, chordAt);
          g.gain.exponentialRampToValueAtTime(0.06, chordAt + 0.1);
          g.gain.exponentialRampToValueAtTime(0.001, chordAt + 1.4);
          osc.connect(g);
          _routeOut(g, 1);
          osc.start(chordAt); osc.stop(chordAt + 1.4);
        });
      } catch(e) { console.warn('Sound error:', e); }
    };

    // Mythic: grandest — deep boom, tall fanfare, choir-like pad + long shimmer
    const playMythicSound = () => {
      if (!soundEnabled) return;
      try {
        const ctx = _ensureAudio();
        const now = ctx.currentTime;

        // Deep sub boom
        const boom = ctx.createOscillator();
        boom.type = 'sine';
        boom.frequency.setValueAtTime(200, now);
        boom.frequency.exponentialRampToValueAtTime(30, now + 0.4);
        const bg = ctx.createGain();
        bg.gain.setValueAtTime(0.7, now);
        bg.gain.exponentialRampToValueAtTime(0.001, now + 1.0);
        boom.connect(bg);
        _routeOut(bg, 0.4);
        boom.start(now); boom.stop(now + 1.0);

        // Tall brassy rising fanfare
        [523.25, 659.25, 783.99, 1046.5, 1318.51, 1567.98].forEach((freq, i) => {
          const t = now + 0.1 + i * 0.1;
          [-8, 8].forEach(cents => {
            const osc = ctx.createOscillator();
            osc.type = 'sawtooth';
            osc.detune.value = cents;
            osc.frequency.value = freq;
            const lp = ctx.createBiquadFilter();
            lp.type = 'lowpass';
            lp.frequency.value = 3600;
            const g = ctx.createGain();
            g.gain.setValueAtTime(0.0001, t);
            g.gain.exponentialRampToValueAtTime(0.08, t + 0.03);
            g.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
            osc.connect(lp);
            lp.connect(g);
            _routeOut(g, 0.9);
            osc.start(t); osc.stop(t + 0.5);
          });
        });

        // Massive sustained chord with a detuned pad (choir-ish)
        const chordAt = now + 0.7;
        [261.63, 329.63, 392, 523.25, 659.25].forEach(freq => {
          [['triangle', 0.07, 1, 0], ['sine', 0.04, 2, 0], ['sawtooth', 0.02, 1, 10]].forEach(([type, vol, mult, det]) => {
            const osc = ctx.createOscillator();
            osc.type = type;
            osc.frequency.value = freq * mult;
            osc.detune.value = det;
            const g = ctx.createGain();
            g.gain.setValueAtTime(0.0001, chordAt);
            g.gain.exponentialRampToValueAtTime(vol, chordAt + 0.08);
            g.gain.exponentialRampToValueAtTime(0.001, chordAt + 2.0);
            osc.connect(g);
            _routeOut(g, 1);
            osc.start(chordAt); osc.stop(chordAt + 2.0);
          });
        });

        // Long shimmer tail
        const shimmer = ctx.createBufferSource();
        shimmer.buffer = _noiseBuffer(ctx, 2.2);
        const hp = ctx.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.value = 5000;
        const sg = ctx.createGain();
        sg.gain.setValueAtTime(0.0001, chordAt);
        sg.gain.exponentialRampToValueAtTime(0.06, chordAt + 0.3);
        sg.gain.exponentialRampToValueAtTime(0.001, chordAt + 2.0);
        shimmer.connect(hp);
        hp.connect(sg);
        _routeOut(sg, 1);
        shimmer.start(chordAt); shimmer.stop(chordAt + 2.2);
      } catch(e) { console.warn('Sound error:', e); }
    };

    // Pick the reveal sound + haptic for a rarity tier
    const playTierRevealSound = (tier) => {
      switch (tier) {
        case 'common':    playCommonSound(); triggerHaptic('reveal'); break;
        case 'rare':      playRevealSound(); triggerHaptic('reveal'); break;
        case 'epic':      playEpicSound();   triggerHaptic('rare');   break;
        case 'legendary': playRareSound();   triggerHaptic('rare');   break;
        case 'mythic':    playMythicSound(); triggerHaptic('rare');   break;
        default:          playRevealSound(); triggerHaptic('reveal');
      }
    };

    // Soft two-note ping for live party events (someone else pulled)
    const playPartyPing = () => {
      if (!soundEnabled) return;
      try {
        const ctx = _ensureAudio();
        const now = ctx.currentTime;
        [880, 1318.5].forEach((f, i) => {
          const osc = ctx.createOscillator();
          osc.type = 'sine';
          osc.frequency.value = f;
          const g = ctx.createGain();
          const t = now + i * 0.07;
          g.gain.setValueAtTime(0.0001, t);
          g.gain.exponentialRampToValueAtTime(0.06, t + 0.02);
          g.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
          osc.connect(g);
          _routeOut(g, 1);
          osc.start(t); osc.stop(t + 0.5);
        });
      } catch(e) {}
    };

    // Haptic feedback utility (uses Vibration API)
    const triggerHaptic = (pattern = 'light') => {
      if (!hapticEnabled) return;
      if (!navigator.vibrate) return;
      switch (pattern) {
        case 'light': navigator.vibrate(10); break;
        case 'medium': navigator.vibrate(25); break;
        case 'heavy': navigator.vibrate(50); break;
        case 'success': navigator.vibrate([15, 50, 15]); break;
        case 'open': navigator.vibrate([10, 30, 20, 30, 40]); break;
        case 'reveal': navigator.vibrate([20, 40, 30, 40, 50]); break;
        case 'rare': navigator.vibrate([30, 50, 40, 50, 60, 50, 80]); break;
        default: navigator.vibrate(10);
      }
    };

    // Helper: create particle elements and append to a container DOM node
    const spawnParticles = (containerEl, color = '#f59e0b', count = 24) => {
      if (!containerEl) return;
      containerEl.innerHTML = '';
      const rect = containerEl.getBoundingClientRect();
      const cx = rect.width / 2;
      const cy = rect.height / 2;
      for (let i = 0; i < count; i++) {
        const p = document.createElement('div');
        const isStar = Math.random() > 0.5;
        const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.5;
        const distance = 80 + Math.random() * 100;
        const tx = Math.cos(angle) * distance;
        const ty = Math.sin(angle) * distance;
        const size = 4 + Math.random() * 8;
        const duration = 0.6 + Math.random() * 0.6;
        const delay = Math.random() * 0.15;
        const colors = [color, color, color, '#ffffff', '#fbbf24'];
        const pColor = colors[Math.floor(Math.random() * colors.length)];
        p.style.cssText = `
          position: absolute;
          left: ${cx - size/2}px;
          top: ${cy - size/2}px;
          width: ${size}px;
          height: ${size}px;
          border-radius: ${isStar ? '0' : '50%'};
          ${isStar ? 'clip-path: polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%);' : ''}
          background: ${pColor};
          box-shadow: 0 0 ${size}px ${pColor}80;
          opacity: 0;
          pointer-events: none;
          --tx: ${tx}px;
          --ty: ${ty}px;
          animation: particleBurst ${duration}s ${delay}s ease-out forwards;
        `;
        containerEl.appendChild(p);
      }
    };

    // Header
    const hamburgerRef = React.createRef();

    const Header = ({ onMenuClick }) => {
      const isMobile = useIsMobile();
      return (
        <header style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: isMobile ? '0.75rem 1rem' : '1rem 0',
          marginBottom: isMobile ? '1rem' : '1.5rem',
          borderBottom: '1px solid rgba(59, 130, 246, 0.15)',
        }}>

          {/* Hamburger */}
          <button ref={hamburgerRef} onClick={onMenuClick} style={{
            width: '40px', height: '40px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(15, 23, 42, 0.6)',
            border: '1px solid rgba(59, 130, 246, 0.2)',
            borderRadius: '10px',
            cursor: 'pointer',
            color: '#a0aec0', padding: 0, flexShrink: 0,
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>

          {/* Wordmark */}
          <div style={{ display: 'flex', alignItems: 'baseline', gap: isMobile ? '7px' : '9px', whiteSpace: 'nowrap' }}>
            <span style={{
              fontFamily: 'var(--font-sans)',
              fontSize: isMobile ? '1.15rem' : '1.35rem',
              fontWeight: 800,
              lineHeight: 1,
              letterSpacing: '0.02em',
              textTransform: 'uppercase',
              background: 'linear-gradient(135deg, #c4b5fd 0%, #818cf8 50%, #60a5fa 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}>
              Loot Box
            </span>
            <span style={{
              fontFamily: 'var(--font-sans)',
              fontSize: isMobile ? '0.6rem' : '0.68rem',
              fontWeight: 600,
              letterSpacing: '0.3em',
              color: 'rgba(148, 163, 184, 0.7)',
              textTransform: 'uppercase',
            }}>
              Creator
            </span>
          </div>

          {/* Version */}
          <span style={{
            fontSize: '0.7rem',
            fontWeight: 400,
            color: 'rgba(148, 163, 184, 0.5)',
            marginLeft: '0.5rem',
            flexShrink: 0,
            userSelect: 'none',
          }}>
            {APP_VERSION}
          </span>

        </header>
      );
    };

    // FilterTabs
    const FilterTabs = ({ activeFilter, onFilterChange, filters = ['Shared', 'New', 'Local'] }) => {
      const isMobile = useIsMobile();
      return (
        <div style={{
          display: 'flex',
          gap: '0.25rem',
          padding: '0.5rem',
          background: 'rgba(15, 22, 36, 0.8)',
          borderRadius: '12px',
          border: '1px solid rgba(59, 130, 246, 0.2)',
          marginBottom: '2rem',
          overflow: 'hidden',
        }}>
          {filters.map(filter => {
            const isActive = activeFilter === filter;
            return (
              <button
                key={filter}
                style={{
                  flex: 1,
                  padding: '0.75rem 0.5rem',
                  fontSize: isMobile ? '0.8rem' : '0.875rem',
                  fontWeight: 600,
                  color: isActive ? '#ffffff' : '#a0aec0',
                  background: isActive ? 'linear-gradient(135deg, #1e40af 0%, #3b82f6 100%)' : 'transparent',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  transition: 'all 0.25s ease',
                  fontFamily: 'inherit',
                  boxShadow: isActive ? '0 4px 16px rgba(59, 130, 246, 0.3)' : 'none',
                }}
                onClick={() => onFilterChange(filter)}
              >
                {filter}
              </button>
            );
          })}
        </div>
      );
    };

    // ConfirmDialog Component
    const ConfirmDialog = ({ show, title, message, onConfirm, onCancel, confirmText = 'Delete', cancelText = 'Cancel' }) => {
      if (!show) return null;

      return (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.7)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          animation: 'fadeIn 0.2s ease',
          padding: 'env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)',
        }}>
          <Card style={{
            maxWidth: '400px',
            width: '90%',
            animation: 'slideUp 0.3s ease',
          }}>
            <h3 style={{
              fontSize: '1.5rem',
              fontWeight: 700,
              color: '#e2e8f0',
              marginBottom: '1rem',
            }}>
              {title}
            </h3>
            <p style={{
              fontSize: '1rem',
              color: '#a0aec0',
              marginBottom: '1.5rem',
              lineHeight: 1.6,
            }}>
              {message}
            </p>
            <div style={{ display: 'flex', gap: '1rem' }}>
              <Button variant="ghost" onClick={onCancel} fullWidth>
                {cancelText}
              </Button>
              <Button variant="secondary" onClick={onConfirm} fullWidth style={{
                background: 'linear-gradient(135deg, #0f1a2e 0%, #0f1a2e 100%)', border: '2px solid #3b6fd4', color: '#ffffff',
              }}>
                {confirmText}
              </Button>
            </div>
          </Card>
        </div>
      );
    };

    // ToggleSwitch Component
    const ToggleSwitch = ({ enabled, onToggle }) => {
      return (
        <div
          onClick={onToggle}
          style={{ minHeight: '44px', display: 'flex', alignItems: 'center', cursor: 'pointer' }}
        >
          <div style={{
            width: '44px',
            height: '24px',
            borderRadius: '12px',
            background: enabled ? 'rgba(59, 130, 246, 0.8)' : 'rgba(51, 65, 85, 0.6)',
            transition: 'background 0.2s ease',
            position: 'relative',
            flexShrink: 0,
          }}>
            <div style={{
              width: '20px',
              height: '20px',
              borderRadius: '50%',
              background: '#ffffff',
              position: 'absolute',
              top: '2px',
              left: enabled ? '22px' : '2px',
              transition: 'left 0.2s ease',
            }} />
          </div>
        </div>
      );
    };

    // SettingsRow Component
    const SettingsRow = ({ label, description, rightContent, onClick, isLast = false }) => {
      const [isHovered, setIsHovered] = useState(false);
      return (
        <div
          onClick={onClick}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '0.875rem 0',
            borderBottom: isLast ? 'none' : '1px solid rgba(148, 163, 184, 0.08)',
            cursor: onClick ? 'pointer' : 'default',
            background: onClick && isHovered ? 'rgba(59, 130, 246, 0.05)' : 'transparent',
            borderRadius: onClick ? '8px' : '0',
            transition: 'background 0.15s ease',
          }}
        >
          <div style={{ flex: 1 }}>
            <div style={{ color: '#e2e8f0', fontSize: '0.95rem', fontWeight: 500 }}>{label}</div>
            {description && (
              <div style={{ color: '#64748b', fontSize: '0.8rem', marginTop: '0.15rem' }}>{description}</div>
            )}
          </div>
          <div style={{ marginLeft: '1rem', flexShrink: 0 }}>{rightContent}</div>
        </div>
      );
    };

    // DiscoverScreen Component
    const DiscoverScreen = ({ onBack, onImport, success, info }) => {
      const isMobile = useIsMobile();
      const [templates, setTemplates] = useState([]);
      const [loading, setLoading] = useState(true);
      const [activeCategory, setActiveCategory] = useState('All');
      const [confirmTemplate, setConfirmTemplate] = useState(null);

      useEffect(() => {
        const load = async () => {
          setLoading(true);
          const results = await fetchCuratedTemplates();
          // Sort by createdAt newest first
          results.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
          setTemplates(results);
          setLoading(false);
        };
        load();
      }, []);

      const categories = ['All', ...Array.from(new Set(templates.map(t => t.category || 'General')))];

      const filtered = activeCategory === 'All'
        ? templates
        : templates.filter(t => (t.category || 'General') === activeCategory);

      const handleImport = (template) => {
        setConfirmTemplate(template);
      };

      const handleConfirmImport = () => {
        if (!confirmTemplate) return;
        onImport(confirmTemplate);
        setConfirmTemplate(null);
        success(`"${confirmTemplate.name}" added to your boxes!`);
      };

      const cardStyle = {
        background: 'rgba(15, 23, 42, 0.6)',
        border: '1px solid rgba(59, 130, 246, 0.15)',
        borderRadius: '14px',
        padding: '1rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.6rem',
      };

      return (
        <div style={{ maxWidth: '600px', margin: '0 auto', padding: isMobile ? '1rem' : '2rem', minHeight: '100vh' }}>

          {/* Back Header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
            <button onClick={onBack} style={{
              background: 'rgba(15, 23, 42, 0.6)',
              border: '1px solid rgba(59, 130, 246, 0.2)',
              borderRadius: '10px', padding: '8px 10px', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#a0aec0',
            }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
            <div>
              <h2 tabIndex={-1} className="screen-heading" style={{ margin: 0, fontSize: '1.3rem', fontWeight: 800, color: '#e2e8f0', outline: 'none' }}>Discover</h2>
              <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '1px' }}>
                Ready-made boxes to inspire you
              </div>
            </div>
          </div>

          {/* Category Filter Tabs */}
          {!loading && templates.length > 0 && (
            <div style={{
              display: 'flex', gap: '0.5rem', marginBottom: '1rem',
              overflowX: 'auto', paddingBottom: '2px',
            }}>
              {categories.map(cat => {
                const isActive = cat === activeCategory;
                return (
                  <button key={cat} onClick={() => setActiveCategory(cat)} style={{
                    flex: '0 0 auto',
                    padding: '0.35rem 0.85rem',
                    fontSize: '0.8rem', fontWeight: 600,
                    color: isActive ? '#ffffff' : '#a0aec0',
                    background: isActive
                      ? 'linear-gradient(135deg, #1e40af 0%, #3b82f6 100%)'
                      : 'rgba(15, 22, 36, 0.6)',
                    border: `1px solid ${isActive ? '#3b82f6' : 'rgba(59, 130, 246, 0.2)'}`,
                    borderRadius: '8px', cursor: 'pointer',
                    fontFamily: 'inherit', transition: 'all 0.2s ease',
                  }}>
                    {cat}
                  </button>
                );
              })}
            </div>
          )}

          {/* Loading */}
          {loading && (
            <div style={{ textAlign: 'center', padding: '3rem', color: '#64748b' }}>
              Loading templates...
            </div>
          )}

          {/* Empty State */}
          {!loading && templates.length === 0 && (
            <div style={{
              textAlign: 'center', padding: '3rem 2rem',
              color: '#64748b', fontSize: '0.9rem', lineHeight: '1.6',
            }}>
              <div style={{ fontSize: '2rem', marginBottom: '0.75rem', opacity: 0.4 }}>
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ margin: '0 auto', display: 'block' }}>
                  <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
              </div>
              No templates yet. Check back soon!
            </div>
          )}

          {/* Template Cards */}
          {!loading && filtered.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {filtered.map(template => {
                const itemCount = (template.items || []).length;
                const imageUrl = template.boxImageId
                  ? (template.boxImageId.startsWith('http')
                      ? template.boxImageId
                      : `assets/images/boxes/free/${template.boxImageId}.png`)
                  : 'assets/images/boxes/free/chest.png';

                return (
                  <div key={template.id} style={cardStyle}>
                    <div style={{ display: 'flex', gap: '0.875rem', alignItems: 'flex-start' }}>
                      {/* Box Image */}
                      <div style={{
                        width: '56px', height: '56px', flexShrink: 0,
                        borderRadius: '10px',
                        background: 'rgba(30, 64, 175, 0.2)',
                        border: '1px solid rgba(59, 130, 246, 0.2)',
                        overflow: 'hidden',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        <img
                          src={imageUrl}
                          alt={template.name}
                          style={{ width: '44px', height: '44px', objectFit: 'contain' }}
                          onError={e => { e.target.style.display = 'none'; }}
                        />
                      </div>

                      {/* Info */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          fontSize: '1rem', fontWeight: 700, color: '#e2e8f0',
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>
                          {template.name}
                        </div>
                        {template.description && (
                          <div style={{
                            fontSize: '0.8rem', color: '#a0aec0',
                            marginTop: '2px', lineHeight: '1.4',
                          }}>
                            {template.description}
                          </div>
                        )}
                        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '6px', flexWrap: 'wrap' }}>
                          <span style={{
                            fontSize: '0.65rem', fontWeight: 600, color: '#64748b',
                            background: 'rgba(100, 116, 139, 0.15)',
                            border: '1px solid rgba(100, 116, 139, 0.2)',
                            borderRadius: '6px', padding: '2px 7px',
                          }}>
                            {itemCount} {itemCount === 1 ? 'item' : 'items'}
                          </span>
                          {template.category && template.category !== 'General' && (
                            <span style={{
                              fontSize: '0.65rem', fontWeight: 600, color: '#60a5fa',
                              background: 'rgba(59, 130, 246, 0.1)',
                              border: '1px solid rgba(59, 130, 246, 0.2)',
                              borderRadius: '6px', padding: '2px 7px',
                            }}>
                              {template.category}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Import Button */}
                      <button
                        onClick={() => handleImport(template)}
                        style={{
                          flexShrink: 0,
                          padding: '0.45rem 0.9rem',
                          background: 'linear-gradient(135deg, #1e40af 0%, #3b82f6 100%)',
                          border: 'none', borderRadius: '8px',
                          color: '#fff', fontWeight: 700, fontSize: '0.8rem',
                          cursor: 'pointer', fontFamily: 'inherit',
                          alignSelf: 'center',
                        }}>
                        Import
                      </button>
                    </div>

                    {/* Item Preview Pills */}
                    {itemCount > 0 && (
                      <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', paddingTop: '0.25rem' }}>
                        {(template.items || []).slice(0, 5).map((item, i) => (
                          <span key={i} style={{
                            fontSize: '0.7rem', fontWeight: 500,
                            color: item.color || '#a0aec0',
                            background: `${item.color || '#a0aec0'}18`,
                            border: `1px solid ${item.color || '#a0aec0'}33`,
                            borderRadius: '6px', padding: '2px 8px',
                          }}>
                            {item.name}
                          </span>
                        ))}
                        {itemCount > 5 && (
                          <span style={{
                            fontSize: '0.7rem', color: '#64748b',
                            padding: '2px 4px',
                          }}>
                            +{itemCount - 5} more
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Confirm Import Dialog */}
          {confirmTemplate && (
            <ConfirmDialog
              show={true}
              title={`Import "${confirmTemplate.name}"?`}
              message={`This will add a copy of this box to your collection. You can edit it however you like.`}
              onConfirm={handleConfirmImport}
              onCancel={() => setConfirmTemplate(null)}
              confirmText="Import"
              cancelText="Cancel"
            />
          )}
        </div>
      );
    };

    // StatsScreen Component
    const StatsScreen = ({ userSettings, boxes, onBack }) => {
      const isMobile = window.innerWidth < 768;

      // Aggregate all pull history across all boxes
      const allPulls = boxes.flatMap(b => b.pullHistory || []);
      const localBoxes = boxes.filter(b => b.type === 'local' && !b.isVisitor);
      const sharedBoxes = boxes.filter(b => b.type === 'shared' && !b.isVisitor);

      const totalOpens = allPulls.length;
      const totalBoxes = localBoxes.length + sharedBoxes.length;

      // Rarest pull (lowest percentage)
      const rarestPull = allPulls.length > 0
        ? allPulls.reduce((rarest, pull) =>
            pull.percentage < rarest.percentage ? pull : rarest, allPulls[0])
        : null;

      // Most pulled item
      const itemCounts = {};
      allPulls.forEach(p => {
        itemCounts[p.itemName] = (itemCounts[p.itemName] || 0) + 1;
      });
      const mostPulledEntry = Object.entries(itemCounts).sort((a, b) => b[1] - a[1])[0];

      // Unique items discovered
      const uniqueItemNames = new Set(allPulls.map(p => p.itemName)).size;

      // Luck Score: average of (100 - percentage) for all pulls
      const luckScore = allPulls.length > 0
        ? Math.round(allPulls.reduce((sum, p) => sum + (100 - (p.percentage || 0)), 0) / allPulls.length)
        : 0;
      const luckColor = luckScore >= 70 ? '#10b981' : luckScore >= 40 ? '#f59e0b' : '#ef4444';

      // Favorite Box: box with the most total opens
      const favoriteBox = (() => {
        let best = null;
        let bestCount = 0;
        boxes.forEach(b => {
          const count = (b.pullHistory || []).length;
          if (count > bestCount) { best = b; bestCount = count; }
        });
        return best ? { name: best.name, count: bestCount } : null;
      })();

      // Recent Activity: last 5 pulls across all boxes with box name
      const recentActivity = boxes.flatMap(b =>
        (b.pullHistory || []).map(p => ({ ...p, boxName: b.name }))
      ).sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)).slice(0, 5);

      // Relative time formatter
      const formatRelativeTime = (timestamp) => {
        if (!timestamp) return '';
        const diff = Date.now() - timestamp;
        const seconds = Math.floor(diff / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);
        if (seconds < 60) return 'Just now';
        if (minutes < 60) return `${minutes}m ago`;
        if (hours < 24) return `${hours}h ago`;
        if (days === 1) return 'Yesterday';
        if (days < 7) return `${days}d ago`;
        return new Date(timestamp).toLocaleDateString();
      };


      const statCardStyle = {
        background: 'rgba(15, 23, 42, 0.6)',
        border: '1px solid rgba(59, 130, 246, 0.15)',
        borderRadius: '14px',
        padding: '1rem 1.25rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '4px',
      };

      const statLabelStyle = {
        fontSize: '0.7rem',
        fontWeight: 600,
        color: '#64748b',
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
      };

      const statValueStyle = {
        fontSize: '1.6rem',
        fontWeight: 800,
        color: '#e2e8f0',
        lineHeight: 1,
      };

      const sectionHeaderStyle = {
        fontSize: '0.75rem',
        fontWeight: 700,
        color: '#64748b',
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
        marginBottom: '0.75rem',
        marginTop: '1.5rem',
      };

      return (
        <div style={{ maxWidth: '600px', margin: '0 auto', padding: isMobile ? '1rem' : '2rem', minHeight: '100vh' }}>
          {/* Back Header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
            <button onClick={onBack} style={{
              background: 'rgba(15, 23, 42, 0.6)',
              border: '1px solid rgba(59, 130, 246, 0.2)',
              borderRadius: '10px',
              padding: '8px 10px',
              cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#a0aec0',
            }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
            <h2 tabIndex={-1} className="screen-heading" style={{ margin: 0, fontSize: '1.3rem', fontWeight: 800, color: '#e2e8f0', outline: 'none' }}>Stats</h2>
          </div>

          {/* Stats Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <div style={statCardStyle}>
              <span style={statLabelStyle}>Total Opens</span>
              <span style={{ ...statValueStyle, color: '#f59e0b' }}>{totalOpens}</span>
            </div>
            <div style={statCardStyle}>
              <span style={statLabelStyle}>Boxes Created</span>
              <span style={{ ...statValueStyle, color: '#3b82f6' }}>{totalBoxes}</span>
            </div>
            <div style={statCardStyle}>
              <span style={statLabelStyle}>Shared Boxes</span>
              <span style={{ ...statValueStyle, color: '#ec4899' }}>{sharedBoxes.length}</span>
            </div>
            <div style={statCardStyle}>
              <span style={statLabelStyle}>Items Discovered</span>
              <span style={{ ...statValueStyle, color: '#10b981' }}>{uniqueItemNames}</span>
            </div>
            {totalOpens > 0 && (
              <div style={statCardStyle}>
                <span style={statLabelStyle}>Luck Score</span>
                <span style={{ ...statValueStyle, color: luckColor }}>{luckScore}<span style={{ fontSize: '0.9rem', fontWeight: 600, color: '#64748b' }}>/100</span></span>
              </div>
            )}
            {favoriteBox && (
              <div style={statCardStyle}>
                <span style={statLabelStyle}>Favorite Box</span>
                <div style={{ color: '#e2e8f0', fontWeight: 700, fontSize: '0.95rem', lineHeight: 1.2 }}>
                  {favoriteBox.name}
                </div>
                <span style={{ fontSize: '0.7rem', color: '#64748b' }}>{favoriteBox.count} opens</span>
              </div>
            )}
          </div>

          {/* Notable Pulls */}
          {allPulls.length > 0 && (
            <>
              <div style={sectionHeaderStyle}>Notable Pulls</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {rarestPull && (
                  <div style={{
                    ...statCardStyle,
                    flexDirection: 'row', alignItems: 'center', gap: '0.75rem',
                  }}>
                    <span style={{ fontSize: '1.4rem' }}>💎</span>
                    <div>
                      <div style={statLabelStyle}>Rarest Pull</div>
                      <div style={{ color: '#e2e8f0', fontWeight: 700, fontSize: '0.95rem' }}>
                        {rarestPull.itemName}
                        <span style={{ color: '#64748b', fontWeight: 500, fontSize: '0.8rem', marginLeft: '6px' }}>
                          {rarestPull.percentage}% odds
                        </span>
                      </div>
                    </div>
                  </div>
                )}
                {mostPulledEntry && (
                  <div style={{
                    ...statCardStyle,
                    flexDirection: 'row', alignItems: 'center', gap: '0.75rem',
                  }}>
                    <span style={{ fontSize: '1.4rem' }}>🔁</span>
                    <div>
                      <div style={statLabelStyle}>Most Pulled</div>
                      <div style={{ color: '#e2e8f0', fontWeight: 700, fontSize: '0.95rem' }}>
                        {mostPulledEntry[0]}
                        <span style={{ color: '#64748b', fontWeight: 500, fontSize: '0.8rem', marginLeft: '6px' }}>
                          {mostPulledEntry[1]}x
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

          {/* Recent Activity */}
          {recentActivity.length > 0 && (
            <>
              <div style={sectionHeaderStyle}>Recent Activity</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                {recentActivity.map((pull, i) => (
                  <div key={i} style={{
                    ...statCardStyle,
                    flexDirection: 'row', alignItems: 'center', gap: '0.75rem',
                    padding: '0.7rem 1rem',
                  }}>
                    <div style={{
                      width: '8px', height: '8px', borderRadius: '50%', flexShrink: 0,
                      background: (pull.percentage || 50) <= 10 ? '#f59e0b' : (pull.percentage || 50) <= 30 ? '#3b82f6' : '#64748b',
                    }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ color: '#e2e8f0', fontWeight: 600, fontSize: '0.85rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {pull.itemName}
                      </div>
                      <div style={{ color: '#64748b', fontSize: '0.7rem' }}>
                        from {pull.boxName}
                      </div>
                    </div>
                    <span style={{ color: '#475569', fontSize: '0.7rem', flexShrink: 0 }}>
                      {formatRelativeTime(pull.timestamp)}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Empty State */}
          {totalOpens === 0 && (
            <div style={{ textAlign: 'center', padding: '3rem 2rem', color: '#64748b' }}>
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ margin: '0 auto 1rem' }}>
                <rect x="2" y="7" width="20" height="14" rx="2" />
                <path d="M16 7V5a4 4 0 00-8 0v2" />
                <circle cx="12" cy="14" r="1.5" />
              </svg>
              <div style={{ fontSize: '1rem', fontWeight: 600, color: '#a0aec0', marginBottom: '0.5rem' }}>No opens yet!</div>
              <div style={{ fontSize: '0.85rem' }}>Create a box and start opening to see your stats come to life.</div>
            </div>
          )}
        </div>
      );
    };

    // SettingsPage Component
    const SettingsPage = ({ onBack, userSettings, onSettingsChange, success, error, info }) => {
      const [displayName, setDisplayName] = useState(userSettings.displayName || '');
      const [soundOn, setSoundOn] = useState(userSettings.soundEnabled !== false);
      const [hapticOn, setHapticOn] = useState(userSettings.hapticEnabled !== false);
      const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
      const [showClearConfirm, setShowClearConfirm] = useState(false);
      const isMobile = useIsMobile();

      const allBoxes = getAllBoxes();
      const localBoxCount = allBoxes.length;
      const totalOpens = allBoxes.reduce((sum, b) => sum + (b.pullHistory ? b.pullHistory.length : 0), 0);

      const handleBack = () => {
        if (hasUnsavedChanges) {
          const updated = { ...userSettings, displayName: displayName.trim() };
          onSettingsChange(updated);
          if (displayName.trim() !== (userSettings.displayName || '')) {
            AppStorage.set(STORAGE_KEYS.LAST_NAME, displayName.trim());
          }
        }
        onBack();
      };

      const handleSoundToggle = () => {
        const newVal = !soundOn;
        setSoundOn(newVal);
        soundEnabled = newVal;
        const updated = { ...userSettings, soundEnabled: newVal };
        onSettingsChange(updated);
      };

      const handleHapticToggle = () => {
        const newVal = !hapticOn;
        setHapticOn(newVal);
        hapticEnabled = newVal;
        onSettingsChange({ ...userSettings, hapticEnabled: newVal });
        if (newVal && navigator.vibrate) {
          navigator.vibrate([15, 50, 15]);
        }
      };

      const handleSave = () => {
        const updated = { ...userSettings, displayName: displayName.trim() };
        onSettingsChange(updated);
        if (displayName.trim() !== (userSettings.displayName || '')) {
          AppStorage.set(STORAGE_KEYS.LAST_NAME, displayName.trim());
        }
        success('Settings saved');
        setHasUnsavedChanges(false);
      };

      const handleClearAllData = () => {
        // Clear all lootBox* keys
        AppStorage.keys().forEach(key => {
          if (key.startsWith('lootBox')) AppStorage.remove(key);
        });
        AppStorage.remove(STORAGE_KEYS.BOXES);
        AppStorage.remove(STORAGE_KEYS.USER_SETTINGS);
        AppStorage.remove(STORAGE_KEYS.FAVORITES);
        AppStorage.remove(STORAGE_KEYS.SEEN_BOXES);

        const defaults = getUserSettings();
        onSettingsChange(defaults);
        success('All data cleared');
        onBack();
      };

      const sectionHeaderStyle = (isFirst) => ({
        fontSize: '0.75rem',
        fontWeight: 600,
        color: '#64748b',
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        marginBottom: '0.5rem',
        marginTop: isFirst ? 0 : '1.5rem',
      });

      return (
        <div style={{ maxWidth: '600px', margin: '0 auto', animation: 'fadeIn 0.3s ease' }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
            <button onClick={handleBack} aria-label="Back" style={{
              width: '40px', height: '40px',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'rgba(15, 23, 42, 0.6)',
              border: '1px solid rgba(59, 130, 246, 0.2)',
              borderRadius: '10px', cursor: 'pointer',
              color: '#a0aec0', padding: 0, flexShrink: 0,
            }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
            <h2 tabIndex={-1} className="screen-heading" style={{ fontSize: '1.5rem', fontWeight: 700, color: '#e2e8f0', margin: 0, outline: 'none' }}>Settings</h2>
          </div>

          {/* Profile Section */}
          <div style={sectionHeaderStyle(true)}>Profile</div>
          <Card style={{ padding: '0.5rem 1rem' }}>
            <div style={{ padding: '0.875rem 0' }}>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, color: '#cbd5e1', marginBottom: '0.5rem' }}>
                Display Name
              </label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => { setDisplayName(e.target.value); setHasUnsavedChanges(true); }}
                placeholder="What should we call you?"
                style={{
                  width: '100%', padding: '16px 20px', fontSize: '1.15rem', fontFamily: 'inherit', fontWeight: 600,
                  color: '#e2e8f0', background: 'rgba(30, 64, 175, 0.15)',
                  border: displayName.trim() ? '2px solid rgba(59, 130, 246, 0.5)' : '2px solid rgba(56, 189, 248, 0.3)',
                  borderRadius: '14px', outline: 'none', transition: 'all 0.25s ease',
                  boxShadow: '0 0 20px rgba(59, 130, 246, 0.1)', boxSizing: 'border-box',
                }}
                onFocus={(e) => {
                  e.target.style.borderColor = '#3b82f6';
                  e.target.style.boxShadow = '0 0 24px rgba(59, 130, 246, 0.25)';
                  e.target.style.background = 'rgba(30, 64, 175, 0.2)';
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = displayName.trim() ? 'rgba(59, 130, 246, 0.5)' : 'rgba(56, 189, 248, 0.3)';
                  e.target.style.boxShadow = '0 0 20px rgba(59, 130, 246, 0.1)';
                  e.target.style.background = 'rgba(30, 64, 175, 0.15)';
                }}
              />
              <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.5rem' }}>
                Your default name for solo boxes and new shared boxes
              </div>
            </div>
          </Card>

          {/* Sound & Feedback Section */}
          <div style={sectionHeaderStyle(false)}>Sound & Feedback</div>
          <Card style={{ padding: '0.5rem 1rem' }}>
            <SettingsRow
              label="Sound Effects"
              description="Opening sounds and UI feedback"
              rightContent={<ToggleSwitch enabled={soundOn} onToggle={handleSoundToggle} />}
            />
            <SettingsRow
              label="Haptic Feedback"
              description="Vibration on taps and box opens"
              rightContent={<ToggleSwitch enabled={hapticOn} onToggle={handleHapticToggle} />}
              isLast
            />
          </Card>

          {/* Data & Storage Section */}
          <div style={sectionHeaderStyle(false)}>Data & Storage</div>
          <Card style={{ padding: '0.5rem 1rem' }}>
            <SettingsRow
              label="Local Boxes"
              rightContent={<span style={{ color: '#a0aec0', fontSize: '0.9rem' }}>{localBoxCount}</span>}
            />
            <SettingsRow
              label="Total Opens"
              rightContent={<span style={{ color: '#a0aec0', fontSize: '0.9rem' }}>{totalOpens}</span>}
            />
            <div style={{ padding: '0.875rem 0' }}>
              <Button
                variant="ghost"
                fullWidth
                onClick={() => setShowClearConfirm(true)}
                style={{ color: '#ef4444', borderColor: 'rgba(239, 68, 68, 0.3)' }}
              >
                Clear All Data
              </Button>
            </div>
          </Card>

          {/* About Section */}
          <div style={sectionHeaderStyle(false)}>About</div>
          <Card style={{ padding: '0.5rem 1rem' }}>
            <SettingsRow
              label="Loot Box Creator"
              rightContent={<span style={{ color: '#a0aec0', fontSize: '0.85rem' }}>{APP_VERSION}</span>}
            />
          </Card>

          {/* Save Button */}
          {hasUnsavedChanges && (
            <div style={{ marginTop: '1.5rem', marginBottom: '2rem' }}>
              <Button variant="primary" fullWidth onClick={handleSave}>
                Save Changes
              </Button>
            </div>
          )}

          {/* Clear Data Confirm Dialog */}
          <ConfirmDialog
            show={showClearConfirm}
            title="Clear All Data?"
            message="This will delete all your local boxes, settings, and preferences. Shared boxes on the server will not be affected. This cannot be undone."
            confirmText="Delete Everything"
            cancelText="Keep My Data"
            onConfirm={() => { setShowClearConfirm(false); handleClearAllData(); }}
            onCancel={() => setShowClearConfirm(false)}
          />
        </div>
      );
    };

    // BoxCard (simplified for brevity)
    const BoxCard = ({ box, onClick, onEdit, onDelete, onDuplicate, success, error, isNew, isFav, onToggleFavorite }) => {
      const isMobile = useIsMobile();
      const { name, items = [], pullHistory = [], maxPulls, maxPullsPerUser, type = 'local' } = box;
      const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
      const [showOverflowMenu, setShowOverflowMenu] = useState(false);
      const boxFavId = box.shareCode || box.id;

      // Check for new pulls on shared boxes since last viewed
      const hasNewPulls = (() => {
        if (!box.shareCode || !box.type || box.type !== 'shared') return false;
        const lastSeen = getLastSeenPullCounts()[box.shareCode];
        if (lastSeen === undefined) return false; // Never viewed = no dot (isNew badge handles that)
        return pullHistory.length > lastSeen;
      })();

      // Close overflow menu on outside click
      useEffect(() => {
        if (!showOverflowMenu) return;
        const handleClickOutside = () => setShowOverflowMenu(false);
        const timer = setTimeout(() => {
          document.addEventListener('click', handleClickOutside);
        }, 10);
        return () => {
          clearTimeout(timer);
          document.removeEventListener('click', handleClickOutside);
        };
      }, [showOverflowMenu]);

      // Compute opens info
      const opensRemaining = (() => {
        if (!maxPulls || maxPulls <= 0) return { unlimited: true };
        const used = pullHistory.length;
        const remaining = Math.max(0, maxPulls - used);
        return { unlimited: false, remaining, total: maxPulls };
      })();

      const opensIconColor = (() => {
        if (opensRemaining.unlimited) return '#a0aec0';
        if (opensRemaining.remaining <= 0) return '#ef4444';
        if (opensRemaining.remaining <= 2) return '#ef4444';
        const pct = opensRemaining.remaining / opensRemaining.total;
        if (pct <= 0.5) return '#f59e0b';
        return '#10b981';
      })();

      // Expiration color
      const expirationIconColor = (() => {
        if (!box.expiresAt) return '#a0aec0';
        const diff = box.expiresAt - Date.now();
        if (diff <= 0) return '#ef4444';
        if (diff <= 60 * 60 * 1000) return '#ef4444';
        if (diff <= 24 * 60 * 60 * 1000) return '#f59e0b';
        return '#a0aec0';
      })();

      const expirationPulse = box.expiresAt && (box.expiresAt - Date.now()) <= 60 * 60 * 1000 && (box.expiresAt - Date.now()) > 0;

      // Shared box participant count
      const uniqueParticipants = (() => {
        if (box.type !== 'shared') return 0;
        const seen = new Set();
        (pullHistory || []).forEach(p => {
          if (p.userName) seen.add(p.userName);
          else if (p.deviceId) seen.add(p.deviceId);
        });
        return seen.size;
      })();

      // Your opens (per-person usage for current user)
      const yourOpensUsed = (() => {
        if (!maxPullsPerUser || maxPullsPerUser <= 0) return 0;
        const myDeviceId = getDeviceId();
        return (pullHistory || []).filter(p => p.deviceId === myDeviceId).length;
      })();

      const yourOpensRemaining = maxPullsPerUser ? Math.max(0, maxPullsPerUser - yourOpensUsed) : 0;

      const yourOpensColor = (() => {
        if (!maxPullsPerUser || maxPullsPerUser <= 0) return '#ec4899';
        if (yourOpensUsed === 0) return '#10b981';
        if (yourOpensUsed >= maxPullsPerUser) return '#ef4444';
        return '#ec4899';
      })();

      const yourOpensDepleted = maxPullsPerUser > 0 && yourOpensUsed >= maxPullsPerUser;

      const isExpired = box.expiresAt ? Date.now() > box.expiresAt : false;

      // Pull recharge for card display
      const rechargeInfo = (() => {
        if (!box.pullRechargeEnabled) return null;
        const ts = getUserPullTimestamps(box);
        const available = getRechargeOpensAvailable(box, ts);
        const periodLabel = box.pullRechargePeriod === 'hour' ? 'hr' : box.pullRechargePeriod === 'day' ? 'day' : box.pullRechargePeriod === 'week' ? 'wk' : 'mo';
        const cyclesRemaining = getRechargeCyclesRemaining(box);
        const allCyclesUsed = cyclesRemaining === 0;
        const timeUntilNext = getTimeUntilNextRecharge(box, ts);
        return { available, max: box.pullRechargeMax, periodLabel, amount: box.pullRechargeAmount, cyclesRemaining, allCyclesUsed, timeUntilNext };
      })();

      const rechargeColor = (() => {
        if (!rechargeInfo) return '#a0aec0';
        if (rechargeInfo.allCyclesUsed && rechargeInfo.available <= 0) return '#ef4444';
        if (rechargeInfo.available <= 0) return '#f59e0b';
        return '#10b981';
      })();

      const handleEdit = (e) => {
        e.stopPropagation();
        onEdit && onEdit(box);
      };

      const handleDeleteClick = (e) => {
        e.stopPropagation();
        setShowDeleteConfirm(true);
      };

      const handleShare = async (e) => {
        e.stopPropagation();

        let url;
        if (box.type === 'local') {
          // Reuse the box's existing template doc so repeated shares
          // keep the same URL instead of creating orphan documents.
          const shareCode = await saveBoxTemplate(box, { existingCode: box.templateShareCode });
          if (!shareCode) {
            error && error('Failed to share box');
            return;
          }
          if (box.templateShareCode !== shareCode) {
            saveBox({ ...box, templateShareCode: shareCode });
          }
          url = `${window.location.origin}${window.location.pathname}#/template/${shareCode}`;
        } else {
          if (!box.shareCode) return;
          url = `${window.location.origin}${window.location.pathname}#/box/${box.shareCode}`;
        }

        if (navigator.share) {
          try {
            await navigator.share({
              title: box.name,
              text: `Check out my loot box "${box.name}"!`,
              url: url,
            });
          } catch (err) {
            if (err.name !== 'AbortError') {
              console.error('Share failed:', err);
            }
          }
        } else {
          try {
            await navigator.clipboard.writeText(url);
            success && success('Link copied to clipboard');
          } catch {
            // Final fallback: textarea hack
            const textarea = document.createElement('textarea');
            textarea.value = url;
            textarea.style.position = 'fixed';
            textarea.style.opacity = '0';
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
            success && success('Link copied to clipboard');
          }
        }
      };

      const handleDeleteConfirm = () => {
        setShowDeleteConfirm(false);
        onDelete && onDelete(box.id);
      };

      const handleDeleteCancel = () => {
        setShowDeleteConfirm(false);
      };

      return (
        <>
          <div
            onClick={() => {
              // Whole card opens the box; if a menu or tooltip is open,
              // the tap just dismisses it instead.
              if (showOverflowMenu) {
                setShowOverflowMenu(false);
                return;
              }
              onClick && onClick();
            }}
            style={{
              background: 'linear-gradient(135deg, rgba(26, 31, 53, 0.8) 0%, rgba(15, 10, 40, 0.95) 100%)',
              border: '1px solid rgba(99, 102, 241, 0.45)',
              borderRadius: '14px',
              overflow: 'hidden',
              transition: 'all 0.25s ease',
              cursor: 'pointer',
              position: 'relative',
              boxShadow: '0 0 18px rgba(99, 102, 241, 0.15), 0 4px 20px rgba(0, 0, 0, 0.3)',
            }}
          >

            {/* New pulls notification dot moved inline to badges row */}

            {/* Action buttons - HORIZONTAL row, absolute top right */}
            <div
              data-no-open="true"
              onClick={(e) => e.stopPropagation()}
              style={{
                position: 'absolute',
                top: '0.5rem',
                right: '0.5rem',
                display: 'flex',
                flexDirection: 'row',
                gap: '6px',
                zIndex: 3,
              }}
            >
              {/* Favorite */}
              <button onClick={(e) => { e.stopPropagation(); onToggleFavorite && onToggleFavorite(boxFavId); }} style={{
                width: '34px', height: '34px', borderRadius: '8px',
                background: 'rgba(15, 23, 42, 0.75)',
                backdropFilter: 'blur(4px)',
                border: isFav ? '1px solid rgba(245, 158, 11, 0.3)' : '1px solid rgba(148, 163, 184, 0.2)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', transition: 'all 0.2s ease', padding: 0,
              }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill={isFav ? '#f59e0b' : 'none'} stroke={isFav ? '#f59e0b' : '#a0aec0'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ filter: isFav ? 'drop-shadow(0 0 4px rgba(245, 158, 11, 0.5))' : 'none' }}>
                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                </svg>
              </button>

              {/* Share */}
              <button onClick={(e) => { e.stopPropagation(); handleShare(e); }} style={{
                width: '34px', height: '34px', borderRadius: '8px',
                background: 'rgba(15, 23, 42, 0.75)',
                backdropFilter: 'blur(4px)',
                border: '1px solid rgba(148, 163, 184, 0.2)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', transition: 'all 0.2s ease', padding: 0,
              }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8" />
                  <polyline points="16 6 12 2 8 6" />
                  <line x1="12" y1="2" x2="12" y2="15" />
                </svg>
              </button>

              {/* Three-dot overflow menu */}
              <div style={{ position: 'relative' }}>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    e.nativeEvent.stopImmediatePropagation();
                    setShowOverflowMenu(!showOverflowMenu);
                  }}
                  style={{
                    width: '34px', height: '34px', borderRadius: '8px',
                    background: showOverflowMenu ? 'rgba(59, 130, 246, 0.3)' : 'rgba(15, 23, 42, 0.75)',
                    backdropFilter: 'blur(4px)',
                    border: showOverflowMenu ? '1px solid rgba(59, 130, 246, 0.4)' : '1px solid rgba(148, 163, 184, 0.2)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    cursor: 'pointer', transition: 'all 0.2s ease', padding: 0,
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="#a0aec0">
                    <circle cx="12" cy="5" r="2" />
                    <circle cx="12" cy="12" r="2" />
                    <circle cx="12" cy="19" r="2" />
                  </svg>
                </button>

                {showOverflowMenu && (
                  <div
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      position: 'absolute', top: '100%', right: '0', marginTop: '4px',
                      background: 'rgba(15, 23, 42, 0.95)', border: '1px solid rgba(65, 105, 225, 0.3)',
                      borderRadius: '10px', padding: '4px', minWidth: '140px', zIndex: 20,
                      boxShadow: '0 8px 24px rgba(0, 0, 0, 0.5)',
                    }}
                  >
                    {!box.isVisitor && (
                      <button
                        onClick={(e) => { e.stopPropagation(); setShowOverflowMenu(false); onEdit && onEdit(box); }}
                        style={{
                          width: '100%', padding: '10px 12px', background: 'transparent', border: 'none',
                          borderRadius: '8px', color: '#e2e8f0', fontSize: '0.85rem', fontWeight: 500,
                          fontFamily: 'inherit', cursor: 'pointer', display: 'flex', alignItems: 'center',
                          gap: '10px', transition: 'background 0.15s ease',
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(59, 130, 246, 0.1)'}
                        onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a0aec0" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                          <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                        </svg>
                        Edit
                      </button>
                    )}
                    {!box.isVisitor && (
                      <button
                        onClick={(e) => { e.stopPropagation(); setShowOverflowMenu(false); onDuplicate && onDuplicate(box); }}
                        style={{
                          width: '100%', padding: '10px 12px', background: 'transparent', border: 'none',
                          borderRadius: '8px', color: '#e2e8f0', fontSize: '0.85rem', fontWeight: 500,
                          fontFamily: 'inherit', cursor: 'pointer', display: 'flex', alignItems: 'center',
                          gap: '10px', transition: 'background 0.15s ease',
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(59, 130, 246, 0.1)'}
                        onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a0aec0" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                          <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                        </svg>
                        Duplicate
                      </button>
                    )}
                    {!box.isVisitor && (
                      <div style={{ height: '1px', background: 'rgba(148, 163, 184, 0.1)', margin: '4px 8px' }} />
                    )}
                    <button
                      onClick={(e) => { e.stopPropagation(); setShowOverflowMenu(false); setShowDeleteConfirm(true); }}
                      style={{
                        width: '100%', padding: '10px 12px', background: 'transparent', border: 'none',
                        borderRadius: '8px', color: '#ef4444', fontSize: '0.85rem', fontWeight: 500,
                        fontFamily: 'inherit', cursor: 'pointer', display: 'flex', alignItems: 'center',
                        gap: '10px', transition: 'background 0.15s ease',
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)'}
                      onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                      </svg>
                      {box.isVisitor ? 'Remove' : 'Delete'}
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Main card content - HORIZONTAL flex: left info + right chest */}
            <div style={{
              display: 'flex',
              flexDirection: 'row',
              minHeight: isMobile ? '190px' : '210px',
              position: 'relative',
            }}>

              {/* LEFT SIDE: badges, name, info grid — taps bubble up to open the box */}
              <div
                style={{
                  flex: 1,
                  minWidth: 0,
                  padding: '0.75rem 0 0.75rem 0.85rem',
                  display: 'flex',
                  flexDirection: 'column',
                  zIndex: 2,
                }}
              >
                {/* Box name */}
                <div
                  title={name}
                  style={{
                    fontSize: '1.05rem',
                    fontWeight: 700,
                    color: '#e2e8f0',
                    marginBottom: '0.35rem',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    paddingRight: '4px',
                  }}>
                  {name}
                </div>

                {/* Status badges */}
                <div style={{
                  display: 'flex',
                  flexDirection: 'row',
                  gap: '0.35rem',
                  flexWrap: 'wrap',
                  marginBottom: '0.6rem',
                  alignItems: 'center',
                }}>
                  {hasNewPulls && (
                    <div style={{
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      background: '#3b82f6',
                      boxShadow: '0 0 6px rgba(59, 130, 246, 0.6)',
                      flexShrink: 0,
                      animation: 'badgePulse 2s ease-in-out infinite',
                    }} />
                  )}
                  {isNew && (
                    <span style={{
                      padding: '0.15rem 0.5rem', borderRadius: '5px',
                      fontSize: '0.55rem', fontWeight: 700, color: '#34d399',
                      textTransform: 'uppercase', letterSpacing: '0.03em',
                      background: 'transparent',
                      border: '1px solid rgba(52, 211, 153, 0.5)',
                      animation: 'badgePulse 2s ease-in-out infinite',
                    }}>NEW</span>
                  )}
                  {box.type === 'shared' && !box.isVisitor && (
                    <span style={{
                      padding: '0.15rem 0.5rem', borderRadius: '5px',
                      fontSize: '0.55rem', fontWeight: 700, color: '#a78bfa',
                      textTransform: 'uppercase', letterSpacing: '0.03em',
                      background: 'transparent',
                      border: '1px solid rgba(167, 139, 250, 0.5)',
                    }}>GROUP</span>
                  )}
                  {box.isVisitor && (
                    <span style={{
                      padding: '0.15rem 0.5rem', borderRadius: '5px',
                      fontSize: '0.55rem', fontWeight: 700, color: '#34d399',
                      textTransform: 'uppercase', letterSpacing: '0.03em',
                      background: 'transparent',
                      border: '1px solid rgba(52, 211, 153, 0.5)',
                    }}>JOINED</span>
                  )}
                  {isExpired && (
                    <span style={{
                      padding: '0.15rem 0.5rem', borderRadius: '5px',
                      fontSize: '0.55rem', fontWeight: 700, color: '#f87171',
                      textTransform: 'uppercase', letterSpacing: '0.03em',
                      background: 'transparent',
                      border: '1px solid rgba(248, 113, 113, 0.5)',
                    }}>EXPIRED</span>
                  )}
                </div>

                {/* Plain-language stats */}
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '5px',
                  marginTop: 'auto',
                  marginBottom: 'auto',
                  minWidth: 0,
                  fontSize: '0.72rem',
                  fontWeight: 500,
                  color: '#a0aec0',
                  lineHeight: 1.3,
                }}>

                  {/* Items and opens */}
                  <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {items.length} item{items.length === 1 ? '' : 's'}
                    <span style={{ color: '#475569' }}> · </span>
                    <span style={{ color: opensRemaining.unlimited ? '#a0aec0' : opensIconColor }}>
                      {opensRemaining.unlimited
                        ? `${pullHistory.length} open${pullHistory.length === 1 ? '' : 's'}`
                        : `${pullHistory.length}/${opensRemaining.total} opens`}
                    </span>
                  </div>

                  {/* Shared boxes: players and your remaining opens */}
                  {box.type === 'shared' && (
                    <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {uniqueParticipants} player{uniqueParticipants === 1 ? '' : 's'}
                      {maxPullsPerUser > 0 && (
                        <>
                          <span style={{ color: '#475569' }}> · </span>
                          <span style={{ color: yourOpensColor }}>
                            {yourOpensDepleted ? 'no opens left for you' : `${yourOpensRemaining} left for you`}
                          </span>
                        </>
                      )}
                    </div>
                  )}

                  {/* Expiration */}
                  {box.expiresAt && (
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: '4px',
                      color: expirationIconColor, whiteSpace: 'nowrap',
                    }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{
                        flexShrink: 0,
                        animation: expirationPulse ? 'pulse 2s ease-in-out infinite' : 'none',
                      }}>
                        <circle cx="12" cy="12" r="10" />
                        <polyline points="12 6 12 12 16 14" />
                      </svg>
                      {isExpired ? 'Expired' : `${formatExpirationCountdown(box.expiresAt)} left`}
                    </div>
                  )}

                  {/* Recharge */}
                  {rechargeInfo && (
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: '4px',
                      color: rechargeColor, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                      </svg>
                      {rechargeInfo.allCyclesUsed && rechargeInfo.available <= 0
                        ? 'No recharges left'
                        : rechargeInfo.available <= 0
                          ? `Recharges in ${formatRechargeTimeRemaining(rechargeInfo.timeUntilNext)}`
                          : `${rechargeInfo.available}/${rechargeInfo.max} recharge open${rechargeInfo.max === 1 ? '' : 's'}`}
                    </div>
                  )}

                </div>
                {/* End stats */}
              </div>
              {/* End left side */}

              {/* RIGHT SIDE: chest image - bottom aligned */}
              <div
                data-open-target="true"
                onClick={(e) => {
                  e.stopPropagation();
                  onClick(e);
                }}
                style={{
                  width: isMobile ? '150px' : '180px',
                  flexShrink: 0,
                  display: 'flex',
                  alignItems: 'flex-end',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  position: 'relative',
                }}
              >
                {box.boxImageId ? (
                  <img
                    src={getBoxImageUrl(box.boxImageId)}
                    alt={box.name}
                    onError={(e) => { e.target.onerror = null; e.target.src = 'assets/images/boxes/free/chest.png'; }}
                    style={{
                      maxWidth: '100%',
                      maxHeight: '90%',
                      objectFit: 'contain',
                      filter: 'drop-shadow(0 4px 16px rgba(0, 0, 0, 0.5))',
                      transition: 'transform 0.2s ease',
                      transform: 'translateX(-12px)',
                    }}
                  />
                ) : (
                  <span style={{ fontSize: '4rem' }}>📦</span>
                )}
              </div>
              {/* End right side */}

            </div>
            {/* End card-inner */}

          </div>
          {/* End card wrapper */}

          <ConfirmDialog
            show={showDeleteConfirm}
            title={box.isVisitor ? "Remove from your feed?" : "Delete Loot Box?"}
            message={box.isVisitor
              ? `Remove "${name}" from your feed?`
              : `Are you sure you want to delete "${name}"? This action cannot be undone and all open history will be lost.`
            }
            onConfirm={handleDeleteConfirm}
            onCancel={handleDeleteCancel}
            confirmText={box.isVisitor ? "Remove" : "Delete"}
          />
        </>
      );
    };

    // ItemCreator (simplified)
    const getColorName = (hex) => {
      const names = {
        '#ef4444': 'Red',
        '#38bdf8': 'Cyan',
        '#f59e0b': 'Amber',
        '#eab308': 'Yellow',
        '#84cc16': 'Lime',
        '#22c55e': 'Green',
        '#10b981': 'Emerald',
        '#06b6d4': 'Cyan',
        '#3b82f6': 'Blue',
        '#1e40af': 'Navy',
        '#6366f1': 'Indigo',
        '#8b5cf6': 'Violet',
        '#a855f7': 'Purple',
        '#ec4899': 'Pink',
        '#f43f5e': 'Rose',
        '#78716c': 'Stone',
        '#a8a29e': 'Warm Gray',
        '#92400e': 'Brown',
        '#b45309': 'Dark Amber',
        '#854d0e': 'Dark Gold',
        '#374151': 'Charcoal',
        '#6b7280': 'Gray',
        '#9ca3af': 'Silver',
        '#d4d4d8': 'Light Gray',
        '#ffffff': 'White',
      };
      return names[hex] || hex;
    };

    // Compress a user-selected image to a small WebP (JPEG fallback) data URI
    // for embedding directly in an item — no Firebase Storage involved.
    // ~160px covers the largest display (the 80px result card at 2x); the
    // base64 result typically lands around 4-10KB.
    const compressToDataURL = (file, maxDim = 160, quality = 0.8) => new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, w, h);
        let dataUrl = null;
        try { dataUrl = canvas.toDataURL('image/webp', quality); } catch (e) {}
        // Older Safari can't encode WebP — fall back to JPEG (loses alpha)
        if (!dataUrl || dataUrl.indexOf('data:image/webp') !== 0) {
          dataUrl = canvas.toDataURL('image/jpeg', quality);
        }
        resolve(dataUrl);
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not load image')); };
      img.src = url;
    });

    const ItemCreator = ({ items, onAddItem, editingItem, onUpdateItem, onCancelEdit, userSettings }) => {
      const [itemForm, setItemForm] = useState({ name: '', percentage: '', color: '#3b82f6', maxQuantity: '', imageUrl: '' });
      const [colorPickerOpen, setColorPickerOpen] = useState(false);
      const [imgBusy, setImgBusy] = useState(false);
      const [imgError, setImgError] = useState('');
      const fileInputRef = useRef(null);
      const isMobile = useIsMobile();

      const handleItemImage = async (e) => {
        const file = e.target.files && e.target.files[0];
        e.target.value = ''; // let the same file be re-selected later
        if (!file) return;
        if (!file.type.startsWith('image/')) { setImgError('Please choose an image file'); return; }
        if (file.size > 10 * 1024 * 1024) { setImgError('Image too large (max 10MB)'); return; }
        setImgError('');
        setImgBusy(true);
        try {
          const dataUrl = await compressToDataURL(file);
          setItemForm(f => ({ ...f, imageUrl: dataUrl }));
        } catch (err) {
          setImgError("Couldn't process that image");
        } finally {
          setImgBusy(false);
        }
      };
      const remainingPercentage = editingItem
        ? getRemainingPercentage(items.filter(i => i.id !== editingItem.id))
        : getRemainingPercentage(items);

      // Pre-fill form when editing
      useEffect(() => {
        if (editingItem) {
          setItemForm({
            name: editingItem.name,
            percentage: editingItem.percentage.toString(),
            color: editingItem.color,
            maxQuantity: editingItem.maxQuantity ? editingItem.maxQuantity.toString() : '',
            imageUrl: editingItem.imageUrl || '',
          });
        }
      }, [editingItem]);

      const handleSubmit = (e) => {
        e.preventDefault();
        if (!itemForm.name || !itemForm.percentage) return;

        const itemData = {
          id: editingItem ? editingItem.id : Date.now().toString(),
          name: itemForm.name,
          percentage: parseFloat(itemForm.percentage),
          color: itemForm.color,
          maxQuantity: itemForm.maxQuantity ? parseInt(itemForm.maxQuantity) : null,
          imageUrl: itemForm.imageUrl || null,
        };

        if (editingItem) {
          onUpdateItem(itemData);
        } else {
          onAddItem(itemData);
        }

        setItemForm({ name: '', percentage: '', color: itemForm.color, maxQuantity: '', imageUrl: '' });
      };

      const handleCancel = () => {
        if (editingItem && onCancelEdit) {
          onCancelEdit();
        }
        setItemForm({ name: '', percentage: '', color: '#3b82f6', maxQuantity: '', imageUrl: '' });
      };

      const predefinedColors = [
        '#ef4444', '#38bdf8', '#f59e0b', '#eab308', '#84cc16',
        '#22c55e', '#10b981', '#06b6d4', '#3b82f6', '#1e40af',
        '#6366f1', '#8b5cf6', '#a855f7', '#ec4899', '#f43f5e',
        '#78716c', '#a8a29e', '#92400e', '#b45309', '#854d0e',
        '#374151', '#6b7280', '#9ca3af', '#d4d4d8', '#ffffff',
      ];

      return (
        <Card style={{ marginBottom: '2rem' }}>
          <h3 style={{ fontSize: '1.25rem', fontWeight: 600, color: '#e2e8f0', marginBottom: '1rem' }}>
            {editingItem ? 'Edit Item' : 'Add Item'}
          </h3>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', fontWeight: 500, color: '#cbd5e1', marginBottom: '0.5rem' }}>
                Item Name
                <span style={{ fontSize: '0.65rem', color: '#38bdf8', fontWeight: 600 }}>REQUIRED</span>
              </label>
              <Input
                placeholder="e.g., Legendary Sword"
                value={itemForm.name}
                onChange={(e) => setItemForm({ ...itemForm, name: e.target.value })}
                fullWidth
                required
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', alignItems: 'start' }}>
              <div>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', fontWeight: 500, color: '#cbd5e1', marginBottom: '0.5rem' }}>
                  Percentage
                  <span style={{ fontSize: '0.65rem', color: '#38bdf8', fontWeight: 600 }}>REQUIRED</span>
                </label>
                <Input
                  type="number"
                  placeholder={`Max ${remainingPercentage.toFixed(2)}%`}
                  value={itemForm.percentage}
                  onChange={(e) => setItemForm({ ...itemForm, percentage: e.target.value })}
                  step="0.01"
                  min="0.01"
                  max={remainingPercentage}
                  fullWidth
                  required
                />
                {remainingPercentage > 0 && parseFloat(itemForm.percentage || 0) !== remainingPercentage && (
                  <button
                    type="button"
                    onClick={() => setItemForm({ ...itemForm, percentage: String(Math.round(remainingPercentage * 100) / 100) })}
                    style={{
                      marginTop: '0.4rem', padding: '0.25rem 0.6rem',
                      fontSize: '0.7rem', fontWeight: 600, color: '#60a5fa',
                      background: 'rgba(59, 130, 246, 0.1)',
                      border: '1px solid rgba(59, 130, 246, 0.3)',
                      borderRadius: '6px', cursor: 'pointer', fontFamily: 'inherit',
                    }}
                  >
                    Use remaining {(Math.round(remainingPercentage * 100) / 100)}%
                  </button>
                )}
              </div>

              <Input
                type="number"
                label="Max Qty (Optional)"
                placeholder="Unlimited"
                value={itemForm.maxQuantity}
                onChange={(e) => setItemForm({ ...itemForm, maxQuantity: e.target.value })}
                min="1"
                fullWidth
              />

              <div style={{ gridColumn: '1 / -1', fontSize: '0.7rem', color: '#64748b', marginTop: '-0.5rem' }}>
                All item percentages must add up to exactly 100%
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, color: '#cbd5e1', marginBottom: '0.5rem' }}>
                Item Color
              </label>

              {/* Color picker trigger button */}
              <button
                type="button"
                onClick={() => setColorPickerOpen(!colorPickerOpen)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                  width: '100%',
                  padding: '0.75rem 1rem',
                  background: 'rgba(15, 22, 36, 0.6)',
                  border: colorPickerOpen
                    ? '2px solid #3b82f6'
                    : '2px solid rgba(59, 130, 246, 0.2)',
                  borderRadius: '12px',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  transition: 'all 0.2s ease',
                }}
              >
                <div style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '8px',
                  background: itemForm.color,
                  border: itemForm.color === '#ffffff'
                    ? '2px solid rgba(148, 163, 184, 0.5)'
                    : '2px solid rgba(255, 255, 255, 0.15)',
                  boxShadow: `0 0 8px ${itemForm.color}40`,
                  flexShrink: 0,
                }} />
                <span style={{
                  flex: 1,
                  textAlign: 'left',
                  color: '#e2e8f0',
                  fontSize: '0.9rem',
                  fontWeight: 500,
                }}>
                  {getColorName(itemForm.color)}
                </span>
                <svg
                  width="16" height="16" viewBox="0 0 16 16" fill="none"
                  style={{
                    transform: colorPickerOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                    transition: 'transform 0.2s ease',
                    flexShrink: 0,
                  }}
                >
                  <path d="M4 6L8 10L12 6" stroke="#a0aec0" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>

              {/* Inline color grid - renders in normal flow, no positioning */}
              {colorPickerOpen && (
                <div style={{
                  marginTop: '0.5rem',
                  padding: '0.75rem',
                  background: 'rgba(15, 22, 36, 0.95)',
                  border: '2px solid rgba(59, 130, 246, 0.3)',
                  borderRadius: '12px',
                }}>
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(5, 1fr)',
                    gap: '0.4rem',
                  }}>
                    {predefinedColors.map(color => (
                      <button
                        key={color}
                        type="button"
                        style={{
                          width: '100%',
                          aspectRatio: '1',
                          background: color,
                          borderRadius: '6px',
                          border: itemForm.color === color
                            ? '2px solid #ffffff'
                            : color === '#ffffff'
                              ? '2px solid rgba(148, 163, 184, 0.5)'
                              : '2px solid rgba(59, 130, 246, 0.15)',
                          cursor: 'pointer',
                          transform: itemForm.color === color ? 'scale(1.1)' : 'scale(1)',
                          boxShadow: itemForm.color === color ? `0 0 12px ${color}80` : 'none',
                          transition: 'all 0.15s ease',
                        }}
                        onClick={() => {
                          setItemForm({ ...itemForm, color });
                          setColorPickerOpen(false);
                        }}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Item Image (optional) — compressed to a small data URI in-form */}
            <div>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', fontWeight: 500, color: '#cbd5e1', marginBottom: '0.5rem' }}>
                Item Image
                <span style={{ fontSize: '0.65rem', color: '#64748b', fontWeight: 600 }}>OPTIONAL</span>
              </label>
              <input ref={fileInputRef} type="file" accept="image/*" onChange={handleItemImage} style={{ display: 'none' }} />
              {itemForm.imageUrl ? (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '0.75rem',
                  padding: '0.6rem 0.75rem', background: 'rgba(15, 22, 36, 0.6)',
                  border: '2px solid rgba(59, 130, 246, 0.2)', borderRadius: '12px',
                }}>
                  <img src={itemForm.imageUrl} alt="" style={{
                    width: '48px', height: '48px', objectFit: 'contain',
                    borderRadius: '8px', background: 'rgba(30, 64, 175, 0.15)', flexShrink: 0,
                  }} />
                  <span style={{ flex: 1, fontSize: '0.8rem', color: '#a0aec0' }}>Photo attached</span>
                  <button type="button" onClick={() => fileInputRef.current && fileInputRef.current.click()} style={{
                    padding: '0.4rem 0.75rem', fontSize: '0.75rem', fontWeight: 600, fontFamily: 'inherit',
                    color: '#a0aec0', background: 'transparent', border: '1px solid rgba(148, 163, 184, 0.25)',
                    borderRadius: '8px', cursor: 'pointer',
                  }}>Replace</button>
                  <button type="button" aria-label="Remove image" onClick={() => setItemForm(f => ({ ...f, imageUrl: '' }))} style={{
                    width: '28px', height: '28px', flexShrink: 0, fontSize: '1.1rem', lineHeight: 1,
                    color: '#f87171', background: 'transparent', border: '1px solid rgba(239, 68, 68, 0.3)',
                    borderRadius: '8px', cursor: 'pointer',
                  }}>×</button>
                </div>
              ) : (
                <button type="button" onClick={() => fileInputRef.current && fileInputRef.current.click()} disabled={imgBusy} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
                  width: '100%', padding: '0.75rem', fontSize: '0.85rem', fontWeight: 600, fontFamily: 'inherit',
                  color: imgBusy ? '#64748b' : '#a0aec0', background: 'rgba(15, 22, 36, 0.6)',
                  border: '2px dashed rgba(59, 130, 246, 0.25)', borderRadius: '12px',
                  cursor: imgBusy ? 'default' : 'pointer',
                }}>
                  {imgBusy ? 'Processing…' : (
                    <>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                        <circle cx="8.5" cy="8.5" r="1.5" />
                        <polyline points="21 15 16 10 5 21" />
                      </svg>
                      Add a photo
                    </>
                  )}
                </button>
              )}
              {imgError && (
                <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#f87171', marginTop: '0.4rem' }}>{imgError}</div>
              )}
            </div>

            <Button type="submit" variant="primary" fullWidth disabled={remainingPercentage <= 0 || !itemForm.name || !itemForm.percentage}>
              {editingItem ? 'Update Item' : 'Add Item'}
            </Button>
            
            {editingItem && (
              <Button type="button" variant="ghost" fullWidth onClick={handleCancel} style={{ marginTop: '0.5rem' }}>
                Cancel Edit
              </Button>
            )}
          </form>
        </Card>
      );
    };

    // ItemList (simplified)
    // Inline, tap-to-edit odds field used in the item list's "Edit odds" mode.
    // Keeps its own text while focused so partial input (e.g. "33.") isn't
    // clobbered, but syncs from the prop when unfocused (e.g. Split evenly).
    // Commits a Number so downstream odds math stays numeric.
    const PercentInput = ({ value, color, onCommit }) => {
      const ref = useRef(null);
      const fmt = (v) => (v === '' || v === null || v === undefined) ? '' : String(v);
      const [text, setText] = useState(fmt(value));
      useEffect(() => {
        if (document.activeElement !== ref.current) setText(fmt(value));
      }, [value]);
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '3px', flexShrink: 0 }}>
          <input
            ref={ref}
            value={text}
            inputMode="decimal"
            aria-label="Item odds percentage"
            onFocus={(e) => e.target.select()}
            onChange={(e) => {
              const t = e.target.value;
              if (t !== '' && !/^\d*\.?\d*$/.test(t)) return;
              setText(t);
              onCommit(t === '' ? 0 : (parseFloat(t) || 0));
            }}
            onBlur={() => setText(fmt(value))}
            style={{
              width: '56px', padding: '6px 8px', fontSize: '1.05rem', fontWeight: 700,
              textAlign: 'right', color: '#e2e8f0', background: 'rgba(15, 22, 36, 0.9)',
              border: `2px solid ${color}66`, borderRadius: '8px', outline: 'none',
              fontFamily: 'inherit',
            }}
          />
          <span style={{ color: '#60a5fa', fontWeight: 700, fontSize: '1.05rem' }}>%</span>
        </div>
      );
    };

    const ItemList = ({ items, onRemoveItem, onEditItem, onChangePercentage }) => {
      const [editingOdds, setEditingOdds] = useState(false);

      if (items.length === 0) {
        return null;
      }

      return (
        <div>
          <h3 style={{ fontSize: '1.125rem', fontWeight: 600, color: '#e2e8f0', marginBottom: '0.75rem' }}>
            Items ({items.length})
          </h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {items.map(item => (
              <div
                key={item.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '1rem',
                  padding: '0.75rem 1rem',
                  background: 'rgba(15, 22, 36, 0.6)',
                  border: `2px solid ${item.color}40`,
                  borderLeft: `4px solid ${item.color}`,
                  borderRadius: '8px',
                }}
              >
                {item.imageUrl ? (
                  <img
                    src={item.imageUrl}
                    alt={item.name}
                    style={{
                      width: '40px',
                      height: '40px',
                      objectFit: 'contain',
                      borderRadius: '6px',
                      border: `1px solid ${item.color}40`,
                    }}
                  />
                ) : (
                  <span style={{
                    width: '12px',
                    height: '12px',
                    borderRadius: '50%',
                    background: item.color,
                    boxShadow: `0 0 8px ${item.color}80`,
                  }} />
                )}

                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '1rem', fontWeight: 600, color: '#e2e8f0' }}>
                    {item.name}
                  </div>
                  {item.maxQuantity && (
                    <div style={{ fontSize: '0.875rem', color: '#a0aec0' }}>
                      Max: {item.maxQuantity}
                    </div>
                  )}
                </div>

                {editingOdds ? (
                  <PercentInput
                    value={item.percentage}
                    color={item.color}
                    onCommit={(v) => onChangePercentage(item.id, v)}
                  />
                ) : (
                  <span style={{ fontSize: '1.25rem', fontWeight: 700, color: '#60a5fa' }}>
                    {item.percentage}%
                  </span>
                )}

                {!editingOdds && (
                  <button
                    style={{
                      width: '32px',
                      height: '32px',
                      background: 'transparent',
                      border: '1px solid rgba(59, 130, 246, 0.3)',
                      borderRadius: '6px',
                      color: '#60a5fa',
                      cursor: 'pointer',
                      fontSize: '1rem',
                      fontWeight: 600,
                    }}
                    onClick={() => onEditItem(item)}
                    title="Edit item"
                  >
                    ✎
                  </button>
                )}

                <button
                  style={{
                    width: '32px',
                    height: '32px',
                    background: 'transparent',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    borderRadius: '6px',
                    color: '#ef4444',
                    cursor: 'pointer',
                    fontSize: '1.125rem',
                  }}
                  onClick={() => onRemoveItem(item.id)}
                  title="Remove item"
                >
                  ×
                </button>
              </div>
            ))}
          </div>

          {items.length > 1 && (
            <button
              type="button"
              onClick={() => setEditingOdds(v => !v)}
              style={{
                marginTop: '0.6rem',
                display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
                padding: '0.5rem 0.85rem', fontSize: '0.8rem', fontWeight: 600,
                fontFamily: 'inherit', cursor: 'pointer',
                color: editingOdds ? '#e2e8f0' : '#60a5fa',
                background: editingOdds ? 'rgba(59, 130, 246, 0.25)' : 'rgba(15, 22, 36, 0.6)',
                border: '1px solid rgba(59, 130, 246, 0.35)', borderRadius: '8px',
              }}
            >
              {editingOdds ? 'Done editing odds' : 'Edit odds'}
            </button>
          )}
        </div>
      );
    };

    // ===== Inline items editor (add/edit all items on one screen) =====

    // Curated colors that read well on the dark UI. Auto-assigned to new rows
    // (first unused, in this order) and shown as the picker's swatch grid.
    const ITEM_PALETTE = [
      '#3b82f6', '#f59e0b', '#22c55e', '#ec4899', '#8b5cf6',
      '#06b6d4', '#ef4444', '#84cc16', '#a855f7', '#eab308',
      '#38bdf8', '#f43f5e', '#10b981', '#6366f1', '#fb923c',
    ];
    const ITEM_SWATCHES = [
      '#ef4444', '#38bdf8', '#f59e0b', '#eab308', '#84cc16',
      '#22c55e', '#10b981', '#06b6d4', '#3b82f6', '#1e40af',
      '#6366f1', '#8b5cf6', '#a855f7', '#ec4899', '#f43f5e',
      '#78716c', '#a8a29e', '#92400e', '#b45309', '#854d0e',
      '#374151', '#6b7280', '#9ca3af', '#d4d4d8', '#ffffff',
    ];

    // Next palette color not already in use (falls back to cycling by count)
    const pickAutoColor = (items) => {
      const used = new Set((items || []).map(i => (i.color || '').toLowerCase()));
      return ITEM_PALETTE.find(c => !used.has(c.toLowerCase()))
        || ITEM_PALETTE[(items ? items.length : 0) % ITEM_PALETTE.length];
    };

    // Lift a near-black custom color so it stays visible as a dot/accent on
    // the dark background; leaves palette colors untouched.
    const ensureVisibleColor = (hex) => {
      if (!/^#[0-9a-fA-F]{6}$/.test(hex || '')) return hex;
      const c = hex.replace('#', '');
      const r = parseInt(c.slice(0, 2), 16), g = parseInt(c.slice(2, 4), 16), b = parseInt(c.slice(4, 6), 16);
      const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      if (lum >= 0.22) return hex;
      const lift = (v) => Math.round(v + (255 - v) * 0.5);
      const h = (v) => v.toString(16).padStart(2, '0');
      return `#${h(lift(r))}${h(lift(g))}${h(lift(b))}`;
    };

    // Swatch grid + native custom color, in a small popover anchored to a row.
    const ColorPopover = ({ value, onPick, onClose }) => {
      return (
        <>
          <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
          <div style={{
            position: 'absolute', top: '40px', left: 0, zIndex: 41, width: '198px',
            padding: '0.6rem', background: 'rgba(15, 22, 36, 0.98)',
            border: '2px solid rgba(59, 130, 246, 0.35)', borderRadius: '12px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
          }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '0.35rem' }}>
              {ITEM_SWATCHES.map(c => (
                <button
                  key={c}
                  type="button"
                  aria-label={getColorName(c)}
                  onClick={() => onPick(c, true)}
                  style={{
                    width: '100%', aspectRatio: '1', background: c, borderRadius: '6px', cursor: 'pointer',
                    border: value === c ? '2px solid #ffffff'
                      : c === '#ffffff' ? '2px solid rgba(148,163,184,0.5)' : '2px solid rgba(59,130,246,0.15)',
                  }}
                />
              ))}
            </div>
            <label style={{
              display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.6rem',
              fontSize: '0.75rem', color: '#a0aec0', cursor: 'pointer',
            }}>
              <input
                type="color"
                value={/^#[0-9a-fA-F]{6}$/.test(value) ? value : '#3b82f6'}
                onChange={(e) => onPick(e.target.value, false)}
                style={{ width: '30px', height: '30px', padding: 0, border: 'none', background: 'none', cursor: 'pointer' }}
              />
              Custom color
            </label>
          </div>
        </>
      );
    };

    // One editable row per item; "+ Add item" appends a new blank row. Keeps
    // the items array shape identical to the old form so save/open are untouched.
    const ItemsEditor = ({ items, onItemsChange }) => {
      const [openColorFor, setOpenColorFor] = useState(null);
      const [imgTargetId, setImgTargetId] = useState(null);
      const [imgError, setImgError] = useState('');
      const fileInputRef = useRef(null);
      const lastRowRef = useRef(null);

      const setField = (id, patch) =>
        onItemsChange(items.map(it => it.id === id ? { ...it, ...patch } : it));

      const addRow = () => {
        const id = Date.now().toString() + Math.random().toString(36).slice(2, 6);
        onItemsChange([...items, { id, name: '', percentage: '', color: pickAutoColor(items), maxQuantity: '', imageUrl: '' }]);
        triggerHaptic('light');
        setTimeout(() => { if (lastRowRef.current) lastRowRef.current.focus(); }, 0);
      };

      const removeRow = (id) => {
        onItemsChange(items.filter(it => it.id !== id));
        if (openColorFor === id) setOpenColorFor(null);
      };

      const openImagePicker = (id) => {
        setImgTargetId(id); setImgError('');
        if (fileInputRef.current) fileInputRef.current.click();
      };

      const handleFile = async (e) => {
        const file = e.target.files && e.target.files[0];
        e.target.value = '';
        const id = imgTargetId;
        if (!file || !id) return;
        if (!file.type.startsWith('image/')) { setImgError('Please choose an image file'); return; }
        if (file.size > 10 * 1024 * 1024) { setImgError('Image too large (max 10MB)'); return; }
        try {
          const dataUrl = await compressToDataURL(file);
          setField(id, { imageUrl: dataUrl });
        } catch (err) { setImgError("Couldn't process that image"); }
      };

      return (
        <div>
          <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFile} style={{ display: 'none' }} />

          {items.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
              {items.map((item, idx) => {
                const isLast = idx === items.length - 1;
                return (
                  <div key={item.id} style={{
                    display: 'flex', flexDirection: 'column', gap: '0.5rem',
                    padding: '0.6rem 0.75rem', background: 'rgba(15, 22, 36, 0.6)',
                    border: `1px solid ${item.color}40`, borderLeft: `4px solid ${item.color}`,
                    borderRadius: '8px',
                  }}>
                    {/* Row line 1: photo · name · remove */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                      <button
                        type="button"
                        onClick={() => openImagePicker(item.id)}
                        title={item.imageUrl ? 'Change photo' : 'Add photo'}
                        aria-label={item.imageUrl ? 'Change photo' : 'Add photo'}
                        style={{
                          position: 'relative',
                          width: '40px', height: '40px', flexShrink: 0, padding: 0, cursor: 'pointer',
                          borderRadius: '8px',
                          overflow: item.imageUrl ? 'hidden' : 'visible',
                          border: item.imageUrl ? `1px solid ${item.color}40` : '1px dashed rgba(96,165,250,0.6)',
                          background: item.imageUrl ? 'rgba(30,64,175,0.15)' : 'rgba(59,130,246,0.12)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          color: item.imageUrl ? '#64748b' : '#60a5fa',
                        }}
                      >
                        {item.imageUrl ? (
                          <img src={item.imageUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                        ) : (
                          <>
                            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></svg>
                            <span style={{
                              position: 'absolute', right: '-4px', bottom: '-4px',
                              width: '16px', height: '16px', borderRadius: '50%',
                              background: '#3b82f6', color: '#fff', fontSize: '12px', fontWeight: 700, lineHeight: 1,
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              border: '2px solid #0d1526',
                            }}>+</span>
                          </>
                        )}
                      </button>

                      <input
                        ref={isLast ? lastRowRef : null}
                        value={item.name}
                        onChange={(e) => setField(item.id, { name: e.target.value })}
                        placeholder="Item name"
                        aria-label="Item name"
                        style={{
                          flex: 1, minWidth: 0, padding: '8px 10px', fontSize: '1rem', fontWeight: 600,
                          color: '#e2e8f0', background: 'rgba(15,22,36,0.9)',
                          border: '1px solid rgba(59,130,246,0.2)', borderRadius: '8px', outline: 'none', fontFamily: 'inherit',
                        }}
                      />

                      <button
                        type="button" onClick={() => removeRow(item.id)} aria-label="Remove item"
                        style={{
                          width: '32px', height: '32px', flexShrink: 0, background: 'transparent',
                          border: '1px solid rgba(239,68,68,0.3)', borderRadius: '6px', color: '#ef4444',
                          cursor: 'pointer', fontSize: '1.125rem',
                        }}
                      >×</button>
                    </div>

                    {/* Row line 2: odds · color · optional limit */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap', paddingLeft: '46px' }}>
                      <PercentInput value={item.percentage} color={item.color} onCommit={(v) => setField(item.id, { percentage: v })} />

                      <div style={{ position: 'relative' }}>
                        <button
                          type="button"
                          onClick={() => setOpenColorFor(openColorFor === item.id ? null : item.id)}
                          aria-label="Item color"
                          style={{
                            width: '32px', height: '32px', borderRadius: '8px', background: item.color, cursor: 'pointer',
                            border: item.color === '#ffffff' ? '2px solid rgba(148,163,184,0.5)' : '2px solid rgba(255,255,255,0.15)',
                            boxShadow: `0 0 8px ${item.color}40`,
                          }}
                        />
                        {openColorFor === item.id && (
                          <ColorPopover
                            value={item.color}
                            onPick={(hex, close) => { setField(item.id, { color: ensureVisibleColor(hex) }); if (close) setOpenColorFor(null); }}
                            onClose={() => setOpenColorFor(null)}
                          />
                        )}
                      </div>

                      <div style={{
                        display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0,
                        border: '1px solid rgba(148,163,184,0.25)', borderRadius: '8px', padding: '0 6px 0 10px',
                      }} title="Max times this item can be pulled (optional)">
                        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#a0aec0' }}>Max</span>
                        <input
                          type="number" min="1" placeholder="∞" value={item.maxQuantity}
                          onChange={(e) => setField(item.id, { maxQuantity: e.target.value })}
                          aria-label="Max quantity (optional)"
                          style={{
                            width: '42px', padding: '6px 2px', fontSize: '0.85rem', textAlign: 'center',
                            color: '#e2e8f0', background: 'transparent', border: 'none', outline: 'none', fontFamily: 'inherit',
                          }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <button
            type="button" onClick={addRow}
            style={{
              marginTop: items.length ? '0.6rem' : 0,
              display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
              padding: '0.6rem 1rem', fontSize: '0.9rem', fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer',
              color: '#e2e8f0', background: 'rgba(59,130,246,0.18)',
              border: '1px solid rgba(59,130,246,0.4)', borderRadius: '10px',
            }}
          >
            <span style={{ fontSize: '1.1rem', lineHeight: 1 }}>+</span> Add item
          </button>

          {imgError && (
            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#f87171', marginTop: '0.4rem' }}>{imgError}</div>
          )}
        </div>
      );
    };

    // ImagePicker Component
    // Collapsed row showing the current selection; tapping opens a modal
    // sheet with a 4-wide vertically-scrolling grid, tabs, and search.
    // Search matches box names now and `keywords` arrays on catalog docs
    // once they exist (added via box-admin).
    const ImagePicker = ({ selectedImageId, onSelectImage, userSettings, success, error, info }) => {
      const [activeTab, setActiveTab] = useState('defaults');
      const [boxCatalog, setBoxCatalog] = useState(null);
      const [loading, setLoading] = useState(true);
      const [pickerOpen, setPickerOpen] = useState(false);
      const [search, setSearch] = useState('');
      const [uploadBusy, setUploadBusy] = useState(false);
      const [uploadError, setUploadError] = useState('');
      const boxFileInputRef = useRef(null);
      const isMobile = useIsMobile();

      useEffect(() => {
        loadBoxCatalog();
      }, []);

      // Upload a custom box image: compressed to a ~400px WebP data URI
      // (bigger than item images since the box renders large)
      const handleBoxUpload = async (e) => {
        const file = e.target.files && e.target.files[0];
        e.target.value = '';
        if (!file) return;
        if (!file.type.startsWith('image/')) { setUploadError('Please choose an image file'); return; }
        if (file.size > 10 * 1024 * 1024) { setUploadError('Image too large (max 10MB)'); return; }
        setUploadError('');
        setUploadBusy(true);
        try {
          const dataUrl = await compressToDataURL(file, 400, 0.8);
          onSelectImage(dataUrl);
          setPickerOpen(false);
          setSearch('');
        } catch (err) {
          setUploadError("Couldn't process that image");
        } finally {
          setUploadBusy(false);
        }
      };

      // Lock body scroll + close on Escape while the picker sheet is open
      useEffect(() => {
        if (!pickerOpen) return;
        document.body.style.overflow = 'hidden';
        const onKey = (e) => { if (e.key === 'Escape') setPickerOpen(false); };
        document.addEventListener('keydown', onKey);
        return () => {
          document.body.style.overflow = '';
          document.removeEventListener('keydown', onKey);
        };
      }, [pickerOpen]);

      const loadBoxCatalog = async () => {
        setLoading(true);
        try {
          const catalog = await getAllAvailableBoxImages();
          setBoxCatalog(catalog);
        } catch (error) {
          console.error('Error loading box catalog:', error);
        } finally {
          setLoading(false);
        }
      };

      const handleImageClick = (image) => {
        // Store the full URL for Firebase boxes, ID for hardcoded
        const imageRef = image.imageUrl && image.imageUrl.startsWith('http')
          ? image.imageUrl
          : image.id;
        onSelectImage(imageRef);
        setPickerOpen(false);
        setSearch('');
      };

      const getActiveBoxes = () => {
        if (!boxCatalog) return [];
        switch (activeTab) {
          case 'defaults': return boxCatalog.defaults;
          case 'seasonal': return boxCatalog.seasonal;
          default: return [];
        }
      };

      // Resolve the currently selected image for the collapsed row
      const allImages = boxCatalog ? boxCatalog.all : [];
      const selectedImage =
        allImages.find(img => img.id === selectedImageId || img.imageUrl === selectedImageId) ||
        DEFAULT_BOX_IMAGES.find(img => img.id === selectedImageId) ||
        null;
      const selectedUrl = getBoxImageUrl(selectedImageId, boxCatalog);

      const q = search.trim().toLowerCase();
      const visibleBoxes = getActiveBoxes().filter(img =>
        !q ||
        (img.name || '').toLowerCase().includes(q) ||
        (img.keywords || []).some(k => (k || '').toLowerCase().includes(q))
      );

      const tabs = [
        { id: 'defaults', label: 'Defaults', count: boxCatalog?.defaults.length || 0 },
        { id: 'seasonal', label: 'Seasonal', count: boxCatalog?.seasonal.length || 0 },
      ];

      return (
        <div style={{ marginBottom: '1.5rem' }}>
          <label style={{
            display: 'block',
            fontSize: '0.875rem',
            fontWeight: 500,
            color: '#cbd5e1',
            marginBottom: '0.75rem',
          }}>
            Box Image
          </label>

          {/* Collapsed: current selection, tap to change */}
          <div
            onClick={() => { if (!loading) setPickerOpen(true); }}
            role="button"
            aria-label="Change box image"
            style={{
              display: 'flex', alignItems: 'center', gap: '0.9rem',
              padding: '0.6rem 0.75rem',
              background: 'rgba(15, 22, 36, 0.6)',
              border: '2px solid rgba(59, 130, 246, 0.25)',
              borderRadius: '12px',
              cursor: loading ? 'default' : 'pointer',
            }}
          >
            <div style={{
              width: '64px', height: '64px', flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'linear-gradient(135deg, rgba(30, 64, 175, 0.2) 0%, rgba(59, 130, 246, 0.2) 100%)',
              borderRadius: '10px', overflow: 'hidden',
            }}>
              {selectedUrl && (
                <img
                  src={selectedUrl}
                  alt=""
                  onError={(e) => { e.target.onerror = null; e.target.src = 'assets/images/boxes/free/chest.png'; }}
                  style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                />
              )}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '0.95rem', fontWeight: 600, color: '#e2e8f0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {loading ? 'Loading boxes...'
                  : (typeof selectedImageId === 'string' && selectedImageId.startsWith('data:')) ? 'Your photo'
                  : (selectedImage ? selectedImage.name : 'Choose a box')}
              </div>
              <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '2px' }}>
                Tap to change
              </div>
            </div>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </div>

          {/* Modal sheet picker — portaled to body: the parent Card's
              backdrop-filter would otherwise trap position:fixed inside it */}
          {pickerOpen && ReactDOM.createPortal(
            <div
              onClick={() => setPickerOpen(false)}
              style={{
                position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                background: 'rgba(0, 0, 0, 0.7)',
                backdropFilter: 'blur(6px)',
                WebkitBackdropFilter: 'blur(6px)',
                zIndex: 9999,
                display: 'flex',
                alignItems: isMobile ? 'flex-end' : 'center',
                justifyContent: 'center',
                animation: 'fadeIn 0.2s ease',
              }}
            >
              <div
                onClick={(e) => e.stopPropagation()}
                role="dialog"
                aria-label="Choose a box image"
                style={{
                  width: '100%',
                  maxWidth: '480px',
                  maxHeight: '80vh',
                  display: 'flex',
                  flexDirection: 'column',
                  background: 'linear-gradient(180deg, #0f172a 0%, #1e293b 100%)',
                  border: '1px solid rgba(99, 102, 241, 0.3)',
                  borderRadius: isMobile ? '20px 20px 0 0' : '20px',
                  padding: isMobile
                    ? '1rem 1rem calc(1rem + env(safe-area-inset-bottom))'
                    : '1.25rem',
                  boxShadow: '0 -8px 40px rgba(0, 0, 0, 0.5)',
                  animation: 'slideUp 0.25s ease',
                }}
              >
                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                  <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: '#e2e8f0' }}>
                    Choose a Box
                  </h3>
                  <button
                    onClick={() => setPickerOpen(false)}
                    aria-label="Close"
                    style={{
                      width: '32px', height: '32px', borderRadius: '8px',
                      background: 'rgba(15, 23, 42, 0.6)',
                      border: '1px solid rgba(148, 163, 184, 0.2)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      cursor: 'pointer', color: '#a0aec0', padding: 0,
                    }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                </div>

                {/* Search */}
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search boxes..."
                  style={{
                    width: '100%', padding: '10px 14px', fontSize: '0.95rem',
                    fontFamily: 'inherit', color: '#e2e8f0',
                    background: 'rgba(30, 41, 59, 0.8)',
                    border: '1.5px solid rgba(65, 105, 225, 0.35)',
                    borderRadius: '10px', outline: 'none',
                    marginBottom: '0.75rem',
                    boxSizing: 'border-box',
                  }}
                />

                {/* Tabs */}
                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
                  {tabs.map(tab => {
                    const isActive = activeTab === tab.id;
                    return (
                      <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        style={{
                          flex: '0 0 auto',
                          padding: '0.4rem 0.85rem',
                          fontSize: '0.8rem', fontWeight: 600,
                          color: isActive ? '#ffffff' : '#a0aec0',
                          background: isActive
                            ? 'linear-gradient(135deg, #1e40af 0%, #3b82f6 100%)'
                            : 'rgba(15, 22, 36, 0.6)',
                          border: `1px solid ${isActive ? '#3b82f6' : 'rgba(59, 130, 246, 0.2)'}`,
                          borderRadius: '8px', cursor: 'pointer',
                          fontFamily: 'inherit', transition: 'all 0.2s ease',
                        }}
                      >
                        {tab.label} {tab.count > 0 && `(${tab.count})`}
                      </button>
                    );
                  })}
                </div>

                {/* Upload your own box image */}
                <input ref={boxFileInputRef} type="file" accept="image/*" onChange={handleBoxUpload} style={{ display: 'none' }} />
                <button
                  type="button"
                  onClick={() => boxFileInputRef.current && boxFileInputRef.current.click()}
                  disabled={uploadBusy}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
                    width: '100%', padding: '0.6rem', marginBottom: '0.75rem',
                    fontSize: '0.82rem', fontWeight: 600, fontFamily: 'inherit',
                    color: uploadBusy ? '#64748b' : '#93c5fd',
                    background: 'rgba(59, 130, 246, 0.1)',
                    border: '2px dashed rgba(59, 130, 246, 0.35)', borderRadius: '10px',
                    cursor: uploadBusy ? 'default' : 'pointer',
                  }}
                >
                  {uploadBusy ? 'Processing…' : (
                    <>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                        <circle cx="8.5" cy="8.5" r="1.5" />
                        <polyline points="21 15 16 10 5 21" />
                      </svg>
                      Upload your own
                    </>
                  )}
                </button>
                {uploadError && (
                  <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#f87171', marginBottom: '0.5rem' }}>{uploadError}</div>
                )}

                {/* Scrolling grid: 4 wide on mobile */}
                <div style={{ overflowY: 'auto', flex: 1, paddingRight: '2px' }}>
                  {visibleBoxes.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '2.5rem 1rem', color: '#64748b', fontSize: '0.85rem' }}>
                      {q ? `No boxes match "${search.trim()}"` : 'No boxes in this category'}
                    </div>
                  ) : (
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: isMobile ? 'repeat(4, 1fr)' : 'repeat(auto-fill, minmax(96px, 1fr))',
                      gap: '0.5rem',
                      paddingBottom: '0.25rem',
                    }}>
                      {visibleBoxes.map(image => {
                        const isSelected = selectedImageId === image.id || selectedImageId === image.imageUrl;
                        const isSeasonal = image.source === BOX_SOURCES.SEASONAL;
                        return (
                          <div
                            key={image.id}
                            onClick={() => handleImageClick(image)}
                            style={{
                              position: 'relative',
                              cursor: 'pointer',
                              padding: '0.4rem',
                              background: 'rgba(15, 22, 36, 0.6)',
                              border: `2px solid ${isSelected ? '#3b82f6' : 'rgba(59, 130, 246, 0.15)'}`,
                              borderRadius: '10px',
                              boxShadow: isSelected ? 'inset 0 0 12px rgba(59, 130, 246, 0.3)' : 'none',
                              minWidth: 0,
                            }}
                          >
                            <div style={{
                              width: '100%',
                              aspectRatio: '1',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              background: 'linear-gradient(135deg, rgba(30, 64, 175, 0.2) 0%, rgba(59, 130, 246, 0.2) 100%)',
                              borderRadius: '7px',
                              marginBottom: '0.35rem',
                              overflow: 'hidden',
                            }}>
                              <img
                                src={getBoxImageUrl(image.id, boxCatalog)}
                                alt={image.name}
                                loading="lazy"
                                onError={(e) => { e.target.onerror = null; e.target.src = 'assets/images/boxes/free/chest.png'; }}
                                style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                              />
                            </div>
                            <div
                              title={image.name}
                              style={{
                                fontSize: '0.62rem',
                                fontWeight: 600,
                                color: '#cbd5e1',
                                textAlign: 'center',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {image.name}
                            </div>
                            {isSeasonal && image.seasonalInfo && (
                              <div style={{
                                position: 'absolute',
                                top: '3px',
                                right: '3px',
                                padding: '1px 5px',
                                background: 'linear-gradient(135deg, #ec4899 0%, #8b5cf6 100%)',
                                borderRadius: '5px',
                                fontSize: '0.5rem',
                                fontWeight: 700,
                                color: '#ffffff',
                                textTransform: 'uppercase',
                              }}>
                                {image.seasonalInfo.label || 'Seasonal'}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>,
            document.body
          )}

        </div>
      );
    };

    // BoxCreator
    const BoxCreator = ({ onComplete, onCancel, editingBox = null, success, error, info }) => {
      const [boxName, setBoxName] = useState(editingBox ? editingBox.name : '');
      const [items, setItems] = useState(editingBox ? editingBox.items : []);
      const [maxPulls, setMaxPulls] = useState(editingBox && editingBox.maxPulls ? editingBox.maxPulls.toString() : '');
      const [maxPullsPerUser, setMaxPullsPerUser] = useState(editingBox && editingBox.maxPullsPerUser ? editingBox.maxPullsPerUser.toString() : '');
      const [boxType, setBoxType] = useState(editingBox ? editingBox.type : 'local');
      const [editingItem, setEditingItem] = useState(null);
      const [hideContents, setHideContents] = useState(editingBox ? editingBox.hideContents || false : false);
      const [hideOdds, setHideOdds] = useState(editingBox ? editingBox.hideOdds || false : false);
      const [allowParticipantSharing, setAllowParticipantSharing] = useState(
        editingBox ? editingBox.allowParticipantSharing || false : false
      );
      const [expiresAt, setExpiresAt] = useState(() => {
        if (editingBox && editingBox.expiresAt) {
          // Convert timestamp to datetime-local format for the input
          const d = new Date(editingBox.expiresAt);
          return d.getFullYear() + '-' +
            String(d.getMonth() + 1).padStart(2, '0') + '-' +
            String(d.getDate()).padStart(2, '0') + 'T' +
            String(d.getHours()).padStart(2, '0') + ':' +
            String(d.getMinutes()).padStart(2, '0');
        }
        return '';
      });
      const [boxImageId, setBoxImageId] = useState(editingBox ? editingBox.boxImageId || 'chest' : 'chest');
      const [imageSelected, setImageSelected] = useState(editingBox ? true : false);
      const [showAdvanced, setShowAdvanced] = useState(
        editingBox ? !!(editingBox.maxPulls || editingBox.hideContents || editingBox.hideOdds || editingBox.expiresAt || editingBox.pullRechargeEnabled) : false
      );
      const [expirationEnabled, setExpirationEnabled] = useState(
        editingBox ? !!editingBox.expiresAt : false
      );
      const [pullRechargeEnabled, setPullRechargeEnabled] = useState(
        editingBox ? editingBox.pullRechargeEnabled || false : false
      );
      const [pullRechargeAmount, setPullRechargeAmount] = useState(
        editingBox && editingBox.pullRechargeAmount ? editingBox.pullRechargeAmount.toString() : '1'
      );
      const [pullRechargePeriod, setPullRechargePeriod] = useState(
        editingBox ? editingBox.pullRechargePeriod || 'day' : 'day'
      );
      const [pullRechargeMax, setPullRechargeMax] = useState(
        editingBox && editingBox.pullRechargeMax ? editingBox.pullRechargeMax.toString() : '3'
      );
      const [pullRechargeUnlimited, setPullRechargeUnlimited] = useState(
        editingBox ? (editingBox.pullRechargeUnlimited !== false) : true
      );
      const [pullRechargeCycles, setPullRechargeCycles] = useState(
        editingBox && editingBox.pullRechargeCycles ? editingBox.pullRechargeCycles.toString() : '5'
      );

      // Inline validation: no toasts — scroll to the problem, shake it,
      // and show a caption attached to the field itself
      const [stepAlert, setStepAlert] = useState(null); // 'name' | 'items' | 'percent'
      const nameInputRef = useRef(null);
      const itemsSectionRef = useRef(null);
      const validationBarRef = useRef(null);

      const raiseAlert = (which, ref, block = 'center') => {
        // clear + re-set so the shake replays on repeated taps
        // (setTimeout, not rAF — rAF never fires in backgrounded tabs)
        setStepAlert(null);
        setTimeout(() => setStepAlert(which), 0);
        if (ref && ref.current) {
          ref.current.scrollIntoView({ behavior: 'smooth', block });
        }
        triggerHaptic('medium');
      };

      const userSettings = getUserSettings();

      const handleAddItem = (item) => {
        triggerHaptic('light');
        setItems([...items, item]);
        if (stepAlert === 'items') setStepAlert(null);
      };

      // Clear the percentage alert as soon as the totals become valid
      useEffect(() => {
        if (stepAlert === 'percent' && validatePercentages(items).valid) {
          setStepAlert(null);
        }
      }, [items]);

      const handleUpdateItem = (updatedItem) => {
        setItems(items.map(item => item.id === updatedItem.id ? updatedItem : item));
        setEditingItem(null);
      };

      const handleEditItem = (item) => {
        setEditingItem(item);
      };

      const handleCancelEdit = () => {
        setEditingItem(null);
      };

      // Quick inline odds edit from the item list (stores a Number)
      const handleChangePercentage = (itemId, value) => {
        setItems(prev => prev.map(item =>
          item.id === itemId ? { ...item, percentage: value } : item
        ));
      };

      // Redistribute all item percentages equally so they total exactly 100.
      // Rounding remainder goes to the last item.
      const handleSplitEvenly = () => {
        if (items.length === 0) return;
        const even = Math.floor((100 / items.length) * 100) / 100;
        const newItems = items.map(item => ({ ...item, percentage: even }));
        const remainder = Math.round((100 - even * items.length) * 100) / 100;
        newItems[newItems.length - 1].percentage = Math.round((even + remainder) * 100) / 100;
        setItems(newItems);
      };

      // Random odds that still total exactly 100, with a 1% floor per item so
      // nothing lands at 0% (unreachable). Any rounding drift goes to the
      // largest item so a tiny item never gets pushed negative.
      const handleRandomize = () => {
        const n = items.length;
        if (n === 0) return;
        const floor = Math.min(1, Math.floor((100 / n) * 100) / 100);
        const budget = 100 - floor * n;
        const weights = items.map(() => Math.random());
        const wsum = weights.reduce((a, b) => a + b, 0) || 1;
        let pcts = weights.map(w => Math.round((floor + (w / wsum) * budget) * 100) / 100);
        const drift = Math.round((100 - pcts.reduce((a, b) => a + b, 0)) * 100) / 100;
        if (drift !== 0) {
          let maxIdx = 0;
          for (let i = 1; i < pcts.length; i++) if (pcts[i] > pcts[maxIdx]) maxIdx = i;
          pcts[maxIdx] = Math.round((pcts[maxIdx] + drift) * 100) / 100;
        }
        setItems(items.map((it, i) => ({ ...it, percentage: pcts[i] })));
        triggerHaptic('light');
      };

      const handleCreate = async () => {
        if (!boxName.trim()) {
          raiseAlert('name', nameInputRef);
          setTimeout(() => nameInputRef.current && nameInputRef.current.focus({ preventScroll: true }), 400);
          return;
        }

        if (items.length === 0) {
          raiseAlert('items', itemsSectionRef, 'start');
          return;
        }

        // The inline editor can leave a blank row — every item needs a name
        if (items.some(it => !String(it.name || '').trim())) {
          error('Give every item a name (or remove the empty row)');
          raiseAlert('items', itemsSectionRef, 'start');
          return;
        }

        const validation = validatePercentages(items);
        if (!validation.valid) {
          raiseAlert('percent', validationBarRef);
          return;
        }

        triggerHaptic('success');

        if (expirationEnabled && expiresAt && new Date(expiresAt).getTime() <= Date.now()) {
          error('Expiration date must be in the future');
          return;
        }

        const maxPullsNum = maxPulls ? parseInt(maxPulls) : null;
        const maxPerUserNum = maxPullsPerUser ? parseInt(maxPullsPerUser) : null;
        if (maxPullsNum && maxPerUserNum && maxPerUserNum > maxPullsNum) {
          error('Per-person limit cannot be higher than the total opens limit');
          return;
        }

        // Normalize inline-edited item fields to their stored types
        const normalizedItems = items.map(it => ({
          ...it,
          percentage: parseFloat(it.percentage) || 0,
          maxQuantity: it.maxQuantity ? parseInt(it.maxQuantity) : null,
          imageUrl: it.imageUrl || null,
        }));

        const boxData = {
          id: editingBox ? editingBox.id : Date.now().toString(),
          name: boxName.trim(),
          items: normalizedItems,
          maxPulls: maxPulls ? parseInt(maxPulls) : null,
          maxPullsPerUser: maxPullsPerUser ? parseInt(maxPullsPerUser) : null,
          type: boxType,
          shareCode: (editingBox && editingBox.shareCode) ? editingBox.shareCode : generateShareCode(),
          pullHistory: editingBox ? editingBox.pullHistory : [],
          createdAt: editingBox ? editingBox.createdAt : Date.now(),
          creatorDeviceId: (editingBox && editingBox.creatorDeviceId) || getDeviceId(),
          boxImageId: boxImageId,
          hideContents: hideContents,
          hideOdds: hideOdds,
          expiresAt: expiresAt ? new Date(expiresAt).getTime() : null,
          allowParticipantSharing: boxType === 'shared' ? allowParticipantSharing : false,
          pullRechargeEnabled: pullRechargeEnabled,
          pullRechargeAmount: parseInt(pullRechargeAmount) || 1,
          pullRechargePeriod: pullRechargePeriod,
          pullRechargeMax: parseInt(pullRechargeMax) || 3,
          pullRechargeUnlimited: pullRechargeUnlimited,
          pullRechargeCycles: parseInt(pullRechargeCycles) || 5,
        };

        // If shared box, save to Firestore
        if (boxType === 'shared' || (editingBox && editingBox.type === 'shared')) {
          try {
            if (editingBox && editingBox.type === 'shared') {
              // Editing an existing shared box: update settings only,
              // never overwrite the server's pullHistory with local state
              await updateSharedBox(boxData.shareCode, boxData);
            } else {
              await saveSharedBox(boxData);
            }

            // Save lightweight reference locally for creator
            const localRef = {
              id: boxData.id,
              name: boxData.name,
              type: 'shared',
              shareCode: boxData.shareCode,
              isSharedRef: true,
              items: boxData.items,
              maxPulls: boxData.maxPulls,
              maxPullsPerUser: boxData.maxPullsPerUser,
              pullHistory: [],
              createdAt: boxData.createdAt,
              creatorDeviceId: boxData.creatorDeviceId,
              boxImageId: boxData.boxImageId,
              hideContents: boxData.hideContents,
              hideOdds: boxData.hideOdds,
              expiresAt: boxData.expiresAt,
              allowParticipantSharing: boxData.allowParticipantSharing,
              pullRechargeEnabled: boxData.pullRechargeEnabled,
              pullRechargeAmount: boxData.pullRechargeAmount,
              pullRechargePeriod: boxData.pullRechargePeriod,
              pullRechargeMax: boxData.pullRechargeMax,
            };
            saveBox(localRef);
          } catch (err) {
            error('Failed to save shared box: ' + err.message);
            return;
          }
        } else {
          // Local box - save only to localStorage
          const saved = saveBox(boxData);
          if (!saved) {
            error("Not enough room to save this box — try removing some item photos or deleting an old box.");
            return;
          }
        }

        onComplete && onComplete(boxData);
      };

      const validation = validatePercentages(items);

      return (
        <div style={{ maxWidth: '800px', margin: '0 auto' }}>
          {/* Header */}
          <div style={{ marginBottom: '1.5rem' }}>
            {/* Back button - top left */}
            <button
              onClick={onCancel}
              aria-label="Back"
              style={{
                width: '40px',
                height: '40px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'rgba(15, 23, 42, 0.6)',
                border: '1px solid rgba(59, 130, 246, 0.2)',
                borderRadius: '10px',
                cursor: 'pointer',
                color: '#a0aec0',
                padding: 0,
                flexShrink: 0,
                marginBottom: '1rem',
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
            {/* Title - centered */}
            <h2 tabIndex={-1} className="screen-heading" style={{
              fontSize: '1.75rem',
              fontWeight: 800,
              color: '#e2e8f0',
              margin: 0,
              textAlign: 'center',
              outline: 'none',
            }}>
              {editingBox ? 'Edit Loot Box' : 'Create Loot Box'}
            </h2>
          </div>

          {/* STEP 1 - Name Your Box */}
          <div style={{ marginBottom: '1.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
              <div style={{
                width: '24px', height: '24px', borderRadius: '50%',
                background: boxName.trim() ? 'linear-gradient(135deg, #1e40af 0%, #3b82f6 100%)' : 'rgba(51, 65, 85, 0.6)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '0.75rem', fontWeight: 700, color: boxName.trim() ? '#ffffff' : '#64748b',
                flexShrink: 0, transition: 'all 0.3s ease',
              }}>1</div>
              <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#a0aec0', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Name Your Box
              </span>
              <span style={{ fontSize: '0.7rem', fontWeight: 600, color: '#38bdf8', marginLeft: '0.25rem' }}>REQUIRED</span>
            </div>
            <input
              ref={nameInputRef}
              type="text"
              value={boxName}
              onChange={(e) => {
                setBoxName(e.target.value);
                if (stepAlert === 'name' && e.target.value.trim()) setStepAlert(null);
              }}
              maxLength={40}
              placeholder="What's your box called?"
              style={{
                width: '100%', padding: '16px 20px', fontSize: '1.2rem', fontFamily: 'inherit', fontWeight: 600,
                color: '#e2e8f0', background: 'rgba(30, 64, 175, 0.15)',
                border: stepAlert === 'name'
                  ? '2px solid #ef4444'
                  : boxName.trim() ? '2px solid rgba(59, 130, 246, 0.5)' : '2px solid rgba(56, 189, 248, 0.3)',
                borderRadius: '14px', outline: 'none', transition: 'all 0.25s ease',
                boxShadow: stepAlert === 'name'
                  ? '0 0 20px rgba(239, 68, 68, 0.25)'
                  : '0 0 20px rgba(59, 130, 246, 0.1)',
                animation: stepAlert === 'name' ? 'fieldShake 0.4s ease' : 'none',
              }}
              onFocus={(e) => {
                e.target.style.borderColor = '#3b82f6';
                e.target.style.boxShadow = '0 0 24px rgba(59, 130, 246, 0.25)';
                e.target.style.background = 'rgba(30, 64, 175, 0.2)';
              }}
              onBlur={(e) => {
                e.target.style.borderColor = boxName.trim() ? 'rgba(59, 130, 246, 0.5)' : 'rgba(56, 189, 248, 0.3)';
                e.target.style.boxShadow = '0 0 20px rgba(59, 130, 246, 0.1)';
                e.target.style.background = 'rgba(30, 64, 175, 0.15)';
              }}
            />
            {stepAlert === 'name' && (
              <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#f87171', marginTop: '0.4rem' }}>
                Give your box a name
              </div>
            )}
          </div>

          {/* STEP 2 - Choose Appearance */}
          <div style={{ marginBottom: '1.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
              <div style={{
                width: '24px', height: '24px', borderRadius: '50%',
                background: imageSelected ? 'linear-gradient(135deg, #1e40af 0%, #3b82f6 100%)' : 'rgba(51, 65, 85, 0.6)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '0.75rem', fontWeight: 700, color: imageSelected ? '#ffffff' : '#64748b',
                flexShrink: 0, transition: 'all 0.3s ease',
              }}>2</div>
              <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#a0aec0', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Choose Appearance
              </span>
            </div>
            <Card>
              <div>
                <ImagePicker
                  selectedImageId={boxImageId}
                  onSelectImage={(id) => { setBoxImageId(id); setImageSelected(true); }}
                  userSettings={userSettings}
                  success={success}
                  error={error}
                  info={info}
                />
              </div>

              <div style={{ marginTop: '0.75rem' }}>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, color: '#cbd5e1', marginBottom: '0.5rem' }}>
                  Box Type
                </label>
                <div style={{ display: 'flex', gap: '1rem' }}>
                  <button
                    style={{
                      padding: '0.75rem 1.5rem',
                      background: boxType === 'local' ? 'linear-gradient(135deg, #1e40af 0%, #3b82f6 100%)' : 'rgba(15, 22, 36, 0.6)',
                      border: `2px solid ${boxType === 'local' ? '#3b82f6' : 'rgba(59, 130, 246, 0.2)'}`,
                      borderRadius: '12px',
                      color: boxType === 'local' ? '#ffffff' : '#a0aec0',
                      fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                    }}
                    onClick={() => setBoxType('local')}
                  >
                    Local
                  </button>
                  <button
                    style={{
                      padding: '0.75rem 1.5rem',
                      background: boxType === 'shared' ? 'linear-gradient(135deg, #1e40af 0%, #3b82f6 100%)' : 'rgba(15, 22, 36, 0.6)',
                      border: `2px solid ${boxType === 'shared' ? '#3b82f6' : 'rgba(59, 130, 246, 0.2)'}`,
                      borderRadius: '12px',
                      color: boxType === 'shared' ? '#ffffff' : '#a0aec0',
                      fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                    }}
                    onClick={() => setBoxType('shared')}
                  >
                    Shared
                  </button>
                </div>
                <div style={{ fontSize: '0.75rem', color: '#a0aec0', marginTop: '0.5rem', lineHeight: 1.5 }}>
                  {boxType === 'local'
                    ? 'Just for you — stored on this device and works offline.'
                    : 'Friends can join via link or QR code and open it too. Everyone sees pulls live.'}
                </div>
              </div>

              {boxType === 'shared' && (
                <div style={{ marginTop: '0.75rem', maxWidth: '250px' }}>
                  <Input
                    type="number"
                    label="Max Opens Per Person (Optional)"
                    placeholder="Unlimited"
                    value={maxPullsPerUser}
                    onChange={(e) => setMaxPullsPerUser(e.target.value)}
                    min="1"
                    fullWidth
                  />
                </div>
              )}

              {/* Allow Participants to Share - outside Advanced Settings */}
              {boxType === 'shared' && (
                <div style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '0.6rem 0.75rem', background: 'rgba(30, 64, 175, 0.15)',
                  border: '1px solid rgba(59, 130, 246, 0.2)', borderRadius: '8px', marginTop: '0.5rem',
                }}>
                  <div>
                    <div style={{ color: '#e2e8f0', fontWeight: 600, fontSize: '0.9rem' }}>Allow Participants to Share</div>
                    <div style={{ color: '#a0aec0', fontSize: '0.75rem', marginTop: '0.15rem' }}>Let people who join this box share the link with others</div>
                  </div>
                  <label style={{ position: 'relative', display: 'inline-block', width: '44px', height: '24px', cursor: 'pointer', flexShrink: 0 }}>
                    <input type="checkbox" checked={allowParticipantSharing} onChange={(e) => setAllowParticipantSharing(e.target.checked)} style={{ opacity: 0, width: 0, height: 0 }} />
                    <span style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: allowParticipantSharing ? 'linear-gradient(135deg, #4169e1, #1e40af)' : 'rgba(100, 116, 139, 0.4)', borderRadius: '12px', transition: 'all 0.3s ease' }}>
                      <span style={{ position: 'absolute', height: '18px', width: '18px', left: allowParticipantSharing ? '22px' : '3px', bottom: '3px', background: '#fff', borderRadius: '50%', transition: 'all 0.3s ease' }} />
                    </span>
                  </label>
                </div>
              )}
            </Card>
          </div>

          {/* STEP 3 - Add Items */}
          <div ref={itemsSectionRef} style={{
            marginBottom: '1.5rem',
            animation: stepAlert === 'items' ? 'fieldShake 0.4s ease' : 'none',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
              <div style={{
                width: '24px', height: '24px', borderRadius: '50%',
                background: stepAlert === 'items'
                  ? 'linear-gradient(135deg, #b91c1c 0%, #ef4444 100%)'
                  : items.length > 0 ? 'linear-gradient(135deg, #1e40af 0%, #3b82f6 100%)' : 'rgba(51, 65, 85, 0.6)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '0.75rem', fontWeight: 700, color: (items.length > 0 || stepAlert === 'items') ? '#ffffff' : '#64748b',
                flexShrink: 0, transition: 'all 0.3s ease',
              }}>3</div>
              <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#a0aec0', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Add Items
              </span>
              <span style={{ fontSize: '0.7rem', fontWeight: 600, color: '#38bdf8', marginLeft: '0.25rem' }}>REQUIRED</span>
              {stepAlert === 'items' && (
                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#f87171' }}>
                  — add at least one item
                </span>
              )}
            </div>


            <ItemsEditor
              items={items}
              onItemsChange={setItems}
            />

            {/* Quick odds actions — quiet secondary utilities beside the
                primary "Add item"; always available with 2+ items */}
            {items.length >= 2 && (
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.6rem' }}>
                <button
                  type="button"
                  onClick={handleSplitEvenly}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
                    padding: '0.45rem 0.85rem', fontSize: '0.8rem', fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer',
                    color: '#94a3b8', background: 'transparent',
                    border: '1px solid rgba(148,163,184,0.22)', borderRadius: '8px',
                  }}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                    <line x1="4" y1="9" x2="20" y2="9" />
                    <line x1="4" y1="15" x2="20" y2="15" />
                  </svg>
                  Split evenly
                </button>
                <button
                  type="button"
                  onClick={handleRandomize}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
                    padding: '0.45rem 0.85rem', fontSize: '0.8rem', fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer',
                    color: '#94a3b8', background: 'transparent',
                    border: '1px solid rgba(148,163,184,0.22)', borderRadius: '8px',
                  }}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M2 18h1.4c1.3 0 2.5-.6 3.3-1.7l6.1-8.6c.7-1.1 2-1.7 3.3-1.7H22" />
                    <path d="m18 2 4 4-4 4" />
                    <path d="M2 6h1.9c1.5 0 2.9.9 3.6 2.2" />
                    <path d="M22 18h-5.9c-1.3 0-2.6-.7-3.3-1.8l-.5-.8" />
                    <path d="m18 14 4 4-4 4" />
                  </svg>
                  Randomize
                </button>
              </div>
            )}
          </div>

          {/* STEP 4 - Advanced Settings (Optional) */}
          <div style={{ marginBottom: '1.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
              <div style={{
                width: '24px', height: '24px', borderRadius: '50%',
                background: 'rgba(51, 65, 85, 0.6)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '0.75rem', fontWeight: 700, color: '#64748b', flexShrink: 0,
              }}>4</div>
              <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#a0aec0', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Advanced Settings
              </span>
              <span style={{ fontSize: '0.7rem', fontWeight: 500, color: '#64748b', marginLeft: '0.25rem' }}>OPTIONAL</span>
            </div>

            <div
              onClick={() => setShowAdvanced(!showAdvanced)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
                padding: '0.55rem 0.85rem', background: 'rgba(15, 22, 36, 0.6)',
                border: '1px solid rgba(59, 130, 246, 0.2)', borderRadius: '8px',
                cursor: 'pointer', userSelect: 'none',
              }}
            >
              <span style={{ color: '#cbd5e1', fontWeight: 600, fontSize: '0.875rem' }}>
                {showAdvanced ? 'Hide' : 'Show'} Advanced
              </span>
              <span style={{
                color: '#a0aec0', fontSize: '0.75rem', transition: 'transform 0.2s ease',
                transform: showAdvanced ? 'rotate(180deg)' : 'rotate(0deg)', display: 'inline-block',
              }}>▼</span>
            </div>

            {showAdvanced && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.5rem' }}>
                <div style={{ marginBottom: '1rem', maxWidth: '250px' }}>
                  <Input
                    type="number"
                    label="Max Opens Total (Optional)"
                    placeholder="Unlimited"
                    value={maxPulls}
                    onChange={(e) => setMaxPulls(e.target.value)}
                    min="1"
                    fullWidth
                  />
                  <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: '0.25rem' }}>
                    Limit the total number of times this box can be opened by all users combined.
                  </div>
                </div>
                {/* Hide Contents toggle */}
                <div style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '0.6rem 0.75rem', background: 'rgba(30, 64, 175, 0.15)',
                  border: '1px solid rgba(59, 130, 246, 0.2)', borderRadius: '8px',
                }}>
                  <div>
                    <div style={{ color: '#e2e8f0', fontWeight: 600, fontSize: '0.9rem' }}>Hide Contents</div>
                    <div style={{ color: '#a0aec0', fontSize: '0.75rem', marginTop: '0.15rem' }}>Items hidden until opened</div>
                  </div>
                  <label style={{ position: 'relative', display: 'inline-block', width: '44px', height: '24px', cursor: 'pointer', flexShrink: 0 }}>
                    <input type="checkbox" checked={hideContents} onChange={(e) => setHideContents(e.target.checked)} style={{ opacity: 0, width: 0, height: 0 }} />
                    <span style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: hideContents ? 'linear-gradient(135deg, #4169e1, #1e40af)' : 'rgba(100, 116, 139, 0.4)', borderRadius: '12px', transition: 'all 0.3s ease' }}>
                      <span style={{ position: 'absolute', height: '18px', width: '18px', left: hideContents ? '22px' : '3px', bottom: '3px', background: '#fff', borderRadius: '50%', transition: 'all 0.3s ease' }} />
                    </span>
                  </label>
                </div>

                {/* Hide Odds toggle */}
                <div style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '0.6rem 0.75rem', background: 'rgba(30, 64, 175, 0.15)',
                  border: '1px solid rgba(59, 130, 246, 0.2)', borderRadius: '8px',
                }}>
                  <div>
                    <div style={{ color: '#e2e8f0', fontWeight: 600, fontSize: '0.9rem' }}>Hide Odds</div>
                    <div style={{ color: '#a0aec0', fontSize: '0.75rem', marginTop: '0.15rem' }}>Percentages stay secret</div>
                  </div>
                  <label style={{ position: 'relative', display: 'inline-block', width: '44px', height: '24px', cursor: 'pointer', flexShrink: 0 }}>
                    <input type="checkbox" checked={hideOdds} onChange={(e) => setHideOdds(e.target.checked)} style={{ opacity: 0, width: 0, height: 0 }} />
                    <span style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: hideOdds ? 'linear-gradient(135deg, #4169e1, #1e40af)' : 'rgba(100, 116, 139, 0.4)', borderRadius: '12px', transition: 'all 0.3s ease' }}>
                      <span style={{ position: 'absolute', height: '18px', width: '18px', left: hideOdds ? '22px' : '3px', bottom: '3px', background: '#fff', borderRadius: '50%', transition: 'all 0.3s ease' }} />
                    </span>
                  </label>
                </div>

                {/* Expiration Date toggle */}
                <div style={{
                  padding: '0.6rem 0.75rem', background: 'rgba(30, 64, 175, 0.15)',
                  border: '1px solid rgba(59, 130, 246, 0.2)', borderRadius: '8px',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ color: '#e2e8f0', fontWeight: 600, fontSize: '0.9rem' }}>Expiration Date</div>
                      <div style={{ color: '#a0aec0', fontSize: '0.75rem', marginTop: '0.15rem' }}>Box expires after a set date</div>
                    </div>
                    <label style={{ position: 'relative', display: 'inline-block', width: '44px', height: '24px', cursor: 'pointer', flexShrink: 0 }}>
                      <input type="checkbox" checked={expirationEnabled} onChange={(e) => { setExpirationEnabled(e.target.checked); if (!e.target.checked) setExpiresAt(''); }} style={{ opacity: 0, width: 0, height: 0 }} />
                      <span style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: expirationEnabled ? 'linear-gradient(135deg, #4169e1, #1e40af)' : 'rgba(100, 116, 139, 0.4)', borderRadius: '12px', transition: 'all 0.3s ease' }}>
                        <span style={{ position: 'absolute', height: '18px', width: '18px', left: expirationEnabled ? '22px' : '3px', bottom: '3px', background: '#fff', borderRadius: '50%', transition: 'all 0.3s ease' }} />
                      </span>
                    </label>
                  </div>
                  {expirationEnabled && (
                    <div style={{ marginTop: '0.5rem' }}>
                      <input
                        type="datetime-local"
                        value={expiresAt}
                        onChange={(e) => setExpiresAt(e.target.value)}
                        style={{
                          width: '100%', padding: '0.5rem 0.75rem', background: 'rgba(15, 22, 36, 0.6)',
                          border: '1px solid rgba(59, 130, 246, 0.3)', borderRadius: '8px',
                          color: '#e2e8f0', fontSize: '0.875rem', fontFamily: 'inherit', outline: 'none',
                        }}
                      />
                      {expiresAt && (
                        <div style={{ fontSize: '0.75rem', color: '#a0aec0', marginTop: '0.25rem' }}>
                          Expires: {new Date(expiresAt).toLocaleString()}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Rechargeable Opens toggle */}
                <div style={{
                  padding: '0.6rem 0.75rem', background: 'rgba(30, 64, 175, 0.15)',
                  border: '1px solid rgba(59, 130, 246, 0.2)', borderRadius: '8px',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ color: '#e2e8f0', fontWeight: 600, fontSize: '0.9rem' }}>Rechargeable Opens</div>
                      <div style={{ color: '#a0aec0', fontSize: '0.75rem', marginTop: '0.15rem' }}>Limit opens that regenerate over time</div>
                    </div>
                    <label style={{ position: 'relative', display: 'inline-block', width: '44px', height: '24px', cursor: 'pointer', flexShrink: 0 }}>
                      <input type="checkbox" checked={pullRechargeEnabled} onChange={(e) => setPullRechargeEnabled(e.target.checked)} style={{ opacity: 0, width: 0, height: 0 }} />
                      <span style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: pullRechargeEnabled ? 'linear-gradient(135deg, #4169e1, #1e40af)' : 'rgba(100, 116, 139, 0.4)', borderRadius: '12px', transition: 'all 0.3s ease' }}>
                        <span style={{ position: 'absolute', height: '18px', width: '18px', left: pullRechargeEnabled ? '22px' : '3px', bottom: '3px', background: '#fff', borderRadius: '50%', transition: 'all 0.3s ease' }} />
                      </span>
                    </label>
                  </div>
                  {pullRechargeEnabled && (
                    <div style={{ marginTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      <div style={{ display: 'flex', gap: '0.75rem' }}>
                        <div style={{ flex: 1 }}>
                          <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 500, color: '#cbd5e1', marginBottom: '0.25rem' }}>Opens granted</label>
                          <input
                            type="number"
                            min="1"
                            max="99"
                            value={pullRechargeAmount}
                            onChange={(e) => setPullRechargeAmount(e.target.value)}
                            style={{
                              width: '100%', padding: '0.5rem 0.75rem', background: 'rgba(15, 22, 36, 0.6)',
                              border: '1px solid rgba(59, 130, 246, 0.3)', borderRadius: '8px',
                              color: '#e2e8f0', fontSize: '0.875rem', fontFamily: 'inherit', outline: 'none',
                            }}
                          />
                        </div>
                        <div style={{ flex: 1 }}>
                          <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 500, color: '#cbd5e1', marginBottom: '0.25rem' }}>Every</label>
                          <select
                            value={pullRechargePeriod}
                            onChange={(e) => setPullRechargePeriod(e.target.value)}
                            style={{
                              width: '100%', padding: '0.5rem 0.75rem', background: 'rgba(15, 22, 36, 0.6)',
                              border: '1px solid rgba(59, 130, 246, 0.3)', borderRadius: '8px',
                              color: '#e2e8f0', fontSize: '0.875rem', fontFamily: 'inherit', outline: 'none',
                              cursor: 'pointer',
                            }}
                          >
                            <option value="hour">Hour</option>
                            <option value="day">Day</option>
                            <option value="week">Week</option>
                            <option value="month">Month</option>
                          </select>
                        </div>
                      </div>
                      <div style={{ maxWidth: '150px' }}>
                        <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 500, color: '#cbd5e1', marginBottom: '0.25rem' }}>Max saved opens</label>
                        <input
                          type="number"
                          min="1"
                          max="99"
                          value={pullRechargeMax}
                          onChange={(e) => setPullRechargeMax(e.target.value)}
                          style={{
                            width: '100%', padding: '0.5rem 0.75rem', background: 'rgba(15, 22, 36, 0.6)',
                            border: '1px solid rgba(59, 130, 246, 0.3)', borderRadius: '8px',
                            color: '#e2e8f0', fontSize: '0.875rem', fontFamily: 'inherit', outline: 'none',
                          }}
                        />
                        <div style={{ fontSize: '0.65rem', color: '#64748b', marginTop: '0.15rem' }}>Maximum opens a user can bank up</div>
                      </div>

                      {/* Unlimited refills toggle */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.4rem 0' }}>
                        <div>
                          <div style={{ color: '#cbd5e1', fontWeight: 500, fontSize: '0.8rem' }}>Unlimited Recharges</div>
                          <div style={{ color: '#64748b', fontSize: '0.65rem', marginTop: '0.1rem' }}>Opens recharge forever</div>
                        </div>
                        <label style={{ position: 'relative', display: 'inline-block', width: '40px', height: '22px', cursor: 'pointer', flexShrink: 0 }}>
                          <input type="checkbox" checked={pullRechargeUnlimited} onChange={(e) => setPullRechargeUnlimited(e.target.checked)} style={{ opacity: 0, width: 0, height: 0 }} />
                          <span style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: pullRechargeUnlimited ? 'linear-gradient(135deg, #4169e1, #1e40af)' : 'rgba(100, 116, 139, 0.4)', borderRadius: '11px', transition: 'all 0.3s ease' }}>
                            <span style={{ position: 'absolute', height: '16px', width: '16px', left: pullRechargeUnlimited ? '20px' : '3px', bottom: '3px', background: '#fff', borderRadius: '50%', transition: 'all 0.3s ease' }} />
                          </span>
                        </label>
                      </div>

                      {/* Number of refills (only when unlimited is OFF) */}
                      {!pullRechargeUnlimited && (
                        <div style={{ maxWidth: '150px' }}>
                          <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 500, color: '#cbd5e1', marginBottom: '0.25rem' }}>Number of Recharges</label>
                          <input
                            type="number"
                            min="1"
                            max="999"
                            value={pullRechargeCycles}
                            onChange={(e) => setPullRechargeCycles(e.target.value)}
                            style={{
                              width: '100%', padding: '0.5rem 0.75rem', background: 'rgba(15, 22, 36, 0.6)',
                              border: '1px solid rgba(59, 130, 246, 0.3)', borderRadius: '8px',
                              color: '#e2e8f0', fontSize: '0.875rem', fontFamily: 'inherit', outline: 'none',
                            }}
                          />
                        </div>
                      )}

                      <div style={{
                        fontSize: '0.75rem', color: '#a0aec0', fontStyle: 'italic',
                        padding: '0.4rem 0.6rem', background: 'rgba(59, 130, 246, 0.08)', borderRadius: '6px',
                      }}>
                        Users get {pullRechargeAmount || 1} open{(parseInt(pullRechargeAmount) || 1) !== 1 ? 's' : ''} every {pullRechargePeriod}, up to {pullRechargeMax || 3} saved{!pullRechargeUnlimited ? `, refills ${pullRechargeCycles || 5} times` : ''}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Percentage validation bar - only when items exist */}
          {validation && items.length > 0 && (
            <div ref={validationBarRef} style={{
              padding: '1rem',
              background: validation.valid ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
              border: `2px solid ${validation.valid ? '#10b981' : '#ef4444'}`,
              borderRadius: '12px',
              textAlign: 'center',
              marginBottom: '2rem',
              animation: stepAlert === 'percent' ? 'fieldShake 0.4s ease' : 'none',
            }}>
              <div style={{ fontSize: '0.875rem', color: validation.valid ? '#6ee7b7' : '#fca5a5', fontWeight: 600 }}>
                {validation.message} ({validation.total}%)
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: '1rem' }}>
            <Button variant="ghost" onClick={onCancel} fullWidth>Cancel</Button>
            <Button variant="primary" onClick={handleCreate} fullWidth style={{
              ...(validation.valid && boxName.trim() && items.length > 0
                ? { boxShadow: '0 4px 20px rgba(59, 130, 246, 0.5)' }
                : { opacity: 0.6, filter: 'saturate(0.6)' }),
            }}>
              {editingBox ? 'Save Changes' : 'Create Box'}
            </Button>
          </div>
        </div>
      );
    };

    // BoxOpener Component
    const isLightColor = (hex) => {
      if (!hex) return false;
      const c = hex.replace('#', '');
      const r = parseInt(c.substr(0, 2), 16);
      const g = parseInt(c.substr(2, 2), 16);
      const b = parseInt(c.substr(4, 2), 16);
      const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      return luminance > 0.7;
    };

    // Pick a readable text color for an item color shown on the result card.
    // Light colors get dark text; dark colors get lightened toward white so
    // they stay legible on the dark card background.
    const getReadableTextColor = (hex) => {
      if (!hex) return '#e2e8f0';
      const c = hex.replace('#', '');
      const r = parseInt(c.substr(0, 2), 16);
      const g = parseInt(c.substr(2, 2), 16);
      const b = parseInt(c.substr(4, 2), 16);
      const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      if (luminance > 0.7) return '#1e293b';
      if (luminance < 0.35) {
        const lift = (v) => Math.round(v + (255 - v) * 0.55);
        return `rgb(${lift(r)}, ${lift(g)}, ${lift(b)})`;
      }
      return hex;
    };

    // ========== REVEAL ANIMATION COMPONENT ==========
    const RevealAnimation = ({ tier, onComplete, children }) => {
      const [showChildren, setShowChildren] = React.useState(false);
      const [particles, setParticles] = React.useState([]);
      const [flashStyle, setFlashStyle] = React.useState(null);
      const [darkOverlay, setDarkOverlay] = React.useState(false);
      const [shakeClass, setShakeClass] = React.useState('');
      const contentRef = React.useRef(null);

      React.useEffect(() => {
        const randomRange = (min, max) => Math.random() * (max - min) + min;
        const { accent, particles: tierColors } = getTierAccent(tier);

        const makeParticles = (count, colors, sizeRange, txRange, delay = 0) => {
          const p = [];
          for (let i = 0; i < count; i++) {
            const color = colors[Math.floor(Math.random() * colors.length)];
            const size = Math.floor(randomRange(sizeRange[0], sizeRange[1]));
            const tx = Math.floor(randomRange(-txRange, txRange));
            const ty = Math.floor(randomRange(-txRange, txRange));
            p.push({ color, size, tx, ty, delay, id: `${delay}-${i}` });
          }
          return p;
        };

        let totalDuration = 600;

        if (tier === 'common') {
          setShowChildren(true);
          setFlashStyle({
            background: accent + '4d',
            animation: 'screenFlash 0.4s ease-out forwards',
          });
          setParticles(makeParticles(6, tierColors, [4, 5], 80));
          totalDuration = 600;
        } else if (tier === 'rare') {
          setShowChildren(true);
          setShakeClass('shakeScreen 0.5s ease-out');
          setFlashStyle({
            background: accent + '66',
            animation: 'screenFlash 0.6s ease-out forwards',
          });
          setParticles(makeParticles(12, tierColors, [5, 6], 80));
          totalDuration = 800;
        } else if (tier === 'epic') {
          setShowChildren(true);
          setShakeClass('shakeScreen 0.7s ease-out');
          setFlashStyle({
            background: accent + '80',
            animation: 'screenFlash 0.8s ease-out forwards',
          });
          const wave1 = makeParticles(20, tierColors, [5, 8], 120);
          const wave2 = makeParticles(10, tierColors, [5, 8], 120, 0.2);
          setParticles([...wave1, ...wave2]);
          totalDuration = 1200;
        } else if (tier === 'legendary') {
          setShakeClass('shakeScreenHard 0.8s ease-out');
          setFlashStyle({
            background: accent + '99',
            animation: 'screenFlash 1s ease-out forwards',
          });
          setParticles(makeParticles(30, tierColors, [6, 10], 160));
          setTimeout(() => setShakeClass('shakeScreenHard 0.8s ease-out 0.1s'), 900);
          setTimeout(() => setShowChildren(true), 300);
          totalDuration = 1500;
        } else if (tier === 'mythic') {
          setDarkOverlay(true);
          setParticles([]);
          setTimeout(() => {
            setShakeClass('shakeScreenHard 1s ease-out');
          }, 600);
          // Rainbow rain particles
          const rainColors = ['#fbbf24', '#f0abfc', '#60a5fa', '#34d399', '#f87171'];
          const rain = [];
          for (let i = 0; i < 40; i++) {
            rain.push({
              type: 'rain',
              color: rainColors[i % rainColors.length],
              size: Math.floor(randomRange(4, 8)),
              left: `${randomRange(0, 100)}%`,
              duration: randomRange(1, 2),
              delay: randomRange(0, 1.5),
              id: `rain-${i}`,
            });
          }
          setParticles(rain);
          // Central burst at peak
          setTimeout(() => {
            const burst = makeParticles(50, rainColors, [5, 9], 160);
            setParticles(prev => [...prev, ...burst]);
          }, 800);
          setTimeout(() => setShowChildren(true), 600);
          totalDuration = 2500;
        }

        const timer = setTimeout(() => {
          if (onComplete) onComplete();
        }, totalDuration);

        return () => clearTimeout(timer);
      }, [tier]);

      return React.createElement(React.Fragment, null,
        // Shake wrapper for main content
        shakeClass ? React.createElement('style', null,
          `[data-reveal-shake] { animation: ${shakeClass}; }`
        ) : null,

        // Dark overlay for mythic
        darkOverlay ? React.createElement('div', {
          style: {
            position: 'fixed', inset: 0, zIndex: 9998,
            background: 'rgba(0, 0, 0, 0.85)',
            animation: 'mythicDarkness 2.5s ease-in-out forwards',
            pointerEvents: 'none',
          }
        }) : null,

        // Flash overlay
        flashStyle ? React.createElement('div', {
          style: {
            position: 'fixed', inset: 0, zIndex: 9999,
            pointerEvents: 'none',
            ...flashStyle,
          }
        }) : null,

        // Particle overlay
        particles.length > 0 ? React.createElement('div', {
          style: {
            position: 'fixed', inset: 0, zIndex: 9999,
            pointerEvents: 'none',
            overflow: 'hidden',
          }
        }, particles.map(p =>
          p.type === 'rain'
            ? React.createElement('div', {
                key: p.id,
                style: {
                  position: 'absolute',
                  top: '-10px',
                  left: p.left,
                  width: `${p.size}px`,
                  height: `${p.size}px`,
                  borderRadius: '50%',
                  backgroundColor: p.color,
                  boxShadow: `0 0 6px 2px ${p.color}99`,
                  animation: `rainParticle ${p.duration}s ${p.delay}s infinite linear`,
                  pointerEvents: 'none',
                }
              })
            : React.createElement('div', {
                key: p.id,
                style: {
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  width: `${p.size}px`,
                  height: `${p.size}px`,
                  borderRadius: '50%',
                  backgroundColor: p.color,
                  boxShadow: `0 0 6px 2px ${p.color}99`,
                  '--tx': `${p.tx}px`,
                  '--ty': `${p.ty}px`,
                  animation: `particleBurst 0.8s ${p.delay}s ease-out forwards`,
                  pointerEvents: 'none',
                }
              })
        )) : null,

        // Children (the item reveal)
        showChildren ? children : null,
      );
    };

    const BoxOpener = ({ box, onBack, onBoxUpdate, success, error, info }) => {
      const [pullHistory, setPullHistory] = useState(box.pullHistory || []);
      const [currentPull, setCurrentPull] = useState(null);
      const [showResult, setShowResult] = useState(false);
      const [showQRCode, setShowQRCode] = useState(false);
      const qrRef = React.useRef(null);
      const [openingPhase, setOpeningPhase] = useState('idle');
      const [revealTier, setRevealTier] = useState(null);
      const [revealAnimDone, setRevealAnimDone] = useState(false);
      const isOpeningRef = useRef(false);
      const particleContainerRef = React.useRef(null);
      // Hold-to-charge (cosmetic wind-up before opening; never affects odds)
      const [charging, setCharging] = useState(false);
      const chargingRef = useRef(false);
      const chargeStartRef = useRef(0);
      const chargeRafRef = useRef(null);
      const chestRef = useRef(null);
      const chargeGlowRef = useRef(null);
      const chargeSparkRef = useRef(null);
      const lastSparkRef = useRef(0);
      const lastHapticRef = useRef(0);
      const [userName, setUserName] = useState(() => {
        if (box.type === 'shared' && box.shareCode) {
          // Check for a name saved specifically for this box
          const boxName = getBoxUserName(box.shareCode);
          if (boxName) return boxName;
          // The user's chosen display name (drawer/Settings) takes priority
          const settings = getUserSettings();
          if (settings.displayName && settings.displayName !== 'Guest') {
            return settings.displayName;
          }
          // Fall back to the last name used in another box
          const lastName = getLastUsedName();
          if (lastName) return lastName;
          // No name found -- will trigger prompt
          return '';
        }
        // Solo boxes use global display name
        const settings = getUserSettings();
        return settings.displayName && settings.displayName !== 'Guest'
          ? settings.displayName : 'You';
      });
      const [needsName, setNeedsName] = useState(false);
      const [isNameChange, setIsNameChange] = useState(false);
      const prevNameRef = useRef('');

      // Live party feed: celebrate other players' pulls as they happen
      const [partyEvent, setPartyEvent] = useState(null);
      const partyQueueRef = useRef([]);
      const partyTimerRef = useRef(null);
      const knownPullsRef = useRef(null);

      const pullKey = (p) => `${p.deviceId || 'x'}_${p.timestamp || 0}_${p.itemId || ''}`;

      const showNextParty = () => {
        const next = partyQueueRef.current.shift();
        if (!next) { partyTimerRef.current = null; return; }
        setPartyEvent(next);
        playPartyPing();
        triggerHaptic('light');
        partyTimerRef.current = setTimeout(() => {
          setPartyEvent(null);
          // brief gap before the next banner in the queue
          partyTimerRef.current = setTimeout(() => {
            partyTimerRef.current = null;
            showNextParty();
          }, 300);
        }, 3500);
      };

      const enqueueParty = (pull) => {
        partyQueueRef.current.push(pull);
        if (!partyTimerRef.current) showNextParty();
      };

      useEffect(() => {
        return () => { if (partyTimerRef.current) clearTimeout(partyTimerRef.current); };
      }, []);
      const [oddsExpanded, setOddsExpanded] = useState(false);
      const [historyExpanded, setHistoryExpanded] = useState(false);
      const [collectionExpanded, setCollectionExpanded] = useState(false);
      const [newDiscovery, setNewDiscovery] = useState(false);
      const reopenRef = useRef(false);
      const isMobile = useIsMobile();
      const userToggledHistory = useRef(false);

      // Real-time listener for shared boxes
      useEffect(() => {
        if (box.type === 'shared' && box.shareCode) {
          const unsubscribe = subscribeToSharedBox(box.shareCode, (updatedBox) => {
            if (updatedBox === null) {
              // Box was deleted by creator
              info('This box has been deleted by its creator');
              onBack();
              return;
            }
            const history = updatedBox.pullHistory || [];
            // Party feed: the first snapshot just seeds the known set
            // (those pulls are history, not news); after that, celebrate
            // any new pull made by someone other than this device.
            if (knownPullsRef.current === null) {
              knownPullsRef.current = new Set(history.map(pullKey));
            } else {
              const myId = getDeviceId();
              history.forEach(p => {
                const k = pullKey(p);
                if (!knownPullsRef.current.has(k)) {
                  knownPullsRef.current.add(k);
                  if (p.deviceId && p.deviceId !== myId) {
                    enqueueParty(p);
                  }
                }
              });
            }
            setPullHistory(history);
          }, () => {
            error('Connection lost — pull history may be outdated');
          });
          return () => unsubscribe();
        }
      }, [box.shareCode, box.type]);

      // Reset state on unmount
      useEffect(() => {
        return () => {
          setOpeningPhase('idle');
          setShowResult(false);
          setCurrentPull(null);
          isOpeningRef.current = false;
        };
      }, []);

      const remainingPulls = box.maxPulls ? box.maxPulls - pullHistory.length : null;

      // Calculate per-user remaining pulls
      const currentUserName = userName || 'You';
      const currentDeviceId = getDeviceId();
      const userPullCount = pullHistory.filter(p =>
        p.deviceId === currentDeviceId ||
        (!p.deviceId && p.userName === currentUserName)
      ).length;
      const remainingUserPulls = box.maxPullsPerUser ? box.maxPullsPerUser - userPullCount : null;

      // Pull recharge state
      const myPullTimestamps = React.useMemo(() => getUserPullTimestamps({ pullHistory }), [pullHistory]);
      const [rechargeAvailable, setRechargeAvailable] = useState(() =>
        box.pullRechargeEnabled ? getRechargeOpensAvailable(box, getUserPullTimestamps({ pullHistory: box.pullHistory || [] })) : Infinity
      );
      const [rechargeTimeLeft, setRechargeTimeLeft] = useState(() =>
        box.pullRechargeEnabled ? getTimeUntilNextRecharge(box, getUserPullTimestamps({ pullHistory: box.pullHistory || [] })) : 0
      );

      const [rechargeCyclesRemaining, setRechargeCyclesRemaining] = useState(() =>
        getRechargeCyclesRemaining(box)
      );

      // Update recharge state on interval
      useEffect(() => {
        if (!box.pullRechargeEnabled) return;
        const update = () => {
          const ts = getUserPullTimestamps({ pullHistory });
          setRechargeAvailable(getRechargeOpensAvailable(box, ts));
          setRechargeTimeLeft(getTimeUntilNextRecharge(box, ts));
          setRechargeCyclesRemaining(getRechargeCyclesRemaining(box));
        };
        update();
        const interval = setInterval(update, 1000);
        return () => clearInterval(interval);
      }, [box.pullRechargeEnabled, box.pullRechargeAmount, box.pullRechargePeriod, box.pullRechargeMax, box.pullRechargeUnlimited, box.pullRechargeCycles, pullHistory]);

      const rechargeDepleted = box.pullRechargeEnabled && rechargeAvailable <= 0;
      const allCyclesUsed = box.pullRechargeUnlimited === false && rechargeCyclesRemaining === 0;

      // Generate QR code when modal opens
      useEffect(() => {
        if (showQRCode && qrRef.current && typeof QRCode !== 'undefined') {
          qrRef.current.innerHTML = '';
          new QRCode(qrRef.current, {
            text: `${window.location.origin}${window.location.pathname}#/box/${box.shareCode}`,
            width: 200,
            height: 200,
            colorDark: '#0f172a',
            colorLight: '#ffffff',
            correctLevel: QRCode.CorrectLevel.M,
          });
        }
      }, [showQRCode]);

      // Can pull only if ALL limits allow it
      const totalLimitOk = !box.maxPulls || pullHistory.length < box.maxPulls;
      const userLimitOk = !box.maxPullsPerUser || userPullCount < box.maxPullsPerUser;
      const rechargeLimitOk = !box.pullRechargeEnabled || rechargeAvailable > 0;
      const isExpired = box.expiresAt ? Date.now() > box.expiresAt : false;
      const canPull = totalLimitOk && userLimitOk && rechargeLimitOk && !isExpired;
      // Tier accent for the reveal card — one color for rays, border, and glow.
      const tierAccent = getTierAccent(revealTier).accent;

      // Resolve a pull's item image from the box's current item list by
      // itemId. Falls back to any image copied onto the pull itself, so
      // pulls recorded before this refactor still render correctly.
      const resolveItemImage = (pull) => {
        if (!pull) return null;
        const item = (box.items || []).find(i => i.id === pull.itemId);
        return (item && item.imageUrl) || pull.imageUrl || null;
      };

      // Calculate current odds with dynamic adjustment
      const currentOdds = calculateDynamicOdds(box.items, pullHistory);

      // Open Again: re-tap once the reset has rendered, so handleBoxTap
      // sees openingPhase === 'idle' instead of the stale 'done'
      useEffect(() => {
        if (openingPhase === 'idle' && reopenRef.current) {
          reopenRef.current = false;
          handleBoxTap();
        }
      }, [openingPhase]);

      // Discovery log: items THIS user has personally pulled
      const myDiscovered = React.useMemo(() => {
        const counts = {};
        (pullHistory || []).forEach(p => {
          const mine = p.deviceId
            ? p.deviceId === currentDeviceId
            : p.userName === (userName || 'You');
          if (mine && p.itemId) counts[p.itemId] = (counts[p.itemId] || 0) + 1;
        });
        return counts;
      }, [pullHistory, userName]);
      const discoveredCount = (box.items || []).filter(i => myDiscovered[i.id]).length;
      const collectionComplete = (box.items || []).length > 0 && discoveredCount === box.items.length;

      const handleBoxTap = (charged = false) => {
        if (isOpeningRef.current) return;
        if (!canPull || openingPhase !== 'idle' || isExpired || currentOdds.length === 0) return;

        // Recharge check
        if (box.pullRechargeEnabled) {
          const ts = getUserPullTimestamps({ pullHistory });
          const available = getRechargeOpensAvailable(box, ts);
          if (available <= 0) {
            const timeLeft = getTimeUntilNextRecharge(box, ts);
            info(`Next open available in ${formatRechargeTimeRemaining(timeLeft)}`);
            return;
          }
        }

        // Unlock audio on this user gesture (critical for iOS)
        _warmUpAudio();

        // Check if box is shared and needs user name
        if (box.type === 'shared' && (!userName || userName === 'Guest') && !needsName) {
          prevNameRef.current = userName;
          setNeedsName(true);
          return;
        }

        // Lock immediately via ref (synchronous, prevents batched re-entry)
        isOpeningRef.current = true;

        const beginShake = () => {
          // Phase 2: Intense shake + glow. A charged release skips the slow
          // build-up riser and bursts straight in so the hold's momentum
          // carries through instead of restarting.
          setOpeningPhase('shaking');
          triggerHaptic(charged ? 'heavy' : 'open');
          if (charged) playChargeRelease(); else playBuildUpSound();

          // Do the actual pull calculation now (during shake animation)
          const totalPercentage = currentOdds.reduce((sum, item) => sum + item.adjustedPercentage, 0);
          let random = Math.random() * totalPercentage;
          let selectedItem = currentOdds[0];
          for (const item of currentOdds) {
            random -= item.adjustedPercentage;
            if (random <= 0) {
              selectedItem = item;
              break;
            }
          }

          // First time this player has pulled this item? (drives the
          // New Discovery flourish and the collection log)
          const isFirstDiscovery = !pullHistory.some(p =>
            p.itemId === selectedItem.id &&
            (p.deviceId ? p.deviceId === getDeviceId() : p.userName === (userName || 'You'))
          );

          // Pulls reference the item by id and no longer copy its image —
          // images are resolved from the box's item list at render time (see
          // resolveItemImage). This keeps pull records tiny so an item image
          // can't balloon a shared box document. Name/%/color are kept as
          // lightweight scalars so history still renders if an item is later
          // deleted from the box.
          const pull = {
            itemId: selectedItem.id,
            itemName: selectedItem.name,
            percentage: selectedItem.percentage,
            color: selectedItem.color,
            timestamp: Date.now(),
            userName: userName || 'You',
            deviceId: getDeviceId(),
          };

          // For shared boxes, commit the pull to Firestore DURING the shake
          // animation, so the reveal only happens once the server accepts it.
          // If the transaction rejects (limit hit in a race, box deleted),
          // the user never sees a win that didn't count.
          const savePull = box.type === 'shared'
            ? addPullToSharedBox(box.shareCode, pull)
            : Promise.resolve();
          const shakeAnim = new Promise(resolve => setTimeout(resolve, charged ? 40 : 1200));

          Promise.all([savePull, shakeAnim]).then(() => {
            // Phase 3: Reveal (1600ms+)
            const tier = getRarityTier(selectedItem.percentage);
            setOpeningPhase('reveal');
            setCurrentPull(pull);
            setRevealTier(tier);
            setRevealAnimDone(false);
            setShowResult(true);
            setNewDiscovery(isFirstDiscovery);
            if (isFirstDiscovery) setCollectionExpanded(true);

            // Spawn particles
            if (particleContainerRef.current) {
              spawnParticles(particleContainerRef.current, selectedItem.color, 28);
            }

            // Play sound and haptic based on rarity tier
            playTierRevealSound(tier);

            // Auto-expand history
            if (!historyExpanded && !userToggledHistory.current) {
              setHistoryExpanded(true);
            }

            // Record the pull locally (shared pulls were already saved above)
            if (box.type === 'shared') {
              markPullsSeen(box.shareCode, pullHistory.length + 1);
            } else {
              const newHistory = [...pullHistory, pull];
              setPullHistory(newHistory);
              const updatedBox = { ...box, pullHistory: newHistory };
              saveBox(updatedBox);
              onBoxUpdate && onBoxUpdate(updatedBox);
            }

            // Phase 4: Done (after animations settle)
            // Clear the lock BEFORE the state update: the update renders
            // synchronously, and the render must already see the lock open
            // or the Open Again button stays hidden.
            setTimeout(() => {
              isOpeningRef.current = false;
              setOpeningPhase('done');
            }, 800);
          }).catch(async (err) => {
            console.error('Failed to save pull:', err);
            // Let the shake finish so the reset isn't jarring
            await shakeAnim;
            isOpeningRef.current = false;
            setOpeningPhase('idle');
            setShowResult(false);
            setCurrentPull(null);
            error(err.message || 'Could not open the box — please try again');
            // Name conflict (raced another player to the same name):
            // reopen the prompt so they can pick a different one
            if ((err.message || '').includes('already taken')) {
              prevNameRef.current = userName;
              setNeedsName(true);
            }
          });
        };

        if (charged) {
          // Momentum carries straight from the charge peak into the shake
          beginShake();
        } else {
          // Phase 1: Wiggle, then build up
          setOpeningPhase('wiggle');
          triggerHaptic('light');
          setTimeout(beginShake, 400);
        }
      };

      // ===== Hold-to-charge: a cosmetic wind-up. Tap still opens instantly;
      // holding gathers gold sparks + glow + rattle + a rising hum, then
      // release opens. Dragging off cancels. Never touches the outcome. =====
      const CHARGE_MS = 900;

      const spawnChargeSpark = () => {
        const cont = chargeSparkRef.current;
        if (!cont) return;
        const rect = cont.getBoundingClientRect();
        const cx = rect.width / 2, cy = rect.height / 2;
        const angle = Math.random() * Math.PI * 2;
        const dist = 90 + Math.random() * 70;
        const size = 3 + Math.random() * 3;
        const el = document.createElement('div');
        el.style.cssText =
          `position:absolute;left:${cx}px;top:${cy}px;width:${size}px;height:${size}px;` +
          `border-radius:50%;background:#fbbf24;box-shadow:0 0 6px 2px rgba(251,191,36,0.7);` +
          `pointer-events:none;--sx:${(Math.cos(angle) * dist).toFixed(1)}px;` +
          `--sy:${(Math.sin(angle) * dist).toFixed(1)}px;` +
          `animation:chargeSpark ${(0.5 + Math.random() * 0.2).toFixed(2)}s ease-in forwards;`;
        cont.appendChild(el);
        setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, 800);
      };

      const chargeFrame = () => {
        if (!chargingRef.current) return;
        const elapsed = performance.now() - chargeStartRef.current;
        const progress = Math.min(1, elapsed / CHARGE_MS);
        const chest = chestRef.current;
        if (chest) {
          const jitter = progress * 3;
          const jx = (Math.random() - 0.5) * jitter * 2;
          const jy = (Math.random() - 0.5) * jitter * 2;
          const scale = 1 + 0.05 * progress + (progress >= 1 ? Math.sin(elapsed / 80) * 0.012 : 0);
          chest.style.transform = `translate(${jx.toFixed(2)}px, ${jy.toFixed(2)}px) scale(${scale.toFixed(3)})`;
          chest.style.filter = `drop-shadow(0 0 ${(25 + progress * 45).toFixed(0)}px rgba(251,191,36,${(0.6 + progress * 0.4).toFixed(2)}))`;
        }
        const glow = chargeGlowRef.current;
        if (glow) {
          const pulse = progress >= 1 ? Math.sin(elapsed / 70) * 0.08 : 0;
          glow.style.opacity = String(Math.max(0, (0.1 + progress * 0.55 + pulse)).toFixed(3));
          glow.style.transform = `scale(${(0.8 + progress * 0.4).toFixed(3)})`;
        }
        const now = performance.now();
        if (now - lastSparkRef.current > (120 - progress * 80)) {
          spawnChargeSpark();
          if (progress > 0.5) spawnChargeSpark();
          lastSparkRef.current = now;
        }
        if (now - lastHapticRef.current > (220 - progress * 140)) {
          triggerHaptic('light');
          lastHapticRef.current = now;
        }
        updateChargeHum(progress);
        chargeRafRef.current = requestAnimationFrame(chargeFrame);
      };

      const startCharge = (e) => {
        if (isOpeningRef.current || chargingRef.current) return;
        if (!canPull || openingPhase !== 'idle' || isExpired || currentOdds.length === 0) return;
        if (e && e.preventDefault) e.preventDefault();
        _warmUpAudio();
        chargingRef.current = true;
        chargeStartRef.current = performance.now();
        lastSparkRef.current = 0;
        lastHapticRef.current = 0;
        setCharging(true);
        startChargeHum();
        chargeRafRef.current = requestAnimationFrame(chargeFrame);
      };

      const endCharge = (open) => {
        if (!chargingRef.current) return;
        // A real hold gets the fast charged burst; a quick tap keeps the
        // normal wiggle + build-up ceremony.
        const wasCharged = (performance.now() - chargeStartRef.current) > 220;
        chargingRef.current = false;
        if (chargeRafRef.current) cancelAnimationFrame(chargeRafRef.current);
        chargeRafRef.current = null;
        stopChargeHum();
        const glow = chargeGlowRef.current;
        if (glow) { glow.style.opacity = '0'; glow.style.transform = ''; }
        if (chargeSparkRef.current) chargeSparkRef.current.innerHTML = '';
        // On a charged release the box is about to burst into the reveal
        // (~40ms) — leave it at its charged peak so it doesn't visibly deflate
        // first. Otherwise (cancel, or a quick tap) reset it back to rest.
        const chest = chestRef.current;
        if (chest && !(open && wasCharged)) { chest.style.transform = ''; chest.style.filter = ''; }
        setCharging(false);
        if (open) handleBoxTap(wasCharged);
      };

      // Touch pointers get implicit capture, so pointerleave won't fire when
      // you drag off — hit-test on move so drag-off-to-cancel works on phones.
      const handleChargeMove = (e) => {
        if (!chargingRef.current) return;
        const el = chestRef.current;
        if (!el) return;
        const r = el.getBoundingClientRect();
        const m = 28;
        if (e.clientX < r.left - m || e.clientX > r.right + m ||
            e.clientY < r.top - m || e.clientY > r.bottom + m) {
          endCharge(false);
        }
      };

      // Stop any charge if the opener unmounts mid-hold
      useEffect(() => () => {
        chargingRef.current = false;
        if (chargeRafRef.current) cancelAnimationFrame(chargeRafRef.current);
        stopChargeHum();
      }, []);

      const handleNameSubmit = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (userName.trim()) {
          const trimmedName = userName.trim();
          // Reject a name another player is already using in this box
          if (box.type === 'shared') {
            const nameTakenByOther = (pullHistory || []).some(p =>
              p.deviceId && p.deviceId !== currentDeviceId &&
              (p.userName || '').trim().toLowerCase() === trimmedName.toLowerCase()
            );
            if (nameTakenByOther) {
              error(`"${trimmedName}" is already taken in this box — pick another name`);
              return;
            }
          }
          // Save name for this specific box
          if (box.shareCode) {
            setBoxUserName(box.shareCode, trimmedName);
          }
          // Also save as last used name for pre-filling future boxes
          setLastUsedName(trimmedName);
          setNeedsName(false);
          if (isNameChange) {
            success('Name changed to ' + trimmedName);
            setIsNameChange(false);
          } else {
            handleBoxTap();
          }
        }
      };

      if (needsName) {
        return (
          <div style={{ maxWidth: '600px', margin: '0 auto' }}>
            <Card>
              <h2 style={{ fontSize: '1.5rem', fontWeight: 600, color: '#e2e8f0', marginBottom: '1rem' }}>
                Enter Your Name
              </h2>
              <p style={{ color: '#a0aec0', marginBottom: '1.5rem' }}>
                Enter your name for this box. Each box can have a different name.
              </p>
              <form onSubmit={handleNameSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <Input
                  type="text"
                  placeholder="Your name"
                  value={userName}
                  onChange={(e) => setUserName(e.target.value)}
                  fullWidth
                  required
                />
                <div style={{ display: 'flex', gap: '1rem' }}>
                  <Button variant="ghost" onClick={() => {
                    setUserName(prevNameRef.current);
                    setNeedsName(false);
                    setIsNameChange(false);
                  }} fullWidth>Cancel</Button>
                  <Button type="submit" variant="primary" fullWidth>Continue</Button>
                </div>
              </form>
            </Card>
          </div>
        );
      }

      return (
        <div data-reveal-shake="" style={{ maxWidth: '1000px', margin: '0 auto' }}>

          {/* Live party banner: someone else just pulled */}
          {partyEvent && (() => {
            const isRarePull = (partyEvent.percentage || 100) < 10;
            const accent = isRarePull ? '#f59e0b' : (partyEvent.color || '#3b82f6');
            const hideItem = box.hideContents;
            return (
              <div style={{
                position: 'fixed',
                top: 'calc(12px + env(safe-area-inset-top))',
                left: '50%',
                transform: 'translate(-50%, 0)',
                zIndex: 9500,
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '10px 16px',
                background: 'rgba(15, 23, 42, 0.92)',
                backdropFilter: 'blur(10px)',
                WebkitBackdropFilter: 'blur(10px)',
                border: `1px solid ${accent}66`,
                borderRadius: '14px',
                boxShadow: `0 0 24px ${accent}44, 0 8px 24px rgba(0, 0, 0, 0.5)`,
                animation: 'partyDropIn 0.45s cubic-bezier(0.34, 1.56, 0.64, 1)',
                maxWidth: '92%',
              }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill={isRarePull ? accent : 'none'} stroke={accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, filter: `drop-shadow(0 0 4px ${accent}88)` }}>
                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                </svg>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#e2e8f0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {partyEvent.userName || 'Someone'} pulled{' '}
                    <span style={{ color: getReadableTextColor(partyEvent.color || '#3b82f6') }}>
                      {hideItem ? 'a Mystery Item' : partyEvent.itemName}
                    </span>
                    {isRarePull && !hideItem && (
                      <span style={{
                        marginLeft: '6px', fontSize: '0.6rem', fontWeight: 800, color: '#f59e0b',
                        border: '1px solid rgba(245, 158, 11, 0.5)', borderRadius: '4px',
                        padding: '1px 5px', verticalAlign: 'middle', letterSpacing: '0.05em',
                      }}>RARE</span>
                    )}
                  </div>
                  {!box.hideOdds && !hideItem && (
                    <div style={{ fontSize: '0.7rem', color: '#64748b' }}>
                      {partyEvent.percentage}% odds
                    </div>
                  )}
                </div>
              </div>
            );
          })()}

          {/* Header */}
          <div style={{ marginBottom: '1rem' }}>
            {/* Back button - left aligned, compact */}
            <button onClick={onBack} aria-label="Back" style={{
              width: '40px', height: '40px',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'rgba(15, 23, 42, 0.6)',
              border: '1px solid rgba(59, 130, 246, 0.2)',
              borderRadius: '10px', cursor: 'pointer',
              color: '#a0aec0', padding: 0, flexShrink: 0,
              marginBottom: '0.5rem',
            }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>

            {/* Box name - full width, centered */}
            <h2 tabIndex={-1} className="screen-heading" style={{
              fontSize: '1.75rem',
              fontWeight: 700,
              color: '#e2e8f0',
              margin: '0 0 0.25rem 0',
              textAlign: 'center',
              outline: 'none',
            }}>
              {box.name}
            </h2>

            {box.type === 'shared' && userName && (
              <div
                onClick={(e) => { e.stopPropagation(); prevNameRef.current = userName; setNeedsName(true); setIsNameChange(true); }}
                style={{
                  fontSize: '0.8rem',
                  color: '#a0aec0',
                  cursor: 'pointer',
                  textAlign: 'center',
                  marginBottom: '0.25rem',
                }}
              >
                Playing as <span style={{ color: '#60a5fa', fontWeight: 600 }}>{userName}</span> - tap to change
              </div>
            )}

            {/* Bottom row: Status badges */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
              {remainingPulls !== null && (
                <div style={{
                  padding: '0.5rem 1rem',
                  background: remainingPulls === 0 ? 'rgba(239, 68, 68, 0.2)' : 'rgba(59, 130, 246, 0.2)',
                  border: `1px solid ${remainingPulls === 0 ? '#ef4444' : '#3b82f6'}`,
                  borderRadius: '8px',
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  color: remainingPulls === 0 ? '#fca5a5' : '#93c5fd',
                }}>
                  {remainingPulls}/{box.maxPulls} Opens Left
                </div>
              )}
              {remainingUserPulls !== null && (
                <div style={{
                  padding: '0.5rem 1rem',
                  background: remainingUserPulls === 0 ? 'rgba(239, 68, 68, 0.2)' : 'rgba(139, 92, 246, 0.2)',
                  border: `1px solid ${remainingUserPulls === 0 ? '#ef4444' : '#8b5cf6'}`,
                  borderRadius: '8px',
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  color: remainingUserPulls === 0 ? '#fca5a5' : '#c4b5fd',
                }}>
                  You: {remainingUserPulls}/{box.maxPullsPerUser} Opens Left
                </div>
              )}
              {box.expiresAt && (
                <div style={{
                  padding: '0.5rem 1rem',
                  background: isExpired
                    ? 'rgba(239, 68, 68, 0.2)'
                    : isExpiringSoon(box.expiresAt)
                      ? 'rgba(245, 158, 11, 0.2)'
                      : 'rgba(16, 185, 129, 0.2)',
                  border: `1px solid ${
                    isExpired
                      ? '#ef4444'
                      : isExpiringSoon(box.expiresAt)
                        ? '#f59e0b'
                        : '#10b981'
                  }`,
                  borderRadius: '8px',
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  color: isExpired
                    ? '#fca5a5'
                    : isExpiringSoon(box.expiresAt)
                      ? '#fcd34d'
                      : '#6ee7b7',
                }}>
                  {isExpired ? 'Expired' : formatExpirationCountdown(box.expiresAt) + ' left'}
                </div>
              )}

              {box.pullRechargeEnabled && (
                <div style={{
                  padding: '0.5rem 1rem',
                  background: allCyclesUsed && rechargeAvailable <= 0 ? 'rgba(239, 68, 68, 0.2)' : rechargeAvailable > 0 ? 'rgba(16, 185, 129, 0.2)' : 'rgba(245, 158, 11, 0.2)',
                  border: `1px solid ${allCyclesUsed && rechargeAvailable <= 0 ? '#ef4444' : rechargeAvailable > 0 ? '#10b981' : '#f59e0b'}`,
                  borderRadius: '8px',
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  color: allCyclesUsed && rechargeAvailable <= 0 ? '#fca5a5' : rechargeAvailable > 0 ? '#6ee7b7' : '#fcd34d',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                }}
                  title={
                    allCyclesUsed && rechargeAvailable <= 0
                      ? 'All refills used'
                      : rechargeCyclesRemaining !== null
                        ? `Recharge opens: ${rechargeAvailable} of ${box.pullRechargeMax} available. ${rechargeCyclesRemaining} refill${rechargeCyclesRemaining !== 1 ? 's' : ''} left.`
                        : `Recharge opens: ${rechargeAvailable} of ${box.pullRechargeMax} available.${rechargeDepleted ? ' Next open in ' + formatRechargeTimeRemaining(rechargeTimeLeft) + '.' : ''}`
                  }
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                  </svg>
                  {rechargeAvailable}/{box.pullRechargeMax}
                </div>
              )}

              {/* Cycle counter (only when NOT unlimited) */}
              {box.pullRechargeEnabled && rechargeCyclesRemaining !== null && (
                <div style={{
                  fontSize: '0.75rem',
                  color: rechargeCyclesRemaining <= 0 ? '#ef4444' : '#a0aec0',
                  fontWeight: 500,
                }}>
                  {rechargeCyclesRemaining <= 0 ? 'No refills left' : `${rechargeCyclesRemaining} refill${rechargeCyclesRemaining !== 1 ? 's' : ''} left`}
                </div>
              )}

              {/* Countdown or depleted message */}
              {rechargeDepleted && allCyclesUsed && (
                <div style={{
                  fontSize: '0.8rem',
                  color: '#ef4444',
                  fontWeight: 500,
                }}>
                  All refills used
                </div>
              )}
              {rechargeDepleted && !allCyclesUsed && (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.15rem' }}>
                  <div style={{
                    fontSize: '0.8rem',
                    color: '#f59e0b',
                    fontWeight: 500,
                  }}>
                    Next open in {formatRechargeTimeRemaining(rechargeTimeLeft)}
                  </div>
                  {rechargeCyclesRemaining !== null && (
                    <div style={{ fontSize: '0.7rem', color: '#a0aec0' }}>
                      {rechargeCyclesRemaining} refill{rechargeCyclesRemaining !== 1 ? 's' : ''} left
                    </div>
                  )}
                </div>
              )}

            </div>
          </div>

          {/* Main Opening Area */}
          <Card style={{
            marginBottom: '1.5rem',
            minHeight: '300px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            position: 'relative',
            overflow: 'hidden',
          }}>

            {/* Vignette - darkens the scene during the shake so the chest pops */}
            {(openingPhase === 'wiggle' || openingPhase === 'shaking') && (
              <div style={{
                position: 'absolute',
                inset: 0,
                background: 'radial-gradient(circle at center, rgba(0, 0, 0, 0) 15%, rgba(0, 0, 0, 0.6) 100%)',
                zIndex: 1,
                pointerEvents: 'none',
                animation: 'fadeIn 0.4s ease',
                borderRadius: '16px',
              }} />
            )}

            {/* Glow ring - visible during shaking phase */}
            <div style={{
              position: 'absolute',
              width: '200px',
              height: '200px',
              borderRadius: '50%',
              opacity: 0,
              pointerEvents: 'none',
              animation: openingPhase === 'shaking' ? 'glowPulse 1.2s ease-in-out forwards' : 'none',
            }} />

            {/* Gold charge glow — driven directly by the hold's rAF loop */}
            <div ref={chargeGlowRef} style={{
              position: 'absolute',
              top: '50%', left: '50%',
              width: '320px', height: '320px',
              marginTop: '-170px', marginLeft: '-160px',
              borderRadius: '50%',
              background: 'radial-gradient(circle, rgba(251,191,36,0.55) 0%, rgba(251,191,36,0) 65%)',
              opacity: 0,
              zIndex: 1,
              pointerEvents: 'none',
            }} />

            {/* Gold charge sparks gathering toward the box */}
            <div ref={chargeSparkRef} style={{
              position: 'absolute',
              inset: 0,
              zIndex: 3,
              pointerEvents: 'none',
              overflow: 'hidden',
              borderRadius: '16px',
            }} />

            {/* Flash overlay - visible at reveal moment */}
            <div style={{
              position: 'absolute',
              inset: 0,
              background: 'radial-gradient(circle, rgba(255,255,255,0.9) 0%, rgba(255,255,255,0) 70%)',
              opacity: 0,
              zIndex: 5,
              pointerEvents: 'none',
              borderRadius: '16px',
              animation: openingPhase === 'reveal' ? 'flashBurst 0.6s ease-out forwards' : 'none',
            }} />

            {/* Particle container */}
            <div
              ref={particleContainerRef}
              style={{
                position: 'absolute',
                inset: 0,
                pointerEvents: 'none',
                zIndex: 4,
                overflow: 'hidden',
                borderRadius: '16px',
              }}
            />

            {/* Chest image - visible during idle, wiggle, shaking phases */}
            {(openingPhase === 'idle' || openingPhase === 'wiggle' || openingPhase === 'shaking') && (
              <div style={{ textAlign: 'center' }}>
                <div
                  ref={chestRef}
                  tabIndex={openingPhase === 'idle' && canPull && !isExpired ? 0 : -1}
                  role="button"
                  aria-label="Open loot box"
                  onPointerDown={openingPhase === 'idle' && canPull && !isExpired && !isOpeningRef.current ? startCharge : undefined}
                  onPointerUp={() => endCharge(true)}
                  onPointerMove={handleChargeMove}
                  onPointerLeave={() => endCharge(false)}
                  onPointerCancel={() => endCharge(false)}
                  onContextMenu={(e) => e.preventDefault()}
                  onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && openingPhase === 'idle' && canPull && !isExpired && !isOpeningRef.current) { e.preventDefault(); handleBoxTap(); } }}
                  style={{
                    width: '200px',
                    height: '200px',
                    margin: '0 auto 1.5rem',
                    cursor: openingPhase === 'idle' && canPull && !isExpired ? 'pointer' : 'default',
                    animation: charging
                      ? 'none'
                      : openingPhase === 'wiggle'
                        ? 'boxWiggle 0.4s ease'
                        : openingPhase === 'shaking'
                          ? 'intenseShake 1.2s ease-in-out'
                          : canPull && !isExpired
                            ? 'boxIdle 3s ease-in-out infinite'
                            : 'none',
                    transition: charging ? 'none' : 'transform 0.2s ease, opacity 0.3s ease',
                    filter: 'drop-shadow(0 0 25px rgba(59, 130, 246, 0.6))',
                    borderRadius: '16px',
                    zIndex: 2,
                    position: 'relative',
                    opacity: rechargeDepleted ? 0.6 : 1,
                    touchAction: 'none',
                    WebkitTouchCallout: 'none',
                    WebkitUserSelect: 'none',
                    userSelect: 'none',
                  }}
                >
                  <img
                    src={getBoxImageUrl(box.boxImageId)}
                    alt={box.name}
                    draggable={false}
                    style={{ width: '100%', height: '100%', objectFit: 'contain', pointerEvents: 'none', WebkitTouchCallout: 'none', WebkitUserSelect: 'none', userSelect: 'none' }}
                    onError={(e) => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'block'; }}
                  />
                  <div style={{ fontSize: '6rem', display: 'none' }}>📦</div>
                </div>

                {openingPhase === 'idle' && !charging && canPull && !isExpired && (
                  <div style={{
                    fontSize: '1rem', color: '#a0aec0',
                    animation: 'tapHint 2s ease-in-out infinite',
                    marginTop: '-0.5rem', marginBottom: '0.5rem', fontWeight: 500,
                  }}>
                    {isMobile ? 'Tap to Open!' : 'Click to Open!'}
                  </div>
                )}

                {openingPhase === 'shaking' && (
                  <div style={{
                    fontSize: '1rem', color: '#f59e0b',
                    fontWeight: 600, marginTop: '-0.5rem',
                  }}>
                    Opening...
                  </div>
                )}

                {openingPhase === 'idle' && (isExpired || !canPull) && (
                  <>
                    <div style={{ fontSize: '1.25rem', color: '#fca5a5', marginBottom: '0.5rem' }}>
                      {isExpired ? 'This box has expired' : rechargeDepleted ? `Next open in ${formatRechargeTimeRemaining(rechargeTimeLeft)}` : 'No opens remaining'}
                    </div>
                    <div style={{ fontSize: '0.875rem', color: '#64748b' }}>
                      {isExpired
                        ? 'You can still view the open history below'
                        : rechargeDepleted
                          ? `${rechargeAvailable}/${box.pullRechargeMax} recharge opens available`
                          : 'Check the open history to see what was opened'}
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Result card - visible during reveal and done phases */}
            {(openingPhase === 'reveal' || openingPhase === 'done') && showResult && currentPull && (
              <RevealAnimation tier={revealTier} onComplete={() => setRevealAnimDone(true)}>
              <>
              {/* Rotating light rays behind the result card, in the item's color */}
              <div style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                width: '560px',
                height: '560px',
                marginTop: '-280px',
                marginLeft: '-280px',
                pointerEvents: 'none',
                zIndex: 5,
                animation: 'raysIn 0.6s ease forwards',
                opacity: 0,
              }}>
                <div style={{
                  width: '100%',
                  height: '100%',
                  background: `repeating-conic-gradient(from 0deg, ${tierAccent}00 0deg 14deg, ${tierAccent}30 20deg, ${tierAccent}00 26deg)`,
                  WebkitMaskImage: 'radial-gradient(closest-side, rgba(0,0,0,0.9), transparent 72%)',
                  maskImage: 'radial-gradient(closest-side, rgba(0,0,0,0.9), transparent 72%)',
                  animation: 'raysSpin 14s linear infinite',
                }} />
              </div>
              <div
                onClick={() => {
                  if (openingPhase === 'done' && canPull && !isExpired && !isOpeningRef.current) {
                    setOpeningPhase('idle');
                    setShowResult(false);
                    setCurrentPull(null);
                    setRevealTier(null);
                    setRevealAnimDone(false);
                    setNewDiscovery(false);
                    if (particleContainerRef.current) particleContainerRef.current.innerHTML = '';
                  }
                }}
                style={{
                  textAlign: 'center',
                  padding: '3rem',
                  borderRadius: '16px',
                  background: `linear-gradient(135deg, ${tierAccent}40 0%, ${tierAccent}20 100%)`,
                  border: `2px solid ${tierAccent}`,
                  boxShadow: `0 0 40px ${tierAccent}60`,
                  width: '100%',
                  maxWidth: '500px',
                  cursor: canPull && !isExpired ? 'pointer' : 'default',
                  zIndex: 6,
                  position: 'relative',
                  opacity: 0,
                  transform: 'scale(0.3) translateY(20px)',
                  animation: 'resultReveal 0.7s cubic-bezier(0.34, 1.56, 0.64, 1) forwards',
                }}
              >
                {resolveItemImage(currentPull) ? (
                  <img
                    src={resolveItemImage(currentPull)}
                    alt={currentPull.itemName}
                    style={{
                      width: '140px', height: '140px',
                      objectFit: 'contain', borderRadius: '12px',
                      marginBottom: '1.25rem',
                      border: `2px solid ${currentPull.color}40`,
                      filter: `drop-shadow(0 4px 16px ${currentPull.color}55)`,
                    }}
                  />
                ) : null}
                {newDiscovery && (
                  <div style={{
                    display: 'inline-flex', alignItems: 'center', gap: '5px',
                    padding: '3px 10px', borderRadius: '999px',
                    border: '1px solid rgba(245, 158, 11, 0.5)',
                    background: 'rgba(245, 158, 11, 0.08)',
                    color: '#fbbf24', fontSize: '0.7rem', fontWeight: 800,
                    letterSpacing: '0.06em', textTransform: 'uppercase',
                    marginBottom: '0.75rem',
                  }}>
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="#fbbf24" stroke="#fbbf24" strokeWidth="1" strokeLinejoin="round">
                      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                    </svg>
                    New Discovery
                  </div>
                )}
                <div style={{
                  fontSize: '2rem', fontWeight: 800, marginBottom: '0.5rem',
                  color: getReadableTextColor(tierAccent),
                  animation: 'shimmerText 1.5s ease-in-out 0.5s',
                }}>
                  {currentPull.itemName}
                </div>
                <div style={{
                  fontSize: '1rem', fontWeight: 500,
                  color: isLightColor(tierAccent) ? '#475569' : '#a0aec0',
                }}>
                  {currentPull.percentage}% chance
                </div>
                {canPull && !isExpired && (
                  <div style={{
                    fontSize: '0.875rem', color: '#64748b',
                    marginTop: '1rem',
                    animation: 'tapHint 2s ease-in-out infinite',
                  }}>
                    {isMobile ? 'Tap to open again!' : 'Click to open again!'}
                  </div>
                )}
              </div>
              </>
              </RevealAnimation>
            )}

          </Card>

          {showResult && canPull && !isExpired && openingPhase === 'done' && !isOpeningRef.current && (
            <button
              onClick={() => {
                setOpeningPhase('idle');
                setShowResult(false);
                setCurrentPull(null);
                setRevealTier(null);
                setRevealAnimDone(false);
                setNewDiscovery(false);
                if (particleContainerRef.current) particleContainerRef.current.innerHTML = '';
                // handleBoxTap can't be called from this (stale) render's
                // closure — the effect below re-taps once state is idle
                reopenRef.current = true;
              }}
              style={{
                width: '100%',
                padding: '0.875rem 1.25rem',
                marginBottom: '1rem',
                fontSize: '0.95rem',
                fontWeight: 700,
                fontFamily: 'inherit',
                color: '#e2e8f0',
                background: 'rgba(15, 23, 42, 0.7)',
                backdropFilter: 'blur(12px)',
                WebkitBackdropFilter: 'blur(12px)',
                border: '1px solid rgba(99, 102, 241, 0.45)',
                borderRadius: '16px',
                cursor: 'pointer',
                letterSpacing: '0.03em',
                position: 'relative',
                overflow: 'hidden',
                animation: 'borderPulse 3s ease-in-out infinite',
                transition: 'all 0.2s ease',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = 'rgba(30, 27, 75, 0.75)';
                e.currentTarget.style.borderColor = 'rgba(139, 92, 246, 0.7)';
                e.currentTarget.style.color = '#ffffff';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = 'rgba(15, 23, 42, 0.7)';
                e.currentTarget.style.borderColor = 'rgba(99, 102, 241, 0.45)';
                e.currentTarget.style.color = '#e2e8f0';
              }}
            >
              Open Again
            </button>
          )}

          {box.type === 'shared' && box.shareCode && (
            <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem' }}>
            {showResult && openingPhase === 'done' && currentPull && (
            <button
              onClick={async () => {
                const url = `${window.location.origin}${window.location.pathname}#/box/${box.shareCode}`;
                const text = `I just pulled ${currentPull.itemName} (${currentPull.percentage}% odds) from ${box.name}!\nTry your luck: ${url}`;
                if (navigator.share) {
                  try {
                    await navigator.share({ title: box.name, text });
                  } catch (err) {
                    if (err.name !== 'AbortError') console.error('Share failed:', err);
                  }
                } else {
                  try {
                    await navigator.clipboard.writeText(text);
                    success('Result copied to clipboard!');
                  } catch {
                    const textarea = document.createElement('textarea');
                    textarea.value = text;
                    textarea.style.position = 'fixed';
                    textarea.style.opacity = '0';
                    document.body.appendChild(textarea);
                    textarea.select();
                    document.execCommand('copy');
                    document.body.removeChild(textarea);
                    success('Result copied to clipboard!');
                  }
                }
              }}
              style={{
                flex: 1,
                padding: '0.75rem 1.25rem',
                fontSize: '0.85rem',
                fontWeight: 600,
                fontFamily: 'inherit',
                color: '#a0aec0',
                background: 'transparent',
                border: '1px solid rgba(148, 163, 184, 0.25)',
                borderRadius: '12px',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = 'rgba(15, 23, 42, 0.5)';
                e.currentTarget.style.borderColor = 'rgba(148, 163, 184, 0.4)';
                e.currentTarget.style.color = '#e2e8f0';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = 'transparent';
                e.currentTarget.style.borderColor = 'rgba(148, 163, 184, 0.25)';
                e.currentTarget.style.color = '#a0aec0';
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8" />
                <polyline points="16 6 12 2 8 6" />
                <line x1="12" y1="2" x2="12" y2="15" />
              </svg>
              Share Result
            </button>
            )}
            <button
              onClick={() => setShowQRCode(true)}
              style={{
                flex: 1,
                padding: '0.75rem 1.25rem',
                fontSize: '0.85rem',
                fontWeight: 600,
                fontFamily: 'inherit',
                color: '#a0aec0',
                background: 'transparent',
                border: '1px solid rgba(148, 163, 184, 0.25)',
                borderRadius: '12px',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = 'rgba(15, 23, 42, 0.5)';
                e.currentTarget.style.borderColor = 'rgba(148, 163, 184, 0.4)';
                e.currentTarget.style.color = '#e2e8f0';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = 'transparent';
                e.currentTarget.style.borderColor = 'rgba(148, 163, 184, 0.25)';
                e.currentTarget.style.color = '#a0aec0';
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="2" width="8" height="8" rx="1" />
                <rect x="14" y="2" width="8" height="8" rx="1" />
                <rect x="2" y="14" width="8" height="8" rx="1" />
                <rect x="14" y="14" width="4" height="4" rx="0.5" />
                <line x1="22" y1="14" x2="22" y2="18" />
                <line x1="18" y1="22" x2="22" y2="22" />
              </svg>
              QR Code
            </button>
            </div>
          )}

          {/* QR Code Modal */}
          {showQRCode && (
            <>
              <div
                onClick={() => setShowQRCode(false)}
                style={{
                  position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                  background: 'rgba(0, 0, 0, 0.7)',
                  backdropFilter: 'blur(8px)',
                  WebkitBackdropFilter: 'blur(8px)',
                  zIndex: 9998,
                  animation: 'fadeIn 0.2s ease',
                }}
              />
              <div style={{
                position: 'fixed',
                top: '50%', left: '50%',
                transform: 'translate(-50%, -50%)',
                zIndex: 9999,
                background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.95) 0%, rgba(30, 27, 75, 0.95) 100%)',
                border: '1px solid rgba(99, 102, 241, 0.3)',
                borderRadius: '20px',
                padding: '2rem',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '1.25rem',
                boxShadow: '0 0 40px rgba(99, 102, 241, 0.2), 0 8px 32px rgba(0, 0, 0, 0.5)',
                animation: 'slideUp 0.3s ease',
                maxWidth: '320px',
                width: '90%',
              }}>
                <h3 style={{
                  margin: 0, fontSize: '1.1rem', fontWeight: 700,
                  color: '#e2e8f0', textAlign: 'center',
                }}>
                  {box.name}
                </h3>
                <div
                  ref={qrRef}
                  style={{
                    background: '#ffffff',
                    borderRadius: '12px',
                    padding: '16px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                />
                <div style={{
                  fontSize: '0.75rem', color: '#64748b', textAlign: 'center',
                }}>
                  Scan to open this loot box
                </div>
                <button
                  onClick={() => setShowQRCode(false)}
                  style={{
                    width: '100%',
                    padding: '0.7rem',
                    fontSize: '0.9rem',
                    fontWeight: 600,
                    fontFamily: 'inherit',
                    color: '#a0aec0',
                    background: 'rgba(15, 23, 42, 0.6)',
                    border: '1px solid rgba(148, 163, 184, 0.2)',
                    borderRadius: '10px',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.background = 'rgba(15, 23, 42, 0.8)';
                    e.currentTarget.style.color = '#e2e8f0';
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.background = 'rgba(15, 23, 42, 0.6)';
                    e.currentTarget.style.color = '#a0aec0';
                  }}
                >
                  Close
                </button>
              </div>
            </>
          )}

          {/* Collection / Discovery Log */}
          {(box.items || []).length > 0 && (
            <Card style={{ marginBottom: isMobile ? '1rem' : '1.5rem' }}>
              <div
                onClick={() => setCollectionExpanded(!collectionExpanded)}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  cursor: 'pointer',
                  userSelect: 'none',
                  WebkitUserSelect: 'none',
                  minHeight: '44px',
                  padding: '0.25rem 0',
                }}
              >
                <h3 style={{ fontSize: '1.25rem', fontWeight: 600, color: '#e2e8f0', margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
                  Collection
                  <span style={{
                    fontSize: '0.8rem', fontWeight: 700,
                    color: collectionComplete ? '#fbbf24' : '#60a5fa',
                    border: `1px solid ${collectionComplete ? 'rgba(245, 158, 11, 0.5)' : 'rgba(59, 130, 246, 0.35)'}`,
                    borderRadius: '999px', padding: '2px 10px',
                  }}>
                    {discoveredCount}/{box.items.length}{collectionComplete ? ' ✦' : ''}
                  </span>
                </h3>
                <span style={{
                  fontSize: '1.25rem',
                  color: '#a0aec0',
                  transition: 'transform 0.25s ease',
                  transform: collectionExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                  display: 'inline-block',
                }}>
                  ▼
                </span>
              </div>

              {collectionExpanded && (
                <div style={{ marginTop: '0.75rem' }}>
                  {/* Progress bar */}
                  <div style={{ height: '6px', borderRadius: '3px', background: 'rgba(51, 65, 85, 0.5)', overflow: 'hidden', marginBottom: '1rem' }}>
                    <div style={{
                      width: `${(discoveredCount / box.items.length) * 100}%`,
                      height: '100%',
                      borderRadius: '3px',
                      background: collectionComplete
                        ? 'linear-gradient(90deg, #f59e0b, #fbbf24)'
                        : 'linear-gradient(90deg, #1e40af, #3b82f6)',
                      transition: 'width 0.5s ease',
                    }} />
                  </div>

                  {/* Item tiles: discovered vs silhouettes */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))', gap: '0.5rem' }}>
                    {box.items.map(item => {
                      const count = myDiscovered[item.id] || 0;
                      const found = count > 0;
                      return (
                        <div key={item.id} style={{
                          padding: '0.6rem 0.5rem',
                          borderRadius: '10px',
                          textAlign: 'center',
                          background: found ? `${item.color}14` : 'rgba(15, 22, 36, 0.5)',
                          border: found ? `1px solid ${item.color}55` : '1px dashed rgba(100, 116, 139, 0.35)',
                          minWidth: 0,
                        }}>
                          <div style={{
                            width: '14px', height: '14px', borderRadius: '50%',
                            background: found ? item.color : 'rgba(100, 116, 139, 0.3)',
                            boxShadow: found ? `0 0 8px ${item.color}80` : 'none',
                            margin: '0 auto 6px',
                          }} />
                          <div style={{
                            fontSize: '0.7rem', fontWeight: 600,
                            color: found ? '#e2e8f0' : '#475569',
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          }}>
                            {found ? item.name : '???'}
                          </div>
                          <div style={{ fontSize: '0.6rem', color: found ? '#64748b' : '#3f4a5f' }}>
                            {found ? `×${count}` : 'undiscovered'}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {collectionComplete && (
                    <div style={{
                      textAlign: 'center', marginTop: '0.75rem',
                      fontSize: '0.8rem', fontWeight: 700, color: '#fbbf24',
                    }}>
                      Collection complete — you've found everything!
                    </div>
                  )}
                </div>
              )}
            </Card>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : (box.hideOdds ? '1fr' : '1fr 1fr'), gap: isMobile ? '1rem' : '1.5rem' }}>
            {/* Current Odds - only show if not hidden */}
            {!box.hideOdds && (
              <Card>
                <div
                  onClick={() => setOddsExpanded(!oddsExpanded)}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    cursor: 'pointer',
                    userSelect: 'none',
                    WebkitUserSelect: 'none',
                    minHeight: '44px',
                    padding: '0.25rem 0',
                  }}
                >
                  <h3 style={{
                    fontSize: '1.25rem',
                    fontWeight: 600,
                    color: '#e2e8f0',
                    margin: 0,
                  }}>
                    Current Odds
                  </h3>
                  <span style={{
                    fontSize: '1.25rem',
                    color: '#a0aec0',
                    transition: 'transform 0.25s ease',
                    transform: oddsExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                    display: 'inline-block',
                  }}>
                    ▼
                  </span>
                </div>

                {oddsExpanded && (
                  <div style={{ marginTop: '1rem' }}>
                    {currentOdds.length === 0 ? (
                      <div style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>
                        All items claimed!
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                        {currentOdds.map(item => (
                          <div
                            key={item.id}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.75rem',
                              padding: '0.75rem',
                              background: 'rgba(15, 22, 36, 0.6)',
                              border: `1px solid ${item.color}40`,
                              borderLeft: `3px solid ${item.color}`,
                              borderRadius: '8px',
                            }}
                          >
                            {item.imageUrl ? (
                              <img
                                src={item.imageUrl}
                                alt={item.name}
                                style={{
                                  width: '32px',
                                  height: '32px',
                                  objectFit: 'contain',
                                  borderRadius: '4px',
                                  border: `1px solid ${item.color}40`,
                                }}
                              />
                            ) : (
                              <span style={{
                                width: '10px',
                                height: '10px',
                                borderRadius: '50%',
                                background: item.color,
                                boxShadow: `0 0 8px ${item.color}80`,
                              }} />
                            )}
                            <span style={{ flex: 1, fontSize: '0.875rem', color: '#cbd5e1' }}>
                              {box.hideContents ? '???' : item.name}
                            </span>
                            <span style={{ fontSize: '1rem', fontWeight: 700, color: isLightColor(item.color) ? '#a0aec0' : item.color }}>
                              {item.adjustedPercentage.toFixed(1)}%
                            </span>
                            {item.remaining !== Infinity && (
                              <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                                ({item.remaining} left)
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </Card>
            )}

            {/* Pull History */}
            <Card>
              <div
                onClick={() => {
                  setHistoryExpanded(!historyExpanded);
                  userToggledHistory.current = true;
                }}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  cursor: 'pointer',
                  userSelect: 'none',
                  WebkitUserSelect: 'none',
                  minHeight: '44px',
                  padding: '0.25rem 0',
                }}
              >
                <h3 style={{
                  fontSize: '1.25rem',
                  fontWeight: 600,
                  color: '#e2e8f0',
                  margin: 0,
                }}>
                  Open History ({pullHistory.length})
                </h3>
                <span style={{
                  fontSize: '1.25rem',
                  color: '#a0aec0',
                  transition: 'transform 0.25s ease',
                  transform: historyExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                  display: 'inline-block',
                }}>
                  ▼
                </span>
              </div>

              {historyExpanded && (
                <div style={{ marginTop: '1rem' }}>
                  {pullHistory.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>
                      No opens yet
                    </div>
                  ) : (
                    <div style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.5rem',
                      maxHeight: '400px',
                      overflowY: 'auto',
                    }}>
                      {pullHistory.slice().reverse().map((pull, idx) => {
                        // Current user can see their own pulls, but hideContents hides items pulled by others.
                        // Match by deviceId (stable) rather than display name (collides / changes).
                        const isCurrentUserPull = pull.deviceId
                          ? pull.deviceId === currentDeviceId
                          : pull.userName === (userName || 'You');
                        const shouldHideItemName = box.hideContents && !isCurrentUserPull;

                        return (
                          <div
                            key={idx}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.5rem',
                              padding: '0.5rem',
                              background: 'rgba(15, 22, 36, 0.4)',
                              borderRadius: '6px',
                              fontSize: '0.875rem',
                            }}
                          >
                            {resolveItemImage(pull) && !shouldHideItemName ? (
                              <img
                                src={resolveItemImage(pull)}
                                alt={pull.itemName}
                                style={{
                                  width: '24px',
                                  height: '24px',
                                  objectFit: 'contain',
                                  borderRadius: '3px',
                                  border: `1px solid ${pull.color}40`,
                                }}
                              />
                            ) : (
                              <span style={{
                                width: '8px',
                                height: '8px',
                                borderRadius: '50%',
                                background: pull.color,
                              }} />
                            )}
                            <span style={{ color: '#cbd5e1' }}>
                              {shouldHideItemName ? 'Mystery Item' : pull.itemName}
                            </span>
                            <span style={{ marginLeft: 'auto', color: '#64748b', fontSize: '0.75rem' }}>
                              {pull.userName}
                            </span>
                            <span style={{ color: '#475569', fontSize: '0.75rem' }}>
                              {new Date(pull.timestamp).toLocaleTimeString()}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </Card>
          </div>
        </div>
      );
    };

    // ========== ERROR BOUNDARY ==========

    class ErrorBoundary extends React.Component {
      constructor(props) {
        super(props);
        this.state = { hasError: false };
      }
      static getDerivedStateFromError() {
        return { hasError: true };
      }
      componentDidCatch(error, errorInfo) {
        console.error('App crashed:', error, errorInfo);
      }
      render() {
        if (this.state.hasError) {
          return React.createElement('div', {
            style: {
              minHeight: '100vh',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%)',
              color: '#e2e8f0',
              fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
              padding: '2rem',
              textAlign: 'center',
            }
          },
            React.createElement('div', { style: { fontSize: '2.5rem', marginBottom: '1rem' } }, '\uD83D\uDCE6'),
            React.createElement('h1', { style: { fontSize: '1.3rem', fontWeight: 700, marginBottom: '0.5rem' } }, 'Something went wrong'),
            React.createElement('p', { style: { color: '#a0aec0', fontSize: '0.9rem', marginBottom: '1.5rem' } }, 'Please refresh the page.'),
            React.createElement('button', {
              onClick: () => window.location.reload(),
              style: {
                padding: '0.75rem 2rem',
                fontSize: '0.95rem',
                fontWeight: 600,
                color: '#e2e8f0',
                background: 'rgba(15, 23, 42, 0.7)',
                border: '1px solid rgba(99, 102, 241, 0.45)',
                borderRadius: '12px',
                cursor: 'pointer',
                fontFamily: 'inherit',
              }
            }, 'Refresh')
          );
        }
        return this.props.children;
      }
    }

    // ========== MAIN APP ==========

    const App = () => {
      const isMobile = useIsMobile();
      const [mode, setMode] = useState('home'); // home, create, edit, open
      const [activeFilter, setActiveFilter] = useState('All');
      const [favorites, setFavorites] = useState(getFavorites());
      const [boxes, setBoxes] = useState([]);
      const [userSettings, setUserSettings] = useState(null);
      const [editingBox, setEditingBox] = useState(null);
      const [openingBox, setOpeningBox] = useState(null);
      const [pendingTemplate, setPendingTemplate] = useState(null);
      const [drawerOpen, setDrawerOpen] = useState(false);
      const [showAboutModal, setShowAboutModal] = useState(false);
      const [showWelcome, setShowWelcome] = useState(() => !hasSeenWelcome());
      const { showToast, toastElement, success, error, info } = useToast();

      // Tick to keep expiration badges fresh (1s when under 1min, else 30s)
      const [, setTick] = useState(0);
      const boxesRef = useRef(boxes);
      useEffect(() => { boxesRef.current = boxes; }, [boxes]);

      useEffect(() => {
        const getInterval = () => {
          const hasExpiringSoon = boxesRef.current.some(b =>
            b.expiresAt && b.expiresAt - Date.now() > 0 && b.expiresAt - Date.now() < 60000
          );
          return hasExpiringSoon ? 1000 : 30000;
        };

        let timer = setInterval(() => setTick(t => t + 1), getInterval());

        // Re-check interval every 30s to switch between fast/slow
        const checker = setInterval(() => {
          clearInterval(timer);
          timer = setInterval(() => setTick(t => t + 1), getInterval());
        }, 30000);

        return () => {
          clearInterval(timer);
          clearInterval(checker);
        };
      }, []);

      // Scroll to top and focus heading on mode change
      useEffect(() => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
        setTimeout(() => {
          const heading = document.querySelector('.screen-heading');
          if (heading) heading.focus();
        }, 100);
      }, [mode]);

      const loadTemplate = async (shareCode) => {
        const templateData = await fetchBoxTemplate(shareCode);
        if (templateData) {
          setPendingTemplate(templateData);
        } else {
          error('Template not found or link expired');
        }
        window.location.hash = '';
      };

      const handleConfirmImport = () => {
        if (!pendingTemplate) return;


        importBoxFromTemplate(pendingTemplate);
        setPendingTemplate(null);
        loadData();
        success('Box imported successfully!');
      };

      const handleDiscoverImport = (templateData) => {
        const newBox = importBoxFromTemplate(templateData);
        saveBox(newBox);
        loadData();
      };

      const handleSaveSettings = (updatedSettings) => {
        saveUserSettings(updatedSettings);
        setUserSettings(updatedSettings);
      };

      const handleCancelImport = () => {
        setPendingTemplate(null);
      };

      useEffect(() => {
        migrateOldName();
        loadData();

        // Check for shared box URL
        const hash = window.location.hash;
        const match = hash.match(/^#\/box\/([A-Z0-9]{6})$/);
        if (match) {
          const shareCode = match[1];
          loadSharedBox(shareCode);
        }

        // Check for template URL
        const templateMatch = hash.match(/^#\/template\/([A-Z0-9]{6})$/);
        if (templateMatch) {
          loadTemplate(templateMatch[1]);
        }

        // Listen for hash changes
        const handleHashChange = () => {
          const hash = window.location.hash;
          const match = hash.match(/^#\/box\/([A-Z0-9]{6})$/);
          if (match) {
            loadSharedBox(match[1]);
          }
          const templateMatch = hash.match(/^#\/template\/([A-Z0-9]{6})$/);
          if (templateMatch) {
            loadTemplate(templateMatch[1]);
          }
        };
        window.addEventListener('hashchange', handleHashChange);
        return () => window.removeEventListener('hashchange', handleHashChange);
      }, []);

      useEffect(() => {
        // Subscribe to real-time updates for all shared boxes
        const unsubscribers = [];

        boxes.forEach((box) => {
          if (box.type === 'shared' && box.shareCode) {
            const unsub = subscribeToSharedBox(box.shareCode, (updatedBox) => {
              if (updatedBox) {
                setBoxes(prev => prev.map(b => {
                  if (b.shareCode === box.shareCode) {
                    const updated = {
                      ...b,
                      ...updatedBox,
                      id: b.id,
                      isSharedRef: b.isSharedRef,
                      isVisitor: b.isVisitor,
                      // Snapshot omits a custom box image (it lives in the meta
                      // doc); keep the one we already have so the card image
                      // doesn't blank out on every pull.
                      boxImageId: updatedBox.boxImageId || b.boxImageId,
                    };
                    // Also persist to localStorage
                    saveBox(updated);
                    return updated;
                  }
                  return b;
                }));
              }
            });
            unsubscribers.push(unsub);
          }
        });

        return () => {
          unsubscribers.forEach(unsub => unsub());
        };
      }, [boxes.filter(b => b.type === 'shared').map(b => b.shareCode).join(',')]);

      const loadData = async () => {
        const loadedBoxes = getAllBoxes();
        const settings = getUserSettings();

        // Fetch fresh pull counts for shared boxes from Firestore
        const updatedBoxes = await Promise.all(
          loadedBoxes.map(async (box) => {
            if (box.type === 'shared' && box.shareCode) {
              try {
                // Home feed cards don't render item images — skip the images read
                const freshBox = await fetchSharedBox(box.shareCode, false);
                if (freshBox) {
                  return {
                    ...box,
                    ...freshBox,
                    id: box.id,
                    isSharedRef: box.isSharedRef,
                    isVisitor: box.isVisitor,
                    // Images were skipped in this fetch; keep the custom box
                    // image already stored locally so the card keeps showing it.
                    boxImageId: freshBox.boxImageId || box.boxImageId,
                  };
                }
              } catch (err) {
                console.error('Error fetching shared box:', err);
              }
            }
            return box;
          })
        );

        // Persist updated shared box data back to localStorage
        updatedBoxes.forEach((box) => {
          if (box.type === 'shared' && box.shareCode) {
            saveBox(box);
          }
        });

        setBoxes(updatedBoxes);
        setUserSettings(settings);
      };

      const loadSharedBox = async (shareCode) => {
        const box = await fetchSharedBox(shareCode);
        if (box) {
          // Save a read-only reference so visitor sees it in their feed
          const existingBoxes = getAllBoxes();
          const alreadySaved = existingBoxes.some(
            b => b.shareCode === shareCode
          );

          if (!alreadySaved) {
            const visitorRef = {
              id: box.id,
              name: box.name,
              type: 'shared',
              shareCode: box.shareCode,
              isSharedRef: true,
              isVisitor: true,  // THIS IS THE KEY FLAG
              items: box.items,
              maxPulls: box.maxPulls,
              maxPullsPerUser: box.maxPullsPerUser || null,
              pullHistory: [],  // will be fetched from Firestore
              createdAt: box.createdAt,
              boxImageId: box.boxImageId,
              hideContents: box.hideContents,
              hideOdds: box.hideOdds,
              expiresAt: box.expiresAt || null,
              allowParticipantSharing: box.allowParticipantSharing || false,
            };
            saveBox(visitorRef);
            loadData();  // refresh the box list
          }

          setOpeningBox(box);
          setMode('open');
        } else {
          error('This box no longer exists or the link is invalid');
        }
      };

      const handleCreateBox = () => {
        setEditingBox(null);
        setMode('create');
      };

      const handleEditBox = (box) => {
        if (box.isVisitor) {
          info('You can only view shared boxes you joined');
          return;
        }
        setEditingBox(box);
        setMode('edit');
      };

      const handleDeleteBox = async (boxId) => {
        triggerHaptic('heavy');
        const box = boxes.find(b => b.id === boxId);

        // If shared box AND creator (not visitor), delete from Firestore
        if (box && box.type === 'shared' && box.shareCode && !box.isVisitor) {
          const deleted = await deleteSharedBox(box.shareCode);
          if (!deleted) {
            error('Failed to delete shared box from server');
            return;
          }
        }

        // Delete local reference (works for both creator and visitor)
        deleteBox(boxId);

        if (openingBox && openingBox.id === boxId) {
          setOpeningBox(null);
          setMode('home');
        }

        loadData();
        success(box?.isVisitor ? 'Removed from your feed' : 'Box deleted successfully');
      };

      // Lock body scroll when drawer is open
      useEffect(() => {
        document.body.style.overflow = drawerOpen ? 'hidden' : '';
        return () => { document.body.style.overflow = ''; };
      }, [drawerOpen]);

      const handleDrawerNavigate = (key) => {
        setDrawerOpen(false);
        switch (key) {
          case 'create': handleCreateBox(); break;
          case 'myBoxes': setMode('home'); break;
          case 'templates': setMode('discover'); break;
          case 'stats': setMode('stats'); break;
          case 'settings': setMode('settings'); break;
          case 'shareApp': {
            const appUrl = `${window.location.origin}${window.location.pathname}`;
            if (navigator.share) {
              navigator.share({ title: 'Loot Box Creator', text: 'Create, customize, and share loot boxes with friends!', url: appUrl }).catch(() => {});
            } else {
              navigator.clipboard.writeText(appUrl).then(() => success('Link copied to clipboard')).catch(() => {
                const textarea = document.createElement('textarea');
                textarea.value = appUrl;
                textarea.style.position = 'fixed';
                textarea.style.opacity = '0';
                document.body.appendChild(textarea);
                textarea.select();
                document.execCommand('copy');
                document.body.removeChild(textarea);
                success('Link copied to clipboard');
              });
            }
            break;
          }
          case 'about': setTimeout(() => setShowAboutModal(true), 100); break;
        }
      };

      const handleDuplicateBox = (box) => {
        if (box.isVisitor) {
          info('You can only duplicate boxes you created');
          return;
        }
        const duplicatedBox = {
          ...box,
          id: Date.now().toString(),
          name: `${box.name} (Copy)`,
          pullHistory: [],
          createdAt: Date.now(),
          shareCode: generateShareCode(),
          isVisitor: false,
          isSharedRef: false,
          type: 'local',
        };
        saveBox(duplicatedBox);
        loadData();
        triggerHaptic('success');
        success(`"${box.name}" duplicated!`);
      };

      const handleToggleFavorite = (boxId) => {
        triggerHaptic('light');
        const newFavs = toggleFavorite(boxId);
        setFavorites([...newFavs]);
      };

      const handleBoxSaved = (box) => {
        loadData();
        setMode('home');
        setEditingBox(null);
        if (showWelcome) { markWelcomeSeen(); setShowWelcome(false); }
        success(editingBox ? 'Box updated successfully!' : `${box.name} created successfully!`);
      };

      const handleCancel = () => {
        setMode('home');
        setEditingBox(null);
      };

      const handleOpenBox = async (box) => {
        markBoxAsSeen(box.id);
        if (box.shareCode) {
          markPullsSeen(box.shareCode, (box.pullHistory || []).length);
        }
        if (box.type === 'shared' && box.shareCode) {
          const freshBox = await fetchSharedBox(box.shareCode);
          if (freshBox) {
            markPullsSeen(box.shareCode, (freshBox.pullHistory || []).length);
            setOpeningBox(freshBox);
            setMode('open');
          } else {
            // Box was deleted - clean up local reference
            deleteBox(box.id);
            loadData();
            error('This box no longer exists. It has been removed from your list.');
            return;
          }
        } else {
          setOpeningBox(box);
          setMode('open');
        }
      };

      const handleBoxUpdate = (updatedBox) => {
        loadData();
        setOpeningBox(updatedBox);
      };

      const handleCloseOpener = () => {
        setMode('home');
        setOpeningBox(null);
        loadData(); // Reload to show updated pull counts
      };

      let filteredBoxes = boxes.filter(box => {
        if (activeFilter === 'Local') return box.type === 'local';
        if (activeFilter === 'Shared') return box.type === 'shared';
        if (activeFilter === 'Unopened') {
          // Show boxes that haven't been opened yet
          return !box.pullHistory || box.pullHistory.length === 0;
        }
        if (activeFilter === 'Faves') {
          const favId = box.shareCode || box.id;
          return favorites.includes(favId);
        }
        if (activeFilter === 'All') return true;
        return true;
      });

      // Sort "All" filter by newest first, then by most recently used
      if (activeFilter === 'All') {
        filteredBoxes = filteredBoxes.sort((a, b) => {
          const getLastActivity = (box) => {
            const lastPull = (box.pullHistory && box.pullHistory.length > 0)
              ? Math.max(...box.pullHistory.map(p => p.timestamp || 0))
              : 0;
            return Math.max(lastPull, box.createdAt || 0);
          };
          return getLastActivity(b) - getLastActivity(a);
        });
      }

      if (!userSettings) return (
        <div className="boot-screen">
          <img src="assets/images/ui/logo-chest.png" alt="" />
          <div className="boot-title">Loot Box Creator</div>
        </div>
      );

      return (
        <div style={{ maxWidth: '1200px', margin: '0 auto', padding: isMobile ? '1rem' : '2rem', minHeight: '100vh' }}>
          <Header
            onMenuClick={() => setDrawerOpen(true)}
          />

          {mode === 'home' && (
            <>
              <FilterTabs activeFilter={activeFilter} onFilterChange={setActiveFilter} filters={['All', 'Shared', 'Unopened', 'Faves', 'Local']} />

              <div
                style={{
                  position: 'relative',
                  width: '100%',
                  marginBottom: isMobile ? '1rem' : '1.5rem',
                  borderRadius: '16px',
                  overflow: 'hidden',
                }}
              >
                <button
                  onClick={handleCreateBox}
                  style={{
                    width: '100%',
                    padding: isMobile ? '0.875rem 1.25rem' : '0.85rem 1.25rem',
                    fontSize: isMobile ? '0.95rem' : '1rem',
                    fontWeight: 700,
                    fontFamily: 'inherit',
                    color: '#e2e8f0',
                    background: 'rgba(15, 23, 42, 0.7)',
                    backdropFilter: 'blur(12px)',
                    WebkitBackdropFilter: 'blur(12px)',
                    border: '1px solid rgba(99, 102, 241, 0.45)',
                    borderRadius: '16px',
                    cursor: 'pointer',
                    letterSpacing: '0.03em',
                    position: 'relative',
                    overflow: 'hidden',
                    animation: 'borderPulse 3s ease-in-out infinite',
                    transition: 'all 0.2s ease',
                    zIndex: 0,
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.background = 'rgba(30, 27, 75, 0.75)';
                    e.currentTarget.style.borderColor = 'rgba(139, 92, 246, 0.7)';
                    e.currentTarget.style.color = '#ffffff';
                    // trigger shimmer
                    const shimmer = e.currentTarget.querySelector('.btn-shimmer');
                    if (shimmer) shimmer.style.animation = 'shimmerSweep 0.6s ease forwards';
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.background = 'rgba(15, 23, 42, 0.7)';
                    e.currentTarget.style.borderColor = 'rgba(99, 102, 241, 0.45)';
                    e.currentTarget.style.color = '#e2e8f0';
                    const shimmer = e.currentTarget.querySelector('.btn-shimmer');
                    if (shimmer) shimmer.style.animation = 'none';
                  }}
                  onTouchStart={e => {
                    e.currentTarget.style.background = 'rgba(30, 27, 75, 0.75)';
                    e.currentTarget.style.borderColor = 'rgba(139, 92, 246, 0.7)';
                    const shimmer = e.currentTarget.querySelector('.btn-shimmer');
                    if (shimmer) {
                      shimmer.style.animation = 'none';
                      void shimmer.offsetWidth;
                      shimmer.style.animation = 'shimmerSweep 0.6s ease forwards';
                    }
                  }}
                  onTouchEnd={e => {
                    setTimeout(() => {
                      e.currentTarget.style.background = 'rgba(15, 23, 42, 0.7)';
                      e.currentTarget.style.borderColor = 'rgba(99, 102, 241, 0.45)';
                    }, 300);
                  }}
                >
                  {/* Shimmer sweep overlay */}
                  <div
                    className="btn-shimmer"
                    style={{
                      position: 'absolute',
                      top: 0, left: 0,
                      width: '40%', height: '100%',
                      background: 'linear-gradient(90deg, transparent, rgba(139, 92, 246, 0.15), rgba(99, 102, 241, 0.1), transparent)',
                      animation: 'none',
                      pointerEvents: 'none',
                      zIndex: 1,
                    }}
                  />

                  {/* Top edge highlight */}
                  <div style={{
                    position: 'absolute',
                    top: 0, left: '10%', right: '10%',
                    height: '1px',
                    background: 'linear-gradient(90deg, transparent, rgba(167, 139, 250, 0.6), transparent)',
                    pointerEvents: 'none',
                    zIndex: 2,
                  }} />

                  {/* Button text */}
                  <span style={{ position: 'relative', zIndex: 3, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    Create New Loot Box
                  </span>
                </button>
              </div>

              {activeFilter === 'All' && boxes.length === 0 ? (
                showWelcome ? (
                  <div style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center',
                    padding: '2.5rem 1.5rem 3rem',
                  }}>
                    <div style={{
                      position: 'relative', width: '220px', height: '220px', margin: '0 auto',
                      marginBottom: '1.5rem',
                      animation: 'emptyStateFloat 3s ease-in-out infinite',
                    }}>
                      <div style={{
                        position: 'absolute', width: '280px', height: '280px', borderRadius: '50%',
                        background: 'radial-gradient(circle, rgba(59, 130, 246, 0.35) 0%, rgba(99, 102, 241, 0.15) 50%, transparent 75%)',
                        filter: 'blur(28px)',
                        top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
                        zIndex: 0, pointerEvents: 'none',
                      }} />
                      <img
                        src="assets/images/ui/empty-state-chest.png"
                        alt=""
                        style={{
                          width: '200px', height: '200px', objectFit: 'contain',
                          position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
                          filter: 'drop-shadow(0 8px 24px rgba(59, 130, 246, 0.3))',
                          zIndex: 1,
                        }}
                      />
                      {[
                        { top: '70%', left: '15%', color: '#60a5fa', size: 5, delay: '0s',   duration: '3.5s' },
                        { top: '60%', left: '80%', color: '#a78bfa', size: 4, delay: '1.2s', duration: '4s'   },
                        { top: '40%', left: '10%', color: '#fbbf24', size: 6, delay: '2s',   duration: '3s'   },
                        { top: '75%', left: '55%', color: '#f0abfc', size: 4, delay: '0.6s', duration: '4.5s' },
                        { top: '50%', left: '88%', color: '#60a5fa', size: 5, delay: '3s',   duration: '3.8s' },
                        { top: '80%', left: '35%', color: '#a78bfa', size: 4, delay: '1.8s', duration: '5s'   },
                      ].map((p, i) => (
                        <div key={i} style={{
                          position: 'absolute', top: p.top, left: p.left,
                          width: `${p.size}px`, height: `${p.size}px`, borderRadius: '50%',
                          backgroundColor: p.color,
                          boxShadow: `0 0 6px 2px ${p.color}99`,
                          animation: `floatParticle ${p.duration} ${p.delay} infinite ease-in-out`,
                          pointerEvents: 'none', zIndex: 2,
                        }} />
                      ))}
                    </div>
                    <h2 style={{
                      fontSize: '1.4rem', fontWeight: 800, color: '#e2e8f0',
                      margin: '0 0 0.5rem 0', textAlign: 'center',
                    }}>
                      Welcome to Loot Box Creator!
                    </h2>
                    <p style={{
                      fontSize: '0.9rem', color: '#a0aec0', textAlign: 'center',
                      maxWidth: '300px', lineHeight: '1.6', margin: '0 0 1.5rem 0',
                    }}>
                      Build custom loot boxes and share them with friends.
                    </p>
                    <button
                      onClick={() => { markWelcomeSeen(); setShowWelcome(false); handleCreateBox(); }}
                      style={{
                        width: '100%',
                        maxWidth: '320px',
                        padding: '0.875rem 1.25rem',
                        fontSize: '0.95rem',
                        fontWeight: 700,
                        fontFamily: 'inherit',
                        color: '#e2e8f0',
                        background: 'rgba(15, 23, 42, 0.7)',
                        backdropFilter: 'blur(12px)',
                        WebkitBackdropFilter: 'blur(12px)',
                        border: '1px solid rgba(99, 102, 241, 0.45)',
                        borderRadius: '16px',
                        cursor: 'pointer',
                        letterSpacing: '0.03em',
                        position: 'relative',
                        overflow: 'hidden',
                        animation: 'borderPulse 3s ease-in-out infinite',
                        transition: 'all 0.2s ease',
                      }}
                      onMouseEnter={e => {
                        e.currentTarget.style.background = 'rgba(30, 27, 75, 0.75)';
                        e.currentTarget.style.borderColor = 'rgba(139, 92, 246, 0.7)';
                        e.currentTarget.style.color = '#ffffff';
                      }}
                      onMouseLeave={e => {
                        e.currentTarget.style.background = 'rgba(15, 23, 42, 0.7)';
                        e.currentTarget.style.borderColor = 'rgba(99, 102, 241, 0.45)';
                        e.currentTarget.style.color = '#e2e8f0';
                      }}
                    >
                      Create Your First Box
                    </button>
                  </div>
                ) : (
                <div style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center',
                  padding: '3rem 1.5rem 3rem',
                }}>
                  <div style={{
                    position: 'relative', width: '220px', height: '220px', margin: '0 auto',
                    marginBottom: '1.5rem',
                    animation: 'emptyStateFloat 3s ease-in-out infinite',
                  }}>
                    <div style={{
                      position: 'absolute', width: '260px', height: '260px', borderRadius: '50%',
                      background: 'radial-gradient(circle, rgba(59, 130, 246, 0.35) 0%, rgba(99, 102, 241, 0.15) 50%, transparent 75%)',
                      filter: 'blur(28px)',
                      top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
                      zIndex: 0, pointerEvents: 'none',
                    }} />
                    <img
                      src="assets/images/ui/empty-state-chest.png"
                      alt=""
                      style={{
                        width: '200px', height: '200px', objectFit: 'contain',
                        position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
                        filter: 'drop-shadow(0 8px 24px rgba(59, 130, 246, 0.3))',
                        zIndex: 1,
                      }}
                    />
                    {[
                      { top: '70%', left: '15%', color: '#60a5fa', size: 5, delay: '0s',   duration: '3.5s' },
                      { top: '60%', left: '80%', color: '#a78bfa', size: 4, delay: '1.2s', duration: '4s'   },
                      { top: '40%', left: '10%', color: '#fbbf24', size: 6, delay: '2s',   duration: '3s'   },
                      { top: '75%', left: '55%', color: '#f0abfc', size: 4, delay: '0.6s', duration: '4.5s' },
                      { top: '50%', left: '88%', color: '#60a5fa', size: 5, delay: '3s',   duration: '3.8s' },
                      { top: '80%', left: '35%', color: '#a78bfa', size: 4, delay: '1.8s', duration: '5s'   },
                    ].map((p, i) => (
                      <div key={i} style={{
                        position: 'absolute', top: p.top, left: p.left,
                        width: `${p.size}px`, height: `${p.size}px`, borderRadius: '50%',
                        backgroundColor: p.color,
                        boxShadow: `0 0 6px 2px ${p.color}99`,
                        animation: `floatParticle ${p.duration} ${p.delay} infinite ease-in-out`,
                        pointerEvents: 'none', zIndex: 2,
                      }} />
                    ))}
                  </div>
                  <div style={{
                    fontSize: '0.9rem', color: '#a0aec0', textAlign: 'center',
                    maxWidth: '280px', lineHeight: '1.5',
                  }}>
                    Tap <span style={{ color: '#3b82f6', fontWeight: 600 }}>Create New Loot Box</span> above to build your first box
                  </div>
                </div>
                )
              ) : filteredBoxes.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '4rem 2rem', color: '#64748b' }}>
                  {activeFilter === 'Faves' ? (
                    <>
                      <div style={{ marginBottom: '1rem', opacity: 0.5 }}>
                        <svg width="40" height="40" viewBox="0 0 24 24" style={{ fill: 'none', stroke: '#64748b', strokeWidth: 1.5 }}>
                          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                        </svg>
                      </div>
                      <div style={{ fontSize: '1.125rem', marginBottom: '0.5rem' }}>No favorites yet</div>
                      <div style={{ fontSize: '0.875rem', color: '#475569' }}>Tap the star on any box to add it here</div>
                    </>
                  ) : (
                    <>
                      <div style={{ marginBottom: '1rem', opacity: 0.3 }}>
                        <img src="assets/images/ui/empty-state-chest.png" alt="" style={{ width: '80px', height: '80px', objectFit: 'contain' }} />
                      </div>
                      <div style={{ fontSize: '1.125rem', marginBottom: '0.5rem' }}>
                        {activeFilter === 'Local' && 'No local boxes yet'}
                        {activeFilter === 'Shared' && 'No shared boxes yet'}
                        {activeFilter === 'Unopened' && 'No unopened boxes'}
                      </div>
                      <div style={{ fontSize: '0.875rem', color: '#475569' }}>
                        {activeFilter === 'Unopened' ? 'All your boxes have been opened!' : 'Create your first loot box to get started!'}
                      </div>
                    </>
                  )}
                </div>
              ) : (
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(300px, 1fr))',
                  gap: isMobile ? '1rem' : '1.5rem',
                  marginTop: isMobile ? '1rem' : '2rem',
                }}>
                  {filteredBoxes.map(box => (
                    <BoxCard
                      key={box.id}
                      box={box}
                      onClick={() => handleOpenBox(box)}
                      onEdit={handleEditBox}
                      onDelete={handleDeleteBox}
                      onDuplicate={handleDuplicateBox}
                      success={success}
                      error={error}
                      isNew={!getSeenBoxes().includes(box.id)}
                      isFav={favorites.includes(box.shareCode || box.id)}
                      onToggleFavorite={handleToggleFavorite}
                    />
                  ))}
                </div>
              )}
            </>
          )}

          {(mode === 'create' || mode === 'edit') && (
            <BoxCreator
              onComplete={handleBoxSaved}
              onCancel={handleCancel}
              editingBox={editingBox}
              success={success}
              error={error}
              info={info}
            />
          )}

          {mode === 'open' && openingBox && (
            <BoxOpener
              key={openingBox.shareCode || openingBox.id}
              box={openingBox}
              onBack={handleCloseOpener}
              onBoxUpdate={handleBoxUpdate}
              success={success}
              error={error}
              info={info}
            />
          )}

          {mode === 'settings' && (
            <SettingsPage
              onBack={() => setMode('home')}
              userSettings={userSettings}
              onSettingsChange={(newSettings) => {
                saveUserSettings(newSettings);
                setUserSettings(newSettings);
              }}
              success={success}
              error={error}
              info={info}
            />
          )}

          {mode === 'stats' && (
            <StatsScreen
              userSettings={userSettings}
              boxes={boxes}
              onBack={() => setMode('home')}
            />
          )}

          {mode === 'discover' && (
            <DiscoverScreen
              onBack={() => setMode('home')}
              onImport={handleDiscoverImport}
              success={success}
              info={info}
            />
          )}

          {/* Template Import Confirmation Dialog */}
          {pendingTemplate && (
            <div style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'rgba(0, 0, 0, 0.7)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 1000,
              padding: 'calc(1rem + env(safe-area-inset-top)) calc(1rem + env(safe-area-inset-right)) calc(1rem + env(safe-area-inset-bottom)) calc(1rem + env(safe-area-inset-left))',
            }}>
              <Card style={{ maxWidth: '450px', width: '100%' }}>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#e2e8f0', marginBottom: '0.5rem' }}>
                  Import Box Template?
                </h3>
                <p style={{ color: '#a0aec0', fontSize: '0.875rem', marginBottom: '1rem' }}>
                  Import "{pendingTemplate.name}" by {pendingTemplate.createdBy}? This will create a new local box with the same items and settings.
                </p>

                <div style={{ marginBottom: '1rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem', color: '#a0aec0', marginBottom: '0.5rem' }}>
                    <span>Items:</span>
                    <span style={{ fontWeight: 600, color: '#cbd5e1' }}>{(pendingTemplate.items || []).length}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem', color: '#a0aec0', marginBottom: '0.75rem' }}>
                    <span>Created by:</span>
                    <span style={{ fontWeight: 600, color: '#cbd5e1' }}>{pendingTemplate.createdBy}</span>
                  </div>

                  <div style={{
                    maxHeight: '200px',
                    overflowY: 'auto',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.25rem',
                  }}>
                    {(pendingTemplate.items || []).map((item, idx) => (
                      <div key={idx} style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        padding: '0.35rem 0.5rem',
                        background: 'rgba(15, 22, 36, 0.4)',
                        borderRadius: '6px',
                        fontSize: '0.8rem',
                      }}>
                        <span style={{
                          width: '8px',
                          height: '8px',
                          borderRadius: '50%',
                          background: item.color || '#3b82f6',
                          flexShrink: 0,
                        }} />
                        <span style={{ color: '#cbd5e1', flex: 1 }}>{item.name}</span>
                        <span style={{ color: '#64748b' }}>{item.percentage}%</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '1rem' }}>
                  <Button variant="ghost" onClick={handleCancelImport} fullWidth>Cancel</Button>
                  <Button variant="primary" onClick={handleConfirmImport} fullWidth>Import</Button>
                </div>
              </Card>
            </div>
          )}

          <SideDrawer
            isOpen={drawerOpen}
            onClose={() => setDrawerOpen(false)}
            userSettings={userSettings}
            activeScreen={mode}
            boxes={boxes}
            onNavigate={handleDrawerNavigate}
            onDisplayNameChange={(name) => {
              const updated = { ...userSettings, displayName: name };
              saveUserSettings(updated);
              setUserSettings(updated);
              setLastUsedName(name);
              success('Name set to ' + name);
            }}
          />

          <AboutModal
            show={showAboutModal}
            onClose={() => setShowAboutModal(false)}
          />

          {toastElement}
        </div>
      );
    };

    // Render
    createRoot(document.getElementById('root')).render(<ErrorBoundary><App /></ErrorBoundary>);
