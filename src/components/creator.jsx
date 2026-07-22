import ReactDOM from 'react-dom';
import { useEffect, useRef, useState } from 'react';
import { BackButton, Button, Card, Input, useIsMobile } from './common.jsx';
import { compressToDataURL, getColorName } from './BoxCard.jsx';
import { generateShareCode, getDeviceId, getRemainingPercentage, validatePercentages } from '../lib/utils.js';
import { triggerHaptic } from '../services/audio.js';
import { getAllAvailableBoxImages, saveSharedBox, updateSharedBox } from '../services/firebase.js';
import { BOX_SOURCES, DEFAULT_BOX_IMAGES, getBoxImageUrl } from '../lib/catalog.js';
import { getUserSettings, saveBox } from '../lib/storage.js';
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
        <BackButton onClick={onCancel} style={{ marginBottom: '1rem' }} />
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


export {
  ItemCreator,
  PercentInput,
  ItemList,
  ITEM_PALETTE,
  ITEM_SWATCHES,
  pickAutoColor,
  ensureVisibleColor,
  ColorPopover,
  ItemsEditor,
  ImagePicker,
  BoxCreator,
  isLightColor,
  getReadableTextColor,
};
