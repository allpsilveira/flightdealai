import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import api from "../lib/api";

const TYPE_LABEL = {
  deal: "Deal",
  event: "Event",
  route: "Route",
};

const TYPE_TONE = {
  deal: "bg-emerald-500/10 text-emerald-300 ring-emerald-400/30",
  event: "bg-amber-500/10 text-amber-300 ring-amber-400/30",
  route: "bg-sky-500/10 text-sky-300 ring-sky-400/30",
};

export default function Saved() {
  const [items, setItems] = useState(null);
  const [error, setError] = useState(null);

  const load = async () => {
    try {
      const { data } = await api.get("/saved");
      setItems(data);
    } catch (e) {
      setError(e?.message || "Failed to load saved items");
    }
  };

  useEffect(() => { load(); }, []);

  const remove = async (id) => {
    try {
      await api.delete(`/saved/${id}`);
      setItems((prev) => prev.filter((it) => it.id !== id));
    } catch (e) {
      console.warn("delete failed", e?.message);
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      <header className="mb-6">
        <h1 className="font-serif text-3xl text-champagne">Saved</h1>
        <p className="text-sm text-zinc-400 mt-1">
          Snapshots of deals, events, and routes you've bookmarked. Each entry preserves the price and context at save time.
        </p>
      </header>

      {error && (
        <div className="rounded-lg border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          {error}
        </div>
      )}

      {items === null && !error && (
        <div className="text-zinc-500 text-sm">Loading…</div>
      )}

      {items && items.length === 0 && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-10 text-center">
          <p className="text-zinc-400">Nothing saved yet.</p>
          <p className="text-zinc-500 text-sm mt-1">
            Open any deal or timeline event and tap <span className="text-champagne">Save</span> to keep it here.
          </p>
        </div>
      )}

      {items && items.length > 0 && (
        <ul className="space-y-3">
          {items.map((it) => (
            <SavedRow key={it.id} item={it} onDelete={() => remove(it.id)} />
          ))}
        </ul>
      )}
    </div>
  );
}

function SavedRow({ item, onDelete }) {
  const s = item.snapshot || {};
  const tone = TYPE_TONE[item.item_type] || "bg-zinc-500/10 text-zinc-300 ring-zinc-400/30";

  let title = item.label || "";
  let detail = "";
  let href = null;

  if (item.item_type === "deal") {
    title = title || `${s.origin} → ${s.destination}`;
    detail = [
      s.cabin_class,
      s.airline_code,
      s.best_price_usd ? `$${Math.round(s.best_price_usd).toLocaleString()}` : null,
      s.departure_date ? format(new Date(s.departure_date), "MMM d, yyyy") : null,
    ].filter(Boolean).join(" · ");
  } else if (item.item_type === "event") {
    title = title || s.headline || "Event";
    detail = [
      s.event_type,
      s.airline,
      s.price_usd ? `$${Math.round(s.price_usd).toLocaleString()}` : null,
      s.timestamp ? format(new Date(s.timestamp), "MMM d, h:mm a") : null,
    ].filter(Boolean).join(" · ");
  } else if (item.item_type === "route") {
    title = title || `${(s.origins || []).join("/")} → ${(s.destinations || []).join("/")}`;
    detail = (s.cabin_classes || []).join(", ");
    href = `/route/${item.item_id}`;
  }

  return (
    <li className="flex items-start gap-4 rounded-xl border border-zinc-800 bg-zinc-900/40 px-4 py-3 hover:border-zinc-700 transition-colors">
      <span className={`shrink-0 px-2 py-0.5 rounded text-[11px] font-medium ring-1 ring-inset ${tone}`}>
        {TYPE_LABEL[item.item_type] || item.item_type}
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-sm text-zinc-100 font-medium truncate">
          {href ? <Link to={href} className="hover:text-champagne">{title}</Link> : title}
        </div>
        {detail && <div className="text-xs text-zinc-500 mt-0.5">{detail}</div>}
        <div className="text-[11px] text-zinc-600 mt-1">
          Saved {item.created_at ? format(new Date(item.created_at), "MMM d, yyyy") : "—"}
        </div>
      </div>
      <button
        onClick={onDelete}
        className="text-xs text-zinc-500 hover:text-rose-400 transition-colors"
      >
        Remove
      </button>
    </li>
  );
}
