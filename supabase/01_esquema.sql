-- =====================================================================
--  LIBRERÍA MATY - ESQUEMA COMPLETO DE LA BASE DE DATOS
--  Cómo usarlo: Supabase > SQL Editor > New query > pega TODO > Run.
--  Se puede ejecutar más de una vez sin romper nada.
-- =====================================================================

-- 0. Limpia políticas anteriores de MATY (para poder volver a ejecutar) ------
do $$
declare r record;
begin
  for r in select schemaname, tablename, policyname from pg_policies
           where policyname like 'maty\_%' escape '\' and schemaname in ('public','storage')
  loop
    execute format('drop policy if exists %I on %I.%I', r.policyname, r.schemaname, r.tablename);
  end loop;
end $$;

create sequence if not exists public.sales_ticket_seq;

-- 1. PERFILES ------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,+
  full_name text not null default '',
  phone text,
  role text not null default 'customer' check (role in ('admin','employee','customer')),
  active boolean not null default true,
  can_manage_inventory boolean not null default false,
  can_verify_payments boolean not null default false,
  created_at timestamptz not null default now()
);

-- Funciones que responden "¿quién es este usuario?" (se usan en las políticas)
create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles
                 where id = auth.uid() and active and role in ('admin','employee'));
$$;
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles
                 where id = auth.uid() and active and role = 'admin');
$$;
create or replace function public.can_inventory() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles
                 where id = auth.uid() and active
                   and (role = 'admin' or (role = 'employee' and can_manage_inventory)));
$$;
create or replace function public.can_verify() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles
                 where id = auth.uid() and active
                   and (role = 'admin' or (role = 'employee' and can_verify_payments)));
$$;

-- Perfil automático para cada usuario nuevo (siempre como "customer")
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', ''), 'customer')
  on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Nadie puede cambiar su propio rol; solo un administrador cambia roles de otros
create or replace function public.protect_profile() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;  -- SQL Editor (tú como dueño del proyecto)
  if not public.is_admin() then
    if new.id is distinct from old.id or new.role is distinct from old.role
       or new.active is distinct from old.active or new.email is distinct from old.email
       or new.can_manage_inventory is distinct from old.can_manage_inventory
       or new.can_verify_payments is distinct from old.can_verify_payments then
      raise exception 'No tienes permiso para cambiar roles ni permisos.';
    end if;
  elsif new.id = auth.uid() and (new.role is distinct from old.role or new.active is distinct from old.active) then
    raise exception 'No puedes cambiar tu propio rol ni desactivar tu propia cuenta.';
  end if;
  return new;
end $$;
drop trigger if exists protect_profile_trg on public.profiles;
create trigger protect_profile_trg before update on public.profiles
  for each row execute function public.protect_profile();

-- 2. CONFIGURACIÓN, CATEGORÍAS, PRODUCTOS ---------------------------------------
create table if not exists public.settings (
  key text primary key,
  value text not null default '',
  is_public boolean not null default false,
  label text
);

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text,
  category_id uuid references public.categories(id) on delete set null,
  price numeric(12,2) not null check (price >= 0),
  image_url text,
  stock integer not null default 0 check (stock >= 0),
  reserved integer not null default 0 check (reserved >= 0),
  min_stock integer not null default 0 check (min_stock >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint products_reserved_le_stock check (reserved <= stock)
);
create index if not exists products_category_idx on public.products(category_id);
create index if not exists products_active_idx on public.products(active);

-- El costo vive aparte para que los clientes jamás puedan verlo
create table if not exists public.product_costs (
  product_id uuid primary key references public.products(id) on delete cascade,
  cost numeric(12,2) not null default 0 check (cost >= 0)
);

-- El stock solo cambia mediante funciones de inventario (nunca editando la tabla)
create or replace function public.guard_product() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  if coalesce(current_setting('app.stock_rpc', true), '') <> 'on' then
    if tg_op = 'INSERT' then
      new.stock := 0; new.reserved := 0;
    elsif new.stock is distinct from old.stock or new.reserved is distinct from old.reserved then
      raise exception 'El stock solo se modifica con movimientos de inventario.';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists guard_product_trg on public.products;
create trigger guard_product_trg before insert or update on public.products
  for each row execute function public.guard_product();

-- 3. PROMOCIONES -----------------------------------------------------------------
create table if not exists public.promotions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  discount_type text not null check (discount_type in ('percent','fixed')),
  discount_value numeric(12,2) not null check (discount_value > 0),
  product_id uuid references public.products(id) on delete cascade,
  category_id uuid references public.categories(id) on delete cascade,
  min_quantity integer not null default 1 check (min_quantity >= 1),
  starts_at timestamptz not null default now(),
  ends_at timestamptz not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint promo_dates check (ends_at > starts_at),
  constraint promo_pct check (discount_type <> 'percent' or discount_value <= 100),
  constraint promo_scope check (not (product_id is not null and category_id is not null))
);

-- Precio con promoción vigente (null si no hay promoción aplicable)
create or replace function public.promo_unit_price(p_product uuid, p_qty integer default 1)
returns numeric language sql stable security definer set search_path = public as $$
  select greatest(0, round(min(
           case pr.discount_type
             when 'percent' then p.price * (1 - pr.discount_value / 100)
             else p.price - pr.discount_value end), 2))
  from public.products p
  join public.promotions pr
    on pr.active and now() between pr.starts_at and pr.ends_at
   and pr.min_quantity <= greatest(p_qty, 1)
   and (pr.product_id = p.id
        or (pr.product_id is null and pr.category_id = p.category_id)
        or (pr.product_id is null and pr.category_id is null))
  where p.id = p_product
  group by p.price;
$$;

-- Catálogo público (sin costos) con disponibilidad y precio promocional
drop view if exists public.catalog;
create view public.catalog as
select p.id, p.code, p.name, p.description, p.category_id, c.name as category_name,
       p.price, p.image_url,
       greatest(p.stock - p.reserved, 0) as available,
       public.promo_unit_price(p.id, 1) as promo_price,
       p.created_at
