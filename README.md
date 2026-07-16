# Checklist USA — SAMU Salvador

Checklist diário de materiais e equipamentos das USAs, feito pelo médico de plantão direto do celular — **checklist.mnrs.com.br**. Evolução do checklist que existia no [samu-normas](https://github.com/caiooliveirac/samu-normas) (`docs/checklist.md` continua sendo a fonte de verdade dos itens, copiada em `server/data/`).

## Como funciona

- **Painel** (`/`): as 12 USAs com o **médico de plantão em tempo real** (lido do banco do [plantoes](https://plantoes.mnrs.com.br), read-only) e o status do checklist do dia.
- **Checklist** (`/b/SM01`): wizard mobile item a item por seção — toque = conforme, botão lateral = falta/observação; lacre e datas como campos. Rascunho salvo no aparelho.
- **Bot Telegram** (`@samu_checklists_bot`):
  - avisa o admin na hora em que cada USA conclui (com itens faltando, se houver);
  - digest automático às **11h e 13h** (America/Bahia) com quem fez / não fez, apontando o médico de plantão pendente com link de contato (resolvido pelas mensagens do grupo do plantões);
  - comandos guiados: `/status`, `/pendentes`, `/faltas` (+ teclado fixo). `/admin <código>` registra novos admins.

## Stack

React 19 + Vite + Tailwind 4 + framer-motion (visual do samu-normas) · Fastify + grammY + Postgres (croner para os digests) · container único servindo API + SPA na porta 3030.

## Dev

```bash
npm install
npm run dev:server   # API em 127.0.0.1:3030 (usa .env / defaults)
npm run dev:web      # Vite em 5173 com proxy /api
npm test             # vitest (parser, matching, digest)
npm run typecheck
```

## Deploy

Push na `main` → GitHub Actions (`.github/workflows/deploy.yml`): typecheck+testes+build → rsync para o servidor (magalu) → `scripts/deploy.sh` faz build da imagem, **canary** com healthcheck em 3031 (bot desligado) e swap em 3030 com rollback automático. Nginx roteia `checklist.mnrs.com.br → 127.0.0.1:3030` (mapa em `/etc/nginx/sites-enabled/mnrs.conf`).

Segredos ficam só no servidor, em `/home/ubuntu/checklist/.deploy-env` (ver `.env.example`). Secrets do repo: `PROD_SSH_HOST`, `PROD_SSH_USER`, `PROD_SSH_KEY` (chave dedicada de CI).

## Integração com o plantoes

Usuário Postgres `checklist` com `GRANT SELECT` em `operations_v2.intervention_bases`, `intervention_occupancies`, `doctors` e `telegram_ingested_messages` no banco `plantoes` — de onde vêm o plantonista ativo por base (`ended_at IS NULL`) e o `telegram_user_id` provável (match de nome nas mensagens recentes do grupo).
