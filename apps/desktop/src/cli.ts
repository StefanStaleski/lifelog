#!/usr/bin/env node
import { closeSync, mkdirSync, openSync, readFileSync, unlinkSync, writeSync } from "node:fs";
import { join } from "node:path";
import { AwClient } from "./aw";
import { EMPTY_STATE, defaultPaths, loadConfig, readJson, type SyncState } from "./config";
import type { DesktopUsageEvent } from "./contract";
import { Queue } from "./queue";
import { runSync, summarise } from "./sync";
import { VERSION } from "./version";

const USAGE = `lifelog-desktop ${VERSION}

Usage:
  lifelog-desktop sync [--dry-run]   collect ActivityWatch windows, queue them, upload
                                     (--dry-run: print the batches instead; changes nothing)
  lifelog-desktop status             cursor, queue size, last result
`;

const log = (msg: string) => console.error(`[lifelog-desktop] ${msg}`);

/** One sync at a time (the timer and a manual run could overlap). */
function withLock<T>(dir: string, fn: () => Promise<T>): Promise<T> {
  mkdirSync(dir, { recursive: true });
  const file = join(dir, "sync.lock");
  let fd: number;
  try {
    fd = openSync(file, "wx");
  } catch {
    const pid = Number(readFileSync(file, "utf8"));
    let alive: boolean;
    try {
      alive = pid > 0 && process.kill(pid, 0);
    } catch {
      alive = false;
    }
    if (alive) throw new Error(`another sync is running (pid ${pid})`);
    unlinkSync(file);
    fd = openSync(file, "wx");
  }
  writeSync(fd, String(process.pid));
  closeSync(fd);
  return fn().finally(() => unlinkSync(file));
}

async function main(argv: string[]): Promise<number> {
  const [command, ...flags] = argv;
  const paths = defaultPaths();

  if (command === "sync") {
    const dryRun = flags.includes("--dry-run");
    const config = loadConfig(paths.config);
    const aw = new AwClient(config.awUrl);
    const result = await withLock(paths.stateDir, () =>
      runSync({ aw, config, paths, log }, { dryRun }),
    );
    if (dryRun) {
      for (const batch of result.batches) console.log(JSON.stringify({ events: batch }, null, 2));
      log(`dry run: ${result.batches.length} batch(es), ${result.pending} events; nothing written`);
      const usage = result.batches
        .flat()
        .filter((e): e is DesktopUsageEvent => e.type === "desktop_usage");
      for (const row of summarise(usage)) {
        log(
          `  ${row.minutes.toFixed(1).padStart(7)} min  ${row.app}${row.host ? `  ${row.host}` : ""}`,
        );
      }
      return 0;
    }
    return result.upload?.kind === "failed" ? 2 : 0;
  }

  if (command === "status") {
    const state = { ...EMPTY_STATE, ...readJson<Partial<SyncState>>(paths.state, {}) };
    const queue = new Queue(paths.queue);
    const config = loadConfig(paths.config);
    let aw = "unreachable";
    try {
      aw = (await new AwClient(config.awUrl).info()).version;
    } catch {
      // reported below
    }
    console.log(
      JSON.stringify(
        {
          version: VERSION,
          config: paths.config,
          base_url: config.baseUrl,
          activitywatch: aw,
          synced_until: state.synced_until,
          pending_count: queue.size,
          last_run_at: state.last_run_at,
          last_result: state.last_result,
        },
        null,
        2,
      ),
    );
    return 0;
  }

  console.error(USAGE);
  return command === undefined || command === "help" || command === "--help" ? 0 : 64;
}

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (e: unknown) => {
    log(e instanceof Error ? e.message : String(e));
    process.exit(1);
  },
);
