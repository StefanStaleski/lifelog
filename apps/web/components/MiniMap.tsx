"use client";

import dynamic from "next/dynamic";
import type { PlaceDto } from "@/lib/places";

const PlacesMap = dynamic(() => import("./PlacesMap"), {
  ssr: false,
  loading: () => <div className="h-64 w-full animate-pulse rounded-xl bg-stone-800" />,
});

/** Read-only map of the known places (editing lives in Time → Your places). */
export function MiniMap({ places }: { places: PlaceDto[] }) {
  return (
    <div className="[&_.leaflet-container]:h-64! [&_.leaflet-container]:sm:h-72!">
      <PlacesMap places={places} draft={null} focus={null} onPick={() => {}} />
    </div>
  );
}
