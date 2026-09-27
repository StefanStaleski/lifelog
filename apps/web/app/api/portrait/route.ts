import { getDb } from "@/lib/db";
import { unauthorized } from "@/lib/http";
import { deleteFramesFrom, portraitInfo } from "@/lib/portrait";
import { getOwner } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** How many portrait frames there are (owner only; the phone's token can't see photos). */
export async function GET() {
  if (!(await getOwner())) return unauthorized();
  return Response.json(await portraitInfo(getDb()));
}

/** `DELETE /api/portrait?from=n`: remove frames n.. (default: all). */
export async function DELETE(req: Request) {
  if (!(await getOwner())) return unauthorized();
  const from = Number(new URL(req.url).searchParams.get("from") ?? "0");
  await deleteFramesFrom(getDb(), Number.isInteger(from) && from >= 0 ? from : 0);
  return Response.json(await portraitInfo(getDb()));
}
