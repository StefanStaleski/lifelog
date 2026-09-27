import { afterEach, describe, expect, it, vi } from "vitest";
import { devAuthBypass, isOwnerEmail } from "./owner";

afterEach(() => vi.unstubAllEnvs());

describe("isOwnerEmail", () => {
  it("matches DASHBOARD_EMAIL ignoring case and spaces", () => {
    vi.stubEnv("DASHBOARD_EMAIL", "Owner@Example.com");
    expect(isOwnerEmail(" owner@example.com ")).toBe(true);
    expect(isOwnerEmail("someone@example.com")).toBe(false);
    expect(isOwnerEmail(null)).toBe(false);
  });

  it("lets nobody in when DASHBOARD_EMAIL is unset", () => {
    vi.stubEnv("DASHBOARD_EMAIL", "");
    expect(isOwnerEmail("")).toBe(false);
    expect(isOwnerEmail("owner@example.com")).toBe(false);
  });
});

describe("devAuthBypass", () => {
  it("only works in local development", () => {
    vi.stubEnv("DASHBOARD_DEV_AUTH_BYPASS", "1");
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("VERCEL", "");
    expect(devAuthBypass()).toBe(true);

    vi.stubEnv("VERCEL", "1");
    expect(devAuthBypass()).toBe(false);

    vi.stubEnv("VERCEL", "");
    vi.stubEnv("NODE_ENV", "production");
    expect(devAuthBypass()).toBe(false);
  });
});
