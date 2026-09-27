import { z } from "zod";
import { isDashboardAuthorized } from "./dashboard-auth";

export const DateSchema = z.iso.date();

export const unauthorized = () => Response.json({ error: "unauthorized" }, { status: 401 });
export const badRequest = (error: string) => Response.json({ error }, { status: 400 });

/** Runs `handler` only for the owner (session) or the device token. */
export async function guarded(req: Request, handler: () => Promise<Response>): Promise<Response> {
  if (!(await isDashboardAuthorized(req))) return unauthorized();
  return handler();
}

/** `from`/`to` query params as local dates; `from` <= `to`, at most `maxDays` apart. */
export function dateRange(url: URL, maxDays = 800): { from: string; to: string } | string {
  const from = DateSchema.safeParse(url.searchParams.get("from"));
  const to = DateSchema.safeParse(url.searchParams.get("to"));
  if (!from.success || !to.success) return "from and to must be dates (YYYY-MM-DD)";
  if (from.data > to.data) return "from must not be after to";
  if ((Date.parse(to.data) - Date.parse(from.data)) / 86_400_000 > maxDays)
    return `at most ${maxDays} days`;
  return { from: from.data, to: to.data };
}
