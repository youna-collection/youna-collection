/**
 * Tâche planifiée Netlify : chaque heure, demande au site d'envoyer les rappels de panier.
 * Tout le travail se fait dans le site (src/app/api/taches/relance-panier) ; ici on ne fait qu'appeler.
 * À régler sur Netlify : la variable CRON_SECRET (la même valeur que dans le site).
 * URL est fournie automatiquement par Netlify (adresse principale du site).
 */

export default async function relancePanier() {
  const site = process.env.URL;
  const secret = process.env.CRON_SECRET;
  if (!site || !secret) {
    console.error("Relance panier : URL ou CRON_SECRET manquant");
    return;
  }
  const response = await fetch(`${site}/api/taches/relance-panier`, {
    method: "POST",
    headers: { authorization: `Bearer ${secret}` },
    signal: AbortSignal.timeout(25_000),
  });
  console.log("Relance panier :", response.status, await response.text());
}

export const config = { schedule: "@hourly" };
