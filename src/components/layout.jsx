import ReactDOM from 'react-dom';
import React from 'react';
import { useEffect, useState } from 'react';
import { APP_VERSION } from '../lib/storage.js';
import { Button, Card, useIsMobile } from './common.jsx';
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

export {
  AboutModal,
  SideDrawer,
  hamburgerRef,
  Header,
  FilterTabs,
  ConfirmDialog,
  ToggleSwitch,
  SettingsRow,
};
