/**
 * Comment chaque fiche Shopify (une par couleur) devient une couleur ou une taille
 * d'une fiche du nouveau site. Liste explicite : aucun produit n'est deviné.
 */

export type CategoryDef = { slug: string; name: string; position: number };

export type ProductDef = {
  slug: string;
  name: string;
  category: string;
  kind: "standard" | "bouquet";
  bouquetEligible: boolean;
  /** Fiche Shopify dont on reprend la description. */
  descriptionFrom: string;
  /** Poids utilisé quand Shopify indique 0 g. */
  defaultWeightGrams: number;
  position: number;
  /**
   * Endroit de la photo (en fraction de largeur et de hauteur) où le tissu est bien visible :
   * la pastille de couleur y est mesurée. Absent pour les produits sans couleur.
   */
  swatchPoint?: { x: number; y: number };
};

export type VariantDef = {
  product: string;
  color?: string;
  size?: string;
  bouquetVeilCount?: number;
  /** Couleur de pastille fixée à la main, quand la photo ne permet pas de la mesurer. */
  hex?: string;
};

export const CATEGORIES: CategoryDef[] = [
  { slug: "voiles", name: "Voiles", position: 1 },
  { slug: "abayas", name: "Abayas", position: 2 },
  { slug: "jupes", name: "Jupes", position: 3 },
  { slug: "cagoules", name: "Cagoules", position: 4 },
  { slug: "bouquets", name: "Bouquets", position: 5 },
];

export const PRODUCTS: ProductDef[] = [
  { slug: "liquid-jersey", name: "Liquid Jersey", category: "voiles", kind: "standard", bouquetEligible: true, descriptionFrom: "liquid-jersey-matcha", defaultWeightGrams: 300, position: 1, swatchPoint: { x: 0.5, y: 0.4 } },
  { slug: "jersey", name: "Jersey", category: "voiles", kind: "standard", bouquetEligible: true, descriptionFrom: "jersey-peach", defaultWeightGrams: 300, position: 2, swatchPoint: { x: 0.5, y: 0.4 } },
  { slug: "premium-jersey-pearly", name: "Premium Jersey Pearly", category: "voiles", kind: "standard", bouquetEligible: false, descriptionFrom: "jersey-pearly", defaultWeightGrams: 300, position: 3, swatchPoint: { x: 0.5, y: 0.3 } },
  { slug: "abaya-essential", name: "Abaya Essential", category: "abayas", kind: "standard", bouquetEligible: false, descriptionFrom: "abaya-essential-denim", defaultWeightGrams: 300, position: 4, swatchPoint: { x: 0.5, y: 0.25 } },
  { slug: "set-abaya-khimar", name: "Set Abaya Khimar Jersey Premium", category: "abayas", kind: "standard", bouquetEligible: false, descriptionFrom: "set-abaya-khimar-jersey-premium-kaki", defaultWeightGrams: 300, position: 5, swatchPoint: { x: 0.5, y: 0.25 } },
  { slug: "abaya-abeer", name: "Abaya Abeer", category: "abayas", kind: "standard", bouquetEligible: false, descriptionFrom: "abaya-abeer", defaultWeightGrams: 300, position: 6 },
  { slug: "jupe-coton", name: "La Jupe Coton", category: "jupes", kind: "standard", bouquetEligible: false, descriptionFrom: "la-jupe-coton-blanche", defaultWeightGrams: 300, position: 7, swatchPoint: { x: 0.5, y: 0.75 } },
  { slug: "cagoule", name: "Cagoule", category: "cagoules", kind: "standard", bouquetEligible: false, descriptionFrom: "cagoule-burgundy", defaultWeightGrams: 300, position: 8, swatchPoint: { x: 0.5, y: 0.3 } },
  { slug: "bouquet-youna", name: "Bouquet Youna", category: "bouquets", kind: "bouquet", bouquetEligible: false, descriptionFrom: "bouquet-youna-s", defaultWeightGrams: 900, position: 9 },
];

