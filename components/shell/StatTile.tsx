export interface StatTileProps {
  label: string;
  value: string;
  detail: string;
  valueTone?: "number" | "status";
}

export function StatTile({ label, value, detail, valueTone = "number" }: StatTileProps) {
  return (
    <div className="stat-tile">
      <div className="stat-label">{label}</div>
      <div className={`stat-value ${valueTone === "status" ? "stat-value-status" : ""}`}>
        {value}
      </div>
      <div className="stat-detail">{detail}</div>
    </div>
  );
}
