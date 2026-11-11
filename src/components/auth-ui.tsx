import type { ComponentProps, ReactNode } from "react";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export function AuthCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-8 px-4 py-12">
      <h1 className="text-center text-2xl tracking-[0.2em] uppercase">{title}</h1>
      {isSupabaseConfigured ? null : (
        <p className="border border-sand p-3 text-sm text-muted">
          Site de test : la connexion sera active une fois Supabase configuré.
        </p>
      )}
      {children}
    </main>
  );
}

export function Field({ label, ...props }: { label: string } & ComponentProps<"input">) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      {label}
      {/* text-base (16 px) : évite le zoom automatique de l'iPhone sur les champs. */}
      <input
        {...props}
        className="min-h-12 border border-sand bg-white px-3 text-base outline-none focus:border-ink"
      />
    </label>
  );
}

export function Divider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 text-xs tracking-widest text-muted uppercase">
      <span className="h-px flex-1 bg-sand" />
      {label}
      <span className="h-px flex-1 bg-sand" />
    </div>
  );
}
