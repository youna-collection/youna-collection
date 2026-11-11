import { AccountNav } from "@/components/account-nav";

/** Chaque page vérifie elle-même la connexion : la mise en page ne fait que l'habillage. */
export default function AccountLayout({ children }: LayoutProps<"/compte">) {
  return (
    <main className="mx-auto grid w-full max-w-5xl flex-1 grid-cols-[minmax(0,1fr)] gap-8 px-4 py-8 md:grid-cols-[12rem_minmax(0,1fr)] md:gap-12 md:py-12">
      <div className="flex flex-col gap-4 md:sticky md:top-28 md:self-start">
        <p className="text-sm tracking-[0.2em] uppercase">Mon compte</p>
        <AccountNav />
      </div>
      <div className="min-w-0">{children}</div>
    </main>
  );
}
