# Architecture Decision Records

ADR фиксирует значимое архитектурное решение: контекст, рассмотренные варианты, выбор и последствия. ADR не редактируются задним числом: если решение меняется, пишется новый ADR со статусом «заменяет ADR-NNN», а старый получает статус «заменён».

Шаблон: [template.md](template.md).

| №                                               | Решение                                                                                                  | Статус  | Дата       |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ------- | ---------- |
| [001](001-system-topology.md)                   | Топология: Next.js + NestJS API (модульный монолит) + PostgreSQL                                         | Принято | 2026-11-09 |
| [002](002-monorepo.md)                          | Монорепозиторий на pnpm workspaces                                                                       | Принято | 2026-11-09 |
| [003](003-double-booking-protection.md)         | Защита от двойного бронирования: exclusion constraint + истечение pending при записи                     | Принято | 2026-11-09 |
| [004](004-orm-drizzle.md)                       | ORM: Drizzle + drizzle-kit                                                                               | Принято | 2026-11-09 |
| [005](005-authentication-sessions.md)           | Аутентификация: серверные сессии в `__Host-` cookie, Argon2id                                            | Принято | 2026-11-09 |
| [006](006-backend-layers-and-modules.md)        | Backend: прагматичные слои, модули с владением таблицами, ацикличные зависимости                         | Принято | 2026-11-09 |
| [007](007-api-contracts-errors-validation.md)   | API: REST + `/me`, Problem Details, Zod, OpenAPI → openapi-typescript                                    | Принято | 2026-11-09 |
| [008](008-logging-and-configuration.md)         | Логирование nestjs-pino, конфигурация env + Zod, токены из писем во фрагменте URL                        | Принято | 2026-11-09 |
| [009](009-frontend-structure.md)                | Frontend: RSC для чтения, изменения только через `/api/*`, `allowedActions` от API                       | Принято | 2026-11-09 |
| [010](010-development-environment.md)           | Окружение: Node 24, pnpm, PostgreSQL 18, инфра в Docker, ESLint + Prettier, GitHub Flow                  | Принято | 2026-11-09 |
| [011](011-architecture-checks-and-git-hooks.md) | Проверка границ: dependency-cruiser; pre-commit: husky + lint-staged                                     | Принято | 2026-11-09 |
| [012](012-outbox-and-email-delivery.md)         | Outbox в PostgreSQL, обработчик с арендой, SMTP через nodemailer                                         | Принято | 2026-11-10 |
| [013](013-testing-strategy.md)                  | Тестирование: уровни; браузерные e2e на Playwright против изолированного стека                           | Принято | 2026-11-12 |
| [014](014-security-headers-csp.md)              | Заголовки безопасности; CSP с nonce на каждый запрос, `no-store` в API                                   | Принято | 2026-11-12 |
| [015](015-dependencies-and-secrets.md)          | Уязвимые зависимости: правило разбора, `audit --prod`, Dependabot; secretlint в pre-commit               | Принято | 2026-11-12 |
| [016](016-reliability-limits-and-health.md)     | Тайм-ауты базы и HTTP, лимит тела, `503` без базы, liveness/readiness, `HOST`                            | Принято | 2026-11-13 |
| [017](017-continuous-integration.md)            | CI на каждом PR и `main`: actions по SHA, канарейка gitleaks, ruleset `main`                             | Принято | 2026-11-13 |
| [018](018-container-images.md)                  | Docker-образы api и web; адрес API при запуске (`proxy.ts`); миграции отдельным шагом; GHCR с provenance | Принято | 2026-11-13 |
