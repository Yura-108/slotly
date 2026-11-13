# Slotly

Платформа онлайн-записи к специалистам: специалист описывает услуги и расписание, клиент выбирает свободное время и бронирует. Учебный full-stack проект, который проходит полный цикл от идеи до production.

> Статус: этап 4 — организация разработки. Прогресс — в [ROADMAP.md](ROADMAP.md).

## Стек

- **web** — Next.js 16, React, TypeScript, Tailwind CSS
- **api** — NestJS, TypeScript, Drizzle ORM, PostgreSQL 18
- Монорепозиторий на pnpm workspaces, локальная инфраструктура в Docker Compose

## Документация

| Документ                                     | Содержание                                                                      |
| -------------------------------------------- | ------------------------------------------------------------------------------- |
| [docs/discovery.md](docs/discovery.md)       | проблема, пользователи, аналоги, границы продукта                               |
| [docs/requirements.md](docs/requirements.md) | требования, MVP, жизненный цикл брони                                           |
| [docs/architecture/](docs/architecture/)     | модель данных, backend, API, frontend, логирование и конфигурация, тестирование |
| [docs/adr/](docs/adr/README.md)              | архитектурные решения                                                           |
| [docs/learning-log.md](docs/learning-log.md) | журнал обучения                                                                 |

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
pnpm --filter @slotly/api db:migrate  # применить миграции к локальной БД
pnpm --filter @slotly/api dev       # http://127.0.0.1:4000/health/ready
```

### web

```bash
cp apps/web/.env.example apps/web/.env
pnpm --filter @slotly/web dev       # http://localhost:3000, /api/* проксируется в api
```

Адрес api (`API_INTERNAL_URL`) фиксируется при `next build`: после его смены сборку нужно повторить.

## Команды

| Команда                                      | Что делает                                                                                                                                |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm lint` / `typecheck` / `test`           | проверки во всех пакетах                                                                                                                  |
| `pnpm format` / `format:check`               | Prettier                                                                                                                                  |
| `pnpm test:e2e`                              | браузерные e2e (Playwright) на изолированном стеке; нужен Docker, один раз — `pnpm --filter @slotly/e2e exec playwright install chromium` |
| `pnpm test:e2e:report`                       | открыть HTML-отчёт последнего прогона e2e                                                                                                 |
| `pnpm --filter @slotly/api test:coverage`    | покрытие домена API unit-тестами (пороги)                                                                                                 |
| `pnpm --filter @slotly/api test:mutation`    | мутационное тестирование домена (Stryker, ~3 мин)                                                                                         |
| `pnpm --filter @slotly/api dev`              | api с hot reload                                                                                                                          |
| `pnpm --filter @slotly/web dev`              | web с hot reload                                                                                                                          |
| `pnpm --filter @slotly/api db:generate`      | сгенерировать SQL-миграцию по схеме                                                                                                       |
| `pnpm --filter @slotly/api db:migrate`       | применить миграции                                                                                                                        |
| `pnpm --filter @slotly/api openapi:generate` | обновить контракт `apps/api/openapi.json`                                                                                                 |
| `pnpm --filter @slotly/web api:types`        | типы клиента web из `openapi.json`                                                                                                        |

## Процесс разработки

- GitHub Flow: ветка от `main` → Pull Request → squash merge. Заголовок PR — в формате [Conventional Commits](https://www.conventionalcommits.org/) (`feat(bookings): …`), его проверяет CI.
- CI ([ADR-017](docs/adr/017-continuous-integration.md)) на каждом PR: линтер, типы, формат, аудит, секреты, актуальность контракта API, тесты, gitleaks по истории. В `main` — только через PR с зелёными проверками.
- `pnpm install` ставит pre-commit hook: Prettier и ESLint для staged-файлов, secretlint — поиск секретов ([ADR-015](docs/adr/015-dependencies-and-secrets.md)).
- `pnpm audit:prod` — уязвимости production-зависимостей; `pnpm secrets:check` — секреты во всём рабочем дереве.
- `pnpm lint` проверяет и границы модулей (dependency-cruiser): см. [ADR-011](docs/adr/011-architecture-checks-and-git-hooks.md).
