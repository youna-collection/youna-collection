/** Réseaux sociaux de la boutique : règles pures (sans base), faciles à tester. */

export type SocialNetwork = "instagram" | "tiktok" | "snapchat";

export const SOCIAL_NETWORKS: { key: SocialNetwork; column: `${SocialNetwork}_url`; label: string; hosts: string[]; profile: (handle: string) => string }[] = [
  { key: "instagram", column: "instagram_url", label: "Instagram", hosts: ["instagram.com"], profile: (h) => `https://www.instagram.com/${h}/` },
  { key: "tiktok", column: "tiktok_url", label: "TikTok", hosts: ["tiktok.com"], profile: (h) => `https://www.tiktok.com/@${h}` },
  { key: "snapchat", column: "snapchat_url", label: "Snapchat", hosts: ["snapchat.com"], profile: (h) => `https://www.snapchat.com/add/${h}` },
];

const HANDLE = /^@?([A-Za-z0-9._-]{1,30})$/;

/**
 * Transforme ce que l'admin a saisi en lien de profil : un lien complet du bon réseau,
 * ou simplement le pseudo (avec ou sans @). Renvoie null si vide, ou une erreur lisible.
 */
export function normalizeSocialLink(network: SocialNetwork, input: string): { url: string | null } | { error: string } {
  const value = input.trim();
  const def = SOCIAL_NETWORKS.find((n) => n.key === network)!;
  if (!value) return { url: null };

  const handle = HANDLE.exec(value);
  if (handle && !value.includes(".com")) return { url: def.profile(handle[1]) };

  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
  } catch {
    return { error: `Lien ${def.label} invalide.` };
  }
  const host = url.hostname.toLowerCase().replace(/^(www\.|m\.)/, "");
  if (!def.hosts.includes(host)) return { error: `Le lien ${def.label} doit commencer par https://www.${def.hosts[0]}/` };
  url.protocol = "https:";
  const result = url.toString();
  if (result.length > 300) return { error: `Lien ${def.label} trop long.` };
  return { url: result };
}
