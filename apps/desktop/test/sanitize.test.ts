import { describe, expect, it } from "vitest";
import { toHostSpans } from "../src/aw";
import { appMatchesBrowser, browserOfBucket, hostnameOf, normaliseApp } from "../src/sanitize";

describe("hostnameOf", () => {
  it.each([
    ["https://www.github.com/stefan/private-repo?token=abc#x", "github.com"],
    ["https://user:pass@mail.google.com:443/mail/u/0/#inbox", "mail.google.com"],
    ["http://localhost:3000/api/v1/health", "localhost"],
    ["https://EXAMPLE.org./Path", "example.org"],
    ["http://192.168.1.10:8080/admin", "192.168.1.10"],
    ["https://[::1]:8443/x", null],
    ["https://xn--80ak6aa92e.com/", "xn--80ak6aa92e.com"],
  ])("%s → %s", (url, host) => {
    expect(hostnameOf(url)).toBe(host);
  });

  it.each([
    "file:///home/stefan/Documents/salary.pdf",
    "about:newtab",
    "chrome://settings",
    "moz-extension://abc/popup.html",
    "data:text/html,<b>hi</b>",
    "not a url",
    "",
  ])("drops %s", (url) => {
    expect(hostnameOf(url)).toBeNull();
  });

  it("ignores non-strings", () => {
    expect(hostnameOf(undefined)).toBeNull();
    expect(hostnameOf(42)).toBeNull();
  });
});

describe("toHostSpans", () => {
  it("keeps only the hostname, and nothing for incognito tabs", () => {
    const spans = toHostSpans([
      {
        timestamp: "2026-09-28T10:00:00+00:00",
        duration: 10,
        data: { url: "https://bank.example.com/account/123?session=s3cret", title: "My account" },
      },
      {
        timestamp: "2026-09-28T10:00:10+00:00",
        duration: 10,
        data: { url: "https://private.example.com/", title: "Private", incognito: true },
      },
    ]);
    expect(spans).toEqual([
      {
        start: Date.parse("2026-09-28T10:00:00Z"),
        end: Date.parse("2026-09-28T10:00:10Z"),
        host: "bank.example.com",
      },
      {
        start: Date.parse("2026-09-28T10:00:10Z"),
        end: Date.parse("2026-09-28T10:00:20Z"),
        host: null,
      },
    ]);
    expect(JSON.stringify(spans)).not.toMatch(/s3cret|account|Private|title|url/);
  });
});

describe("normaliseApp", () => {
  it("lowercases and trims the window class", () => {
    expect(normaliseApp("Code")).toBe("code");
    expect(normaliseApp("  Google-chrome ")).toBe("google-chrome");
    expect(normaliseApp("Gnome-terminal")).toBe("gnome-terminal");
    expect(normaliseApp("")).toBe("unknown");
    expect(normaliseApp(null)).toBe("unknown");
  });
});

describe("browsers", () => {
  it("reads the browser from web bucket ids", () => {
    expect(browserOfBucket("aw-watcher-web-firefox_laptop-host")).toBe("firefox");
    expect(browserOfBucket("aw-watcher-web-chrome")).toBe("chrome");
    expect(browserOfBucket("aw-watcher-window_laptop-host")).toBeNull();
  });

  it("matches X11 window classes to browsers", () => {
    expect(appMatchesBrowser("firefox", "firefox")).toBe(true);
    expect(appMatchesBrowser("google-chrome", "chrome")).toBe(true);
    expect(appMatchesBrowser("code", "chrome")).toBe(false);
    expect(appMatchesBrowser("code", "firefox")).toBe(false);
  });
});
