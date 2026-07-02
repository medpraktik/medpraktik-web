create table if not exists public.activation_requests (
  id uuid primary key default gen_random_uuid(),
  activation_code text not null unique,
  package_key text not null,
  package_label text not null,
  buyer_name text,
  practice_name text,
  whatsapp text,
  email text,
  midtrans_payment_id text,
  device_fingerprint text,
  payment_status text not null default 'menunggu_verifikasi',
  activation_status text not null default 'draft',
  license_id text,
  license_type text,
  license_key text,
  buyer_notes text,
  admin_notes text,
  source text not null default 'cloudflare_payment_link',
  license_sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.activation_events (
  id uuid primary key default gen_random_uuid(),
  activation_code text not null references public.activation_requests(activation_code) on delete cascade,
  actor text not null,
  action text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists activation_requests_status_created_idx
  on public.activation_requests(activation_status, created_at desc);

create index if not exists activation_requests_payment_idx
  on public.activation_requests(payment_status, created_at desc);

create index if not exists activation_requests_contact_idx
  on public.activation_requests(email, whatsapp);

create index if not exists activation_events_code_created_idx
  on public.activation_events(activation_code, created_at desc);

alter table public.activation_requests enable row level security;
alter table public.activation_events enable row level security;

revoke all on public.activation_requests from anon, authenticated;
revoke all on public.activation_events from anon, authenticated;

grant all on public.activation_requests to service_role;
grant all on public.activation_events to service_role;
