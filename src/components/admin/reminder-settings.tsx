"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { setReminderSettings } from "@/app/actions/admin-settings";

export function ReminderSettings({ enabled, second }: { enabled: boolean; second: boolean }) {
  const router = useRouter();
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function save(next: { enabled: boolean; second: boolean }) {
    setFeedback(null);
    startTransition(async () => {
      const result = await setReminderSettings(next);
      setFeedback({ ok: result.status === "success", text: result.message ?? "" });
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3 text-sm">
      <label className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={enabled}
          disabled={pending}
          onChange={(e) => save({ enabled: e.target.checked, second })}
          className="mt-1 size-4 accent-ink"
        />
        <span>Envoyer un rappel 24 h après un panier abandonné</span>
      </label>
      <label className={`flex items-start gap-3 ${enabled ? "" : "opacity-50"}`}>
        <input
          type="checkbox"
          checked={second}
          disabled={pending || !enabled}
          onChange={(e) => save({ enabled, second: e.target.checked })}
          className="mt-1 size-4 accent-ink"
        />
        <span>Envoyer un deuxième et dernier rappel au bout de 3 jours</span>
      </label>
      {feedback ? (
        <p role="status" className={feedback.ok ? "text-success" : "text-danger"}>
          {feedback.text}
        </p>
      ) : null}
    </div>
  );
}
