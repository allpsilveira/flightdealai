import { useState } from "react";
import { useAuthStore } from "../stores/useAuth";
import api from "../lib/api";

export default function Settings() {
  const user = useAuthStore((s) => s.user);
  const updateUser = useAuthStore((s) => s.updateUser);
  const [language, setLanguage] = useState(user?.language ?? "en");
  const [whatsapp, setWhatsapp] = useState(user?.whatsapp_number ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await api.patch("/auth/me", { language, whatsapp_number: whatsapp || null });
      updateUser({ language, whatsapp_number: whatsapp || null });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-8 max-w-xl">
      <h2 className="font-serif text-3xl font-light text-white mb-1">Settings</h2>
      <p className="text-sm text-white/40 font-sans mb-8">Account preferences</p>

      <div className="card p-6 space-y-6">
        <div>
          <label className="block text-xs font-sans text-white/50 mb-1.5 tracking-wider uppercase">
            Email
          </label>
          <p className="input cursor-not-allowed opacity-50">{user?.email}</p>
        </div>

        <div>
          <label className="block text-xs font-sans text-white/50 mb-1.5 tracking-wider uppercase">
            Language
          </label>
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            className="input"
          >
            <option value="en">English</option>
            <option value="pt">Português</option>
          </select>
        </div>

        <div>
          <label className="block text-xs font-sans text-white/50 mb-1.5 tracking-wider uppercase">
            WhatsApp Number
          </label>
          <input
            type="tel"
            value={whatsapp}
            onChange={(e) => setWhatsapp(e.target.value)}
            className="input"
            placeholder="+1 (555) 000-0000"
          />
          <p className="text-xs text-white/30 font-sans mt-1">
            Used for deal alerts via WhatsApp Business
          </p>
        </div>

        <div className="gold-rule" />

        <button
          onClick={save}
          disabled={saving}
          className="btn-primary"
        >
          {saving ? "Saving…" : saved ? "Saved ✓" : "Save Changes"}
        </button>
      </div>
    </div>
  );
}
