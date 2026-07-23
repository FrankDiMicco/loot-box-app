import { useEffect, useRef, useState } from 'react';
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

// Back Button — icon-only nav control shared by the create/edit and opener
// screens. Centralized so the two can't drift, and styled to stand out
// against busy, blue-accented form chrome: 44px tap target, a brighter
// chevron, a defined border, and a drop shadow that lifts it off flat
// fields. Pass `style` for per-screen spacing (e.g. marginBottom).
const BackButton = ({ onClick, style = {} }) => {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <button
      onClick={onClick}
      aria-label="Back"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        width: '44px',
        height: '44px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: isHovered ? 'rgba(37, 99, 235, 0.3)' : 'rgba(30, 41, 59, 0.85)',
        border: `1px solid ${isHovered ? 'rgba(96, 165, 250, 0.75)' : 'rgba(96, 165, 250, 0.45)'}`,
        borderRadius: '12px',
        cursor: 'pointer',
        color: '#e2e8f0',
        padding: 0,
        flexShrink: 0,
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.35)',
        transition: 'all 0.2s ease',
        ...style,
      }}
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="15 18 9 12 15 6" />
      </svg>
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

// GlowButton — the home "Create New Loot Box" CTA and the welcome CTA.
// All styling + hover/active/shimmer behavior lives in the .glow-button
// CSS class (styles.css); this just wires up the layered spans.
const GlowButton = ({ children, onClick, style }) => (
  <button className="glow-button" onClick={onClick} style={style}>
    <span className="glow-button__shimmer" />
    <span className="glow-button__edge" />
    <span className="glow-button__label">{children}</span>
  </button>
);

// Floating treasure-chest + drifting particles, shared by the home empty
// states. glowSize tunes the radial halo behind the chest.
const EMPTY_STATE_PARTICLES = [
  { top: '70%', left: '15%', color: '#60a5fa', size: 5, delay: '0s',   duration: '3.5s' },
  { top: '60%', left: '80%', color: '#a78bfa', size: 4, delay: '1.2s', duration: '4s'   },
  { top: '40%', left: '10%', color: '#fbbf24', size: 6, delay: '2s',   duration: '3s'   },
  { top: '75%', left: '55%', color: '#f0abfc', size: 4, delay: '0.6s', duration: '4.5s' },
  { top: '50%', left: '88%', color: '#60a5fa', size: 5, delay: '3s',   duration: '3.8s' },
  { top: '80%', left: '35%', color: '#a78bfa', size: 4, delay: '1.8s', duration: '5s'   },
];

const EmptyStateChest = ({ glowSize = 260 }) => (
  <div style={{
    position: 'relative', width: '220px', height: '220px', margin: '0 auto',
    marginBottom: '1.5rem', animation: 'emptyStateFloat 3s ease-in-out infinite',
  }}>
    <div style={{
      position: 'absolute', width: `${glowSize}px`, height: `${glowSize}px`, borderRadius: '50%',
      background: 'radial-gradient(circle, rgba(59, 130, 246, 0.35) 0%, rgba(99, 102, 241, 0.15) 50%, transparent 75%)',
      filter: 'blur(28px)',
      top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
      zIndex: 0, pointerEvents: 'none',
    }} />
    <img
      src="assets/images/ui/empty-state-chest.webp"
      alt=""
      style={{
        width: '200px', height: '200px', objectFit: 'contain',
        position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
        filter: 'drop-shadow(0 8px 24px rgba(59, 130, 246, 0.3))',
        zIndex: 1,
      }}
    />
    {EMPTY_STATE_PARTICLES.map((p, i) => (
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
);

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


export {
  Button,
  BackButton,
  GlowButton,
  EmptyStateChest,
  Input,
  Card,
  Toast,
  useIsMobile,
  useToast,
};
