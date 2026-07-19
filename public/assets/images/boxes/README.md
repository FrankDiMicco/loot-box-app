# Loot Box Images

## Folder Structure

```
assets/images/boxes/
├── free/          # Free tier box images (5-10 images)
└── premium/       # Premium tier box images (20+ images)
```

## Image Requirements

### Format
- **File Type**: PNG (with transparency)
- **Recommended Size**: 512x512 pixels
- **Max File Size**: 200KB per image (will be optimized/compressed)

### Free Tier Images (5-10)
Basic, classic loot box designs:
- Classic wooden chest
- Gift box
- Treasure chest
- Mystery box
- Simple crate

### Premium Tier Images (20+)
More elaborate and themed designs:
- Animated/glowing effects
- Fantasy themed (dragon chest, crystal box)
- Sci-fi themed (tech crate, holographic)
- Holiday themed (present, pumpkin, etc.)
- Luxury themed (gold chest, jeweled box)

## Naming Convention

Use descriptive, lowercase names with hyphens:
- `wooden-chest.png`
- `gift-box.png`
- `mystery-crate.png`
- `dragon-treasure.png`
- `cyber-container.png`

## Integration

Images will be:
1. Converted to base64 for small files (< 50KB)
2. Stored as separate files for larger images
3. Referenced in a catalog object in the app
4. Displayed in an image picker during box creation

## To Add Images

1. Place PNG files in the appropriate folder (free/ or premium/)
2. Run the image processor script (to be created)
3. Update the image catalog in the app code

## Current Status

- [ ] Free tier images (0/5)
- [ ] Premium tier images (0/20)
- [ ] Image processor script
- [ ] Image picker UI component
- [ ] Integration into BoxCreator
