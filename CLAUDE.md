# Slotly — инструкции для AI-агентов

Платформа онлайн-записи к специалистам. Учебный проект: пользователь — frontend-разработчик, углубляющий backend и архитектуру; общение на русском. Прогресс и текущий шаг — [ROADMAP.md](ROADMAP.md).

## Перед изменениями

- Прочитай релевантные документы: [requirements](docs/requirements.md), [data-model](docs/architecture/data-model.md), [backend](docs/architecture/backend.md), [api](docs/architecture/api.md), [frontend](docs/architecture/frontend.md), [ADR](docs/adr/README.md).
- Изучи текущую реализацию затрагиваемого кода до правки.
- Решение, меняющее архитектуру или соглашения, требует нового ADR и согласования с пользователем.

## Архитектурные правила (нарушать нельзя)

1. `apps/web` не обращается к БД. Все данные — только через API.
2. Бизнес-правила живут только в `apps/api` (домен). Frontend показывает решения API (`allowedActions`), а не повторяет правила.
3. Таблицу читает и пишет только модуль-владелец; другие модули — через его экспортированный сервис. Граф зависимостей модулей ацикличен, `forwardRef` запрещён.
4. Слои api: controller (HTTP) → service (use case, транзакция, права) → domain (чистые функции, время — параметром) + repository (Drizzle). Controller не вызывает repository; domain не импортирует NestJS и Drizzle.
5. Каждый UPDATE статуса брони — с условием на текущий статус (compare-and-set); 0 строк = конфликт.
6. Инварианты данных — ограничениями БД; ошибки PostgreSQL (`23P01`, `23505`) переводятся в доменные ошибки в репозитории.
7. Побочные эффекты (письма) — через outbox в той же транзакции; payload содержит всё нужное для письма.
8. Ошибки API — RFC 9457 Problem Details с `code`; доменные ошибки → HTTP только в глобальном exception filter.
9. `process.env` читается только в модуле конфигурации. Секреты, пароли, токены, cookie и тела запросов не логируются.
10. Изменения данных из web — только из браузера через `/api/*`; Server Actions для изменений не используются.

## Качество

- Не ослабляй проверки: без `any`, `@ts-ignore`, отключения правил линтера без комментария-обоснования.
- Не удаляй и не ослабляй существующие тесты, чтобы новая реализация прошла.
- Не исправляй несвязанный код в рамках задачи. Временные решения — только с записью в ROADMAP или issue.
- Задача не завершена, пока не пройдены линтер, проверка типов и тесты затронутых пакетов.
- Обновляй документацию вместе с кодом, если меняется поведение, API, схема или соглашения.
- Перед выбором или обновлением библиотеки сверяйся с актуальной документацией.

## Git

- GitHub Flow: ветка от `main` → PR → squash merge. Заголовок PR — Conventional Commits (`feat(bookings): …`), проверяется в CI. Прямые коммиты в `main` не делаются.
- Не коммить и не пушь без запроса пользователя. pre-commit (husky + lint-staged) не обходить через `--no-verify`.

## Команды

- Инфраструктура: `docker compose up -d --wait` (PostgreSQL на `localhost:55432`, Mailpit UI `http://localhost:8025`).
- Проверки всего репозитория: `pnpm lint` (ESLint + границы модулей через dependency-cruiser), `pnpm typecheck`, `pnpm test`, `pnpm format:check`.
- Граф модулей api в `apps/api/.dependency-cruiser.cjs` совпадает с [backend.md](docs/architecture/backend.md) §2: новое ребро — только вместе с правкой документа и согласованием.
- api: `pnpm --filter @slotly/api dev | test | db:generate | db:migrate`; web: `pnpm --filter @slotly/web dev | build`.
- Версии зависимостей точные; скрипты установки разрешаются только через `allowBuilds` в `pnpm-workspace.yaml`; слишком свежие релизы не исключаются из `minimumReleaseAge` — берётся предыдущий патч.

# Concept Loom

For requests to learn, study, practise, understand, or receive an explanation, load the `concept-coach` skill. Use the `concept-loom` MCP tools to prepare and assess knowledge checks, maintain learning notebooks, and show Mermaid or text diagrams directly in the conversation.

Use `AskUserQuestion` to present returned checkpoint choices and to collect preferences. Do not reveal expected keys or the private rationale before the learner answers.
