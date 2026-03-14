import sharp from "sharp";
import { readFileSync, mkdirSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const __dir = dirname(fileURLToPath(import.meta.url));
const publicDir = resolve(__dir, "../public");
const svg = readFileSync(resolve(publicDir, "icon.svg"));

mkdirSync(publicDir, { recursive: true });

await sharp(svg).resize(192, 192).toFile(resolve(publicDir, "icon-192.png"));
console.log("✓ icon-192.png");

await sharp(svg).resize(512, 512).toFile(resolve(publicDir, "icon-512.png"));
console.log("✓ icon-512.png");

// Apple touch icon (180x180, no rounded corners — iOS adds them)
await sharp(svg).resize(180, 180).toFile(resolve(publicDir, "apple-touch-icon.png"));
console.log("✓ apple-touch-icon.png");

console.log("Icons generated.");
