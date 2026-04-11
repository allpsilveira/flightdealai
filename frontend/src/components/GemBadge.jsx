export default function GemBadge({ score }) {
  return (
    <span className="badge-gem">
      ✦ GEM{score != null ? ` · ${Math.round(score)}` : ""}
    </span>
  );
}
