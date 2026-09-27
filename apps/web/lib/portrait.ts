import { portraitFrames } from "@lifelog/shared/db";
import { asc, eq, gte, max, sql } from "drizzle-orm";
import type { Db } from "./db";

export const MAX_FRAMES = 36;
export const MAX_FRAME_BYTES = 700 * 1024;

/** Checks the file really is a JPEG, PNG or WebP (by its first bytes, not the claimed type). */
export function sniffImage(bytes: Uint8Array): "image/jpeg" | "image/png" | "image/webp" | null {
  const b = bytes;
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47)
    return "image/png";
  if (
    b.length > 12 &&
    String.fromCharCode(b[0]!, b[1]!, b[2]!, b[3]!) === "RIFF" &&
    String.fromCharCode(b[8]!, b[9]!, b[10]!, b[11]!) === "WEBP"
  )
    return "image/webp";
  return null;
}

export async function portraitInfo(db: Db): Promise<{ frames: number; version: number }> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int`, updated: max(portraitFrames.updatedAt) })
    .from(portraitFrames);
  return { frames: row?.n ?? 0, version: row?.updated ? row.updated.getTime() : 0 };
}

export async function putFrame(db: Db, idx: number, bytes: Buffer, mime: string) {
  await db
    .insert(portraitFrames)
    .values({ idx, mime, bytes, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: portraitFrames.idx,
      set: { mime, bytes, updatedAt: new Date() },
    });
}

export async function getFrame(db: Db, idx: number) {
  const [row] = await db.select().from(portraitFrames).where(eq(portraitFrames.idx, idx));
  return row ?? null;
}

/** Removes every frame from `from` on (0 = the whole portrait). */
export async function deleteFramesFrom(db: Db, from = 0) {
  await db.delete(portraitFrames).where(gte(portraitFrames.idx, from));
}

export async function frameIndexes(db: Db): Promise<number[]> {
  return (
    await db
      .select({ idx: portraitFrames.idx })
      .from(portraitFrames)
      .orderBy(asc(portraitFrames.idx))
  ).map((r) => r.idx);
}
