import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { GET as getFrameRoute, PUT } from "@/app/api/portrait/frames/[idx]/route";
import { GET as infoRoute } from "@/app/api/portrait/route";
import { closeDb, getDb } from "@/lib/db";
import { resetDb } from "@/test/helpers";
import {
  deleteFramesFrom,
  frameIndexes,
  getFrame,
  portraitInfo,
  putFrame,
  sniffImage,
} from "./portrait";

beforeEach(resetDb);
afterAll(closeDb);

const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]);
const webp = Buffer.from("RIFF\0\0\0\0WEBPVP8 ", "latin1");

describe("portrait", () => {
  it("recognises images by their bytes, not their claimed type", () => {
    expect(sniffImage(jpeg)).toBe("image/jpeg");
    expect(sniffImage(png)).toBe("image/png");
    expect(sniffImage(webp)).toBe("image/webp");
    expect(sniffImage(Buffer.from("<svg onload=alert(1)>"))).toBeNull();
  });

  it("stores, replaces and trims frames", async () => {
    const db = getDb();
    await putFrame(db, 0, jpeg, "image/jpeg");
    await putFrame(db, 1, png, "image/png");
    await putFrame(db, 2, jpeg, "image/jpeg");
    await putFrame(db, 1, webp, "image/webp");
    expect((await getFrame(db, 1))?.mime).toBe("image/webp");
    expect((await portraitInfo(db)).frames).toBe(3);

    await deleteFramesFrom(db, 1); // a shorter set replaced a longer one
    expect(await frameIndexes(db)).toEqual([0]);
  });

  it("only the signed-in owner can see or change the portrait", async () => {
    const ctx = { params: Promise.resolve({ idx: "0" }) };
    expect((await infoRoute()).status).toBe(401);
    expect((await getFrameRoute(new Request("http://x"), ctx)).status).toBe(401);
    expect((await PUT(new Request("http://x", { method: "PUT", body: jpeg }), ctx)).status).toBe(
      401,
    );
    // the phone's device token doesn't unlock photos either
    const withToken = new Request("http://x", {
      headers: { authorization: "Bearer test-device-token" },
    });
    expect((await getFrameRoute(withToken, ctx)).status).toBe(401);
  });
});
