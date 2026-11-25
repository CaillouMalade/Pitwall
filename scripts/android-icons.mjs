// Renders the pre-Android 8 launcher bitmaps from the shared Pitwall icon.
// Newer Android versions use the vector adaptive icon in android/app/src/main/res.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const res = path.join(root, "android/app/src/main/res");
const svg = await readFile(path.join(root, "web/public/icons/icon-512.svg"));
const mask = (radius) =>
  Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"><rect width="512" height="512" rx="${radius}"/></svg>`,
  );
const sizes = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
for (const [density, size] of Object.entries(sizes)) {
  for (const [name, radius] of [
    ["ic_launcher", 96],
    ["ic_launcher_round", 256],
  ]) {
    // Sharp resizes before compositing, so the mask is applied in its own pass.
    const shaped = await sharp(svg)
      .composite([{ input: mask(radius), blend: "dest-in" }])
      .png()
      .toBuffer();
    await sharp(shaped)
      .resize(size, size)
      .png()
      .toFile(path.join(res, `mipmap-${density}`, `${name}.png`));
  }
}
console.log("Android launcher bitmaps written.");
