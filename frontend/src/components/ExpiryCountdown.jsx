import { useState, useEffect } from "react";
import { formatDistanceToNow, isPast } from "date-fns";

export default function ExpiryCountdown({ expiresAt }) {
  const [, forceUpdate] = useState(0);

  useEffect(() => {
    if (!expiresAt) return;
    const interval = setInterval(() => forceUpdate((n) => n + 1), 30_000);
    return () => clearInterval(interval);
  }, [expiresAt]);

  if (!expiresAt) return null;

  const expiry = new Date(expiresAt);
  if (isPast(expiry)) {
    return (
      <span className="text-xs font-sans text-red-400/70">
        ⏱ Offer expired
      </span>
    );
  }

  const distance = formatDistanceToNow(expiry, { addSuffix: true });
  const isUrgent = (expiry - Date.now()) < 3_600_000; // < 1h

  return (
    <span className={`text-xs font-sans ${isUrgent ? "text-amber-400 animate-pulse" : "text-white/40"}`}>
      ⏱ Expires {distance}
    </span>
  );
}
