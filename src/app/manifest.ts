import type { MetadataRoute } from "next";

/** Nom et icônes quand on ajoute le site à l'écran d'accueil du téléphone. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Youna Collection",
    short_name: "Youna",
    description: "Voiles, abayas, cagoules et bouquets de voiles.",
    start_url: "/",
    display: "standalone",
    background_color: "#f6f1e9",
    theme_color: "#f6f1e9",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
