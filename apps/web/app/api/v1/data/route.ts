import { getDb } from "@/lib/db";
import { deleteRange } from "@/lib/delete-range";
import { badRequest, dateRange, guarded } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Kill switch: `DELETE ?from&to&confirm=delete` removes everything recorded on those local dates. */
export function DELETE(req: Request) {
  return guarded(req, async () => {
    const url = new URL(req.url);
    if (url.searchParams.get("confirm") !== "delete") return badRequest("add confirm=delete");
    const range = dateRange(url, 3660);
    if (typeof range === "string") return badRequest(range);
    return Response.json({ deleted: await deleteRange(getDb(), range.from, range.to) });
  });
}
