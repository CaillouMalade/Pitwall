/**
 * The packaged Android app runs the same interface inside a system WebView.
 * Its bridge is injected before the page loads, so detection needs no import;
 * native plugins load on demand and never reach browser or desktop sessions.
 */
type Bridge = { isNativePlatform?: () => boolean; getPlatform?: () => string };
const bridge = () => (globalThis as { Capacitor?: Bridge }).Capacitor;

// Read once: the answer must not change after plugin modules load later.
const native = Boolean(bridge()?.isNativePlatform?.());
export const isNativeApp = () => native;

/** Lets the stylesheet apply phone chrome before the first paint. */
export function markNativePlatform() {
  if (isNativeApp())
    document.documentElement.dataset.platform =
      bridge()?.getPlatform?.() ?? "android";
}

/** A WebView cannot save a Blob link, so exports go through the share sheet. */
export async function shareFile(name: string, text: string) {
  const [{ Filesystem, Directory, Encoding }, { Share }] = await Promise.all([
    import("@capacitor/filesystem"),
    import("@capacitor/share"),
  ]);
  const { uri } = await Filesystem.writeFile({
    path: name,
    data: text,
    directory: Directory.Cache,
    encoding: Encoding.UTF8,
  });
  try {
    await Share.share({ title: name, files: [uri] });
  } catch {
    // Dismissing the share sheet is a normal outcome, not a failed export.
  }
}

/** Keeps the status and navigation bars in step with the chosen appearance. */
async function setSystemBars(dark: boolean, color: string) {
  try {
    const { SystemBars, SystemBarsStyle, registerPlugin } =
      await import("@capacitor/core");
    await SystemBars.setStyle({
      style: dark ? SystemBarsStyle.Dark : SystemBarsStyle.Light,
    });
    // Older WebViews show the window behind the bars rather than the page.
    await registerPlugin<{
      setBackground: (options: { color: string }) => Promise<void>;
    }>("PitwallShell").setBackground({ color });
  } catch {
    // Bar colours are cosmetic; the interface works without them.
  }
}

/** Follows the theme attribute, wherever in the interface it gets changed. */
export function followTheme() {
  if (!isNativeApp()) return;
  const root = document.documentElement;
  const sync = () =>
    void setSystemBars(
      root.dataset.theme === "dark",
      getComputedStyle(root).getPropertyValue("--bg").trim(),
    );
  sync();
  new MutationObserver(sync).observe(root, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });
}

/** Routes the Android back gesture; the handler reports whether it acted. */
export function onNativeBack(handler: () => boolean) {
  if (!isNativeApp()) return () => undefined;
  let cancelled = false;
  let remove = () => undefined as void;
  void import("@capacitor/app")
    .then(async ({ App }) => {
      const listener = await App.addListener("backButton", () => {
        if (!handler()) void App.minimizeApp();
      });
      if (cancelled) void listener.remove();
      else remove = () => void listener.remove();
    })
    // Without the listener Android falls back to its own back behaviour.
    .catch(() => undefined);
  return () => {
    cancelled = true;
    remove();
  };
}
