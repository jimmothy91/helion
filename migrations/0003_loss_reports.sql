create table if not exists loss_reports (
  id text primary key,
  build text not null,
  bot text not null,
  map text not null,
  card text not null,
  created_at timestamptz not null default now()
);
