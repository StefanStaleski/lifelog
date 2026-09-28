import { createHash } from "node:crypto";

/** Fixed namespace for every laptop event id. Never change it: ids must stay stable forever. */
export const LIFELOG_DESKTOP_NAMESPACE = "62fdd2da-b035-409d-a6ee-eb888f5e4e51";

/** RFC 4122 name-based UUID (version 5, SHA-1). */
export function uuidv5(name: string, namespace: string = LIFELOG_DESKTOP_NAMESPACE): string {
  const ns = Buffer.from(namespace.replace(/-/g, ""), "hex");
  if (ns.length !== 16) throw new Error(`invalid namespace uuid: ${namespace}`);
  const bytes = createHash("sha1").update(ns).update(name, "utf8").digest().subarray(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x50;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Id of one desktop_usage event: re-collecting the same window always yields the same id. */
export function usageEventId(windowStartIso: string, app: string, host: string | null): string {
  return uuidv5(`${windowStartIso}|${app}|${host ?? ""}`);
}
