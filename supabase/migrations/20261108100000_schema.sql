-- Youna Collection : structure de la base de données.
-- Tous les montants sont en centimes d'euro (entiers) pour éviter les erreurs d'arrondi.

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------
create type public.user_role as enum ('customer', 'admin');
create type public.product_status as enum ('active', 'draft', 'archived');
create type public.product_kind as enum ('standard', 'bouquet');
create type public.order_status as enum ('paid', 'preparing', 'shipped', 'delivered', 'cancelled', 'refunded');
create type public.order_source as enum ('web', 'in_person', 'shopify_import');
create type public.shipping_carrier as enum ('mondial_relay', 'colissimo', 'pickup');
create type public.promo_type as enum ('percent', 'fixed', 'free_shipping');
create type public.cart_status as enum ('active', 'converted', 'abandoned');
create type public.checkout_status as enum ('open', 'completed', 'expired');
create type public.invoice_kind as enum ('invoice', 'credit_note');
create type public.ticket_type as enum ('return', 'exchange', 'complaint');
create type public.ticket_status as enum ('open', 'in_progress', 'waiting_customer', 'resolved', 'closed');
create type public.message_author as enum ('customer', 'admin');
create type public.stock_reason as enum ('initial', 'manual', 'order', 'cancellation', 'return', 'in_person_sale', 'import');

-- ---------------------------------------------------------------------------
-- Comptes clients
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  first_name text,
  last_name text,
  phone text,
  role public.user_role not null default 'customer',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.addresses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  label text,
  first_name text not null,
  last_name text not null,
  line1 text not null,
  line2 text,
  postal_code text not null,
  city text not null,
  country char(2) not null default 'FR',
  phone text,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index addresses_user_id_idx on public.addresses (user_id);
create unique index addresses_one_default_idx on public.addresses (user_id) where is_default;

-- ---------------------------------------------------------------------------
-- Catalogue
-- ---------------------------------------------------------------------------
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  position integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text,
  category_id uuid references public.categories (id) on delete set null,
  kind public.product_kind not null default 'standard',
  status public.product_status not null default 'draft',
  -- Un voile "bouquet_eligible" peut être choisi dans un bouquet à composer.
  bouquet_eligible boolean not null default false,
  position integer not null default 0,
  seo_title text,
  seo_description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index products_category_id_idx on public.products (category_id);
create index products_status_idx on public.products (status);

create table public.product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  sku text unique,
  color_name text,
  color_hex text check (color_hex is null or color_hex ~ '^#[0-9A-Fa-f]{6}$'),
  size text,
  price_cents integer not null check (price_cents >= 0),
  compare_at_price_cents integer check (compare_at_price_cents is null or compare_at_price_cents >= 0),
  weight_grams integer not null default 0 check (weight_grams >= 0),
  -- Quantité physiquement en stock.
  stock integer not null default 0 check (stock >= 0),
  -- Quantité bloquée par des paiements en cours (30 minutes maximum).
  reserved integer not null default 0 check (reserved >= 0),
  -- Ce qui peut réellement être vendu.
  available integer generated always as (stock - reserved) stored,
  track_stock boolean not null default true,
  low_stock_threshold integer not null default 2 check (low_stock_threshold >= 0),
  -- Nombre de voiles à choisir, pour une taille de bouquet (3 pour S, 6 pour XL...).
  bouquet_veil_count integer check (bouquet_veil_count is null or bouquet_veil_count > 0),
  is_active boolean not null default true,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint product_variants_reserved_within_stock check (not track_stock or reserved <= stock),
  constraint product_variants_unique_option unique nulls not distinct (product_id, color_name, size)
);
create index product_variants_product_id_idx on public.product_variants (product_id);

create table public.product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  variant_id uuid references public.product_variants (id) on delete set null,
  storage_path text not null,
  alt text,
  position integer not null default 0,
  created_at timestamptz not null default now()
);
create index product_images_product_id_idx on public.product_images (product_id);
create index product_images_variant_id_idx on public.product_images (variant_id);

create table public.favorites (
  user_id uuid not null references auth.users (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, product_id)
);
create index favorites_product_id_idx on public.favorites (product_id);

