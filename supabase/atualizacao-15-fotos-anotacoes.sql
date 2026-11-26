-- =====================================================================
--  ATUALIZAÇÃO 15 — fotos nas anotações
--  Pasta privada "fotos-notas" no Storage: cada pessoa só vê/envia/apaga
--  as fotos da própria pasta (<id do usuário>/<id da anotação>/foto.jpg).
--  Pode rodar mais de uma vez sem problema.
-- =====================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fotos-notas', 'fotos-notas', false, 5242880, array['image/jpeg'])
on conflict (id) do update set public = false, file_size_limit = 5242880, allowed_mime_types = array['image/jpeg'];

drop policy if exists "fotos_notas_ver"     on storage.objects;
drop policy if exists "fotos_notas_enviar"  on storage.objects;
drop policy if exists "fotos_notas_alterar" on storage.objects;
drop policy if exists "fotos_notas_apagar"  on storage.objects;
create policy "fotos_notas_ver" on storage.objects for select to authenticated
  using (bucket_id = 'fotos-notas' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "fotos_notas_enviar" on storage.objects for insert to authenticated
  with check (bucket_id = 'fotos-notas' and (storage.foldername(name))[1] = auth.uid()::text and public.is_member());
create policy "fotos_notas_alterar" on storage.objects for update to authenticated
  using (bucket_id = 'fotos-notas' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "fotos_notas_apagar" on storage.objects for delete to authenticated
  using (bucket_id = 'fotos-notas' and (storage.foldername(name))[1] = auth.uid()::text);

select id, public, file_size_limit from storage.buckets where id = 'fotos-notas';
