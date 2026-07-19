import { AppStorage, STORAGE_KEYS } from './storage.js';
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


export {
  getRarityTier,
  getTierAccent,
  calculateDynamicOdds,
  validatePercentages,
  getRemainingPercentage,
  generateShareCode,
  getDeviceId,
  formatExpirationCountdown,
  isExpiringSoon,
  getRechargeIntervalMs,
  getRechargeOpensAvailable,
  getTimeUntilNextRecharge,
  formatRechargeTimeRemaining,
  getUserPullTimestamps,
  getRechargeCyclesRemaining,
};