/** Clé : identifiant Shopify (Handle). L'ordre fixe l'ordre des couleurs sur la fiche. */
export const VARIANTS: Record<string, VariantDef> = {
  // Liquid Jersey
  "liquid-jersey-terracotta-copie": { product: "liquid-jersey", color: "Noir" },
  "liquid-jersey-burgundy-copie": { product: "liquid-jersey", color: "Snow White" },
  "liquid-jersey-copie-copie-1": { product: "liquid-jersey", color: "Beige Ivory" },
  "liquid-jersey-misty": { product: "liquid-jersey", color: "Misty" },
  "liquid-jersey-light-matcha": { product: "liquid-jersey", color: "Light Matcha" },
  "liquid-jersey-matcha": { product: "liquid-jersey", color: "Matcha" },
  "jersey-kaki": { product: "liquid-jersey", color: "Kaki" },
  "liquid-jersey-kaki-dark": { product: "liquid-jersey", color: "Kaki Dark" },
  "lemon-light": { product: "liquid-jersey", color: "Lemon Light" },
  "liquid-jersey-kaki-pinky": { product: "liquid-jersey", color: "Pinky" },
  "liquid-jersey-beige-ivory-copie": { product: "liquid-jersey", color: "Burgundy" },
  "liquid-jersey-copie": { product: "liquid-jersey", color: "Toffee" },
  "liquid-jersey-ash-brown": { product: "liquid-jersey", color: "Ash Brown" },
  "liquid-jersey-1": { product: "liquid-jersey", color: "Espresso" },
  "liquid-jersey-2": { product: "liquid-jersey", color: "Dark Brown" },
  "liquid-jersey-copie-copie": { product: "liquid-jersey", color: "Night Blue" },

  // Jersey
  "jersey-peach": { product: "jersey", color: "Peach" },
  "baby-pink": { product: "jersey", color: "Baby Pink" },
  "liquid-jersey-copie-2": { product: "jersey", color: "Rosy" },
  "lilac": { product: "jersey", color: "Lilac" },
  "modesty-mango": { product: "jersey", color: "Mango" },
  "jersey-amber": { product: "jersey", color: "Amber" },
  "liquid-jersey": { product: "jersey", color: "Terracotta" },
  "liquid-jersey-sage-copie": { product: "jersey", color: "Red Copper" },
  "jersey-burgundy": { product: "jersey", color: "Burgundy" },
  "liquid-jersey-copie-1": { product: "jersey", color: "Sage" },
  "jersey-light-blue": { product: "jersey", color: "Light Blue" },
  "jersey-powder-blue": { product: "jersey", color: "Powder Blue" },
  "jersey-grey": { product: "jersey", color: "Grey" },
  "jersey-brown": { product: "jersey", color: "Brown" },

  // Premium Jersey Pearly
  "jersey-pearly": { product: "premium-jersey-pearly", color: "White" },
  "jersey-pearly-black": { product: "premium-jersey-pearly", color: "Black" },

  // Abaya Essential
  "abaya-essential-almond": { product: "abaya-essential", color: "Almond" },
  "abaya-essential": { product: "abaya-essential", color: "Desert Taupe" },
  "abaya-essential-kaki": { product: "abaya-essential", color: "Kaki" },
  "abaya-essential-denim": { product: "abaya-essential", color: "Denim" },
  "abaya-essential-night-blue": { product: "abaya-essential", color: "Night Blue" },
  "abaya-essential-brown": { product: "abaya-essential", color: "Dark Brown" },
  "abaya-essential-burgundy": { product: "abaya-essential", color: "Burgundy" },

  // Set Abaya Khimar (les identifiants Shopify ne correspondent pas aux couleurs : on suit le titre)
  "set-abaya-khimar-jersey-premium-night-blue-copie": { product: "set-abaya-khimar", color: "Night Black" },
  "set-abaya-khimar-jersey-premium-dark-brown-copie": { product: "set-abaya-khimar", color: "Night Blue" },
  "set-abaya-khimar-jersey-premium-burgundy-copie": { product: "set-abaya-khimar", color: "Dark Brown" },
  "set-abaya-khimar-jersey-premium-kaki-copie": { product: "set-abaya-khimar", color: "Burgundy" },
  "set-abaya-khimar-jersey-premium-kaki": { product: "set-abaya-khimar", color: "Kaki" },

  // Abaya Abeer : un seul modèle
  "abaya-abeer": { product: "abaya-abeer" },

  // Jupe coton : photos en extérieur, l'ombre fausse la mesure
  "la-jupe-coton-blanche": { product: "jupe-coton", color: "Blanche", hex: "#f4f1ea" },
  "la-jupe-coton-vanille": { product: "jupe-coton", color: "Jaune Vanille", hex: "#f3e8c4" },

  // Cagoule
  "cagoule-noir": { product: "cagoule", color: "Noir" },
  "cagoule-cream": { product: "cagoule", color: "Ivory" },
  "cagoule-dark-brown": { product: "cagoule", color: "Dark Brown" },
  "cagoule-burgundy": { product: "cagoule", color: "Burgundy" },
  "cagoule-night-blue": { product: "cagoule", color: "Night Blue" },

  // Bouquet : une taille = un nombre de voiles
  "bouquet-youna-s": { product: "bouquet-youna", size: "S", bouquetVeilCount: 3 },
  "bouquet-youna-m": { product: "bouquet-youna", size: "M", bouquetVeilCount: 4 },
  "bouquets-youna": { product: "bouquet-youna", size: "L", bouquetVeilCount: 5 },
  "bouquet-youna-xl": { product: "bouquet-youna", size: "XL", bouquetVeilCount: 6 },
};
