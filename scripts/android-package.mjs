// Copies the signed Android build to release/ under its public name, with a checksum.
import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { version } = JSON.parse(
  readFileSync(path.join(root, "package.json"), "utf8"),
);
const built = path.join(
  root,
  "android/app/build/outputs/apk/release/app-release.apk",
);
const name = `Pitwall-${version}-android-preview.apk`;
const release = path.join(root, "release");
mkdirSync(release, { recursive: true });
copyFileSync(built, path.join(release, name));
const sum = createHash("sha256").update(readFileSync(built)).digest("hex");
writeFileSync(
  path.join(release, "ANDROID-SHA256SUMS.txt"),
  `${sum}  ${name}
`,
);
console.log(`${name}
${sum}`);
