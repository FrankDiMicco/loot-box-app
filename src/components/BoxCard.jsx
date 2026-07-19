import { useEffect, useState } from 'react';
import { useIsMobile } from './common.jsx';
import { getLastSeenPullCounts, saveBox } from '../lib/storage.js';
import { formatExpirationCountdown, formatRechargeTimeRemaining, getDeviceId, getRechargeCyclesRemaining, getRechargeOpensAvailable, getTimeUntilNextRecharge, getUserPullTimestamps } from '../lib/utils.js';
import { saveBoxTemplate } from '../services/firebase.js';
import { getBoxImageUrl } from '../lib/catalog.js';
import { ConfirmDialog } from './layout.jsx';
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


export {
  BoxCard,
  getColorName,
  compressToDataURL,
};
