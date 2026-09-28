/*
 * Everything that leaves ActivityWatch passes through here. Only two strings survive: the
 * normalised app name and the bare browser hostname. Titles, URLs, paths and queries are dropped.
 */

const HOSTNAME = /^[a-z0-9-]+(\.[a-z0-9-]+)*$/;
const IPV6 = /^\[[0-9a-f:.]+\]$/;

/** Bare hostname of an http(s) URL (lowercase, no `www.`, port, path, query or credentials). */
export function hostnameOf(url: unknown): string | null {
  if (typeof url !== "string" || url.length === 0) return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
  const host = parsed.hostname
    .toLowerCase()
    .replace(/\.$/, "")
    .replace(/^www\./, "");
  if (host.length === 0 || host.length > 253) return null;
  return HOSTNAME.test(host) || IPV6.test(host) ? host : null;
}

/** App / window class → lowercase name (e.g. "Code" → "code", "Google-chrome" → "google-chrome"). */
export function normaliseApp(raw: unknown): string {
  if (typeof raw !== "string") return "unknown";
  const app = raw.trim().toLowerCase().replace(/\s+/g, " ").slice(0, 100);
  return app.length > 0 ? app : "unknown";
}

/** Which aw-watcher-web browser (`aw-watcher-web-<browser>`) an app class belongs to. */
const BROWSER_APPS: Record<string, RegExp> = {
  firefox: /firefox|librewolf|navigator/,
  chrome: /chrome|chromium/,
  chromium: /chromium/,
  brave: /brave/,
  edge: /msedge|microsoft-edge/,
  opera: /opera/,
  vivaldi: /vivaldi/,
};

export function appMatchesBrowser(app: string, browser: string): boolean {
  const pattern = BROWSER_APPS[browser];
  return pattern ? pattern.test(app) : app.includes(browser);
}

/** `aw-watcher-web-firefox_myhost` → "firefox"; null for other buckets. */
export function browserOfBucket(bucketId: string): string | null {
  const match = /^aw-watcher-web-([a-z0-9-]+?)(?:_.*)?$/i.exec(bucketId);
  return match ? match[1]!.toLowerCase() : null;
}