from public.products p
left join public.categories c on c.id = p.category_id
where p.active;

-- 4. VENTAS PRESENCIALES ---------------------------------------------------------
create table if not exists public.sales (
  id uuid primary key default gen_random_uuid(),
  ticket_no bigint not null unique default nextval('public.sales_ticket_seq'),
  seller_id uuid references public.profiles(id) on delete set null,
  customer_name text,
  payment_method text not null check (payment_method in ('cash','qr','transfer','card')),
  subtotal numeric(12,2) not null default 0,
  discount_total numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  status text not null default 'completed' check (status in ('completed','voided')),
  notes text,
  void_reason text,
  voided_by uuid references public.profiles(id) on delete set null,
  voided_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists sales_created_idx on public.sales(created_at);
create index if not exists sales_seller_idx on public.sales(seller_id);

create table if not exists public.sale_items (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  product_name text not null,
  product_code text not null,
  quantity integer not null check (quantity > 0),
  list_price numeric(12,2) not null,
  unit_price numeric(12,2) not null,
  unit_cost numeric(12,2) not null default 0,
  line_total numeric(12,2) not null
);
create index if not exists sale_items_sale_idx on public.sale_items(sale_id);

-- 5. INVENTARIO ------------------------------------------------------------------
create table if not exists public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  type text not null check (type in ('purchase_in','sale_out','order_out','void_return','adjust_in','adjust_out')),
  quantity integer not null,
  stock_after integer not null,
  reference_type text,
  reference_id uuid,
  note text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists movements_product_idx on public.inventory_movements(product_id, created_at desc);

create or replace function public._mov(p_product uuid, p_type text, p_qty integer, p_after integer,
                                      p_ref_type text, p_ref uuid, p_note text) returns void
language sql security definer set search_path = public as $$
  insert into public.inventory_movements(product_id, type, quantity, stock_after, reference_type, reference_id, note, created_by)
  values (p_product, p_type, p_qty, p_after, p_ref_type, p_ref, p_note, auth.uid());
$$;

-- 6. PEDIDOS EN LÍNEA ------------------------------------------------------------
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  user_id uuid references auth.users(id) on delete set null,
  customer_name text not null,
  customer_phone text not null,
  customer_email text,
  customer_note text,
  delivery_method text not null check (delivery_method in ('pickup','delivery')),
  payment_method text not null check (payment_method in ('transfer','qr')),
  status text not null default 'pending' check (status in ('pending','confirmed','completed','cancelled')),
  payment_status text not null default 'unpaid' check (payment_status in ('unpaid','in_review','approved','rejected')),
  prep_status text not null default 'not_started' check (prep_status in ('not_started','preparing','prepared')),
  stock_reserved boolean not null default true,
  reserved_until timestamptz,
  subtotal numeric(12,2) not null default 0,
  discount_total numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  cancel_reason text,
  prepared_by uuid references public.profiles(id) on delete set null,
  confirmed_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists orders_status_idx on public.orders(status, created_at desc);
create index if not exists orders_user_idx on public.orders(user_id);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  product_name text not null,
  product_code text not null,
  quantity integer not null check (quantity > 0),
  list_price numeric(12,2) not null,
  unit_price numeric(12,2) not null,
  unit_cost numeric(12,2) not null default 0,
  line_total numeric(12,2) not null
);
create index if not exists order_items_order_idx on public.order_items(order_id);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  method text not null check (method in ('transfer','qr')),
  amount numeric(12,2) not null,
  reference text,
  receipt_path text,
  status text not null default 'in_review' check (status in ('in_review','approved','rejected')),
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  reject_reason text,
  created_at timestamptz not null default now()
);
create index if not exists payments_order_idx on public.payments(order_id);
create index if not exists payments_status_idx on public.payments(status, created_at);

