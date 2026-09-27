import { getDb } from "@/lib/db";
import { badRequest, unauthorized } from "@/lib/http";
import { getFrame, MAX_FRAME_BYTES, MAX_FRAMES, putFrame, sniffImage } from "@/lib/portrait";
import { getOwner } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ idx: string }> };

async function index(ctx: Ctx): Promise<number | null> {
  const idx = Number((await ctx.params).idx);
  return Number.isInteger(idx) && idx >= 0 && idx < MAX_FRAMES ? idx : null;
}

export async function GET(_req: Request, ctx: Ctx) {
  if (!(await getOwner())) return unauthorized();
  const idx = await index(ctx);
  if (idx === null) return badRequest("bad frame index");
  const frame = await getFrame(getDb(), idx);
  if (!frame) return new Response(null, { status: 404 });
  return new Response(new Uint8Array(frame.bytes), {
    headers: {
      "content-type": frame.mime,
      // Private: only this browser may keep it; the ?v= version in the URL busts it on change.
      "cache-control": "private, max-age=86400",
    },
  });
}

/** Body: the image bytes of one frame (JPEG, PNG or WebP, at most 700 KB). */
export async function PUT(req: Request, ctx: Ctx) {
  if (!(await getOwner())) return unauthorized();
  const idx = await index(ctx);
  if (idx === null) return badRequest("bad frame index");
  const bytes = Buffer.from(await req.arrayBuffer());
  if (bytes.length === 0 || bytes.length > MAX_FRAME_BYTES)
    return badRequest("frame must be 1 byte to 700 KB");
  const mime = sniffImage(bytes);
  if (!mime) return badRequest("frame must be a JPEG, PNG or WebP image");
  await putFrame(getDb(), idx, bytes, mime);
  return new Response(null, { status: 204 });
}
