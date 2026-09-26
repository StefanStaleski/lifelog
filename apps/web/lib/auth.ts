import { createHash, timingSafeEqual } from "node:crypto";

const digest = (value: string) => createHash("sha256").update(value).digest();

/** True when the request carries `Authorization: Bearer <DEVICE_TOKEN>`. */
export function isDeviceAuthorized(req: Request): boolean {
  const expected = process.env.DEVICE_TOKEN;
  if (!expected) return false; // misconfigured server rejects everything
  const header = req.headers.get("authorization") ?? "";
  const match = /^Bearer (.+)$/.exec(header);
  if (!match?.[1]) return false;
  // Hash both sides so lengths match and comparison time doesn't leak the token.
  return timingSafeEqual(digest(match[1]), digest(expected));
}
