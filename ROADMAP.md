# Roadmap

Платформа онлайн-записи к специалистам. Учебный full-stack проект: от идеи до production.

Легенда: ✅ готово · 🔄 в работе · ⏳ не начато

| #   | Этап                                                                | Статус | Результат                                                                 |
| --- | ------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------- |
| 1   | Discovery: идея и предметная область                                | ✅     | [docs/discovery.md](docs/discovery.md)                                    |
| 2   | Требования (функциональные, нефункциональные, MVP)                  | ✅     | [docs/requirements.md](docs/requirements.md)                              |
| 3   | Архитектура и проектирование, ADR                                   | ✅     | [docs/architecture/](docs/architecture/), [docs/adr/](docs/adr/README.md) |
| 4   | Организация разработки (репозиторий, линтеры, Docker, Git workflow) | 🔄     | —                                                                         |
| 5   | Реализация vertical slices                                          | ⏳     | —                                                                         |
| 6   | Тестирование и качество                                             | ⏳     | (сквозное, начинается с этапа 5)                                          |
| 7   | Безопасность и надёжность                                           | ⏳     | (сквозное, начинается с этапа 3)                                          |
| 8   | CI/CD                                                               | ⏳     | —                                                                         |
| 9   | Production и эксплуатация                                           | ⏳     | —                                                                         |
| 10  | Ретроспектива                                                       | ⏳     | —                                                                         |

## Текущий шаг

Этап 4 — организация разработки. План уточняется в начале этапа; первая задача — прототип, подтверждающий ADR-003/004/005 (exclusion constraint, `23P01`, тест конкурентного бронирования, `__Host-` cookie через rewrites).

Архитектура (этап 3) — завершена 2026-11-09:

1. Топология и репозиторий — [ADR-001](docs/adr/001-system-topology.md), [ADR-002](docs/adr/002-monorepo.md).
2. ORM — [ADR-004](docs/adr/004-orm-drizzle.md).
3. Модель данных — [data-model.md](docs/architecture/data-model.md), [ADR-003](docs/adr/003-double-booking-protection.md) (ждёт прототипа).
4. Аутентификация — [ADR-005](docs/adr/005-authentication-sessions.md).
5. Backend — [backend.md](docs/architecture/backend.md), [ADR-006](docs/adr/006-backend-layers-and-modules.md).
6. API — [api.md](docs/architecture/api.md), [ADR-007](docs/adr/007-api-contracts-errors-validation.md).
7. Логирование и конфигурация — [observability-and-config.md](docs/architecture/observability-and-config.md), [ADR-008](docs/adr/008-logging-and-configuration.md).
8. Frontend — [frontend.md](docs/architecture/frontend.md), [ADR-009](docs/adr/009-frontend-structure.md).

## Принятые решения

- 2026-11-04 — Идея: онлайн-запись к специалисту (платформа как Calendly).
- 2026-11-04 — Клиент бронирует только с аккаунтом; оплата вне MVP.
- 2026-11-06 — Режим подтверждения — настройка специалиста; pending-бронь занимает слот и истекает; email-уведомления в MVP; один аккаунт может быть и клиентом, и специалистом. Подробно: `docs/discovery.md` §8.
- 2026-11-09 — Язык интерфейса: русский, без i18n в MVP.
- 2026-11-09 — [ADR-001](docs/adr/001-system-topology.md): Next.js + NestJS (модульный монолит) + PostgreSQL. [ADR-002](docs/adr/002-monorepo.md): монорепозиторий на pnpm workspaces.
- 2026-11-09 — [ADR-004](docs/adr/004-orm-drizzle.md): ORM — Drizzle. Первая задача этапа 4 — прототип (exclusion constraint, `23P01`, тест конкурентного бронирования).
- 2026-11-09 — Модель данных утверждена. [ADR-005](docs/adr/005-authentication-sessions.md): серверные сессии вместо JWT; rate limit в памяти — до появления второго экземпляра backend.
- 2026-11-09 — ADR-006–009: прагматичные слои и ацикличные модули; REST + Problem Details + OpenAPI; nestjs-pino и env + Zod; frontend без Server Actions для изменений, `allowedActions` от API. Этап 3 завершён.
