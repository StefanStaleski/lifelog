import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { BodyError, MAX_BODY_BYTES, readJsonBody } from "./body";

const post = (body: BodyInit, encoding?: string) =>
  new Request("http://localhost/", {
    method: "POST",
    headers: encoding ? { "content-encoding": encoding } : {},
    body,
  });

async function statusOf(p: Promise<unknown>): Promise<number | "ok"> {
  try {
    await p;
    return "ok";
  } catch (e) {
    if (e instanceof BodyError) return e.status;
    throw e;
  }
}

describe("readJsonBody", () => {
  it("parses plain and gzipped JSON", async () => {
    expect(await readJsonBody(post('{"a":1}'))).toEqual({ a: 1 });
    expect(await readJsonBody(post(gzipSync('{"a":1}'), "gzip"))).toEqual({ a: 1 });
  });

  it("rejects bad JSON, bad gzip and unknown encodings", async () => {
    expect(await statusOf(readJsonBody(post("{nope")))).toBe(400);
    expect(await statusOf(readJsonBody(post("not gzip", "gzip")))).toBe(400);
    expect(await statusOf(readJsonBody(post("{}", "br")))).toBe(415);
  });

  it("rejects oversized bodies, including gzip bombs", async () => {
    const big = "x".repeat(MAX_BODY_BYTES + 1);
    expect(await statusOf(readJsonBody(post(big)))).toBe(413);
    expect(await statusOf(readJsonBody(post(gzipSync(big), "gzip")))).toBe(413);
  });
});
