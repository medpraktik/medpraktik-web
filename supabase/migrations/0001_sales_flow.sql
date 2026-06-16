create extension if not exists pgcrypto;

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  order_id text not null unique,
  access_token text not null unique,
  request_type text not null,
  package_key text not null,
  package_label text not null,
  amount integer not null default 0,
  status text not null default 'draft',
  payment_status text not null default 'pending',
  practice_name text not null,
  owner_name text not null,
  email text not null,
  whatsapp text not null,
  device_fingerprint text,
  notes text,
  midtrans_token text,
  midtrans_redirect_url text,
  midtrans_transaction_id text,
  license_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.payment_events (
  id uuid primary key default gen_random_uuid(),
  order_id text not null references public.orders(order_id) on delete cascade,
  transaction_id text,
  transaction_status text,
  fraud_status text,
  payment_type text,
  gross_amount text,
  signature_verified boolean not null default false,
  raw_event jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.licenses (
  id uuid primary key default gen_random_uuid(),
  order_id text not null unique references public.orders(order_id) on delete cascade,
  license_id text not null unique,
  package_key text not null,
  license_type text not null,
  device_fingerprint text not null,
  licensed_to text not null,
  license_key text not null,
  expires_at timestamptz,
  fulfilled_at timestamptz,
  fulfilled_by text,
  created_at timestamptz not null default now()
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  order_id text references public.orders(order_id) on delete set null,
  actor text not null,
  action text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists orders_status_created_idx on public.orders(status, created_at desc);
create index if not exists orders_email_idx on public.orders(email);
create index if not exists payment_events_order_idx on public.payment_events(order_id, created_at desc);
create index if not exists audit_logs_order_idx on public.audit_logs(order_id, created_at desc);

alter table public.orders enable row level security;
alter table public.payment_events enable row level security;
alter table public.licenses enable row level security;
alter table public.audit_logs enable row level security;

revoke all on public.orders from anon, authenticated;
revoke all on public.payment_events from anon, authenticated;
revoke all on public.licenses from anon, authenticated;
revoke all on public.audit_logs from anon, authenticated;

grant usage on schema public to service_role;
grant all on public.orders to service_role;
grant all on public.payment_events to service_role;
grant all on public.licenses to service_role;
grant all on public.audit_logs to service_role;
