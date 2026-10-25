import { StatTile, type StatTileProps } from "@/components/shell/StatTile";

interface PageHeaderProps {
  title: string;
  description: string;
  stats?: StatTileProps[];
}

export function PageHeader({ title, description, stats = [] }: PageHeaderProps) {
  return (
    <header className="page-header">
      <div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {stats.length > 0 ? (
        <div className="kpi-strip" aria-label={`${title} status`}>
          {stats.map((stat) => (
            <StatTile key={stat.label} {...stat} />
          ))}
        </div>
      ) : null}
    </header>
  );
}
