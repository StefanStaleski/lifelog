import type { ReactNode } from "react";

/** Each page (and the loading skeleton before it) eases in instead of popping. */
export default function Template({ children }: { children: ReactNode }) {
  return <div className="page-stage">{children}</div>;
}
