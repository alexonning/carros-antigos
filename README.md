# Encontro de Carros Antigos — Gestão de Presença

Sistema de controle de presença para encontro de carros antigos, com área
administrativa (login) e cadastro público para visitantes. Persistência no
Supabase (PostgreSQL + Storage + Auth + Realtime).

## Páginas

- **`index.html`** — área da organização (login). Pesquisa, check-in,
  cadastro, edição e exclusão de carros.
- **`cadastro.html`** — página pública, sem login, para os próprios donos
  cadastrarem seus carros. É o link para compartilhar com os visitantes.

## Campos do carro

Placa (única), ano, modelo, cor, dono, **proprietário**, **cidade**,
**telefone** (com máscara DDD + número), **disponível para venda (sim/não)**,
descrição e fotos.

## Como colocar no ar

### 1. Supabase
1. Crie um projeto em [supabase.com](https://supabase.com).
2. **SQL Editor → New query**: cole todo o `supabase-setup.sql` e clique em **Run**.
   Cria a tabela, os campos, as políticas de segurança (RLS), o bucket de fotos,
   o cadastro público e o tempo real.
3. **Authentication → Users → Add user**: crie os logins da equipe
   (marque *Auto Confirm User*). Em **Providers → Email**, desmarque *Enable signups*.

### 2. Credenciais
Preencha `config.js` com a *Project URL* e a chave *anon public*
(**Project Settings → API**). A chave anon é pública por design — o RLS protege os dados.

### 3. Deploy
Site estático — qualquer host serve (Vercel, Netlify, GitHub Pages).
No Vercel, basta importar o repositório; não há build.

## Segurança (RLS)

- **Organização (logada)**: lê, cria, edita e exclui tudo.
- **Visitante (sem login)**: só pode **inserir** um carro (marcado como
  `origem = 'visitante'` e não-presente) e enviar fotos. Nunca lê, edita ou
  exclui registros de ninguém.

## Estrutura

```
index.html          área logada (organização)
cadastro.html       cadastro público de visitantes
app.js              lógica da área logada
cadastro.js         lógica do cadastro público
shared.js           helpers (máscara de telefone, compressão de imagem)
styles.css          identidade visual vintage (responsiva)
config.js           credenciais do Supabase
supabase-setup.sql  script de criação do banco
```
