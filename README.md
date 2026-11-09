# Slotly

Платформа онлайн-записи к специалистам: специалист описывает услуги и расписание, клиент выбирает свободное время и бронирует. Учебный full-stack проект, который проходит полный цикл от идеи до production.

> Статус: этап 4 — организация разработки. Прогресс — в [ROADMAP.md](ROADMAP.md).

## Стек

- **web** — Next.js 16, React, TypeScript, Tailwind CSS
- **api** — NestJS, TypeScript, Drizzle ORM, PostgreSQL 18
- Монорепозиторий на pnpm workspaces, локальная инфраструктура в Docker Compose

## Документация

| Документ | Содержание |
| --- | --- |
| [docs/discovery.md](docs/discovery.md) | проблема, пользователи, аналоги, границы продукта |
| [docs/requirements.md](docs/requirements.md) | требования, MVP, жизненный цикл брони |
| [docs/architecture/](docs/architecture/) | модель данных, backend, API, frontend, логирование и конфигурация |
| [docs/adr/](docs/adr/README.md) | архитектурные решения |
| [docs/learning-log.md](docs/learning-log.md) | журнал обучения |

## Требования к окружению

- Node.js 24 (см. `.nvmrc`)
- pnpm (версия закреплена в `package.json` → `packageManager`)
- Docker с Docker Compose

## Локальный запуск

_Появится по мере настройки этапа 4._
