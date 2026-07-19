import { getUserSettings } from '../lib/storage.js';
// ========== SOUND ENGINE (Web Audio API, zero audio files) ==========
let soundEnabled = getUserSettings().soundEnabled !== false;
let hapticEnabled = getUserSettings().hapticEnabled !== false;
// Imported let-bindings are read-only for importers; the Settings toggles
// must flip these through setters.
const setSoundEnabled = (v) => { soundEnabled = v; };
const setHapticEnabled = (v) => { hapticEnabled = v; };
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


export {
  setSoundEnabled,
  setHapticEnabled,
  _audioCtx,
  _masterGain,
  _reverb,
  _ensureAudio,
  _routeOut,
  _noiseBuffer,
  _warmUpAudio,
  playBuildUpSound,
  _chargeNodes,
  startChargeHum,
  updateChargeHum,
  stopChargeHum,
  playChargeRelease,
  playRevealSound,
  playRareSound,
  playCommonSound,
  playEpicSound,
  playMythicSound,
  playTierRevealSound,
  playPartyPing,
  triggerHaptic,
  spawnParticles,
};
