create table if not exists map_library (
  id text primary key,
  payload text not null,
  updated_at timestamptz not null default now()
);
