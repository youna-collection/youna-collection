"use client";

import { type ReactNode, useActionState } from "react";
import type { ActionState } from "@/app/actions/auth";

const INITIAL_STATE: ActionState = { status: "idle" };

export function ActionForm({
  action,
  submitLabel,
  children,
  secondary = false,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  submitLabel: string;
  children: ReactNode;
  secondary?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, INITIAL_STATE);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {children}
      {state.message ? (
        <p role="status" className={`text-sm ${state.status === "error" ? "text-danger" : "text-success"}`}>
          {state.message}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className={`min-h-12 border border-ink px-6 text-sm tracking-widest uppercase transition-opacity disabled:opacity-50 ${
          secondary ? "text-ink" : "bg-ink text-ivory"
        }`}
      >
        {pending ? "Patientez..." : submitLabel}
      </button>
    </form>
  );
}
