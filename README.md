# Slotly

Платформа онлайн-записи к специалистам: специалист описывает услуги и расписание, клиент выбирает свободное время и бронирует. Учебный full-stack проект, который проходит полный цикл от идеи до production.

> Статус: этап 4 — организация разработки. Прогресс — в [ROADMAP.md](ROADMAP.md).

## Стек

- **web** — Next.js 16, React, TypeScript, Tailwind CSS
- **api** — NestJS, TypeScript, Drizzle ORM, PostgreSQL 18
- Монорепозиторий на pnpm workspaces, локальная инфраструктура в Docker Compose

## Документация

| Документ                                     | Содержание                                                        |
| -------------------------------------------- | ----------------------------------------------------------------- |
| [docs/discovery.md](docs/discovery.md)       | проблема, пользователи, аналоги, границы продукта                 |
| [docs/requirements.md](docs/requirements.md) | требования, MVP, жизненный цикл брони                             |
| [docs/architecture/](docs/architecture/)     | модель данных, backend, API, frontend, логирование и конфигурация |
| [docs/adr/](docs/adr/README.md)              | архитектурные решения                                             |
| [docs/learning-log.md](docs/learning-log.md) | журнал обучения                                                   |

## Требования к окружению

- Node.js 24 (см. `.nvmrc`)
- pnpm (версия закреплена в `package.json` → `packageManager`)
- Docker с Docker Compose

## Локальный запуск

```bash
pnpm install
docker compose up -d --wait   # PostgreSQL 18 (localhost:55432) и Mailpit
```

| Сервис     | Адрес                                                               |
| ---------- | ------------------------------------------------------------------- |
| PostgreSQL | `postgres://slotly:slotly@localhost:55432/slotly` (только локально) |
| Mailpit UI | http://localhost:8025 — письма, отправленные приложением            |

Остановить инфраструктуру: `docker compose down` (данные БД сохраняются в volume; `docker compose down -v` удаляет их).

### api

```bash
cp apps/api/.env.example apps/api/.env
pnpm --filter @slotly/api dev       # http://localhost:4000/health
```

### web

```bash
cp apps/web/.env.example apps/web/.env
pnpm --filter @slotly/web dev       # http://localhost:3000, /api/* проксируется в api
```

Адрес api (`API_INTERNAL_URL`) фиксируется при `next build`: после его смены сборку нужно повторить.

## Команды

| Команда                                 | Что делает                          |
| --------------------------------------- | ----------------------------------- |
| `pnpm lint` / `typecheck` / `test`      | проверки во всех пакетах            |
| `pnpm format` / `format:check`          | Prettier                            |
| `pnpm --filter @slotly/api dev`         | api с hot reload                    |
| `pnpm --filter @slotly/web dev`         | web с hot reload                    |
| `pnpm --filter @slotly/api db:generate` | сгенерировать SQL-миграцию по схеме |
| `pnpm --filter @slotly/api db:migrate`  | применить миграции                  |
