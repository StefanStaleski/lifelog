import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { z } from "zod";

/** Written by the installer; upload is skipped (events stay queued) until it is replaced. */
export const PLACEHOLDER_TOKEN = "REPLACE_WITH_DESKTOP_TOKEN";

export const ConfigSchema = z.object({
  baseUrl: z.url().default("http://localhost:3000"),
  token: z.string().default(PLACEHOLDER_TOKEN),
  deviceId: z.string().min(1).max(64).default("laptop"),
  awUrl: z.url().default("http://localhost:5600"),
});
export type Config = z.infer<typeof ConfigSchema>;

export interface Paths {
  config: string;
  stateDir: string;
  state: string;
  queue: string;
  rejected: string;
}

export function defaultPaths(env: NodeJS.ProcessEnv = process.env): Paths {
  const home = homedir();
  const configHome = env.XDG_CONFIG_HOME || join(home, ".config");
  const stateDir = join(env.XDG_STATE_HOME || join(home, ".local", "state"), "lifelog-desktop");
  return {
    config: env.LIFELOG_DESKTOP_CONFIG || join(configHome, "lifelog-desktop", "config.json"),
    stateDir,
    state: join(stateDir, "state.json"),
    queue: join(stateDir, "queue.json"),
    rejected: join(stateDir, "rejected.jsonl"),
  };
}

export function loadConfig(path: string): Config {
  let raw: unknown = {};
  try {
    raw = JSON.parse(readFileSync(path, "utf8"));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT")
      throw new Error(`bad config ${path}: ${e}`, { cause: e });
  }
  return ConfigSchema.parse(raw);
}

export function tokenConfigured(config: Config): boolean {
  return config.token.length > 0 && config.token !== PLACEHOLDER_TOKEN;
}

/** Write-then-rename so a crash never leaves a half-written file. */
export function writeJsonAtomic(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(value, null, 1) + "\n", { mode: 0o600 });
  renameSync(tmp, path);
}

export function readJson<T>(path: string, fallback: T): T {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return fallback;
    throw new Error(`cannot read ${path}: ${e}`, { cause: e });
  }
}

export interface SyncState {
  /** Every complete window before this instant has been collected into the queue. */
  synced_until: string | null;
  last_run_at: string | null;
  last_result: string | null;
}

export const EMPTY_STATE: SyncState = { synced_until: null, last_run_at: null, last_result: null };
