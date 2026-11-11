-- Stockage des fichiers : photos produit (publiques) et PDF (privés).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('product-images', 'product-images', true, 5242880, array['image/webp', 'image/jpeg', 'image/png']),
  ('documents', 'documents', false, 10485760, array['application/pdf'])
on conflict (id) do nothing;

create policy product_images_files_insert_admin on storage.objects for insert to authenticated
  with check (bucket_id = 'product-images' and (select public.is_admin()));
create policy product_images_files_update_admin on storage.objects for update to authenticated
  using (bucket_id = 'product-images' and (select public.is_admin()))
  with check (bucket_id = 'product-images' and (select public.is_admin()));
create policy product_images_files_delete_admin on storage.objects for delete to authenticated
  using (bucket_id = 'product-images' and (select public.is_admin()));

-- L'admin liste ses photos et ses documents. Les photos restent publiques via leur adresse ;
-- les clientes accèdent aux factures par un lien temporaire créé par le serveur.
create policy admin_files_select on storage.objects for select to authenticated
  using (bucket_id in ('product-images', 'documents') and (select public.is_admin()));
