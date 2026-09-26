/** IANA time zone used for every local `date` column (e.g. `daily_summary.date`). */
export const LOCAL_TIME_ZONE = "Europe/Skopje";

/** Local calendar date (YYYY-MM-DD) in {@link LOCAL_TIME_ZONE} for a UTC instant. */
export function toLocalDate(instant: Date): string {
  // en-CA formats as YYYY-MM-DD
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: LOCAL_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);
}
