import React from 'react';
import { useEffect, useRef, useState } from 'react';
import { calculateDynamicOdds, formatExpirationCountdown, formatRechargeTimeRemaining, getDeviceId, getRarityTier, getRechargeCyclesRemaining, getRechargeOpensAvailable, getTierAccent, getTimeUntilNextRecharge, getUserPullTimestamps, isExpiringSoon } from '../lib/utils.js';
import { getBoxUserName, getLastUsedName, getUserSettings, markPullsSeen, saveBox, setBoxUserName, setLastUsedName } from '../lib/storage.js';
import { _warmUpAudio, playBuildUpSound, playChargeRelease, playPartyPing, playTierRevealSound, spawnParticles, startChargeHum, stopChargeHum, triggerHaptic, updateChargeHum } from '../services/audio.js';
import { Button, Card, Input, useIsMobile } from './common.jsx';
import { addPullToSharedBox, subscribeToSharedBox } from '../services/firebase.js';
import { getReadableTextColor, isLightColor } from './creator.jsx';
import { getBoxImageUrl } from '../lib/catalog.js';
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


export {
  RevealAnimation,
  BoxOpener,
};