-- ---------------------------------------------------------------------------
-- Livraison et codes promo
-- ---------------------------------------------------------------------------
create table public.shipping_methods (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text,
  carrier public.shipping_carrier not null,
  requires_relay_point boolean not null default false,
  requires_address boolean not null default true,
  is_active boolean not null default true,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.shipping_rates (
  id uuid primary key default gen_random_uuid(),
  method_id uuid not null references public.shipping_methods (id) on delete cascade,
  country char(2) not null default 'FR',
  max_weight_grams integer not null check (max_weight_grams > 0),
  price_cents integer not null check (price_cents >= 0),
  unique (method_id, country, max_weight_grams)
);

create table public.promo_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code = upper(code)),
  type public.promo_type not null,
  value integer not null default 0 check (value >= 0),
  min_subtotal_cents integer not null default 0 check (min_subtotal_cents >= 0),
  starts_at timestamptz,
  ends_at timestamptz,
  max_uses integer check (max_uses is null or max_uses > 0),
  used_count integer not null default 0 check (used_count >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint promo_codes_percent_range check (type <> 'percent' or value between 1 and 100)
);

-- ---------------------------------------------------------------------------
-- Paniers (y compris les invitées) et paiements en cours
-- ---------------------------------------------------------------------------
create table public.carts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete cascade,
  guest_token_hash text unique,
  email text check (email is null or email = lower(email)),
  status public.cart_status not null default 'active',
  reminder_consent boolean not null default false,
  reminder_consent_at timestamptz,
  reminder_count integer not null default 0 check (reminder_count between 0 and 2),
  last_reminder_at timestamptz,
  last_activity_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint carts_has_owner check (user_id is not null or guest_token_hash is not null)
);
create unique index carts_one_active_per_user_idx on public.carts (user_id) where status = 'active';
create index carts_reminder_idx on public.carts (last_activity_at)
  where status = 'active' and reminder_consent and email is not null;

