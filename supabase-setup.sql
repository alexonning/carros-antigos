-- =====================================================================
--  ENCONTRO DE CARROS ANTIGOS — Setup completo do Supabase
--  Cole tudo no SQL Editor do Supabase e execute (Run).
--  Já inclui os campos novos (proprietário, cidade, telefone, à venda)
--  e o cadastro público de visitantes.
-- =====================================================================

-- ---------- TABELA ----------
create table if not exists public.carros (
  id            uuid primary key default gen_random_uuid(),
  placa         text        not null unique,
  ano           int         not null check (ano between 1800 and 2100),
  modelo        text        not null,
  cor           text        not null,
  dono          text        not null,
  proprietario  text        not null default '',
  cidade        text        not null default '',
  telefone      text        not null default '',
  a_venda       boolean     not null default false,
  origem        text        not null default 'organizador',
  descricao     text        not null default '',
  fotos         text[]      not null default '{}',
  presente      boolean     not null default false,
  checkin_em    timestamptz,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

-- Se a tabela já existia, garante as colunas novas:
alter table public.carros add column if not exists proprietario text not null default '';
alter table public.carros add column if not exists cidade       text not null default '';
alter table public.carros add column if not exists telefone     text not null default '';
alter table public.carros add column if not exists a_venda      boolean not null default false;
alter table public.carros add column if not exists origem       text not null default 'organizador';

-- Se a tabela já existia com o limite antigo (1900), libera a partir de 1800.
-- O teto continua 1900+200 porque um CHECK não pode usar o ano corrente
-- (não é imutável) — quem barra o futuro é a validação do formulário.
alter table public.carros drop constraint if exists carros_ano_check;
alter table public.carros add  constraint carros_ano_check check (ano between 1800 and 2100);

create index if not exists carros_presente_idx  on public.carros (presente);
create index if not exists carros_criado_em_idx on public.carros (criado_em desc);

-- ---------- atualizado_em automático ----------
create or replace function public.touch_atualizado_em()
returns trigger language plpgsql as $$
begin new.atualizado_em = now(); return new; end; $$;

drop trigger if exists trg_carros_touch on public.carros;
create trigger trg_carros_touch before update on public.carros
  for each row execute function public.touch_atualizado_em();

-- ---------- SEGURANÇA (RLS) ----------
alter table public.carros enable row level security;

-- Organização (logada) lê tudo:
drop policy if exists "carros_select_autenticado" on public.carros;
create policy "carros_select_autenticado"
  on public.carros for select to authenticated using (true);

-- Organização insere/edita/exclui:
drop policy if exists "carros_insert_autenticado" on public.carros;
create policy "carros_insert_autenticado"
  on public.carros for insert to authenticated with check (true);

drop policy if exists "carros_update_autenticado" on public.carros;
create policy "carros_update_autenticado"
  on public.carros for update to authenticated using (true) with check (true);

drop policy if exists "carros_delete_autenticado" on public.carros;
create policy "carros_delete_autenticado"
  on public.carros for delete to authenticated using (true);

-- Visitante (sem login) SÓ pode inserir, e só como 'visitante' e não-presente.
-- Ele nunca lê, edita ou exclui nada.
drop policy if exists "carros_insert_publico" on public.carros;
create policy "carros_insert_publico"
  on public.carros for insert to anon
  with check (origem = 'visitante' and presente = false);

-- ---------- STORAGE DAS FOTOS ----------
insert into storage.buckets (id, name, public)
values ('carros-fotos', 'carros-fotos', true)
on conflict (id) do update set public = true;

drop policy if exists "fotos_leitura_publica" on storage.objects;
create policy "fotos_leitura_publica"
  on storage.objects for select using (bucket_id = 'carros-fotos');

drop policy if exists "fotos_upload_autenticado" on storage.objects;
create policy "fotos_upload_autenticado"
  on storage.objects for insert to authenticated with check (bucket_id = 'carros-fotos');

-- Visitante pode enviar fotos do próprio carro:
drop policy if exists "fotos_upload_publico" on storage.objects;
create policy "fotos_upload_publico"
  on storage.objects for insert to anon with check (bucket_id = 'carros-fotos');

drop policy if exists "fotos_update_autenticado" on storage.objects;
create policy "fotos_update_autenticado"
  on storage.objects for update to authenticated
  using (bucket_id = 'carros-fotos') with check (bucket_id = 'carros-fotos');

drop policy if exists "fotos_delete_autenticado" on storage.objects;
create policy "fotos_delete_autenticado"
  on storage.objects for delete to authenticated using (bucket_id = 'carros-fotos');

-- ---------- TEMPO REAL ----------
do $$ begin
  alter publication supabase_realtime add table public.carros;
exception when duplicate_object then null; end; $$;

-- =====================================================================
--  Depois: crie os usuários da equipe em Authentication → Users
--  (marque "Auto Confirm User") e desmarque "Enable signups".
-- =====================================================================
