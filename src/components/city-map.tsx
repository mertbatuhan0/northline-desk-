import { CITY_MAP, DISTRICTS } from "@/lib/edp/constants";
import type { Incident, Unit } from "@/lib/edp/types";

const PRIORITY_DOT = {
  1: "bg-[#ff6a45]",
  2: "bg-[#ffb020]",
  3: "bg-[#d6de6a]",
} as const;

const UNIT_INK = {
  available: "text-[#9ee0b2]",
  dispatched: "text-[#9ecbff]",
  enroute: "text-[#9ecbff]",
  onscene: "text-[#f0c14a]",
  unavailable: "text-muted-foreground",
} as const;

export function CityMap({ incidents, units }: { incidents: Incident[]; units: Unit[] }) {
  const open = incidents.filter((incident) => incident.status !== "resolved");

  return (
    <div
      className="grid grid-cols-4 gap-1.5"
      aria-label="Northline districts"
    >
      {CITY_MAP.flat().map((cell, index) => {
        if (!cell.district) {
          return (
            <div
              key={`${cell.hint}-${index}`}
              className="flex min-h-16 items-end rounded-lg border border-dashed border-border/70 px-2 py-1.5"
            >
              <span className="text-[10px] tracking-[0.14em] text-muted-foreground/70 uppercase">
                {cell.hint}
              </span>
            </div>
          );
        }
        const district = cell.district;
        const calls = open.filter((incident) => incident.district === district);
        const stationed = units.filter((unit) => unit.district === district);
        return (
          <div
            key={district}
            className="min-h-16 rounded-lg border border-border bg-background/50 px-2 py-1.5"
          >
            <div className="flex items-center justify-between gap-1">
              <span className="text-[10px] tracking-[0.14em] text-foreground/80 uppercase">
                {DISTRICTS[district].label}
              </span>
              <span className="flex gap-1" aria-hidden="true">
                {calls.slice(0, 4).map((incident) => (
                  <span
                    key={incident.id}
                    className={`size-1.5 rounded-full ${PRIORITY_DOT[incident.priority]}`}
                  />
                ))}
              </span>
            </div>
            <div className="mt-1 flex flex-wrap gap-x-1.5 gap-y-0.5">
              {stationed.map((unit) => (
                <span
                  key={unit.id}
                  className={`font-mono text-[10px] ${UNIT_INK[unit.status]}`}
                >
                  {unit.id}
                </span>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
