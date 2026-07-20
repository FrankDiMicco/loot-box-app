import { Button, Card, useIsMobile, useToast } from './components/common.jsx';
import { AboutModal, FilterTabs, Header, SideDrawer } from './components/layout.jsx';
import { BoxCard } from './components/BoxCard.jsx';
import { BoxCreator } from './components/creator.jsx';
import { BoxOpener } from './components/opener.jsx';
import { DiscoverScreen, SettingsPage, StatsScreen } from './components/screens.jsx';
import { APP_VERSION, AppStorage, STORAGE_KEYS, deleteBox, getAllBoxes, getBoxUserName, getFavorites, getLastSeenPullCounts, getLastUsedName, getSeenBoxes, getUserSettings, hasSeenWelcome, markBoxAsSeen, markPullsSeen, markWelcomeSeen, migrateOldName, saveBox, saveUserSettings, setBoxUserName, setLastUsedName, toggleFavorite } from './lib/storage.js';
import { addPullToSharedBox, deleteSharedBox, ensureSignedIn, fetchBoxTemplate, fetchCuratedTemplates, fetchSharedBox, getAllAvailableBoxImages, importBoxFromTemplate, saveBoxTemplate, saveSharedBox, subscribeToSharedBox, updateSharedBox } from './services/firebase.js';
import { _warmUpAudio, playBuildUpSound, playChargeRelease, playPartyPing, playTierRevealSound, setHapticEnabled, setSoundEnabled, spawnParticles, startChargeHum, stopChargeHum, triggerHaptic, updateChargeHum } from './services/audio.js';
import { calculateDynamicOdds, formatExpirationCountdown, formatRechargeTimeRemaining, generateShareCode, getDeviceId, getRarityTier, getRechargeCyclesRemaining, getRechargeOpensAvailable, getRemainingPercentage, getTierAccent, getTimeUntilNextRecharge, getUserPullTimestamps, isExpiringSoon, validatePercentages } from './lib/utils.js';
import { BOX_SOURCES, DEFAULT_BOX_IMAGES, getBoxImageUrl } from './lib/catalog.js';
import React from 'react';
import ReactDOM from 'react-dom';
import { createRoot } from 'react-dom/client';
import './styles.css';

    const { useState, useEffect, useRef } = React;

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
        // Start the anonymous sign-in immediately; write paths await it
        // themselves, this just hides the latency behind app startup.
        ensureSignedIn();
        migrateOldName();
        loadData({ refreshShared: true });

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

      // refreshShared: re-fetch every shared box from Firestore. Only the
      // boot path needs that (to catch pulls made while the app was closed);
      // afterwards the App-level subscriptions keep both state and
      // localStorage fresh (the snapshot handler persists via saveBox), so
      // in-session callers just re-read localStorage — no billed reads.
      const loadData = async ({ refreshShared = false } = {}) => {
        const loadedBoxes = getAllBoxes();
        const settings = getUserSettings();

        if (!refreshShared) {
          setBoxes(loadedBoxes);
          setUserSettings(settings);
          return;
        }

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
