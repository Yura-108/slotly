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
| `POST /auth/verify-email/resend`                                      | пользователь                | новая ссылка подтверждения (прежние гасятся)                   |
| `POST /auth/password-reset/request`                                   | гость                       | одинаковый ответ для любого email                              |
| `POST /auth/password-reset/confirm`                                   | гость                       | новый пароль по токену; удаляет все сессии                     |
| `GET /me`, `PATCH /me`                                                | пользователь                | профиль, часовой пояс                                          |
| `GET /me/specialist-profile`                                          | пользователь                | свой профиль специалиста; 404, если не включён                 |
| `POST /me/specialist-profile`, `PATCH /me/specialist-profile`         | подтверждённый email        | включить/изменить профиль специалиста и настройки              |
| `GET /me/services`, `POST /me/services`                               | специалист                  | услуги, включая архивные                                       |
| `PATCH /me/services/{id}`, `POST /me/services/{id}/archive`           | специалист                  | изменить / архивировать                                        |
| `GET /me/availability`, `PUT /me/availability`                        | специалист                  | недельное расписание целиком (атомарная замена)                |
| `GET /me/days-off`, `POST /me/days-off`, `DELETE /me/days-off/{id}`   | специалист                  | выходные                                                       |
| `GET /me/bookings?as=client\|specialist&scope=upcoming\|past&status=` | пользователь                | списки броней                                                  |
| `GET /specialists/{slug}`                                             | все                         | публичный профиль                                              |
| `GET /specialists/{slug}/services`                                    | все                         | активные услуги                                                |
| `GET /specialists/{slug}/slots?serviceId=&from=&to=`                  | все                         | свободные слоты; `[from, to)` — моменты, ≤ 31 дня              |
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

Реализация (`apps/api/src/infrastructure/http/problem-details.ts`):

- Категория ошибки — базовый класс в `shared/domain-error.ts` (`UnauthenticatedError`, `ForbiddenError`, `NotFoundError`, `ConflictError`, `BusinessRuleError`). `message` доменной ошибки — текст для пользователя на русском, он становится `detail`. Доменная ошибка без категории считается ошибкой программы → 500.
- Ошибки фреймворка (неизвестный маршрут, битый JSON, неподдерживаемый метод) сохраняют статус и получают общий код: `NOT_FOUND`, `BAD_REQUEST`, `METHOD_NOT_ALLOWED`, `PAYLOAD_TOO_LARGE`, `UNSUPPORTED_MEDIA_TYPE`, иначе `HTTP_ERROR`.
- Ответ, не совпавший со своей Zod-схемой, — 500 (ошибка API, а не клиента).
- `type` — `https://slotly.app/errors/<code-в-kebab-case>`; `title` — по статусу, на русском.

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

Команды: `pnpm --filter @slotly/api openapi:generate` (собирает api и пишет `openapi.json`; нужна валидная конфигурация — `.env` или переменные окружения, к БД не подключается), затем `pnpm --filter @slotly/web api:types` (`src/shared/api/schema.d.ts`). Ошибки в клиенте типизированы как `ProblemDetails`. Ответы с `@ZodResponse` получают в схеме суффикс `_Output` (`Me_Output`) — так nestjs-zod отличает схему ответа от схемы запроса.

## 5a. Аутентификация (реализовано в срезе 1)

- **Все маршруты закрыты по умолчанию**: глобальный `SessionGuard` требует сессию, открытые маршруты помечены `@Public()`. Забытый декоратор приводит к 401, а не к утечке.
- `POST /auth/register` → `202` без тела — одинаково для нового и занятого email; хэш пароля вычисляется в обоих случаях до `INSERT`.
- `POST /auth/login` → `204` + `Set-Cookie: __Host-session=…; Max-Age=7776000; Path=/; HttpOnly; Secure; SameSite=Lax`. `Max-Age` равен абсолютному сроку (90 дней); скользящий срок (30 дней) проверяет сервер.
- `POST /auth/logout` → `204`, открытый маршрут: выход с уже истёкшей сессией тоже очищает cookie.
- `GET /me` → `{ id, email, name, timezone, emailVerified }`.

## 5b. Письма и токены (срез 2)

- Регистрация: пользователь, токен подтверждения и письмо — одна транзакция. Для занятого email вместо этого письмо «аккаунт уже существует»; ответ API тот же.
- `POST /auth/verify-email` → `204`; неизвестный, истёкший или использованный токен — `422 TOKEN_INVALID_OR_EXPIRED` (один ответ на все три случая).
- `POST /auth/verify-email/resend` → `204`, ничего не делает, если email уже подтверждён.
- `POST /auth/password-reset/request` → `202` для любого email; `…/confirm` → `204`: новый пароль, токен погашен, **все** сессии удалены, cookie очищена, email считается подтверждённым (ссылка доказала владение адресом).
- `PATCH /me` `{ name?, timezone? }` → `200` с профилем; пустое тело — `400`.
- Все эндпоинты с токенами и паролями ограничены rate limit входа (10 в минуту на IP).
- Rate limit по IP клиента: базовый — 120 запросов в минуту на любой маршрут, вход и регистрация — 10 в минуту.

