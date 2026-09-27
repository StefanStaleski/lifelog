#!/usr/bin/env node
// Prints the phase-gate report: `pnpm gate [base-url] [days]`.
// DEVICE_TOKEN comes from the environment or apps/web/.env.local.
import { readFileSync } from "node:fs";

const baseUrl = process.argv[2] ?? process.env.BASE_URL ?? "https://lifelog-opal-two.vercel.app";
const days = process.argv[3] ?? "7";
let token = process.env.DEVICE_TOKEN;
if (!token) {
  try {
    const env = readFileSync(new URL("../apps/web/.env.local", import.meta.url), "utf8");
    token = /^DEVICE_TOKEN=(.+)$/m.exec(env)?.[1];
  } catch {
    // fall through to the error below
  }
}
if (!token) {
  console.error("Set DEVICE_TOKEN or add it to apps/web/.env.local");
  process.exit(2);
}

const res = await fetch(`${baseUrl.replace(/\/$/, "")}/api/v1/gate?days=${days}`, {
  headers: { authorization: `Bearer ${token}` },
});
if (!res.ok) {
  console.error(`Gate request failed: HTTP ${res.status} ${await res.text()}`);
  process.exit(2);
}
const gate = await res.json();

const minutes = (m) => (m == null ? "–" : m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`);
const day = (d) =>
  new Date(`${d}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
const local = (iso) =>
  new Date(iso).toLocaleString("en-GB", { timeZone: "Europe/Skopje", dateStyle: "medium", timeStyle: "short" });

console.log(`\nLifelog gate · last ${gate.days} days\n`);
console.log(`${gate.passed ? "✅" : "⏳"} ${gate.summary}\n`);
console.log(["Date".padEnd(12), "Heartbeats".padEnd(11), "Screen time".padEnd(13), "Unlocks".padEnd(8), "Check-in"].join(" "));
for (const d of gate.per_day) {
  console.log(
    [
      day(d.date).padEnd(12),
      String(d.heartbeats).padEnd(11),
      minutes(d.screen_time_min).padEnd(13),
      String(d.unlocks ?? "–").padEnd(8),
      d.checkin ? "✓" : "·",
    ].join(" "),
  );
}
console.log(`\nGaps longer than ${gate.max_gap_min / 60} h: ${gate.gaps.length === 0 ? "none" : ""}`);
for (const g of gate.gaps) console.log(`  ${local(g.from)} → ${local(g.to)}  (${minutes(g.minutes)})`);
if (gate.tracking_since) console.log(`\nTracking since ${local(gate.tracking_since)}`);
process.exit(gate.passed ? 0 : 1);