create table if not exists public.deliveries (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders(id) on delete cascade,
  method text not null check (method in ('pickup','delivery')),
  address text,
  contact_phone text,
  notes text,
  shipping_cost numeric(12,2) check (shipping_cost is null or shipping_cost >= 0),
  status text not null default 'pending' check (status in ('pending','ready_pickup','coordinating','delivered')),
  delivered_by uuid references public.profiles(id) on delete set null,
  delivered_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.order_history (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  entity text not null check (entity in ('order','payment','prep','delivery')),
  from_status text,
  to_status text not null,
  note text,
  changed_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists order_history_order_idx on public.order_history(order_id, created_at);

-- 7. PROVEEDORES, COMPRAS, GASTOS -------------------------------------------------
create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  contact_name text,
  phone text,
  email text,
  address text,
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.purchases (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.suppliers(id) on delete restrict,
  status text not null default 'ordered' check (status in ('ordered','received')),
  invoice_ref text,
  notes text,
  total numeric(12,2) not null default 0,
  created_by uuid references public.profiles(id) on delete set null,
  received_by uuid references public.profiles(id) on delete set null,
  received_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists purchases_supplier_idx on public.purchases(supplier_id, created_at desc);

create table if not exists public.purchase_items (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid not null references public.purchases(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  quantity integer not null check (quantity > 0),
  unit_cost numeric(12,2) not null check (unit_cost >= 0)
);
create index if not exists purchase_items_purchase_idx on public.purchase_items(purchase_id);

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  description text not null,
  category text,
  amount numeric(12,2) not null check (amount > 0),
  expense_date date not null default current_date,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

-- 8. AUDITORÍA -------------------------------------------------------------------
create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  action text not null,
  table_name text not null,
  record_id text,
  details jsonb,
  created_at timestamptz not null default now()
);
create index if not exists audit_created_idx on public.audit_log(created_at desc);

create or replace function public.log_audit() returns trigger
language plpgsql security definer set search_path = public as $$
declare v jsonb;
begin
  if tg_op = 'DELETE' then v := to_jsonb(old); else v := to_jsonb(new); end if;
  insert into public.audit_log(user_id, action, table_name, record_id, details)
  values (auth.uid(), tg_op, tg_table_name, coalesce(v->>'id', v->>'product_id', v->>'key'), v);
  return null;
end $$;
do $$
declare t text;
begin
  foreach t in array array['products','product_costs','promotions','profiles','settings','suppliers','categories','expenses']
  loop
    execute format('drop trigger if exists audit_%1$s on public.%1$s', t);
    execute format('create trigger audit_%1$s after insert or update or delete on public.%1$s for each row execute function public.log_audit()', t);
  end loop;
end $$;

-- 9. FUNCIONES DEL NEGOCIO (operaciones seguras y atómicas) -------------------------

-- 9.1 Libera reservas de pedidos sin pago cuyo plazo venció
create or replace function public.release_expired_reservations() returns integer
language plpgsql security definer set search_path = public as $$
declare o record; it record; n integer := 0;
begin
  perform set_config('app.stock_rpc', 'on', true);
  for o in select id from public.orders
           where status = 'pending' and stock_reserved and reserved_until < now()
             and payment_status in ('unpaid','rejected')
           for update skip locked
  loop
    for it in select product_id, quantity from public.order_items
              where order_id = o.id and product_id is not null order by product_id loop
      update public.products set reserved = greatest(reserved - it.quantity, 0) where id = it.product_id;
    end loop;
    update public.orders set status = 'cancelled', stock_reserved = false,
           cancel_reason = 'Reserva vencida sin pago', updated_at = now() where id = o.id;
    insert into public.order_history(order_id, entity, from_status, to_status, note)
    values (o.id, 'order', 'pending', 'cancelled', 'Reserva vencida sin pago');
    n := n + 1;
  end loop;
  return n;
end $$;

-- 9.2 Crear pedido en línea (invitados o clientes con cuenta). Reserva el stock.
create or replace function public.create_order(p_items jsonb, p_customer jsonb, p_delivery jsonb, p_payment_method text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_id uuid; v_code text; v_item jsonb; v_pid uuid; v_qty integer; r public.products;
  v_list numeric; v_unit numeric; v_sub numeric := 0; v_disc numeric := 0; v_hours integer;
  v_name text := trim(coalesce(p_customer->>'name', ''));
  v_phone text := trim(coalesce(p_customer->>'phone', ''));
  v_method text := coalesce(p_delivery->>'method', 'pickup');
  v_until timestamptz;
begin
  perform public.release_expired_reservations();
  if length(v_name) < 2 then raise exception 'Escribe tu nombre.'; end if;
  if length(v_phone) < 6 then raise exception 'Escribe un teléfono de contacto válido.'; end if;
  if v_method not in ('pickup','delivery') then raise exception 'Elige recojo en tienda o delivery.'; end if;
  if v_method = 'delivery' and length(trim(coalesce(p_delivery->>'address', ''))) < 5 then
    raise exception 'Escribe la dirección o referencia para coordinar el delivery.';
  end if;
  if p_payment_method not in ('transfer','qr') then raise exception 'Elige transferencia o QR.'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 or jsonb_array_length(p_items) > 50 then
    raise exception 'El carrito está vacío.';
  end if;

  perform set_config('app.stock_rpc', 'on', true);
  select coalesce((select value::integer from public.settings where key = 'reservation_hours'), 48) into v_hours;
  v_until := now() + make_interval(hours => v_hours);
  v_code := 'MATY-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));

  insert into public.orders(code, user_id, customer_name, customer_phone, customer_email, customer_note,
                            delivery_method, payment_method, reserved_until)
  values (v_code, auth.uid(), v_name, v_phone, nullif(trim(coalesce(p_customer->>'email', '')), ''),
          nullif(trim(coalesce(p_customer->>'note', '')), ''), v_method, p_payment_method, v_until)
  returning id into v_id;

  for v_item in select value from jsonb_array_elements(p_items) as t(value) order by (value->>'product_id') loop
    v_pid := (v_item->>'product_id')::uuid;
    v_qty := (v_item->>'quantity')::integer;
    if v_qty is null or v_qty < 1 or v_qty > 999 then raise exception 'Cantidad no válida.'; end if;
    select * into r from public.products where id = v_pid and active for update;
    if not found then raise exception 'Un producto del carrito ya no está disponible.'; end if;
    if r.stock - r.reserved < v_qty then
      raise exception 'No hay stock suficiente de "%". Disponible: %.', r.name, greatest(r.stock - r.reserved, 0);
    end if;
    v_list := r.price;
    v_unit := least(v_list, coalesce(public.promo_unit_price(v_pid, v_qty), v_list));
    update public.products set reserved = reserved + v_qty where id = v_pid;
    insert into public.order_items(order_id, product_id, product_name, product_code, quantity, list_price, unit_price, unit_cost, line_total)
    values (v_id, v_pid, r.name, r.code, v_qty, v_list, v_unit,
            coalesce((select cost from public.product_costs where product_id = v_pid), 0), v_unit * v_qty);
    v_sub := v_sub + v_list * v_qty;
    v_disc := v_disc + (v_list - v_unit) * v_qty;
  end loop;

  update public.orders set subtotal = v_sub, discount_total = v_disc, total = v_sub - v_disc where id = v_id;
  insert into public.deliveries(order_id, method, address, contact_phone, notes)
  values (v_id, v_method, nullif(trim(coalesce(p_delivery->>'address', '')), ''), v_phone,
          nullif(trim(coalesce(p_delivery->>'notes', '')), ''));
  insert into public.order_history(order_id, entity, to_status, note) values (v_id, 'order', 'pending', 'Pedido creado');
  return jsonb_build_object('code', v_code, 'total', v_sub - v_disc, 'reserved_until', v_until);
end $$;

-- 9.3 Consulta segura de un pedido con su código (sirve para invitados)
create or replace function public.get_order_public(p_code text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare o public.orders; d public.deliveries;
begin
  select * into o from public.orders where code = upper(trim(p_code));
  if not found then return null; end if;
  select * into d from public.deliveries where order_id = o.id;
  return jsonb_build_object(
    'code', o.code, 'status', o.status, 'payment_status', o.payment_status, 'prep_status', o.prep_status,
    'customer_name', o.customer_name, 'delivery_method', o.delivery_method, 'payment_method', o.payment_method,
    'subtotal', o.subtotal, 'discount_total', o.discount_total, 'total', o.total,
    'reserved_until', o.reserved_until, 'created_at', o.created_at, 'cancel_reason', o.cancel_reason,
    'delivery_status', d.status, 'delivery_address', d.address, 'shipping_cost', d.shipping_cost,
    'reject_reason', case when o.payment_status = 'rejected' then
        (select reject_reason from public.payments where order_id = o.id and status = 'rejected' order by created_at desc limit 1)
      end,
    'items', coalesce((select jsonb_agg(jsonb_build_object('name', product_name, 'quantity', quantity,
                        'unit_price', unit_price, 'line_total', line_total) order by product_name)
                       from public.order_items where order_id = o.id), '[]'::jsonb),
    'history', coalesce((select jsonb_agg(jsonb_build_object('entity', entity, 'to_status', to_status, 'at', created_at) order by created_at)
                         from public.order_history where order_id = o.id), '[]'::jsonb)
  );
end $$;

-- 9.4 El cliente registra que subió un comprobante (queda EN REVISIÓN, no pagado)
create or replace function public.submit_receipt(p_code text, p_reference text, p_path text) returns void
language plpgsql security definer set search_path = public as $$
declare o public.orders;
begin
  select * into o from public.orders where code = upper(trim(p_code)) for update;
  if not found then raise exception 'Pedido no encontrado.'; end if;
  if o.status <> 'pending' then raise exception 'Este pedido ya no admite comprobantes.'; end if;
  if o.payment_status in ('in_review','approved') then raise exception 'Ya hay un comprobante en revisión.'; end if;
  if p_path is null or position(o.code || '/' in p_path) <> 1 then raise exception 'Archivo no válido.'; end if;
  insert into public.payments(order_id, method, amount, reference, receipt_path, status)
  values (o.id, o.payment_method, o.total, nullif(trim(coalesce(p_reference, '')), ''), p_path, 'in_review');
  update public.orders set payment_status = 'in_review', updated_at = now() where id = o.id;
  insert into public.order_history(order_id, entity, from_status, to_status, note)
  values (o.id, 'payment', o.payment_status, 'in_review', 'Comprobante enviado por el cliente');
end $$;

-- 9.5 Personal autorizado aprueba o rechaza un pago. Aprobar descuenta el stock.
create or replace function public.review_payment(p_payment_id uuid, p_approve boolean, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_p public.payments; o public.orders; it record; r public.products;
begin
  if not public.can_verify() then raise exception 'No tienes permiso para verificar pagos.'; end if;
  perform set_config('app.stock_rpc', 'on', true);
  select * into v_p from public.payments where id = p_payment_id for update;
  if not found then raise exception 'Pago no encontrado.'; end if;
  if v_p.status <> 'in_review' then raise exception 'Este pago ya fue revisado.'; end if;
  select * into o from public.orders where id = v_p.order_id for update;

  if not p_approve then
    if length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'Escribe el motivo del rechazo.'; end if;
    update public.payments set status = 'rejected', reviewed_by = auth.uid(), reviewed_at = now(),
           reject_reason = trim(p_reason) where id = v_p.id;
    update public.orders set payment_status = 'rejected', updated_at = now(),
           reserved_until = greatest(coalesce(reserved_until, now()), now() + interval '24 hours') where id = o.id;
    insert into public.order_history(order_id, entity, from_status, to_status, note, changed_by)
    values (o.id, 'payment', 'in_review', 'rejected', trim(p_reason), auth.uid());
    return;
  end if;

  if o.status <> 'pending' then raise exception 'El pedido está en estado "%": no se puede aprobar el pago.', o.status; end if;
  for it in select product_id, quantity from public.order_items where order_id = o.id and product_id is not null order by product_id loop
    select * into r from public.products where id = it.product_id for update;
    if o.stock_reserved then
      if r.stock < it.quantity then raise exception 'Stock insuficiente de "%".', r.name; end if;
      update public.products set stock = stock - it.quantity, reserved = greatest(reserved - it.quantity, 0) where id = it.product_id;
    else
      if r.stock - r.reserved < it.quantity then raise exception 'Stock insuficiente de "%".', r.name; end if;
      update public.products set stock = stock - it.quantity where id = it.product_id;
    end if;
    perform public._mov(it.product_id, 'order_out', -it.quantity, r.stock - it.quantity, 'order', o.id, 'Pedido ' || o.code);
  end loop;
  update public.payments set status = 'approved', reviewed_by = auth.uid(), reviewed_at = now() where id = v_p.id;
  update public.orders set payment_status = 'approved', status = 'confirmed', stock_reserved = false,
         confirmed_at = now(), updated_at = now() where id = o.id;
  insert into public.order_history(order_id, entity, from_status, to_status, note, changed_by)
  values (o.id, 'payment', 'in_review', 'approved', 'Ingreso verificado por el personal', auth.uid()),
         (o.id, 'order', 'pending', 'confirmed', 'Pedido confirmado', auth.uid());
end $$;

-- 9.6 Cancelar un pedido (personal). Libera la reserva o devuelve el stock.
create or replace function public.cancel_order(p_order_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare o public.orders; it record; r public.products;
begin
  if not public.is_staff() then raise exception 'No autorizado.'; end if;
  if length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'Escribe el motivo de la cancelación.'; end if;
  perform set_config('app.stock_rpc', 'on', true);
  select * into o from public.orders where id = p_order_id for update;
  if not found then raise exception 'Pedido no encontrado.'; end if;
  if o.status in ('cancelled','completed') then raise exception 'Este pedido ya está cerrado.'; end if;
  if o.status = 'confirmed' and not public.is_admin() then
    raise exception 'Solo el administrador puede cancelar un pedido ya pagado.';
  end if;
  for it in select product_id, quantity from public.order_items where order_id = o.id and product_id is not null order by product_id loop
    select * into r from public.products where id = it.product_id for update;
    if o.status = 'pending' and o.stock_reserved then
      update public.products set reserved = greatest(reserved - it.quantity, 0) where id = it.product_id;
    elsif o.status = 'confirmed' then
      update public.products set stock = stock + it.quantity where id = it.product_id;
      perform public._mov(it.product_id, 'void_return', it.quantity, r.stock + it.quantity, 'order', o.id, 'Pedido cancelado ' || o.code);
    end if;
  end loop;
  update public.payments set status = 'rejected', reviewed_by = auth.uid(), reviewed_at = now(),
         reject_reason = 'Pedido cancelado' where order_id = o.id and status = 'in_review';
  update public.orders set status = 'cancelled', stock_reserved = false, cancel_reason = trim(p_reason),
         payment_status = case when payment_status = 'in_review' then 'rejected' else payment_status end,
         updated_at = now() where id = o.id;
  insert into public.order_history(order_id, entity, from_status, to_status, note, changed_by)
  values (o.id, 'order', o.status, 'cancelled',
          trim(p_reason) || case when o.payment_status = 'approved' then ' (devolver el dinero al cliente manualmente)' else '' end, auth.uid());
end $$;

-- 9.7 El cliente cancela su pedido mientras no tenga pago aprobado ni en revisión
create or replace function public.customer_cancel_order(p_code text) returns void
language plpgsql security definer set search_path = public as $$
declare o public.orders; it record;
begin
  perform set_config('app.stock_rpc', 'on', true);
  select * into o from public.orders where code = upper(trim(p_code)) for update;
  if not found then raise exception 'Pedido no encontrado.'; end if;
  if o.status <> 'pending' or o.payment_status in ('in_review','approved') then
    raise exception 'Este pedido ya no se puede cancelar desde aquí. Comunícate con la librería.';
  end if;
  if o.stock_reserved then
    for it in select product_id, quantity from public.order_items where order_id = o.id and product_id is not null order by product_id loop
      update public.products set reserved = greatest(reserved - it.quantity, 0) where id = it.product_id;
    end loop;
  end if;
  update public.orders set status = 'cancelled', stock_reserved = false, cancel_reason = 'Cancelado por el cliente', updated_at = now() where id = o.id;
  insert into public.order_history(order_id, entity, from_status, to_status, note)
  values (o.id, 'order', 'pending', 'cancelled', 'Cancelado por el cliente');
end $$;

-- 9.8 Preparación del pedido
create or replace function public.set_prep_status(p_order_id uuid, p_to text) returns void
language plpgsql security definer set search_path = public as $$
declare o public.orders; d public.deliveries;
begin
  if not public.is_staff() then raise exception 'No autorizado.'; end if;
  select * into o from public.orders where id = p_order_id for update;
  if not found then raise exception 'Pedido no encontrado.'; end if;
  if o.status <> 'confirmed' then raise exception 'Solo se preparan pedidos con pago confirmado.'; end if;
  if not ((o.prep_status = 'not_started' and p_to = 'preparing') or (o.prep_status = 'preparing' and p_to = 'prepared')) then
    raise exception 'Cambio de preparación no válido.';
  end if;
  update public.orders set prep_status = p_to, updated_at = now(),
         prepared_by = case when p_to = 'prepared' then auth.uid() else prepared_by end where id = o.id;
  insert into public.order_history(order_id, entity, from_status, to_status, changed_by)
  values (o.id, 'prep', o.prep_status, p_to, auth.uid());
  if p_to = 'prepared' then
    select * into d from public.deliveries where order_id = o.id;
    update public.deliveries set status = case when d.method = 'pickup' then 'ready_pickup' else 'coordinating' end where order_id = o.id;
    insert into public.order_history(order_id, entity, from_status, to_status, changed_by)
    values (o.id, 'delivery', d.status, case when d.method = 'pickup' then 'ready_pickup' else 'coordinating' end, auth.uid());
  end if;
end $$;

-- 9.9 Datos de entrega (costo de envío y notas)
create or replace function public.update_delivery(p_order_id uuid, p_shipping_cost numeric, p_notes text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_staff() then raise exception 'No autorizado.'; end if;
  if p_shipping_cost is not null and p_shipping_cost < 0 then raise exception 'El costo de envío no puede ser negativo.'; end if;
  update public.deliveries set shipping_cost = p_shipping_cost, notes = nullif(trim(coalesce(p_notes, '')), '') where order_id = p_order_id;
end $$;

-- 9.10 Registrar la entrega final
create or replace function public.register_delivery(p_order_id uuid, p_note text default null) returns void
language plpgsql security definer set search_path = public as $$
declare o public.orders; d public.deliveries;
begin
  if not public.is_staff() then raise exception 'No autorizado.'; end if;
  select * into o from public.orders where id = p_order_id for update;
  if not found then raise exception 'Pedido no encontrado.'; end if;
  if o.status <> 'confirmed' or o.prep_status <> 'prepared' then
    raise exception 'Primero termina la preparación del pedido.';
  end if;
  select * into d from public.deliveries where order_id = o.id for update;
  update public.deliveries set status = 'delivered', delivered_by = auth.uid(), delivered_at = now() where order_id = o.id;
  update public.orders set status = 'completed', completed_at = now(), updated_at = now() where id = o.id;
  insert into public.order_history(order_id, entity, from_status, to_status, note, changed_by)
  values (o.id, 'delivery', d.status, 'delivered', p_note, auth.uid()),
         (o.id, 'order', 'confirmed', 'completed', 'Entrega registrada', auth.uid());
end $$;

-- 9.11 Venta presencial
create or replace function public.create_sale(p_items jsonb, p_method text, p_customer text default null, p_notes text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_id uuid; v_ticket bigint; v_item jsonb; v_pid uuid; v_qty integer; v_pct numeric; v_max numeric;
  r public.products; v_list numeric; v_base numeric; v_unit numeric; v_sub numeric := 0; v_disc numeric := 0;
begin
  if not public.is_staff() then raise exception 'No autorizado.'; end if;
  if p_method not in ('cash','qr','transfer','card') then raise exception 'Elige el medio de pago.'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'Agrega al menos un producto.'; end if;
  perform set_config('app.stock_rpc', 'on', true);
  v_max := case when public.is_admin() then 100
                else coalesce((select value::numeric from public.settings where key = 'max_employee_discount_percent'), 0) end;
  insert into public.sales(seller_id, customer_name, payment_method, notes)
  values (auth.uid(), nullif(trim(coalesce(p_customer, '')), ''), p_method, nullif(trim(coalesce(p_notes, '')), ''))
  returning id, ticket_no into v_id, v_ticket;

  for v_item in select value from jsonb_array_elements(p_items) as t(value) order by (value->>'product_id') loop
    v_pid := (v_item->>'product_id')::uuid;
    v_qty := (v_item->>'quantity')::integer;
    v_pct := coalesce((v_item->>'discount_percent')::numeric, 0);
    if v_qty is null or v_qty < 1 then raise exception 'Cantidad no válida.'; end if;
    if v_pct < 0 or v_pct > v_max then raise exception 'Descuento no autorizado (máximo % %%).', v_max; end if;
    select * into r from public.products where id = v_pid and active for update;
    if not found then raise exception 'Un producto ya no está disponible.'; end if;
    if r.stock - r.reserved < v_qty then
      raise exception 'Stock insuficiente de "%". Disponible: %.', r.name, greatest(r.stock - r.reserved, 0);
    end if;
    v_list := r.price;
    v_base := least(v_list, coalesce(public.promo_unit_price(v_pid, v_qty), v_list));
    v_unit := round(v_base * (1 - v_pct / 100), 2);
    update public.products set stock = stock - v_qty where id = v_pid;
    perform public._mov(v_pid, 'sale_out', -v_qty, r.stock - v_qty, 'sale', v_id, 'Venta #' || v_ticket);
    insert into public.sale_items(sale_id, product_id, product_name, product_code, quantity, list_price, unit_price, unit_cost, line_total)
    values (v_id, v_pid, r.name, r.code, v_qty, v_list, v_unit,
            coalesce((select cost from public.product_costs where product_id = v_pid), 0), v_unit * v_qty);
    v_sub := v_sub + v_list * v_qty;
    v_disc := v_disc + (v_list - v_unit) * v_qty;
  end loop;
  update public.sales set subtotal = v_sub, discount_total = v_disc, total = v_sub - v_disc where id = v_id;
  return jsonb_build_object('id', v_id, 'ticket_no', v_ticket, 'total', v_sub - v_disc);
end $$;

-- 9.12 Anular una venta (conserva el historial y devuelve el stock)
create or replace function public.void_sale(p_sale_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare s public.sales; it record; r public.products;
begin
  if not public.is_admin() then raise exception 'Solo el administrador puede anular ventas.'; end if;
  if length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'Escribe el motivo de la anulación.'; end if;
  perform set_config('app.stock_rpc', 'on', true);
  select * into s from public.sales where id = p_sale_id for update;
  if not found then raise exception 'Venta no encontrada.'; end if;
  if s.status = 'voided' then raise exception 'Esta venta ya está anulada.'; end if;
  for it in select product_id, quantity from public.sale_items where sale_id = s.id and product_id is not null order by product_id loop
    select * into r from public.products where id = it.product_id for update;
    update public.products set stock = stock + it.quantity where id = it.product_id;
    perform public._mov(it.product_id, 'void_return', it.quantity, r.stock + it.quantity, 'sale', s.id, 'Anulación venta #' || s.ticket_no);
  end loop;
  update public.sales set status = 'voided', void_reason = trim(p_reason), voided_by = auth.uid(), voided_at = now() where id = s.id;
end $$;

-- 9.13 Ajuste manual de inventario (+ entra, - sale)
create or replace function public.adjust_stock(p_product uuid, p_delta integer, p_note text) returns integer
language plpgsql security definer set search_path = public as $$
declare r public.products; v_new integer;
begin
  if not public.can_inventory() then raise exception 'No tienes permiso para modificar el inventario.'; end if;
  if p_delta is null or p_delta = 0 then raise exception 'Indica una cantidad distinta de cero.'; end if;
  if length(trim(coalesce(p_note, ''))) < 3 then raise exception 'Escribe el motivo del ajuste.'; end if;
  perform set_config('app.stock_rpc', 'on', true);
  select * into r from public.products where id = p_product for update;
  if not found then raise exception 'Producto no encontrado.'; end if;
  v_new := r.stock + p_delta;
  if v_new < 0 then raise exception 'El stock no puede quedar negativo.'; end if;
  if v_new < r.reserved then raise exception 'No puedes dejar el stock por debajo de lo reservado (%).', r.reserved; end if;
  update public.products set stock = v_new where id = p_product;
  perform public._mov(p_product, case when p_delta > 0 then 'adjust_in' else 'adjust_out' end, p_delta, v_new, 'adjustment', null, trim(p_note));
  return v_new;
end $$;

-- 9.14 Compras a proveedores
create or replace function public.create_purchase(p_supplier uuid, p_items jsonb, p_invoice text default null, p_notes text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_item jsonb; v_total numeric := 0; v_qty integer; v_cost numeric;
begin
  if not public.can_inventory() then raise exception 'No tienes permiso para registrar compras.'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'Agrega al menos un producto.'; end if;
  insert into public.purchases(supplier_id, invoice_ref, notes, created_by)
  values (p_supplier, nullif(trim(coalesce(p_invoice, '')), ''), nullif(trim(coalesce(p_notes, '')), ''), auth.uid())
  returning id into v_id;
  for v_item in select value from jsonb_array_elements(p_items) as t(value) loop
    v_qty := (v_item->>'quantity')::integer;
    v_cost := (v_item->>'unit_cost')::numeric;
    if v_qty is null or v_qty < 1 or v_cost is null or v_cost < 0 then raise exception 'Cantidad o costo no válidos.'; end if;
    insert into public.purchase_items(purchase_id, product_id, quantity, unit_cost)
    values (v_id, (v_item->>'product_id')::uuid, v_qty, v_cost);
    v_total := v_total + v_qty * v_cost;
  end loop;
  update public.purchases set total = v_total where id = v_id;
  return v_id;
end $$;

create or replace function public.receive_purchase(p_purchase uuid) returns void
language plpgsql security definer set search_path = public as $$
declare p public.purchases; it record; r public.products; v_old numeric; v_new numeric;
begin
  if not public.can_inventory() then raise exception 'No tienes permiso para recibir mercadería.'; end if;
  perform set_config('app.stock_rpc', 'on', true);
  select * into p from public.purchases where id = p_purchase for update;
  if not found then raise exception 'Compra no encontrada.'; end if;
  if p.status <> 'ordered' then raise exception 'Esta compra ya fue recibida.'; end if;
  for it in select product_id, quantity, unit_cost from public.purchase_items where purchase_id = p.id order by product_id loop
    select * into r from public.products where id = it.product_id for update;
    select coalesce((select cost from public.product_costs where product_id = it.product_id), 0) into v_old;
    v_new := case when r.stock + it.quantity > 0
                  then round((r.stock * v_old + it.quantity * it.unit_cost) / (r.stock + it.quantity), 2)
                  else it.unit_cost end;
    insert into public.product_costs(product_id, cost) values (it.product_id, v_new)
    on conflict (product_id) do update set cost = excluded.cost;
    update public.products set stock = stock + it.quantity where id = it.product_id;
    perform public._mov(it.product_id, 'purchase_in', it.quantity, r.stock + it.quantity, 'purchase', p.id, 'Compra recibida');
  end loop;
  update public.purchases set status = 'received', received_by = auth.uid(), received_at = now() where id = p.id;
end $$;

-- 9.15 Reporte comercial (solo administrador)
create or replace function public.report_summary(p_from timestamptz, p_to timestamptz) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v jsonb;
begin
  if not public.is_admin() then raise exception 'Solo el administrador puede ver reportes.'; end if;
  with lines as (
    select 'tienda'::text as origin, s.seller_id, si.product_name, si.quantity, si.line_total,
           si.unit_cost * si.quantity as cost, (si.list_price - si.unit_price) * si.quantity as disc
    from public.sale_items si join public.sales s on s.id = si.sale_id
    where s.status = 'completed' and s.created_at >= p_from and s.created_at < p_to
    union all
    select 'online', null, oi.product_name, oi.quantity, oi.line_total,
           oi.unit_cost * oi.quantity, (oi.list_price - oi.unit_price) * oi.quantity
    from public.order_items oi join public.orders o on o.id = oi.order_id
    where o.status in ('confirmed','completed') and o.confirmed_at >= p_from and o.confirmed_at < p_to
  )
  select jsonb_build_object(
    'revenue', coalesce((select sum(line_total) from lines), 0),
    'revenue_store', coalesce((select sum(line_total) from lines where origin = 'tienda'), 0),
    'revenue_online', coalesce((select sum(line_total) from lines where origin = 'online'), 0),
    'cost', coalesce((select sum(cost) from lines), 0),
    'discounts', coalesce((select sum(disc) from lines), 0),
    'expenses', coalesce((select sum(amount) from public.expenses where expense_date >= p_from::date and expense_date < p_to::date), 0),
    'expenses_count', (select count(*) from public.expenses where expense_date >= p_from::date and expense_date < p_to::date),
    'top_products', coalesce((select jsonb_agg(t) from (
        select product_name as name, sum(quantity) as qty, sum(line_total) as total
        from lines group by product_name order by sum(quantity) desc limit 10) t), '[]'::jsonb),
    'by_employee', coalesce((select jsonb_agg(t) from (
        select coalesce(pr.full_name, pr.email, 'Sin nombre') as name, count(*) as sales, sum(s.total) as total
        from public.sales s left join public.profiles pr on pr.id = s.seller_id
        where s.status = 'completed' and s.created_at >= p_from and s.created_at < p_to
        group by 1 order by sum(s.total) desc) t), '[]'::jsonb),
    'orders_by_status', coalesce((select jsonb_object_agg(status, n) from (
        select status, count(*) as n from public.orders where created_at >= p_from and created_at < p_to group by status) x), '{}'::jsonb),
    'pending_payments', (select count(*) from public.payments where status = 'in_review'),
    'voided_sales', (select count(*) from public.sales where status = 'voided' and created_at >= p_from and created_at < p_to)
  ) into v;
  return v;
end $$;

-- 10. SEGURIDAD: ROW LEVEL SECURITY ----------------------------------------------------
alter table public.profiles enable row level security;
alter table public.settings enable row level security;
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.product_costs enable row level security;
alter table public.promotions enable row level security;
alter table public.sales enable row level security;
alter table public.sale_items enable row level security;
alter table public.inventory_movements enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.payments enable row level security;
alter table public.deliveries enable row level security;
alter table public.order_history enable row level security;
alter table public.suppliers enable row level security;
alter table public.purchases enable row level security;
alter table public.purchase_items enable row level security;
alter table public.expenses enable row level security;
alter table public.audit_log enable row level security;

-- Perfiles
create policy maty_profiles_select on public.profiles for select to authenticated using (id = auth.uid() or public.is_staff());
create policy maty_profiles_update on public.profiles for update to authenticated using (id = auth.uid() or public.is_admin()) with check (id = auth.uid() or public.is_admin());
-- Configuración
create policy maty_settings_select on public.settings for select to anon, authenticated using (is_public or public.is_staff());
create policy maty_settings_write on public.settings for all to authenticated using (public.is_admin()) with check (public.is_admin());
-- Categorías
create policy maty_categories_select on public.categories for select to anon, authenticated using (active or public.is_staff());
create policy maty_categories_write on public.categories for all to authenticated using (public.can_inventory()) with check (public.can_inventory());
-- Productos y costos
create policy maty_products_select on public.products for select to authenticated using (public.is_staff());
create policy maty_products_insert on public.products for insert to authenticated with check (public.can_inventory());
create policy maty_products_update on public.products for update to authenticated using (public.can_inventory()) with check (public.can_inventory());
create policy maty_products_delete on public.products for delete to authenticated using (public.is_admin());
create policy maty_costs_all on public.product_costs for all to authenticated using (public.can_inventory()) with check (public.can_inventory());
-- Promociones
create policy maty_promos_select on public.promotions for select to anon, authenticated
  using ((active and now() between starts_at and ends_at) or public.is_staff());
create policy maty_promos_write on public.promotions for all to authenticated using (public.is_admin()) with check (public.is_admin());
-- Ventas (el empleado ve solo las suyas; el administrador ve todas)
create policy maty_sales_select on public.sales for select to authenticated using (public.is_admin() or (public.is_staff() and seller_id = auth.uid()));
create policy maty_sale_items_select on public.sale_items for select to authenticated
  using (exists (select 1 from public.sales s where s.id = sale_id and (public.is_admin() or (public.is_staff() and s.seller_id = auth.uid()))));
-- Inventario
create policy maty_movements_select on public.inventory_movements for select to authenticated using (public.is_staff());
-- Pedidos (el cliente con cuenta ve los suyos; el personal ve todos)
create policy maty_orders_select on public.orders for select to authenticated using (public.is_staff() or user_id = auth.uid());
create policy maty_order_items_select on public.order_items for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id and (public.is_staff() or o.user_id = auth.uid())));
create policy maty_payments_select on public.payments for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id and (public.is_staff() or o.user_id = auth.uid())));
create policy maty_deliveries_select on public.deliveries for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id and (public.is_staff() or o.user_id = auth.uid())));
create policy maty_history_select on public.order_history for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id and (public.is_staff() or o.user_id = auth.uid())));
-- Proveedores y compras
create policy maty_suppliers_all on public.suppliers for all to authenticated using (public.can_inventory()) with check (public.can_inventory());
create policy maty_purchases_select on public.purchases for select to authenticated using (public.can_inventory());
create policy maty_purchases_delete on public.purchases for delete to authenticated using (public.is_admin() and status = 'ordered');
create policy maty_purchase_items_select on public.purchase_items for select to authenticated using (public.can_inventory());
-- Gastos y auditoría
create policy maty_expenses_all on public.expenses for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy maty_audit_select on public.audit_log for select to authenticated using (public.is_admin());

-- Permisos de ejecución de funciones: todo cerrado, y se abre solo lo necesario
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function public.is_staff(), public.is_admin(), public.can_inventory(), public.can_verify(),
      public.release_expired_reservations(), public.create_order(jsonb, jsonb, jsonb, text),
      public.get_order_public(text), public.submit_receipt(text, text, text), public.customer_cancel_order(text)
  to anon, authenticated;
grant execute on function public.review_payment(uuid, boolean, text), public.cancel_order(uuid, text),
      public.set_prep_status(uuid, text), public.update_delivery(uuid, numeric, text), public.register_delivery(uuid, text),
      public.create_sale(jsonb, text, text, text), public.void_sale(uuid, text), public.adjust_stock(uuid, integer, text),
      public.create_purchase(uuid, jsonb, text, text), public.receive_purchase(uuid), public.report_summary(timestamptz, timestamptz)
  to authenticated;
grant select on public.catalog to anon, authenticated;

-- 11. ALMACENAMIENTO (fotos y comprobantes) -----------------------------------------------
create or replace function public.can_upload_receipt(p_code text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.orders
                 where code = upper(coalesce(p_code, '')) and status = 'pending' and payment_status in ('unpaid','rejected'));
$$;
grant execute on function public.can_upload_receipt(text) to anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('product-images', 'product-images', true, 3145728, array['image/jpeg','image/png','image/webp']),
  ('payment-receipts', 'payment-receipts', false, 5242880, array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy maty_img_select on storage.objects for select to anon, authenticated using (bucket_id = 'product-images');
create policy maty_img_insert on storage.objects for insert to authenticated with check (bucket_id = 'product-images' and public.can_inventory());
create policy maty_img_update on storage.objects for update to authenticated using (bucket_id = 'product-images' and public.can_inventory());
create policy maty_img_delete on storage.objects for delete to authenticated using (bucket_id = 'product-images' and public.can_inventory());
create policy maty_rcpt_insert on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'payment-receipts' and public.can_upload_receipt((storage.foldername(name))[1]));
create policy maty_rcpt_select on storage.objects for select to authenticated using (bucket_id = 'payment-receipts' and public.is_staff());
create policy maty_rcpt_delete on storage.objects for delete to authenticated using (bucket_id = 'payment-receipts' and public.is_admin());

-- 12. DATOS INICIALES --------------------------------------------------------------------
insert into public.settings (key, value, is_public, label) values
  ('business_name', 'Librería MATY', true, 'Nombre del negocio'),
  ('payment_instructions', 'Realiza la transferencia a: Banco ____, Cuenta ____, Titular ____. También puedes pagar escaneando el QR.', true, 'Instrucciones de pago'),
  ('qr_image_url', '', true, 'Imagen del QR de pago (se sube en Configuración)'),
  ('pickup_address', '', true, 'Dirección para recoger pedidos'),
  ('pickup_hours', 'Lunes a sábado', true, 'Horario de atención'),
  ('whatsapp', '', true, 'WhatsApp de contacto (solo números, con código de país)'),
  ('reservation_hours', '48', false, 'Horas que se reserva el stock de un pedido sin pago'),
  ('max_employee_discount_percent', '10', false, 'Descuento máximo que puede dar un empleado (%)')
on conflict (key) do nothing;

insert into public.categories (name) values
  ('Cuadernos y papel'), ('Lápices y bolígrafos'), ('Mochilas'), ('Arte y manualidades'), ('Oficina'), ('Otros')
on conflict (name) do nothing;

-- Perfiles para usuarios que ya existían antes de ejecutar este script
insert into public.profiles (id, email, full_name, role)
select id, email, coalesce(raw_user_meta_data->>'full_name', ''), 'customer' from auth.users
on conflict (id) do nothing;
