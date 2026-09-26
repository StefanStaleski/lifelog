import { describe, expect, it } from "vitest";
import { isDeviceAuthorized } from "./auth";

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
});