## 5c. Профиль специалиста и услуги (срез 3)

- `POST /me/specialist-profile` → `201`; без подтверждённого email — `403 EMAIL_NOT_VERIFIED`; повторно — `409 SPECIALIST_PROFILE_EXISTS`; занятый адрес — `409 SLUG_TAKEN` (и при `PATCH`). Часовой пояс по умолчанию — пояс пользователя, настройки записи — значения по умолчанию из модели данных.
- `/me/services*` без профиля специалиста — `403 SPECIALIST_PROFILE_REQUIRED`. Чужая или несуществующая услуга — `404 NOT_FOUND` (одинаковый ответ). Изменение архивной — `422 SERVICE_ARCHIVED`; архивирование идемпотентно (`204`), физического удаления нет.
- Списки услуг — конверт `{ items, total }` без пагинации (у специалиста единицы услуг): пагинацию можно добавить без несовместимого изменения.
- Публичные `GET /specialists/{slug}` и `…/services` не раскрывают настройки записи и архивные услуги.

## 5d. Расписание и выходные (срез 4)

- `PUT /me/availability` `{ intervals: [{ weekday: 1..7, start: "HH:MM", end: "HH:MM" }] }` заменяет неделю целиком (атомарно) и возвращает её отсортированной вместе с `timezone` специалиста. Время — локальное время специалиста; `"24:00"` — конец дня; соседние интервалы (`[)`) допустимы.
- Пересечение интервалов одного дня — `400 VALIDATION_FAILED` с путём `intervals.N` второго из пересекающихся; ограничение БД — страховка (`409 SCHEDULE_OVERLAP`).
- Одновременные `PUT` одного специалиста выстраиваются в очередь (advisory-блокировка): сохраняется одна из недель целиком, без смешения.
- `POST /me/days-off` `{ date: "YYYY-MM-DD" }` — локальная дата специалиста; прошлое — `422 DAY_OFF_IN_PAST` («сегодня» — по поясу специалиста), дубль — `409 DAY_OFF_EXISTS`. `GET` возвращает выходные начиная с сегодняшнего дня.
- Изменение расписания и выходные не затрагивают существующие брони.

## 5e. Слоты (срез 5)

- `GET /specialists/{slug}/slots?serviceId=&from=&to=` — публичный. `from` и `to` — **моменты** ISO 8601 со смещением, а не даты: «пятница» клиента во Владивостоке и специалиста в Берлине начинается в разные моменты, поэтому клиент сам передаёт границы своих дней. Диапазон полуоткрытый `[from, to)`, не длиннее 31 дня; иначе — `400 VALIDATION_FAILED` с путём `to`.
- Ответ `{ items: [{ start, end }], total }`, время в UTC (FR-43), слоты отсортированы. В диапазон попадают слоты, **начинающиеся** в `[from, to)`.
- Неизвестный `slug`, а также чужая, архивная или несуществующая услуга — `404 NOT_FOUND`: клиент не отличает их друг от друга.
- Сетка — по местным часам специалиста от начала рабочего интервала с шагом, равным длительности услуги (FR-42). Несуществующее при весеннем переводе время пропускается; повторяющееся при осеннем — только первое наступление, без дублей. Слоты одного дня не пересекаются.
- Из сетки убираются выходные (по местной дате специалиста), активные брони (`confirmed` и `pending` с `expires_at > now` — эффективный статус), слоты раньше `now + min_notice` и не раньше `now + horizon`. Сетка от этого не сдвигается.

## 5f. Создание брони (срез 6)

- `POST /bookings { serviceId, startAt }` → `201 Booking` (`id`, `status`, `serviceName`, `startAt`, `endAt`, `expiresAt`, `specialist { slug, displayName }`). Статус — `confirmed` или `pending` по настройке специалиста; `expiresAt = min(создание + 24 ч, начало)` только у `pending`.
- `startAt` должен совпадать с началом слота из `GET /specialists/{slug}/slots`: проверка — та же функция расчёта, без учёта занятости. Иначе — `422 SLOT_NOT_AVAILABLE` (не на сетке, выходной, раньше минимального времени, за горизонтом). Занятость решает БД: `409 BOOKING_SLOT_TAKEN`.
- `403 EMAIL_NOT_VERIFIED` — у клиента не подтверждён email; `422 CANNOT_BOOK_SELF`; `422 PENDING_LIMIT_REACHED` — уже 3 активные заявки к этому специалисту (только при создании `pending`); `404 NOT_FOUND` — услуга архивная или не существует.
- Rate limit — 20 запросов в минуту с адреса клиента.
- В той же транзакции в outbox ставятся два письма: специалисту (`booking.new_for_specialist`, с пометкой о подтверждении) и клиенту (`booking.created_for_client`). Время в каждом письме — в поясе получателя.

## 6. Отложено сознательно

- **Idempotency-Key для `POST /bookings`.** Дубль брони невозможен благодаря exclusion constraint; повторный запрос получит 409. В MVP: кнопка блокируется на время запроса. Полная идемпотентность — после MVP.
- Курсорная пагинация — при росте списков.
