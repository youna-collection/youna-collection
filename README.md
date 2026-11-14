# Youna Collection

Boutique en ligne sur mesure : Next.js, Supabase, Stripe, Resend, hébergée sur Netlify.

Ce document s'enrichit à chaque phase. **État actuel : phase 6 terminée (e-mails, SAV, rappels de panier) — prochaine étape : phase 7 (pages légales, SEO, mise en ligne)** — phase 5 terminée (admin complet : produits, catégories, stock, ventes en boutique, commandes, remboursements, factures et avoirs PDF, codes promo, clientes, statistiques, gel de la boutique).

## Installation sur l'ordinateur

Il faut [Node.js](https://nodejs.org) (version 24 conseillée, comme sur Netlify).

```bash
npm install
```

Copier `.env.example` sous le nom `.env.local`, y coller les clés, puis lancer le site :

```bash
npm run dev
```

Le site s'ouvre sur <http://localhost:3000>.

## Vérifier que tout fonctionne

```bash
npm test
```

Ces tests lancent une vraie base de données temporaire en mémoire et contrôlent les règles de sécurité : une cliente ne voit que ses données, personne ne peut se donner le rôle admin, une facture émise ne peut pas être modifiée, etc. Ils ne touchent jamais à la vraie base.

## Mettre en place Supabase

1. Créer un compte sur <https://supabase.com>, puis un projet gratuit en région **Paris** ou **Francfort**.
2. Dans **SQL Editor**, exécuter un par un, dans l'ordre, les fichiers du dossier `supabase/migrations`.
3. Dans **Project Settings > API Keys**, copier l'adresse du projet, la clé *publishable* et la clé *secret* dans `.env.local`.
4. Dans **Authentication > URL Configuration**, indiquer l'adresse du site dans *Site URL*, et ajouter `http://localhost:3000/**` ainsi que l'adresse Netlify suivie de `/**` dans *Redirect URLs*.

### Se donner le rôle admin

Créer un compte normalement sur le site et confirmer l'email, puis exécuter dans **SQL Editor**, en remplaçant l'adresse :

```sql
update public.profiles set role = 'admin' where email = 'adresse-admin@exemple.fr';
```

C'est le seul moyen de devenir admin : le site lui-même ne le permet pas.

## Importer le catalogue depuis Shopify

L'import regroupe les fiches Shopify (une par couleur) en produits à couleurs, selon la liste de `scripts/catalog/shopify-map.ts`. Une fiche absente de cette liste bloque l'import : rien n'est deviné.

1. Dans Shopify, exporter les produits (**Produits > Exporter**, format CSV).
2. Préparer, sans rien envoyer (photos téléchargées et optimisées dans `.cache/`) :

   ```bash
   node scripts/import-catalog.ts "chemin/vers/products_export_1.csv"
   ```

3. Envoyer dans Supabase (demande `SUPABASE_SECRET_KEY` dans `.env.local`) :

   ```bash
   node --env-file=.env.local scripts/import-catalog.ts "chemin/vers/products_export_1.csv" --upload
   ```

Relancer l'import met à jour les produits existants, sans doublon : prix, stocks et photos sont remplacés par ceux de l'export. Le site affiche les changements sous 5 minutes.

Les anciennes adresses Shopify et leurs nouvelles pages sont listées dans `supabase/seed/shopify-redirects.json` (redirections mises en place à l'ouverture).

## Import des anciennes commandes Shopify

Les anciennes clientes et leurs commandes sont reprises dans l'admin, avec leurs vraies dates et leur numéro Shopify (n° 1001, 1002…). Il faut d'abord appliquer la migration `20261119100000_shopify_import.sql`.

1. Dans Shopify, exporter les clientes (**Clients > Exporter**) et les commandes (**Commandes > Exporter**, toutes les commandes), au format CSV. Mettre `customers_export.csv` et `orders_export_1.csv` dans un même dossier, **hors du code** (ce sont des données personnelles).
2. Vérifier, sans rien écrire (seuls des totaux et des numéros de commande s'affichent) :

   ```bash
   node --env-file=.env.local scripts/import-shopify.ts "chemin/vers/le/dossier"
   ```

3. Importer :

   ```bash
   node --env-file=.env.local scripts/import-shopify.ts "chemin/vers/le/dossier" --apply
   ```

4. Tout retirer en cas de besoin (commandes « Shopify » et fiches d'anciennes clientes) :

   ```bash
   node --env-file=.env.local scripts/import-shopify.ts --undo
   ```

**Juste avant la mise en ligne**, refaire un export Shopify et relancer l'étape 3 : seules les commandes pas encore importées sont ajoutées.

Ce qu'il faut savoir :

- Rien n'est envoyé aux clientes : aucun e-mail, aucun compte créé. Le stock ne bouge pas, puisqu'il tient déjà compte de ces ventes.
- Une ancienne cliente qui recrée son compte avec la même adresse e-mail retrouve ses commandes. Son nom, son téléphone et son adresse sont aussi pré-remplis. Sa fiche Shopify est ensuite effacée.
- L'accord pour les e-mails marketing donné sur Shopify n'est pas repris : il faut un nouvel accord.
- Aucune facture ni aucun avoir ne peut être créé sur ces commandes, puisque Shopify les a déjà faits. La base le refuse.
- Une commande Shopify pas encore envoyée apparaît dans « À préparer ». Son statut se change comme d'habitude, mais aucun e-mail ne part.
- Les articles qui ne sont plus au catalogue gardent leur nom Shopify.
- Pour les envois en point relais, le point relais est enregistré à part : c'est le nom de la cliente qui s'affiche.

## Variables d'environnement

| Nom | Où la trouver | Depuis |
|---|---|---|
| `NEXT_PUBLIC_SITE_URL` | L'adresse du site, sans `/` à la fin | Phase 1 |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase, Project Settings | Phase 1 |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase, API Keys | Phase 1 |
| `SUPABASE_SECRET_KEY` | Supabase, API Keys. **Secrète** | Phase 2 (import) |
| `NEXT_PUBLIC_GOOGLE_AUTH_ENABLED` | `true` une fois Google configuré | Optionnel |
| `STRIPE_SECRET_KEY` | Stripe, Développeurs > Clés API. **Secrète**. `sk_test_...` jusqu'au lancement | Phase 3 |
| `STRIPE_WEBHOOK_SECRET` | Stripe, Développeurs > Webhooks (voir plus bas). **Secrète** | Phase 3, en ligne |
| `STRIPE_ALLOW_LIVE` | `true` seulement au lancement, avec la clé `sk_live_...` | Phase 7 |
| `NEXT_PUBLIC_SENDCLOUD_PUBLIC_KEY` | Clé publique Sendcloud (carte des points relais) | Envois |
| `SENDCLOUD_SECRET_KEY` | Clé secrète Sendcloud (étiquettes, vérification des points relais) — serveur seulement | Envois |
| `RESEND_API_KEY` | Resend, API Keys (`re_...`). **Secrète** | Phase 6 |
| `EMAIL_FROM` | Expéditeur. Sans domaine : `Youna Collection <onboarding@resend.dev>` | Phase 6 |
| `SHOP_EMAIL` | Adresse de la boutique : alertes, réponses des clientes, tous les e-mails en mode essai | Phase 6 |
| `EMAIL_ALLOW_REAL` | `true` seulement au lancement : les clientes reçoivent alors leurs e-mails | Phase 7 |
| `CRON_SECRET` | Mot de passe de la tâche planifiée (rappels de panier) : une longue suite de caractères au hasard, la même dans `.env.local` et Netlify. **Secrète** | Phase 6 |


## Ajouter ou modifier un produit (admin)

1. Se connecter avec le compte admin, puis ouvrir **/admin** > **Produits** > **+ Ajouter un produit**.
2. Ajouter les photos (sur téléphone : appareil photo ou galerie ; elles sont réduites automatiquement). La première est la photo principale ; chaque photo peut être associée à sa couleur.
3. Remplir le nom, la description, cocher **une ou plusieurs catégories**, puis une **variante par couleur et/ou taille** : prix, prix barré éventuel, stock, poids. Le champ *Couleur* propose la liste commune : en choisir une remplit aussi sa pastille.
4. Choisir la visibilité : *Brouillon*, *En ligne*, *Programmé* (mise en ligne automatique à la date choisie) ou *Archivé*, puis **Enregistrer**. La boutique est mise à jour immédiatement.
- **Depuis la liste des produits** : boutons *Masquer* / *Mettre en ligne* et *Dupliquer*, sans ouvrir la fiche (la mise en ligne est refusée s'il manque un prix ou un poids).
- **Plusieurs catégories** : le produit apparaît dans chaque catégorie cochée ; la première dans l'ordre du menu est la catégorie principale (fil d'Ariane). Table `product_categories` (migration `20261120100000_catalog_freedom.sql`).
- **Couleurs** (Admin > Couleurs) : la liste commune. Ajouter, renommer, changer la pastille, ordonner, retirer. Renommer ou changer la pastille met à jour toutes les variantes qui portent ce nom ; *Retirer* l'enlève seulement de la liste. Une couleur tapée à la main sur un produit y est ajoutée automatiquement.
- **Dupliquer** crée une copie en brouillon (mêmes variantes, photos et catégories, stock à zéro).
- Un produit ou une variante qui a déjà eu du stock est **archivé/masqué** au lieu d'être supprimé, pour garder l'historique.
- Le stock modifié dans une fiche est appliqué par différence : une vente faite pendant la modification n'est pas effacée.
- **Catégories** : ajouter, renommer, ordonner le menu, masquer, supprimer une catégorie vide.

## Stock et ventes en boutique (admin)

- **Stock** : toutes les variantes sur une page, avec recherche et filtres *Stock bas* / *Épuisé*. Changer le nombre puis **OK** ; la modification est appliquée par différence et notée dans l'**historique** (raison, date, stock restant, numéro de commande).
- **Ventes en boutique** : pour une vente en main propre. Choisir les articles (et les voiles d'un bouquet), le prix (modifiable), le moyen de paiement, une remise éventuelle, le nom/e-mail de la cliente (facultatifs). La vente devient une commande « livrée » (source *en boutique*, sans e-mail obligatoire) et le stock est retiré dans la même opération (`record_in_person_sale`, migration `20261113100000_stock_sales.sql`). Une vente est refusée s'il n'y a pas assez de stock.
- Avec l'e-mail d'une cliente inscrite, la vente apparaît dans son compte comme « Achat en boutique ».

## Commandes, remboursements et factures (admin)

- **Commandes** : onglets par statut (À préparer, En préparation, Expédiées…), recherche par n°, nom ou e-mail. « Imprimer les bons à préparer » sort un PDF avec un bon par commande (sans prix, voiles des bouquets à cocher).
- **Fiche commande** : statut en un clic (préparation → expédiée avec n° de suivi → livrée, retour arrière possible), notes internes, coordonnées de la cliente, lien vers le paiement Stripe, historique.
- **Remboursement** (`record_refund`) : total ou partiel, via Stripe (remboursé sur la carte, clé d'idempotence : un nouvel essai ne rembourse jamais deux fois) ou « rendu en main propre ». Les articles choisis sont remis en stock (voiles des bouquets compris). Tout remboursé avant l'envoi → « Annulée », après → « Remboursée ».
- **Factures** (`issue_invoice`) : numérotation continue (F000001, avoirs A000002…), contenu figé, impossibles à modifier ou supprimer. Créées à la demande (admin ou cliente depuis son compte, `/factures/commande/[n°]` en POST) ; un avoir est créé à chaque remboursement. Rien n'est émis tant que **Paramètres** (nom, SIRET, adresse, mention TVA) n'est pas rempli ; un aperçu PDF est disponible dans Paramètres.
- Migrations : `20261114100000_orders_admin.sql`, `20261114100100_service_role_grants.sql`. PDF dessinés avec `pdf-lib` (polices standard).

## Envois avec Sendcloud

Pas besoin de contrat Mondial Relay ou La Poste : les étiquettes passent par le compte Sendcloud, avec ses tarifs. Migration : `20261122100000_sendcloud.sql`.

- **Réglages Sendcloud** (une fois) : adresse d'expédition, informations de facturation et moyen de paiement ; transporteurs Mondial Relay et Colissimo activés ; dans **Réglages → Intégrations**, l'intégration « Sendcloud API » (« Site Youna ») avec les points relais Mondial Relay activés. Les deux clés vont dans `.env.local` (et dans Netlify à la mise en ligne).
- **Au paiement** : la cliente tape son code postal puis choisit son point relais sur la carte Sendcloud. Le serveur relit ce point chez Sendcloud avant de créer la commande (adresse officielle, point toujours ouvert).
- **Dans la fiche commande** : « Créer l'étiquette » (avec confirmation, car Sendcloud la facture) choisit l'offre la moins chère du transporteur (point relais, consigne ou domicile, sans signature), puis enregistre le numéro et le lien de suivi. « Imprimer l'étiquette (PDF) » la récupère chez Sendcloud. « Annuler l'étiquette » est possible tant que la commande n'est pas marquée expédiée.
- Ensuite, « Marquer comme expédiée » envoie à la cliente l'e-mail avec le suivi, comme avant.
- Les frais de port payés par la cliente restent ceux réglés dans l'admin (ils ne viennent pas de Sendcloud).
- Click & collect (retrait) et commandes de l'ancien site Shopify : pas d'étiquette.
- **À faire à la mise en ligne** : mise à jour automatique des statuts « Expédiée » et « Livrée » par webhook Sendcloud (adresse du site nécessaire).

## Codes promo, clientes, statistiques et gel (admin)

- **Codes promo** : pourcentage, montant fixe ou livraison offerte ; minimum d'achat, dates de début/fin, nombre d'utilisations, « une fois par cliente » (même e-mail). Un code déjà utilisé n'est jamais supprimé, seulement désactivé. Le code est vérifié par le serveur (`promo_quote`) à l'application puis au paiement, transmis à Stripe sous forme de coupon, et recopié dans la commande (`fulfill_checkout` compte l'utilisation).
- **Clientes** (`admin_customers`) : comptes et invitées regroupés par e-mail, filtres (fidèles, sans compte, inscrites sans commande), export CSV pour un tableur (données personnelles : ne pas partager le fichier).
- **Statistiques** (`admin_stats`) : chiffre d'affaires net (payé moins remboursé), commandes, panier moyen, graphique par jour/semaine/mois (heure de Paris), meilleures ventes, en ligne ou en boutique, transporteurs, codes promo, nouvelles clientes. Les frais Stripe ne sont pas déduits.
- **Gel de la boutique** (Paramètres → Gel) : les pages de vente affichent une page d'attente (titre et message au choix, pas une erreur) ; l'ajout au panier et le paiement sont refusés. L'admin voit toujours le site avec un bandeau rouge ; connexion, compte et suivi de commande restent ouverts. L'état est mis en cache 60 s au plus (vidé aussitôt quand on change le réglage).
- Migration : `20261115100000_promos_stats.sql`.

## Apparence et sécurité de l'admin

- **Mode sombre** par défaut dans l'admin (bouton ☀ / ☾ en haut, retenu un an sur l'appareil par le cookie `admin-theme`). Les couleurs sont des variables CSS (`@theme` dans `globals.css`) redéfinies par la classe `.admin-dark` ; la boutique n'est pas touchée. Tableau de bord : liseré de couleur par tuile (or = ventes, bleu = commandes, vert = SAV, ambre = stock bas, rouge = épuisé) et graphique des 7 derniers jours.
- **Protections** (vérifiées par un test d'intrusion le 11/11/2026 : une visiteuse ou une cliente connectée ne lit aucune table privée, ne peut appeler aucune fonction admin, ni changer un prix, ni geler la boutique, ni se donner le rôle admin) :
  1. `proxy.ts` : pas de session → page de connexion ;
  2. `requireAdmin()` dans la mise en page `/admin` et dans chaque action admin ; les routes d'export/PDF vérifient aussi le rôle (sinon 404) ;
  3. base de données : règles RLS sur toutes les tables, `is_admin()` ; la colonne `role` n'est pas modifiable par une cliente ;
  4. en-têtes de sécurité (`next.config.ts`) : anti-iframe, HTTPS obligatoire (HSTS) une fois en ligne.
- Le vrai point faible est le **compte admin lui-même** : protéger la boîte Gmail de l'admin (validation en deux étapes) et un mot de passe unique.

## Logo, bas de page et pages légales

- **Logo** : le monogramme est dessiné une seule fois dans `src/lib/logo-paths.ts` (formes vectorielles) et réutilisé par `LogoMark` (`src/components/logo.tsx` : barre du haut, bas de page, page d'attente, admin en doré) et par les PDF (factures, bons de préparation). Les images (`src/app/favicon.ico`, `src/app/icon.svg`, `src/app/apple-icon.png`, `public/icon-192.png`, `public/icon-512.png`, `public/logo-email.png` pour les e-mails) ont été générées depuis ces mêmes formes : si le logo change, les régénérer toutes. Le logo des e-mails est une image hébergée sur le site (`NEXT_PUBLIC_SITE_URL/logo-email.png`) : il ne s'affiche dans les e-mails qu'une fois le site en ligne ; les modèles Supabase (`supabase/templates/`) l'utilisent aussi : les recoller dans Supabase.
- **Bas de page** : « Livraison rapide / Expéditions sous 48 h » et « Une question / Contactez-nous » (adresse = « E-mail affiché » des Paramètres, sinon `youna.hyj83@gmail.com`), icônes Instagram / TikTok / Snapchat (Paramètres → Réseaux sociaux : lien complet ou simple pseudo ; une icône n'apparaît que si le lien est rempli), liens vers les pages légales.
- **Pages légales** (groupe `(open)`, visibles même boutique gelée) : `/mentions-legales`, `/cgv`, `/confidentialite` (cookies inclus : uniquement des cookies indispensables, donc pas de bandeau), `/livraison-retours` (tarifs lus dans les modes de livraison, toujours à jour). L'identité du vendeur et le médiateur viennent des Paramètres (`src/lib/shop-info.ts`, cache vidé à chaque enregistrement) ; une information manquante s'affiche « [… — à compléter] » sur fond beige : **tout doit être rempli avant l'ouverture**. Le paiement rappelle l'acceptation des CGV ; l'inscription renvoie vers la confidentialité.
- Migration `20261121100000_social_legal.sql` (liens des réseaux + médiateur).

## E-mails (Resend)

- **Envoyés automatiquement** : confirmation de commande (après le paiement, depuis le webhook ou la page « Merci »), expédition avec lien de suivi (case « Prévenir la cliente » cochée par défaut), remboursement. **Alertes pour la boutique** (`SHOP_EMAIL`) : nouvelle commande, rupture de stock, nouvelle demande SAV, réponse d'une cliente au SAV (au plus une par heure et par demande). Voir aussi la partie SAV.
- **Jamais en double** : chaque e-mail a une clé unique dans la table `email_log` (migration `20261116100000_emails.sql`) ; un envoi raté est retenté au déclenchement suivant. Un e-mail en échec ne bloque jamais une commande.
- **Mode essai** : tant que `EMAIL_ALLOW_REAL` n'est pas `true`, tout part vers `SHOP_EMAIL`, avec la vraie destinataire dans l'objet. Sans `RESEND_API_KEY`, les e-mails sont préparés et visibles dans l'admin, mais ne partent pas.
- **Admin** : Paramètres → E-mails → « Voir les e-mails envoyés » (aperçu exact de chaque e-mail) ; chaque fiche commande liste ses e-mails.
- **Lancement** : vérifier le domaine chez Resend (enregistrements DNS chez Netlify), puis `EMAIL_FROM=Youna Collection <contact@domaine>` et `EMAIL_ALLOW_REAL=true` dans Netlify.
- Modèles : `src/lib/email/templates.ts` (contenu) et `layout.ts` (habillage).

## SAV (retours, échanges, réclamations)

- **Clientes avec compte** : `/compte/sav` (et bouton « Retour, échange ou souci » sur chaque commande). **Sans compte** : `/sav` → n° de commande + e-mail → lien personnel signé valable 30 jours (un e-mail par commande et par heure au plus), gardé dans un cookie limité à `/sav`.
- **Règles** (`src/lib/support-rules.ts`) : retour et échange pendant 14 jours après la livraison (21 jours après l'expédition si la commande n'est pas marquée livrée) ; réclamation toujours possible ; une seule demande ouverte par commande ; 3 photos au plus, réduites dans le navigateur (1600 px, JPEG, sans données GPS), rangées dans le dossier privé `support-photos` et montrées par des liens temporaires.
- **Admin** : menu SAV (pastille = demandes où la cliente attend une réponse), réponse + état (Nouvelle, En cours, En attente de la cliente, Résolue, Fermée), e-mail à la cliente si la case est cochée. Une réponse de la cliente rouvre une demande « En attente » ou « Résolue ». Le remboursement d'un retour se fait depuis la commande.
- Base : migration `20261117100000_support.sql`. Les clientes n'écrivent plus directement dans les tables SAV : tout passe par le serveur (`src/app/actions/support.ts`), qui vérifie l'accès.
- **Avant le lancement** : remettre la numérotation des demandes à 101 si des essais ont eu lieu (`alter table public.support_tickets alter column number restart with 101;`).

## Rappels de panier abandonné

- **Qui** : uniquement les clientes qui ont coché « M'envoyer un rappel… » au moment de commander (case jamais pré-cochée, consentement daté dans `carts.reminder_consent_at`). Les anciennes clientes de Shopify ne reçoivent rien tant qu'elles n'ont pas coché la case sur le nouveau site.
- **Quand** (`src/lib/reminder-rules.ts`) : 1er rappel 24 h après la dernière activité sur le panier ; 2e et dernier rappel (désactivable) au bout de 3 jours, au moins 24 h après le premier ; rien pour un panier abandonné depuis plus de 7 jours. **Annulé** si le panier est payé, si elle a commandé depuis (même e-mail ou même compte), si le panier est vide ou épuisé, si la boutique est gelée, ou si elle s'est désinscrite.
- **Contenu** : le panier et un bouton « Reprendre mon panier » (lien signé, 14 jours, qui retrouve le panier même sur un autre appareil). Pas de code promo. Lien « Ne plus recevoir de rappel » (`/desinscription`, un clic de confirmation) et désinscription en un clic depuis Gmail/Outlook (en-tête `List-Unsubscribe`). Les désinscriptions vont dans la table `email_suppressions` ; recocher la case plus tard vaut nouveau consentement.
- **Admin** : Paramètres → Rappels de panier (activer, deuxième rappel). Les rappels apparaissent dans le journal des e-mails.
- **Fonctionnement** : la tâche planifiée Netlify `netlify/functions/relance-panier.mts` tourne chaque heure et appelle `POST /api/taches/relance-panier` avec `Authorization: Bearer <CRON_SECRET>`. Pour la lancer à la main en local : `curl -X POST -H "Authorization: Bearer <CRON_SECRET>" http://localhost:3000/api/taches/relance-panier`. Migration : `20261118100000_cart_reminders.sql`.

## E-mails de connexion (Supabase)

Les e-mails d'inscription, de lien de connexion, de nouveau mot de passe et de changement d'adresse sont envoyés par Supabase. Les modèles en français sont dans `supabase/templates/`. Leurs liens passent par `/auth/confirm?token_hash=…` : ils marchent même ouverts sur un autre appareil ou dans l'application Gmail.

1. Supabase → **Authentication → Emails → Templates** (*Email Templates*). Pour chaque modèle, coller le contenu du fichier dans *Body* (onglet *Source*) et l'objet dans *Subject* :

| Modèle Supabase | Fichier | Objet |
|---|---|---|
| Confirm sign up | `confirmation.html` | Confirmez votre adresse e-mail |
| Magic link | `magic-link.html` | Votre lien de connexion |
| Reset password | `recovery.html` | Choisissez un nouveau mot de passe |
| Change email address | `email-change.html` | Confirmez votre nouvelle adresse e-mail |

2. **Authentication → URL Configuration** : *Site URL* = l'adresse du site (aujourd'hui `http://localhost:3000`, au lancement l'adresse définitive) ; *Redirect URLs* : `http://localhost:3000/**` et `https://<adresse du site>/**`.
3. **Au lancement, envoi par Resend** (l'envoi intégré de Supabase est limité à quelques e-mails par heure) : une fois le domaine vérifié chez Resend, Supabase → **Authentication → Emails → SMTP Settings** → *Enable custom SMTP* : hôte `smtp.resend.com`, port `465`, utilisateur `resend`, mot de passe = une clé API Resend (`re_…`, à coller soi-même), expéditeur `contact@<domaine>`, nom « Youna Collection ». Puis relever la limite dans **Authentication → Rate Limits** (par exemple 30 e-mails par heure). Sans domaine vérifié, Resend n'envoie qu'à l'adresse du compte Resend : ne pas activer le SMTP avant.
4. **Anciennes clientes de Shopify** : les mots de passe ne peuvent pas être repris. Elles créent un compte (ou cliquent « Mot de passe oublié ») avec la même adresse ; leurs anciennes commandes passées sur le nouveau site avec cette adresse sont rattachées automatiquement.

## Export comptable

Commandes → « Exporter pour la comptabilité (CSV) » : un mois ou une année, toutes les commandes (en ligne et en boutique, annulées comprises) avec montants, remboursements, n° de facture et d'avoir.

## Espace client

- `/compte` : dernières commandes ; `/compte/commandes` : historique, statut, numéro de suivi et détail de chaque commande.
- Une commande passée sans compte apparaît dans le compte qui a la même adresse e-mail (confirmée), qu'il soit créé avant ou après la commande.
- `/compte/adresses` : carnet d'adresses ; l'adresse par défaut pré-remplit la page de commande.
- `/compte/profil` : prénom, nom, téléphone, mot de passe. `/compte/favoris` : produits ajoutés avec le cœur.
- `/compte/supprimer` : suppression définitive (RGPD) du compte, du profil, des adresses, des favoris et du panier. Les commandes restent (10 ans, obligation comptable), sans lien avec un compte. Le compte admin ne peut pas être supprimé depuis le site.

## Paiement et commandes

- Le panier est vérifié par le serveur à chaque étape : prix, stock et frais de port viennent toujours de la base.
- Au clic sur « Commander et payer », les articles (et les voiles des bouquets) sont **mis de côté 36 minutes**, le temps du paiement Stripe. Sans paiement, ils sont remis en vente.
- La commande est créée quand Stripe confirme le paiement : par le **webhook** (`/api/stripe/webhook`) en ligne, ou par la page de remerciement. Une même commande n'est jamais créée deux fois.
- Carte de test Stripe : `4242 4242 4242 4242`, date future quelconque, CVC quelconque.
- **Webhook (une fois le site en ligne)** : dans Stripe > Développeurs > Webhooks, ajouter l'adresse `https://<site>/api/stripe/webhook` avec les événements `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed` et `checkout.session.expired`, puis copier le secret `whsec_...` dans `STRIPE_WEBHOOK_SECRET`.
- Avant le lancement : supprimer les commandes d'essai (n° 2001…) et repartir de 2001.

## Déploiement sur Netlify

- Site Netlify **youna-collection** : https://youna-collection.netlify.app (mis en ligne le 11/11/2026, version de test : Stripe en mode test, `EMAIL_ALLOW_REAL=false`, invisible sur Google).
- Le code est dans le dépôt GitHub **public** `youna-collection/youna-collection` (public car l'offre gratuite de Netlify bloque les dépôts privés : « Unrecognized Git contributor »). **Ne jamais y mettre de clé, de `.env.local` ni de fichier client** (le `.gitignore` les exclut). Les commits sont signés avec l'adresse anonyme GitHub (`355467589+youna-collection@users.noreply.github.com`). Le dépôt est relié au site : **chaque envoi (`git push`) sur la branche `main` reconstruit et remet le site en ligne automatiquement** (3 à 5 minutes). Les réglages de construction viennent de `netlify.toml`.
- Les variables d'environnement sont dans **Site configuration > Environment variables** (copiées depuis `.env.local`, sauf `NEXT_PUBLIC_SITE_URL` = l'adresse Netlify). Après un changement de variable, relancer un déploiement depuis Netlify (« Trigger deploy »).
- Ne pas construire avec `netlify deploy` depuis Windows : le module Next.js de Netlify a des bugs de chemins sous Windows (middleware). Toujours passer par GitHub.
- Supabase > Authentication > URL Configuration : « Site URL » = l'adresse du site en ligne, et « Redirect URLs » doit contenir `https://youna-collection.netlify.app/**` (et `http://localhost:3000/**` pour les essais), sinon les liens « mot de passe oublié » et « lien de connexion » ne ramènent pas sur le site.
- À faire avant l'ouverture : nom de domaine, webhook Stripe (`STRIPE_WEBHOOK_SECRET`), clés Stripe live, `RESEND_API_KEY` + domaine vérifié, `EMAIL_ALLOW_REAL=true`, retirer `robots: noindex` dans `src/app/layout.tsx`.
