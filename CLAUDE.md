# checklist — orientações para agentes

App do checklist diário das USAs (checklist.mnrs.com.br). Monorepo npm workspaces: `server/` (Fastify+grammY+pg) e `web/` (React 19+Vite+Tailwind 4).

## Comandos

- `npm install` na raiz (workspaces)
- `npm run typecheck` · `npm test` (vitest em server/test) · `npm run build`
- Dev: `npm run dev:server` (3030) + `npm run dev:web` (5173, proxy /api)

## Regras do projeto

- **Itens do checklist**: `server/data/checklist.md` é a fonte de verdade (formato herdado do samu-normas: `## N. GRUPO` + `- [ ] ITEM`); `checklist_compact.md` tem os rótulos curtos na MESMA ordem/quantidade. Editar os dois juntos.
- **Fuso**: tudo em America/Bahia (`server/src/day.ts`); digests via croner em `index.ts`.
- **plantoes**: acesso somente-leitura (usuário pg `checklist`, GRANT SELECT). Não escrever no banco do plantoes. Queries em `server/src/plantoes.ts`.
- **Bot**: long polling; NUNCA rodar duas instâncias com polling (conflito getUpdates) — canary usa `BOT_MODE=disabled`.
- **Segredos**: só em `/home/ubuntu/checklist/.deploy-env` no servidor; nada de tokens no repo.
- **Deploy**: push na main → Actions → rsync + `scripts/deploy.sh` (canary 3031 → swap 3030). Nginx: mapa `$host→porta` em `/etc/nginx/sites-enabled/mnrs.conf` no servidor magalu.
- Visual: paleta brand #C73227 / accent #DF4E24 (escala em `web/src/index.css`), fundo slate-50 com marca d'água SAMU — manter consistência com mnrs.com.br/manual.
