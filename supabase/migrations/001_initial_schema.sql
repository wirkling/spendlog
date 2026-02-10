-- Enable required extensions
create extension if not exists "uuid-ossp";

-- Category enum
create type expense_category as enum (
  'gasoil',
  'restaurants_autoroute',
  'mission_receptions',
  'hotels_transport',
  'entretien_vehicules',
  'fournitures_bureaux',
  'divers',
  'salons'
);

-- Scan status enum
create type scan_status as enum ('queued', 'processing', 'completed', 'failed');

-- Salon sub-type enum
create type salon_sub_type as enum ('salons', 'sirha', 'siprho');

-- Profiles table
create table profiles (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade not null unique,
  full_name text not null default '',
  employee_id text,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- Receipts table
create table receipts (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade not null,
  receipt_date date not null,
  category expense_category not null,
  amount_ttc_cents integer not null default 0,
  amount_tva_cents integer,
  amount_ht_cents integer generated always as (amount_ttc_cents - coalesce(amount_tva_cents, 0)) stored,
  company_name text, -- for mission_receptions
  designation text, -- for divers
  divers_account_code text, -- for divers sub-account
  salon_sub_type salon_sub_type, -- for salons
  image_path text,
  scan_status scan_status not null default 'queued',
  ocr_raw_result jsonb,
  is_verified boolean not null default false,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- Scan jobs table
create table scan_jobs (
  id uuid primary key default uuid_generate_v4(),
  receipt_id uuid references receipts(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  image_path text not null,
  status scan_status not null default 'queued',
  result jsonb,
  confidence real,
  error_message text,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- Exports table
create table exports (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade not null,
  month text not null, -- YYYY-MM
  file_name text not null,
  created_at timestamptz default now() not null
);

-- Indexes
create index receipts_user_date_idx on receipts(user_id, receipt_date);
create index receipts_user_category_idx on receipts(user_id, category);
create index scan_jobs_status_idx on scan_jobs(status);
create index scan_jobs_receipt_idx on scan_jobs(receipt_id);

-- RLS Policies
alter table profiles enable row level security;
alter table receipts enable row level security;
alter table scan_jobs enable row level security;
alter table exports enable row level security;

-- Profiles: users can read/update their own
create policy "Users can view own profile" on profiles
  for select using (auth.uid() = user_id);
create policy "Users can update own profile" on profiles
  for update using (auth.uid() = user_id);
create policy "Users can insert own profile" on profiles
  for insert with check (auth.uid() = user_id);

-- Receipts: users can CRUD their own
create policy "Users can view own receipts" on receipts
  for select using (auth.uid() = user_id);
create policy "Users can insert own receipts" on receipts
  for insert with check (auth.uid() = user_id);
create policy "Users can update own receipts" on receipts
  for update using (auth.uid() = user_id);
create policy "Users can delete own receipts" on receipts
  for delete using (auth.uid() = user_id);

-- Scan jobs: users can view their own, service role can update
create policy "Users can view own scan jobs" on scan_jobs
  for select using (auth.uid() = user_id);
create policy "Users can insert own scan jobs" on scan_jobs
  for insert with check (auth.uid() = user_id);

-- Exports: users can CRUD their own
create policy "Users can view own exports" on exports
  for select using (auth.uid() = user_id);
create policy "Users can insert own exports" on exports
  for insert with check (auth.uid() = user_id);

-- Enable realtime on scan_jobs
alter publication supabase_realtime add table scan_jobs;

-- Auto-update updated_at trigger
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger receipts_updated_at
  before update on receipts
  for each row execute function update_updated_at();

create trigger scan_jobs_updated_at
  before update on scan_jobs
  for each row execute function update_updated_at();

create trigger profiles_updated_at
  before update on profiles
  for each row execute function update_updated_at();

-- Auto-create profile on user signup
create or replace function handle_new_user()
returns trigger as $$
begin
  insert into profiles (user_id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', ''));
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- Storage bucket for receipt images
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'receipt-images',
  'receipt-images',
  false,
  10485760, -- 10MB
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic']
);

-- Storage RLS: users can manage their own images
create policy "Users can upload own receipt images" on storage.objects
  for insert with check (
    bucket_id = 'receipt-images'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "Users can view own receipt images" on storage.objects
  for select using (
    bucket_id = 'receipt-images'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "Users can delete own receipt images" on storage.objects
  for delete using (
    bucket_id = 'receipt-images'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
