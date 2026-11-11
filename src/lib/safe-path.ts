const PLACEHOLDER_ORIGIN = "https://placeholder.invalid";

/**
 * N'accepte qu'un chemin interne au site. Empêche un lien piégé de renvoyer
 * une cliente vers un site extérieur juste après sa connexion.
 */
export function safePath(value: unknown, fallback = "/compte"): string {
  if (typeof value !== "string" || !value.startsWith("/")) {
    return fallback;
  }
  try {
    const url = new URL(value, PLACEHOLDER_ORIGIN);
    if (url.origin !== PLACEHOLDER_ORIGIN) {
      return fallback;
    }
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}