create table public.cart_items (
  id uuid primary key default gen_random_uuid(),
  cart_id uuid not null references public.carts (id) on delete cascade,
  variant_id uuid not null references public.product_variants (id) on delete cascade,
  quantity integer not null check (quantity > 0),
  -- Pour un bouquet : les voiles choisis, revérifiés côté serveur au paiement.
  bouquet_veil_variant_ids uuid[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index cart_items_cart_id_idx on public.cart_items (cart_id);
create index cart_items_variant_id_idx on public.cart_items (variant_id);

create table public.checkouts (
  id uuid primary key default gen_random_uuid(),
  stripe_session_id text unique,
  user_id uuid references auth.users (id) on delete set null,
  cart_id uuid references public.carts (id) on delete set null,
  email text check (email is null or email = lower(email)),
  status public.checkout_status not null default 'open',
  -- Copie figée des lignes, de la livraison et des totaux calculés par le serveur.
  snapshot jsonb not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index checkouts_user_id_idx on public.checkouts (user_id);
create index checkouts_cart_id_idx on public.checkouts (cart_id);
create index checkouts_open_expiry_idx on public.checkouts (expires_at) where status = 'open';

create table public.checkout_reservations (
  checkout_id uuid not null references public.checkouts (id) on delete cascade,
  variant_id uuid not null references public.product_variants (id) on delete restrict,
  quantity integer not null check (quantity > 0),
  primary key (checkout_id, variant_id)
);
create index checkout_reservations_variant_id_idx on public.checkout_reservations (variant_id);

-- Mémorise les événements Stripe déjà traités : un même paiement n'est jamais compté deux fois.
create table public.stripe_events (
  id text primary key,
  type text not null,
  processed_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Commandes
-- ---------------------------------------------------------------------------
create table public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number bigint generated by default as identity (start with 2001) unique,
  -- Reste vide pour une invitée. La commande survit à la suppression du compte (obligation comptable).
  user_id uuid references auth.users (id) on delete set null,
  email text not null check (email = lower(email)),
  status public.order_status not null default 'paid',
  source public.order_source not null default 'web',
  currency char(3) not null default 'EUR',
  subtotal_cents integer not null check (subtotal_cents >= 0),
  discount_cents integer not null default 0 check (discount_cents >= 0),
  shipping_cents integer not null default 0 check (shipping_cents >= 0),
  total_cents integer not null check (total_cents >= 0),
  refunded_cents integer not null default 0 check (refunded_cents >= 0),
  promo_code text,
  shipping_method_code text,
  carrier public.shipping_carrier,
  shipping_address jsonb,
  billing_address jsonb,
  relay_point jsonb,
  tracking_number text,
  tracking_url text,
  stripe_session_id text unique,
  stripe_payment_intent_id text unique,
  legacy_shopify_id text unique,
  legacy_name text,
  paid_at timestamptz,
  shipped_at timestamptz,
  delivered_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index orders_user_id_idx on public.orders (user_id);
create index orders_email_idx on public.orders (email);
create index orders_status_idx on public.orders (status);
create index orders_created_at_idx on public.orders (created_at desc);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  variant_id uuid references public.product_variants (id) on delete set null,
  -- Copie figée : la facture reste juste si le produit change ensuite.
  product_name text not null,
  variant_label text,
  sku text,
  unit_price_cents integer not null check (unit_price_cents >= 0),
  quantity integer not null check (quantity > 0),
  line_total_cents integer not null check (line_total_cents >= 0)
);
create index order_items_order_id_idx on public.order_items (order_id);
create index order_items_variant_id_idx on public.order_items (variant_id);

-- Le détail des voiles choisis dans un bouquet.
create table public.order_item_components (
  id uuid primary key default gen_random_uuid(),
  order_item_id uuid not null references public.order_items (id) on delete cascade,
  variant_id uuid references public.product_variants (id) on delete set null,
  label text not null
);
create index order_item_components_order_item_id_idx on public.order_item_components (order_item_id);
create index order_item_components_variant_id_idx on public.order_item_components (variant_id);

create table public.order_status_history (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  from_status public.order_status,
  to_status public.order_status not null,
  changed_at timestamptz not null default now()
);
create index order_status_history_order_id_idx on public.order_status_history (order_id);

-- Notes internes : jamais visibles par les clientes.
create table public.order_notes (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  author_id uuid references auth.users (id) on delete set null,
  body text not null,
  created_at timestamptz not null default now()
);
create index order_notes_order_id_idx on public.order_notes (order_id);
create index order_notes_author_id_idx on public.order_notes (author_id);

-- ---------------------------------------------------------------------------
-- Stock : historique complet des mouvements
-- ---------------------------------------------------------------------------
create table public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  -- "restrict" : une variante ayant un historique s'archive, elle ne se supprime pas.
  variant_id uuid not null references public.product_variants (id) on delete restrict,
  delta integer not null check (delta <> 0),
  stock_after integer not null check (stock_after >= 0),
  reason public.stock_reason not null,
  order_id uuid references public.orders (id) on delete set null,
  note text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index stock_movements_variant_id_idx on public.stock_movements (variant_id, created_at desc);
create index stock_movements_order_id_idx on public.stock_movements (order_id);
create index stock_movements_created_by_idx on public.stock_movements (created_by);

-- ---------------------------------------------------------------------------
-- Factures et avoirs : numérotation continue, documents non modifiables
-- ---------------------------------------------------------------------------
create table public.document_counters (
  name text primary key,
  last_value bigint not null default 0 check (last_value >= 0)
);
insert into public.document_counters (name, last_value) values ('invoice', 0);

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete restrict,
  kind public.invoice_kind not null default 'invoice',
  number bigint not null unique check (number > 0),
  credit_of uuid references public.invoices (id) on delete restrict,
  issued_at timestamptz not null default now(),
  seller jsonb not null,
  buyer jsonb not null,
  lines jsonb not null,
  totals jsonb not null,
  pdf_path text,
  constraint invoices_credit_note_reference check ((kind = 'credit_note') = (credit_of is not null))
);
create unique index invoices_one_per_order_idx on public.invoices (order_id) where kind = 'invoice';
create index invoices_credit_of_idx on public.invoices (credit_of);

-- ---------------------------------------------------------------------------
-- SAV
-- ---------------------------------------------------------------------------
create table public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete restrict,
  user_id uuid references auth.users (id) on delete set null,
  email text not null check (email = lower(email)),
  type public.ticket_type not null,
  status public.ticket_status not null default 'open',
  subject text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index support_tickets_order_id_idx on public.support_tickets (order_id);
create index support_tickets_user_id_idx on public.support_tickets (user_id);
create index support_tickets_status_idx on public.support_tickets (status);

create table public.support_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets (id) on delete cascade,
  author_id uuid references auth.users (id) on delete set null,
  author_role public.message_author not null,
  body text not null,
  created_at timestamptz not null default now()
);
create index support_messages_ticket_id_idx on public.support_messages (ticket_id, created_at);
create index support_messages_author_id_idx on public.support_messages (author_id);

-- ---------------------------------------------------------------------------
-- Désinscriptions aux relances de panier
-- ---------------------------------------------------------------------------
create table public.email_suppressions (
  email text primary key check (email = lower(email)),
  reason text not null default 'unsubscribe',
  created_at timestamptz not null default now()
);
