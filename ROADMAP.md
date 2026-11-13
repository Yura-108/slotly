# Roadmap

Платформа онлайн-записи к специалистам. Учебный full-stack проект: от идеи до production.

Легенда: ✅ готово · 🔄 в работе · ⏳ не начато

| #   | Этап                                                                | Статус | Результат                                                                                                        |
| --- | ------------------------------------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------- |
| 1   | Discovery: идея и предметная область                                | ✅     | [docs/discovery.md](docs/discovery.md)                                                                           |
| 2   | Требования (функциональные, нефункциональные, MVP)                  | ✅     | [docs/requirements.md](docs/requirements.md)                                                                     |
| 3   | Архитектура и проектирование, ADR                                   | ✅     | [docs/architecture/](docs/architecture/), [docs/adr/](docs/adr/README.md)                                        |
| 4   | Организация разработки (репозиторий, линтеры, Docker, Git workflow) | ✅     | [ADR-010](docs/adr/010-development-environment.md), [ADR-011](docs/adr/011-architecture-checks-and-git-hooks.md) |
| 5   | Реализация vertical slices                                          | ✅     | 8 срезов, PR #1–#8                                                                                               |
| 6   | Тестирование и качество                                             | ✅     | [testing.md](docs/architecture/testing.md), [ADR-013](docs/adr/013-testing-strategy.md)                          |
| 7   | Безопасность и надёжность                                           | ✅     | [security.md](docs/architecture/security.md)                                                                     |
| 8   | CI/CD                                                               | 🔄     | [ADR-017](docs/adr/017-continuous-integration.md)                                                                |
| 9   | Production и эксплуатация                                           | ⏳     | —                                                                                                                |
| 10  | Ретроспектива                                                       | ⏳     | —                                                                                                                |

## Текущий шаг

Этап 8 — CI/CD (план утверждён 2026-11-13), срез на PR:

1. ✅ CI на каждом PR и `main` ([ADR-017](docs/adr/017-continuous-integration.md)): линтер, типы, формат, `audit:prod`, секреты, дрейф контракта API, тесты, gitleaks по истории с канарейкой; actions по SHA; ruleset `main`.
2. Браузерные e2e в CI (артефакты трасс при падении); Stryker по расписанию и при изменении домена.
3. Docker-образы api и web: многоэтапная сборка, не root, smoke-проверка в CI, публикация в GHCR с provenance на `main`.

Этап 7 — безопасность и надёжность (план утверждён 2026-11-12), срез на PR:

1. ✅ Модель угроз [security.md](docs/architecture/security.md) по OWASP Top 10:2025; тест матрицы доступа по настоящей таблице маршрутов (`401` вне списка публичных, точный список публичных, `403` без `Origin`).
2. ✅ Заголовки безопасности и CSP с nonce на каждый запрос ([ADR-014](docs/adr/014-security-headers-csp.md)), HSTS в production, `Cache-Control: no-store` в API; браузерные e2e падают на любом нарушении CSP.
3. ✅ Зависимости и секреты ([ADR-015](docs/adr/015-dependencies-and-secrets.md)): `multer` исправлен обновлением Nest, `qs` — точечным `overrides`, четыре dev-уведомления приняты с причиной; `pnpm audit:prod`; secretlint в pre-commit, история проверена; Dependabot.
4. ✅ Надёжность ([ADR-016](docs/adr/016-reliability-limits-and-health.md)): тайм-ауты пула и `statement_timeout`, `503` при недоступной БД, процесс переживает перезапуск БД; тайм-ауты HTTP-сервера, лимит тела; `/health/live` и `/health/ready`; API слушает `127.0.0.1`.

Этап 7 завершён 2026-11-13.

Этап 6 — тестирование и качество (план утверждён 2026-11-12), срез на PR:

1. ✅ Стратегия и каркас: [testing.md](docs/architecture/testing.md), [ADR-013](docs/adr/013-testing-strategy.md); пакет `e2e/` с изолированным стеком; сценарий регистрации с подтверждением email по настоящему письму.
2. ✅ Сценарии бронирования в браузере: настройка специалиста, запись, подтверждение, конфликт двух браузеров, разные часовые пояса, отмена и отклонение, сброс пароля.
3. ✅ Качество: доступность (axe) и клавиатура; покрытие домена API с порогами; мутационное тестирование Stryker — 100% (11 пробелов в тестах закрыто, эквивалентные мутанты помечены).

Этап 6 завершён 2026-11-12. Следующий — этап 7: безопасность и надёжность.

Этап 5 — реализация vertical slices (план утверждён 2026-11-09). Каждый срез — от миграции до UI и тестов, отдельный PR:

