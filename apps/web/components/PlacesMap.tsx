"use client";

import "leaflet/dist/leaflet.css";
import { useEffect } from "react";
import { Circle, MapContainer, TileLayer, Tooltip, useMap, useMapEvents } from "react-leaflet";
import type { PlaceDto } from "@/lib/places";
import type { Suggestion } from "@/lib/suggestions";

const KIND_COLOR: Record<string, string> = {
  home: "#2a78d6",
  work: "#eb6834",
  gym: "#1baf7a",
  other: "#eda100",
};

function ClickToPick({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({ click: (e) => onPick(e.latlng.lat, e.latlng.lng) });
  return null;
}

function FlyTo({ to }: { to: [number, number] | null }) {
  const map = useMap();
  useEffect(() => {
    if (to) map.flyTo(to, Math.max(map.getZoom(), 16), { duration: 0.6 });
  }, [to, map]);
  return null;
}

/** OpenStreetMap with every place as a circle of its geofence radius; tap to drop the draft pin. */
export default function PlacesMap({
  places,
  suggestions = [],
  draft,
  focus,
  onPick,
}: {
  places: PlaceDto[];
  suggestions?: Suggestion[];
  draft: { lat: number; lng: number; radius_m: number; kind: string } | null;
  focus: [number, number] | null;
  onPick: (lat: number, lng: number) => void;
}) {
  const active = places.filter((p) => !p.archived);
  const first = active[0] ?? suggestions[0];
  const center: [number, number] = first ? [first.lat, first.lng] : [41.9981, 21.4254]; // Skopje
  return (
    <MapContainer
      center={center}
      zoom={14}
      scrollWheelZoom
      className="hud-map h-80 w-full rounded-xl sm:h-96"
      style={{ zIndex: 0 }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {active.map((p) => (
        <Circle
          key={p.id}
          center={[p.lat, p.lng]}
          radius={p.radius_m}
          pathOptions={{ color: KIND_COLOR[p.kind], weight: 2, fillOpacity: 0.2 }}
        >
          <Tooltip permanent direction="top">
            {p.name}
          </Tooltip>
        </Circle>
      ))}
      {suggestions.map((s) => (
        <Circle
          key={`${s.lat},${s.lng}`}
          center={[s.lat, s.lng]}
          radius={s.radius_m}
          pathOptions={{ color: "#78716c", weight: 2, dashArray: "4 6", fillOpacity: 0.08 }}
        >
          <Tooltip direction="top">Suggested</Tooltip>
        </Circle>
      ))}
      {draft && (
        <Circle
          center={[draft.lat, draft.lng]}
          radius={draft.radius_m}
          pathOptions={{
            color: KIND_COLOR[draft.kind],
            weight: 3,
            dashArray: "6 6",
            fillOpacity: 0.15,
          }}
        />
      )}
      <ClickToPick onPick={onPick} />
      <FlyTo to={focus} />
    </MapContainer>
  );
}
