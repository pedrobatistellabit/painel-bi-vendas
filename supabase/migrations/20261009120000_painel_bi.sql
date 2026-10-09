-- Painel BI Kenlo Inteligência: dados compartilhados pela equipe.
--
-- Quem acessa: só usuários logados cujo e-mail (confirmado) está em `membros`.
--   admin  -> importa planilhas, limpa dados e gerencia a equipe
--   leitor -> só visualiza
--
-- Importação: o admin cria uma `importacoes` com status 'carregando', envia as
-- linhas em lotes e chama `ativar_importacao`. Só então a nova base substitui a
-- anterior, numa única transação. Leitores nunca veem uma importação pela metade.

create table public.membros (
  email     text primary key check (email = lower(email)),
  papel     text not null default 'leitor' check (papel in ('admin', 'leitor')),
  criado_em timestamptz not null default now()
);

create table public.importacoes (
  id         bigint generated always as identity primary key,
  tipo       text not null check (tipo in ('atendimentos', 'imoveis')),
  arquivos   text[] not null default '{}',
  linhas     integer not null default 0,
  status     text not null default 'carregando' check (status in ('carregando', 'ativa', 'substituida')),
  criado_por uuid default auth.uid() references auth.users (id) on delete set null,
  criado_em  timestamptz not null default now(),
  ativada_em timestamptz
);
create unique index importacoes_uma_ativa_por_tipo on public.importacoes (tipo) where status = 'ativa';

create table public.atendimentos (
  importacao_id    bigint not null references public.importacoes (id) on delete cascade,
  linha            integer not null,
  codigo           text,
  data_lead        timestamptz,
  corretor         text,
  equipe           text,
  unidade          text,
  captador         text,
  midia            text,
  grupo_midia      text,
  pretensao        text,
  mercado          text,
  imovel_ref       text,
  empreendimento   text,
  tipo_imovel      text,
  cidade           text,
  bairro           text,
  cep              text,
  lat              double precision,
  lng              double precision,
  proprietario     text,
  data_visita      timestamptz,
  status_visita    text,
  data_proposta    timestamptz,
  status_proposta  text,
  data_fechamento  timestamptz,
  valor_fechamento numeric,
  comissao         numeric,
  primary key (importacao_id, linha)
);

create table public.imoveis (
  importacao_id bigint not null references public.importacoes (id) on delete cascade,
  linha         integer not null,
  imovel_ref    text,
  proprietario  text,
  telefone      text,
  email         text,
  endereco      text,
  cidade        text,
  bairro        text,
  tipo_imovel   text,
  pretensao     text,
  mercado       text,
  unidade       text,
  captador      text,
  valor         numeric,
  area_m2       numeric,
  status        text,
  data_cadastro timestamptz,
  primary key (importacao_id, linha)
);

-- Papel do usuário logado, ou null se ele não for membro (ou não confirmou o e-mail).
create function public.papel_atual()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select m.papel
  from public.membros m
  join auth.users u on lower(u.email) = m.email
  where u.id = auth.uid()
    and u.email_confirmed_at is not null
$$;

alter table public.membros      enable row level security;
alter table public.importacoes  enable row level security;
alter table public.atendimentos enable row level security;
alter table public.imoveis      enable row level security;

-- membros: cada um vê o próprio registro; o admin vê e altera todos.
create policy membros_select on public.membros for select to authenticated
  using (email = lower((select auth.jwt()) ->> 'email') or (select public.papel_atual()) = 'admin');
create policy membros_insert on public.membros for insert to authenticated
  with check ((select public.papel_atual()) = 'admin');
create policy membros_update on public.membros for update to authenticated
  using ((select public.papel_atual()) = 'admin') with check ((select public.papel_atual()) = 'admin');
create policy membros_delete on public.membros for delete to authenticated
  using ((select public.papel_atual()) = 'admin' and email <> lower((select auth.jwt()) ->> 'email'));

-- importacoes: membros leem; admin cria (sempre como 'carregando').
create policy importacoes_select on public.importacoes for select to authenticated
  using ((select public.papel_atual()) is not null);
create policy importacoes_insert on public.importacoes for insert to authenticated
  with check ((select public.papel_atual()) = 'admin' and status = 'carregando');

-- dados: membros leem só a base ativa; admin grava só em importação que ainda está carregando.
create policy atendimentos_select on public.atendimentos for select to authenticated
  using (
    (select public.papel_atual()) is not null
    and exists (select 1 from public.importacoes i where i.id = importacao_id and i.status = 'ativa')
  );
create policy atendimentos_insert on public.atendimentos for insert to authenticated
  with check (
    (select public.papel_atual()) = 'admin'
    and exists (select 1 from public.importacoes i where i.id = importacao_id and i.status = 'carregando' and i.tipo = 'atendimentos')
  );
create policy imoveis_select on public.imoveis for select to authenticated
  using (
    (select public.papel_atual()) is not null
    and exists (select 1 from public.importacoes i where i.id = importacao_id and i.status = 'ativa')
  );
create policy imoveis_insert on public.imoveis for insert to authenticated
  with check (
    (select public.papel_atual()) = 'admin'
    and exists (select 1 from public.importacoes i where i.id = importacao_id and i.status = 'carregando' and i.tipo = 'imoveis')
  );

-- Troca a base ativa pela importação recém-carregada e apaga as linhas da anterior.
create function public.ativar_importacao(p_id bigint)
returns public.importacoes
language plpgsql
security definer
set search_path = ''
as $$
declare
  imp public.importacoes;
  n   integer;
begin
  if public.papel_atual() is distinct from 'admin' then
    raise exception 'Somente administradores podem importar dados' using errcode = '42501';
  end if;

  select * into imp from public.importacoes where id = p_id for update;
  if not found or imp.status <> 'carregando' then
    raise exception 'Importação % não está em carregamento', p_id;
  end if;

  if imp.tipo = 'atendimentos' then
    select count(*) into n from public.atendimentos where importacao_id = p_id;
    delete from public.atendimentos where importacao_id in
      (select id from public.importacoes where tipo = imp.tipo and id <> p_id);
  else
    select count(*) into n from public.imoveis where importacao_id = p_id;
    delete from public.imoveis where importacao_id in
      (select id from public.importacoes where tipo = imp.tipo and id <> p_id);
  end if;

  update public.importacoes set status = 'substituida'
    where tipo = imp.tipo and status = 'ativa';
  -- cargas abandonadas no meio (aba fechada, erro de rede)
  delete from public.importacoes
    where tipo = imp.tipo and status = 'carregando' and id <> p_id;

  update public.importacoes
    set status = 'ativa', linhas = n, ativada_em = now()
    where id = p_id
    returning * into imp;
  return imp;
end;
$$;

-- Apaga todos os dados importados (mantém a equipe).
create function public.limpar_dados()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.papel_atual() is distinct from 'admin' then
    raise exception 'Somente administradores podem apagar dados' using errcode = '42501';
  end if;
  delete from public.importacoes where true;
end;
$$;

revoke all on public.membros, public.importacoes, public.atendimentos, public.imoveis from anon, authenticated;
grant select, insert, update, delete on public.membros to authenticated;
grant select, insert on public.importacoes, public.atendimentos, public.imoveis to authenticated;

revoke execute on function public.papel_atual(), public.ativar_importacao(bigint), public.limpar_dados() from public, anon;
grant execute on function public.papel_atual(), public.ativar_importacao(bigint), public.limpar_dados() to authenticated;
