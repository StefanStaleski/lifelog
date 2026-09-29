import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { readJson, writeJsonAtomic } from "./config";
import type { DesktopEvent } from "./contract";

/**
 * Local-first queue: events are written here before any upload and removed only once the server
 * acknowledged them (a 2xx response for their batch). Ids are deterministic, so adding an event
 * that is already queued is a no-op.
 */
export class Queue {
  private events: DesktopEvent[];

  constructor(private readonly file: string) {
    this.events = readJson<DesktopEvent[]>(file, []);
  }

  get size(): number {
    return this.events.length;
  }

  all(): readonly DesktopEvent[] {
    return this.events;
  }

  /** Adds new events (by id) and persists; returns how many were new. */
  add(events: DesktopEvent[]): number {
    const known = new Set(this.events.map((e) => e.id));
    const fresh = events.filter((e) => !known.has(e.id) && known.add(e.id));
    if (fresh.length > 0) {
      this.events.push(...fresh);
      this.save();
    }
    return fresh.length;
  }

  /** Oldest first. */
  peek(n: number): DesktopEvent[] {
    return this.events.slice(0, n);
  }

  /** Removes acknowledged events and persists. */
  ack(ids: Iterable<string>): void {
    const done = new Set(ids);
    const before = this.events.length;
    this.events = this.events.filter((e) => !done.has(e.id));
    if (this.events.length !== before) this.save();
  }

  private save(): void {
    writeJsonAtomic(this.file, this.events);
  }
}

/** Events the server refused permanently are kept here for inspection, never silently lost. */
export function recordRejected(file: string, rows: { event: DesktopEvent; error: string }[]): void {
  if (rows.length === 0) return;
  mkdirSync(dirname(file), { recursive: true });
  const at = new Date().toISOString();
  appendFileSync(file, rows.map((r) => JSON.stringify({ at, ...r })).join("\n") + "\n", {
    mode: 0o600,
  });
}
