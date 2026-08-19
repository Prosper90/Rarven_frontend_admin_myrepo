type Variant = "open" | "locked" | "settled" | "upcoming" | "success" | "danger" | "warning" | "neutral";

const STYLES: Record<Variant, string> = {
  open:     "bg-success/10 text-success border border-success/20",
  locked:   "bg-warning/10 text-warning border border-warning/20",
  settled:  "bg-muted/10 text-muted border border-muted/20",
  upcoming: "bg-info/10 text-info border border-info/20",
  success:  "bg-success/10 text-success border border-success/20",
  danger:   "bg-danger/10 text-danger border border-danger/20",
  warning:  "bg-warning/10 text-warning border border-warning/20",
  neutral:  "bg-surface-3 text-muted border border-border",
};

export default function Badge({ label, variant }: { label: string; variant: Variant }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${STYLES[variant]}`}>
      {label}
    </span>
  );
}
