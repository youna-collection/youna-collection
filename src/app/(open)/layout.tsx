import { ShopShell } from "@/components/shop-shell";

/** Compte client et connexion : restent ouverts même quand la boutique est gelée. */
export default function OpenLayout({ children }: LayoutProps<"/">) {
  return <ShopShell>{children}</ShopShell>;
}
