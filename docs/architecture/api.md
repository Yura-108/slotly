# API: контракты, ошибки, валидация

> Статус: утверждено 2026-11-09. Решение: [ADR-007](../adr/007-api-contracts-errors-validation.md).
> Полная спецификация — `apps/api/openapi.json` (генерируется) и Swagger UI `/docs` (только вне production или за аутентификацией — решается на этапе 9).

## 1. Соглашения

- REST, JSON, ресурсы во множественном числе, пути в kebab-case, поля в camelCase.
- Время — ISO 8601 в UTC (`2026-11-10T07:00:00Z`); локальные даты (`days_off`) — `YYYY-MM-DD`.
- ID — UUID v7 в виде строки.
- Ресурсы текущего пользователя — под `/me`: владелец берётся из сессии, а не из URL (защита от IDOR).
- Смена статуса брони — отдельные action-эндпоинты (`POST /bookings/{id}/cancel`), а не `PATCH` статуса: у каждого перехода свои права, правила и тело запроса.
- Ответ с бронью содержит `allowedActions` (действия, доступные текущему пользователю сейчас) и `cancelDeadlineAt`. Frontend не повторяет бизнес-правила, а показывает действия по этому списку ([ADR-009](../adr/009-frontend-structure.md)).
- Списки: `limit` (по умолчанию 20, максимум 100) и `offset`; ответ `{ items, total }`.
- Без версии в URL. Правило совместимости: изменение API обратно совместимо как минимум на один деплой (expand → contract).

## 2. Эндпоинты (MVP)

| Метод и путь                                                          | Доступ                      | Назначение                                                     |
| --------------------------------------------------------------------- | --------------------------- | -------------------------------------------------------------- |
| `POST /auth/register`                                                 | гость                       | регистрация; одинаковый ответ для нового и существующего email |
| `POST /auth/login`                                                    | гость                       | вход, установка cookie                                         |
| `POST /auth/logout`                                                   | пользователь                | удаление сессии                                                |
| `POST /auth/verify-email`                                             | гость                       | подтверждение по токену из письма                              |
| `POST /auth/password-reset/request`                                   | гость                       | одинаковый ответ для любого email                              |
| `POST /auth/password-reset/confirm`                                   | гость                       | новый пароль по токену; удаляет все сессии                     |
| `GET /me`, `PATCH /me`                                                | пользователь                | профиль, часовой пояс                                          |
| `POST /me/specialist-profile`, `PATCH /me/specialist-profile`         | подтверждённый email        | включить/изменить профиль специалиста и настройки              |
| `GET /me/services`, `POST /me/services`                               | специалист                  | услуги, включая архивные                                       |
| `PATCH /me/services/{id}`, `POST /me/services/{id}/archive`           | специалист                  | изменить / архивировать                                        |
| `GET /me/availability`, `PUT /me/availability`                        | специалист                  | недельное расписание целиком (атомарная замена)                |
| `GET /me/days-off`, `POST /me/days-off`, `DELETE /me/days-off/{id}`   | специалист                  | выходные                                                       |
| `GET /me/bookings?as=client\|specialist&scope=upcoming\|past&status=` | пользователь                | списки броней                                                  |
| `GET /specialists/{slug}`                                             | все                         | публичный профиль                                              |
| `GET /specialists/{slug}/services`                                    | все                         | активные услуги                                                |
| `GET /specialists/{slug}/slots?serviceId=&from=&to=`                  | все                         | свободные слоты; диапазон ≤ 31 дня                             |
| `POST /bookings`                                                      | подтверждённый email        | создать бронь `{ serviceId, startAt }`                         |
| `GET /bookings/{id}`                                                  | клиент или специалист брони | детали                                                         |
| `POST /bookings/{id}/confirm`                                         | специалист брони            | `pending → confirmed`                                          |
| `POST /bookings/{id}/reject`                                          | специалист брони            | `pending → rejected`, `{ reason? }`                            |
| `POST /bookings/{id}/cancel`                                          | клиент или специалист брони | `→ cancelled`, `{ reason? }`                                   |
| `GET /health`                                                         | все                         | health check                                                   |