1. ✅ Регистрация, вход, выход, `GET /me` (FR-1, FR-3) + основа API: Problem Details, nestjs-zod, OpenAPI и клиент web, проверка `Origin`, rate limit с адресом клиента через прокси.
2. ✅ Подтверждение email, сброс пароля, редактирование профиля (FR-2, FR-4, FR-5) + outbox, письма, фоновые задачи — [ADR-012](docs/adr/012-outbox-and-email-delivery.md).
3. ✅ Профиль специалиста и услуги (FR-10, FR-11, FR-20, FR-21), публичная страница `/book/{slug}`.
4. ✅ Недельное расписание и выходные (FR-30, FR-31).
5. ✅ Слоты (FR-40–43): `calculateSlots`, часовые пояса и переход на летнее время, выбор недели на `/book/{slug}`.
6. ✅ Создание брони (FR-50, FR-51, FR-56) + письма специалисту и клиенту.
7. ✅ Управление бронями (FR-52, FR-53, FR-55): машина состояний, `allowedActions`, списки, снимок дедлайна отмены, переход `/start` после входа.
8. ✅ Истечение pending с письмами клиентам (в том числе при создании чужой брони), надёжность писем (FR-54, FR-62), уборка сессий, токенов и outbox; общий движок фоновых задач.

Этап 5 завершён 2026-11-12. Следующий — этап 6: тестирование (Playwright, сквозные сценарии в браузере).

Готовность среза: миграция прочитана; unit-тесты домена, интеграционные тесты репозиториев и e2e-тесты API; `openapi.json` и клиент web обновлены; UI на русском с обработкой ошибок по `code`; документация и журнал обучения; PR со squash merge; `lint`, `typecheck`, `test`, `format:check` проходят. Браузерные e2e (Playwright) — этап 6.

Этап 4 — организация разработки, завершён 2026-11-09 ([ADR-010](docs/adr/010-development-environment.md)):

1. ✅ Основа репозитория, CLAUDE.md.
2. ✅ pnpm workspace, TypeScript, Prettier.
3. ✅ Docker Compose: PostgreSQL 18, Mailpit.
4. ✅ Каркас `apps/api`: конфигурация, логирование, БД, health check.
5. ✅ Прототип: exclusion constraint, `23P01`, тест конкурентного бронирования — [ADR-003](docs/adr/003-double-booking-protection.md) принят; найден и устранён deadlock при конкурентных вставках.
6. ✅ Каркас `apps/web`: rewrites `/api/*`, `__Host-` cookie через прокси на localhost подтверждена — [ADR-005](docs/adr/005-authentication-sessions.md), «Результаты прототипа».
7. ✅ Процесс: границы модулей (dependency-cruiser), pre-commit, шаблон PR, проверка заголовка PR, приватный репозиторий на GitHub — [ADR-011](docs/adr/011-architecture-checks-and-git-hooks.md).

## Отложенные задачи

- Политика паролей: сейчас от 8 символов без проверки по утёкшим базам; NIST SP 800-63B-4 для пароля как единственного фактора требует от 15. Решить вместе с UX регистрации (длина, проверка по k-anonymity API утечек) — [security.md](docs/architecture/security.md) §4, A07.
- Переход на Node 26 — начало 2027. Вместе с ним — заменить `apps/api/src/shared/zoned-time.ts` на нативный `Temporal` (в Node 24 он только за флагом `--harmony-temporal`); тесты перевода времени остаются.
- Переход на NestJS 12 и ESM в api — после поддержки NestJS 12 в nestjs-zod.
- Переход на TypeScript 7 — после поддержки в typescript-eslint, NestJS CLI и Next.js.
- ESLint 10 в `apps/web` — после поддержки в `eslint-config-next` (сейчас её плагины `eslint-plugin-react`, `-import`, `-jsx-a11y` объявляют ESLint до 9; web на ESLint 9.39, api — на 10).
- Этап 9: выбрать почтовый сервис (SMTP), настроить SPF/DKIM/DMARC домена; алерт на сообщения outbox в статусе `failed`.
- Этап 9: `TRUSTED_PROXY` под сеть хостинга (сейчас `loopback`); Swagger UI `/docs` — только вне production или за аутентификацией.
- Этап 9: адрес API в rewrites фиксируется при `next build` — выбрать сборку на окружение или `proxy.ts` с адресом во время выполнения.

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
- 2026-11-09 — Этап 4: ADR-003 и ADR-005 подтверждены прототипами; [ADR-010](docs/adr/010-development-environment.md) — окружение; [ADR-011](docs/adr/011-architecture-checks-and-git-hooks.md) — dependency-cruiser и pre-commit. Дальше — только через PR.
