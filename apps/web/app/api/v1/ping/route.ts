// Liveness check for deploy smoke tests; returns no user data, so no auth.
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({ ok: true, time: new Date().toISOString() });
}
