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


export {
  BOX_SOURCES,
  DEFAULT_BOX_IMAGES,
  getDefaultBoxImages,
  getAllBoxImages,
  getBoxImageUrl,
  normalizeAssetPath,
};
