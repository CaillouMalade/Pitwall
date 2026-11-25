// Runs the Android project's own Gradle wrapper, e.g. `assembleDebug`.
// Needs JDK 21 and the Android SDK (JAVA_HOME and ANDROID_HOME); see docs/ANDROID_APP.md.
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const android = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../android",
);
const tasks = process.argv.slice(2);
const windows = process.platform === "win32";
// A batch file needs the shell on Windows; the quoted path survives spaces.
const result = spawnSync(
  windows ? `"${path.join(android, "gradlew.bat")}"` : "./gradlew",
  tasks.length ? tasks : ["assembleDebug"],
  { cwd: android, stdio: "inherit", shell: windows },
);
process.exit(result.status ?? 1);
