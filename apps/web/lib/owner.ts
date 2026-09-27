/** The single person allowed into the dashboard (DASHBOARD_EMAIL). */
export function isOwnerEmail(email: string | null | undefined): boolean {
  const owner = process.env.DASHBOARD_EMAIL?.trim().toLowerCase();
  return !!owner && !!email && email.trim().toLowerCase() === owner;
}

/**
 * Local development only: `DASHBOARD_DEV_AUTH_BYPASS=1 pnpm --filter web dev` skips sign-in so the
 * dashboard can be worked on against the local database. Never active on Vercel or in builds.
 */
export function devAuthBypass(): boolean {
  return (
    process.env.NODE_ENV === "development" &&
    !process.env.VERCEL &&
    process.env.DASHBOARD_DEV_AUTH_BYPASS === "1"
  );
}