## 3. Ошибки — RFC 9457 Problem Details

`Content-Type: application/problem+json`

```json
{
  "type": "https://slotly.app/errors/booking-slot-taken",
  "title": "Время уже занято",
  "status": 409,
  "code": "BOOKING_SLOT_TAKEN",
  "detail": "Выбранное время только что забронировали. Выберите другой слот.",
  "requestId": "01J…",
  "errors": [{ "path": "startAt", "code": "invalid_date", "message": "…" }]
}
```

- `code` — стабильный машинный идентификатор; клиент ветвится только по нему.
- `errors` — только для ошибок валидации.
- `requestId` — также в заголовке ответа `X-Request-Id` и во всех логах запроса.
- 5xx никогда не содержат стек, SQL или внутренние сообщения.

### Сопоставление доменных ошибок и HTTP

Выполняется в одном глобальном exception filter.

| Класс ошибки           | HTTP | Примеры `code`                                                                                                          |
| ---------------------- | ---- | ----------------------------------------------------------------------------------------------------------------------- |
| `ValidationError`      | 400  | `VALIDATION_FAILED`                                                                                                     |
| `UnauthenticatedError` | 401  | `UNAUTHENTICATED`, `INVALID_CREDENTIALS`                                                                                |
| `ForbiddenError`       | 403  | `EMAIL_NOT_VERIFIED`, `SPECIALIST_PROFILE_REQUIRED`, `ORIGIN_NOT_ALLOWED`                                               |
| `NotFoundError`        | 404  | `NOT_FOUND` (в том числе чужой ресурс)                                                                                  |
| `ConflictError`        | 409  | `BOOKING_SLOT_TAKEN`, `BOOKING_STATUS_CHANGED`, `SLUG_TAKEN`                                                            |
| `BusinessRuleError`    | 422  | `CANCEL_DEADLINE_PASSED`, `PENDING_LIMIT_REACHED`, `SLOT_NOT_AVAILABLE`, `CANNOT_BOOK_SELF`, `TOKEN_INVALID_OR_EXPIRED` |
| rate limit             | 429  | `RATE_LIMITED` (+ `Retry-After`)                                                                                        |
| прочее                 | 500  | `INTERNAL_ERROR`                                                                                                        |

Принципы выбора:

- **400 vs 422:** 400 — запрос некорректен сам по себе; 422 — корректен, но бизнес-правило не позволяет выполнить его сейчас.
- **409 vs 422:** 409 — конфликт с конкурентным изменением (повтор с обновлёнными данными может помочь); 422 — правило (повтор того же запроса не поможет).

## 4. Валидация

| Уровень      | Что                               | Где                                                                         |
| ------------ | --------------------------------- | --------------------------------------------------------------------------- |
| Граница HTTP | форма: типы, длины, enum, форматы | Zod-схемы DTO (`createZodDto`), глобальный `ZodValidationPipe` (nestjs-zod) |
| Домен        | бизнес-правила                    | доменные функции и сервисы                                                  |
| БД           | инварианты                        | ограничения ([data-model.md](data-model.md))                                |

Frontend-валидация — только для UX; источник истины — API.

Ответы тоже описываются Zod-схемами: это документирует их в OpenAPI и не даёт случайно отдать лишние поля (например, `passwordHash`).

## 5. Контракт для frontend

1. Zod-схемы DTO → `@nestjs/swagger` + `cleanupOpenApiDoc` (nestjs-zod) → `apps/api/openapi.json` (OpenAPI 3.1, коммитится).
2. `openapi-typescript` → типы в `apps/web`.
3. `openapi-fetch` → типизированный клиент: пути, параметры, тело, ответы и ошибки (`application/problem+json`).
4. CI перегенерирует `openapi.json` и типы и падает, если они отличаются от закоммиченных.

## 6. Отложено сознательно

- **Idempotency-Key для `POST /bookings`.** Дубль брони невозможен благодаря exclusion constraint; повторный запрос получит 409. В MVP: кнопка блокируется на время запроса. Полная идемпотентность — после MVP.
- Курсорная пагинация — при росте списков.
