export default function SectionTitle({
  title,
  subtitle,
  action,
  onClick,
  compact = false,
}: {
  title: string;
  subtitle: string;
  action?: string;
  onClick?: () => void;
  compact?: boolean;
}) {
  return (
    <div className={`section-heading ${compact ? "compact" : ""}`}>
      <div>
        <p>{title}</p>
        <span>{subtitle}</span>
      </div>
      {action && <button onClick={onClick}>{action}</button>}
    </div>
  );
}
