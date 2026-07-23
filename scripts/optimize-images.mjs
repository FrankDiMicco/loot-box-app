// Image optimizer for the bundled art in public/assets/images.
//
// Policy (keeps the deployed payload small without breaking references):
//   - Box catalog art (free/, premium/): resize to 768px + palette-PNG IN
//     PLACE. Keeping the .png filename means Firestore boxCatalog docs and
//     box-admin.html that point at these paths keep working untouched.
//   - UI art (ui/): convert to WebP. Its only references live in source we
//     control (index.html, src/), which already point at .webp.
//
// Run after adding or replacing any bundled image:  npm run optimize:images
// Source art (1024px+ originals) is preserved under backups/box-catalog-images.

import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const kb = b => (b / 1024).toFixed(0) + 'KB';

// [relative path] — resized + palette-PNG, overwritten in place.
const pngInPlace = [
  'public/assets/images/boxes/free/chest.png',
  'public/assets/images/boxes/free/metal.png',
  'public/assets/images/boxes/free/skull_bone.png',
  'public/assets/images/boxes/premium/army_camo.png',
  'public/assets/images/boxes/premium/blue_tron.png',
];

// [source png, output webp] — the source png is expected to already be gone
// once converted; this list documents the mapping and re-runs idempotently
// against whichever of the two files is present.
const toWebp = [
  ['public/assets/images/ui/empty-state-chest.png', 'public/assets/images/ui/empty-state-chest.webp'],
  ['public/assets/images/ui/logo-chest.png',        'public/assets/images/ui/logo-chest.webp'],
];

let before = 0, after = 0;

for (const rel of pngInPlace) {
  const f = path.join(ROOT, rel);
  if (!fs.existsSync(f)) { console.log(`skip (missing) ${rel}`); continue; }
  const orig = fs.statSync(f).size; before += orig;
  const buf = await sharp(f)
    .resize(768, 768, { fit: 'inside', withoutEnlargement: true })
    .png({ compressionLevel: 9, palette: true, quality: 92, effort: 10 })
    .toBuffer();
  fs.writeFileSync(f, buf); after += buf.length;
  console.log(`png   ${kb(orig)} -> ${kb(buf.length)}  ${rel.split('/').pop()}`);
}

for (const [relSrc, relOut] of toWebp) {
  const src = path.join(ROOT, relSrc);
  const out = path.join(ROOT, relOut);
  if (!fs.existsSync(src)) { console.log(`skip (already webp) ${relOut.split('/').pop()}`); continue; }
  const orig = fs.statSync(src).size; before += orig;
  const buf = await sharp(src)
    .resize(512, 512, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 82, effort: 6 })
    .toBuffer();
  fs.writeFileSync(out, buf); after += buf.length;
  console.log(`webp  ${kb(orig)} -> ${kb(buf.length)}  ${relOut.split('/').pop()}`);
}

if (before > 0) {
  console.log(`\nTOTAL ${kb(before)} -> ${kb(after)}  (saved ${kb(before - after)}, ${(100 - after / before * 100).toFixed(0)}%)`);
} else {
  console.log('Nothing to optimize — all images already processed.');
}
