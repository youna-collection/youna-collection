-- Étiquettes Sendcloud : chaque commande garde la référence de son envoi.
-- Écrit uniquement par le serveur (clé secrète) : aucun droit pour les comptes connectés.
alter table public.orders
  add column sendcloud_shipment_id text,
  add column sendcloud_parcel_id text,
  add column shipping_option_code text,
  -- Rempli dès qu'une étiquette est demandée : empêche d'en créer deux en cliquant deux fois.
  add column label_requested_at timestamptz;
