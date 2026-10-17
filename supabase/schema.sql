-- Cole este arquivo inteiro no SQL Editor do Supabase e clique em "Run".

create table if not exists public.meetings (
  id         text primary key,
  room       smallint not null check (room in (1, 2)),
  date       text not null,            -- 'YYYY-MM-DD'
  start_min  smallint not null,        -- minutos desde 00:00 (480 = 08:00)
  end_min    smallint not null,
  name       text not null,
  people     smallint not null default 1,
  bu         text not null default '',
  company    text not null default '',
  updated_at timestamptz not null default now(),
  check (end_min > start_min)
);

-- Impede duas reuniões sobrepostas na mesma sala e dia (garantia no banco).
create extension if not exists btree_gist;
alter table public.meetings drop constraint if exists meetings_no_overlap;
alter table public.meetings add constraint meetings_no_overlap
  exclude using gist (
    room with =,
    date with =,
    int4range(start_min::int, end_min::int) with &&
  );

-- Acesso aberto com a chave pública (adequado a um evento curto e link interno).
alter table public.meetings enable row level security;
drop policy if exists "sial_read"   on public.meetings;
drop policy if exists "sial_write"  on public.meetings;
drop policy if exists "sial_update" on public.meetings;
drop policy if exists "sial_delete" on public.meetings;
create policy "sial_read"   on public.meetings for select using (true);
create policy "sial_write"  on public.meetings for insert with check (true);
create policy "sial_update" on public.meetings for update using (true);
create policy "sial_delete" on public.meetings for delete using (true);

-- Tempo real: avisa os outros aparelhos a cada mudança.
alter publication supabase_realtime add table public.meetings;
