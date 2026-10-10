-- =====================================================================
--  CONVERTIR EN ADMINISTRADOR AL USUARIO CREADO EN AUTHENTICATION
--  1) Cambia SOLO el correo entre comillas (línea marcada abajo).
--  2) Pega todo en SQL Editor > Run.
-- =====================================================================
insert into public.profiles (id, email, full_name, role, active)
select id, email, 'Administrador', 'admin', true
from auth.users
where lower(email) = lower('luzmarinasaiquita@gmail.com')   -- <<< CAMBIA ESTE CORREO
on conflict (id) do update set role = 'admin', active = true;

do $$
begin
  if not exists (select 1 from public.profiles where role = 'admin') then
    raise exception 'No se encontró ese correo en Authentication > Users. Revisa que esté bien escrito y que el usuario exista.';
  end if;
end $$;

select email, role from public.profiles where role = 'admin';
