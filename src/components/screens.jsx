import { setHapticEnabled, setSoundEnabled } from '../services/audio.js';
import { useEffect, useState } from 'react';
import { Button, Card, useIsMobile } from './common.jsx';
import { fetchCuratedTemplates } from '../services/firebase.js';
import { ConfirmDialog, SettingsRow, ToggleSwitch } from './layout.jsx';
import { APP_VERSION, AppStorage, STORAGE_KEYS, getAllBoxes, getUserSettings } from '../lib/storage.js';
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
    setSoundEnabled(newVal);
    const updated = { ...userSettings, soundEnabled: newVal };
    onSettingsChange(updated);
  };

  const handleHapticToggle = () => {
    const newVal = !hapticOn;
    setHapticOn(newVal);
    setHapticEnabled(newVal);
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

export {
  DiscoverScreen,
  StatsScreen,
  SettingsPage,
};
