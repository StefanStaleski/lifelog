import { gunzipSync } from "node:zlib";

/** 500 events are ~250 KB of JSON; anything far beyond that is a bug or abuse. */
export const MAX_BODY_BYTES = 5 * 1024 * 1024;

export class BodyError extends Error {
  constructor(
    readonly status: 400 | 413 | 415,
    message: string,
  ) {
    super(message);
  }
}

/** Reads a JSON body, transparently gunzipping `Content-Encoding: gzip`. */
export async function readJsonBody(req: Request): Promise<unknown> {
  const raw = Buffer.from(await req.arrayBuffer());
  if (raw.length > MAX_BODY_BYTES) throw new BodyError(413, "body too large");

  const encoding = req.headers.get("content-encoding")?.toLowerCase();
  let text: string;
  if (encoding === "gzip") {
    try {
      text = gunzipSync(raw, { maxOutputLength: MAX_BODY_BYTES }).toString("utf8");
    } catch (e) {
      const tooLarge = (e as NodeJS.ErrnoException).code === "ERR_BUFFER_TOO_LARGE";
      throw tooLarge ? new BodyError(413, "body too large") : new BodyError(400, "invalid gzip");
    }
  } else if (!encoding || encoding === "identity") {
    text = raw.toString("utf8");
  } else {
    throw new BodyError(415, `unsupported content-encoding: ${encoding}`);
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new BodyError(400, "invalid JSON");
  }
}
