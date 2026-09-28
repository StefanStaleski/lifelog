import { describe, expect, it } from "vitest";
import { isDeviceAuthorized, uploaderOf } from "./auth";

const req = (authorization?: string) =>
  new Request("http://localhost/", { headers: authorization ? { authorization } : {} });

describe("isDeviceAuthorized", () => {
  it("accepts the configured bearer token", () => {
    expect(isDeviceAuthorized(req("Bearer test-device-token"))).toBe(true);
  });

  it("rejects missing, malformed or wrong tokens", () => {
    expect(isDeviceAuthorized(req())).toBe(false);
    expect(isDeviceAuthorized(req("test-device-token"))).toBe(false);
    expect(isDeviceAuthorized(req("Bearer "))).toBe(false);
    expect(isDeviceAuthorized(req("Bearer test-device-tokenX"))).toBe(false);
  });

  it("rejects everything when DEVICE_TOKEN is unset", () => {
    const saved = process.env.DEVICE_TOKEN;
    delete process.env.DEVICE_TOKEN;
    try {
      expect(isDeviceAuthorized(req("Bearer "))).toBe(false);
      expect(isDeviceAuthorized(req("Bearer undefined"))).toBe(false);
    } finally {
      process.env.DEVICE_TOKEN = saved;
    }
  });

  it("does not accept the desktop token", () => {
    expect(isDeviceAuthorized(req("Bearer test-desktop-token"))).toBe(false);
  });
});

describe("uploaderOf", () => {
  it("tells the phone and the laptop apart", () => {
    expect(uploaderOf(req("Bearer test-device-token"))).toBe("phone");
    expect(uploaderOf(req("Bearer test-desktop-token"))).toBe("desktop");
    expect(uploaderOf(req("Bearer nope"))).toBeNull();
    expect(uploaderOf(req())).toBeNull();
  });

  it("rejects the laptop when DESKTOP_TOKEN is unset", () => {
    const saved = process.env.DESKTOP_TOKEN;
    delete process.env.DESKTOP_TOKEN;
    try {
      expect(uploaderOf(req("Bearer test-desktop-token"))).toBeNull();
      expect(uploaderOf(req("Bearer undefined"))).toBeNull();
      expect(uploaderOf(req("Bearer test-device-token"))).toBe("phone");
    } finally {
      process.env.DESKTOP_TOKEN = saved;
    }
  });
});
