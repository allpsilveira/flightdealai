/**
 * Renders AI-generated text with basic markdown:
 *   **bold** → <strong>
 *   - item / • item → <ul><li>
 *   blank lines → paragraph breaks
 */

function InlineFormatted({ text }) {
  // Split on **bold** markers
  const parts = text.split(/(\*\*[\s\S]+?\*\*)/g);
  return (
    <>
      {parts.map((part, i) =>
        part.startsWith("**") && part.endsWith("**") && part.length > 4 ? (
          <strong key={i} className="font-semibold text-zinc-900 dark:text-zinc-100">
            {part.slice(2, -2)}
          </strong>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
}

export default function FormattedText({ text, className = "" }) {
  if (!text) return null;

  // Split into paragraphs on blank lines
  const paragraphs = text.split(/\n\s*\n/).filter((s) => s.trim());

  return (
    <div className={`space-y-2 ${className}`}>
      {paragraphs.map((para, pi) => {
        const lines = para.split(/\n/).map((l) => l.trim()).filter(Boolean);
        const isList = lines.length > 0 && lines.every((l) => /^[-•*]\s/.test(l));

        if (isList) {
          return (
            <ul key={pi} className="space-y-1 pl-4 list-disc">
              {lines.map((line, li) => (
                <li key={li} className="text-sm text-zinc-600 dark:text-zinc-300 leading-relaxed">
                  <InlineFormatted text={line.replace(/^[-•*]\s+/, "")} />
                </li>
              ))}
            </ul>
          );
        }

        return (
          <p key={pi} className="text-sm text-zinc-600 dark:text-zinc-300 leading-relaxed">
            <InlineFormatted text={para} />
          </p>
        );
      })}
    </div>
  );
}
