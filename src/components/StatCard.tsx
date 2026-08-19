interface Props {
  label: string;
  value: string | number;
  sub?: string;
  accent?: "primary" | "success" | "warning" | "danger" | "info";
}

const ACCENT = {
  primary: "text-primary",
  success: "text-success",
  warning: "text-warning",
  danger:  "text-danger",
  info:    "text-info",
};

export default function StatCard({ label, value, sub, accent = "primary" }: Props) {
  return (
    <div className="bg-surface border border-border rounded-xl p-4">
      <p className="text-xs text-muted uppercase tracking-wider">{label}</p>
      <p className={`text-2xl font-black mt-1 ${ACCENT[accent]}`}>{value}</p>
      {sub && <p className="text-xs text-faint mt-1">{sub}</p>}
    </div>
  );
}
