# Модель данных

> Статус: утверждена 2026-11-09.
> Основа: [requirements.md](../requirements.md), [ADR-003](../adr/003-double-booking-protection.md), [ADR-004](../adr/004-orm-drizzle.md).
> Таблицы аутентификации `sessions` и `auth_tokens` добавлены по [ADR-005](../adr/005-authentication-sessions.md).

## 1. Принципы

1. **Инварианты данных — в БД.** То, что должно быть истинно для каждой строки при любом пути записи (непересечение, диапазоны значений, связи), закрепляется ограничениями. Код приложения может ошибиться; ограничение — нет.
2. **Процессы — в домене.** Переходы статусов брони, права доступа, правила отмены — это бизнес-логика backend, а не триггеры БД. БД охраняет _состояние_, домен — _переходы_ между состояниями.
3. **Моменты — в UTC, правила — в локальном времени.** Брони: `timestamptz`. Недельное расписание: минуты от полуночи в часовом поясе специалиста.
4. **Бронь — зафиксированный факт.** Всё, что нужно для понимания брони в будущем, хранится в ней самой, а не вычисляется из изменяемых данных.
5. **Идентификаторы — UUID v7.** Не позволяют перебирать и оценивать объём данных по ID (в отличие от `serial`), при этом упорядочены по времени, что хорошо для B-tree индексов.

## 2. Схема связей

```
users 1 ──── * sessions
users 1 ──── * auth_tokens
users 1 ──── 0..1 specialist_profiles
  │                    │ 1
  │                    ├──── * services
  │                    ├──── * weekly_availability
  │                    ├──── * days_off
  │                    │ 1
  │ 1 (как клиент)      │
  └──── * bookings * ───┘
              │ *
              └──── 1 services

outbox_messages — без внешних ключей (очередь исходящих событий)
```

## 3. Таблицы

### users

| Колонка                | Тип         | Ограничения              | Комментарий                                                  |
| ---------------------- | ----------- | ------------------------ | ------------------------------------------------------------ |
| id                     | uuid        | PK                       | v7                                                           |
| email                  | text        | NOT NULL                 | хранится в нижнем регистре                                   |
| password_hash          | text        | NOT NULL                 | алгоритм — в ADR по аутентификации                           |
| name                   | text        | NOT NULL, 1–100 символов |                                                              |
| timezone               | text        | NOT NULL                 | IANA; используется для писем — сервер не знает пояс браузера |
| email_verified_at      | timestamptz | NULL                     | NULL = не подтверждён                                        |
| created_at, updated_at | timestamptz | NOT NULL DEFAULT now()   |                                                              |

- `UNIQUE (email)`; приложение нормализует email (trim + lower) до записи. Дополнительно `CHECK (email = lower(email))`, чтобы разный регистр не создал дубликат в обход кода.

### sessions

| Колонка      | Тип         | Ограничения                            | Комментарий                                               |
| ------------ | ----------- | -------------------------------------- | --------------------------------------------------------- |
| id           | uuid        | PK                                     |                                                           |
| user_id      | uuid        | FK → users ON DELETE CASCADE, NOT NULL |                                                           |
| token_hash   | bytea       | UNIQUE, NOT NULL                       | SHA-256 токена из cookie; сам токен не хранится           |
| created_at   | timestamptz | NOT NULL                               | начало отсчёта абсолютного срока (90 дней)                |
| last_seen_at | timestamptz | NOT NULL                               | скользящий срок (30 дней); обновляется не чаще раза в час |
| expires_at   | timestamptz | NOT NULL                               | `min(last_seen_at + 30 д, created_at + 90 д)`             |
| user_agent   | text        | NULL                                   | для будущего списка «активные сессии»                     |

- Индекс `(user_id)` — удаление всех сессий пользователя при смене пароля.
- Индекс `(expires_at)` — уборка истёкших.

### auth_tokens

Одноразовые токены из писем.

| Колонка    | Тип                                                          | Ограничения                            | Комментарий                                            |
| ---------- | ------------------------------------------------------------ | -------------------------------------- | ------------------------------------------------------ |
| id         | uuid                                                         | PK                                     |                                                        |
| user_id    | uuid                                                         | FK → users ON DELETE CASCADE, NOT NULL |                                                        |
| purpose    | enum `auth_token_purpose` (`verify_email`, `reset_password`) | NOT NULL                               |                                                        |
| token_hash | bytea                                                        | UNIQUE, NOT NULL                       | SHA-256                                                |
| expires_at | timestamptz                                                  | NOT NULL                               | 24 ч / 1 ч                                             |
| used_at    | timestamptz                                                  | NULL                                   | одноразовость: условный UPDATE `WHERE used_at IS NULL` |
| created_at | timestamptz                                                  | NOT NULL                               |                                                        |

- Индекс `(user_id, purpose)` — новая ссылка гасит прежние неиспользованные ссылки того же назначения.

### specialist_profiles

Связь 1 : 0..1 с `users`: первичный ключ одновременно является внешним ключом, поэтому у пользователя физически не может быть двух профилей.

| Колонка                      | Тип                                         | Ограничения                           | Комментарий                       |
| ---------------------------- | ------------------------------------------- | ------------------------------------- | --------------------------------- |
| user_id                      | uuid                                        | PK, FK → users                        |                                   |
| slug                         | text                                        | UNIQUE, NOT NULL, `^[a-z0-9-]{3,40}$` | адрес публичной страницы          |
| display_name                 | text                                        | NOT NULL, 1–100 символов              |                                   |
| bio                          | text                                        | NULL, до 2000 символов                |                                   |
| timezone                     | text                                        | NOT NULL                              | IANA; в нём трактуется расписание |
| confirmation_mode            | enum `confirmation_mode` (`auto`, `manual`) | NOT NULL DEFAULT `manual`             |                                   |
| min_notice_minutes           | integer                                     | NOT NULL, 0..10080                    | по умолчанию 120                  |
| booking_horizon_days         | integer                                     | NOT NULL, 1..365                      | по умолчанию 60                   |
| client_cancel_deadline_hours | integer                                     | NOT NULL, 0..720                      | по умолчанию 24                   |
| created_at, updated_at       | timestamptz                                 | NOT NULL                              |                                   |

`users.timezone` и `specialist_profiles.timezone` — разные понятия: первое определяет, как показывать время человеку в письмах; второе — как трактовать его рабочее расписание.

### services

| Колонка                | Тип         | Ограничения                                | Комментарий                           |
| ---------------------- | ----------- | ------------------------------------------ | ------------------------------------- |
| id                     | uuid        | PK                                         |                                       |
| specialist_id          | uuid        | FK → specialist_profiles, NOT NULL         |                                       |
| name                   | text        | NOT NULL, 1–100                            |                                       |
| description            | text        | NULL, до 2000 символов                     |                                       |
| duration_minutes       | integer     | NOT NULL, `BETWEEN 15 AND 480 AND % 5 = 0` | FR-20                                 |
| archived_at            | timestamptz | NULL                                       | архивирование вместо удаления (FR-21) |
| created_at, updated_at | timestamptz | NOT NULL                                   |                                       |

- Индекс `(specialist_id) WHERE archived_at IS NULL` — активные услуги на публичной странице.
- `ON DELETE RESTRICT` из `bookings`: услугу с бронями нельзя удалить физически.

### weekly_availability

Одна строка = один рабочий интервал в один день недели.

| Колонка       | Тип      | Ограничения                                | Комментарий                  |
| ------------- | -------- | ------------------------------------------ | ---------------------------- |
| id            | uuid     | PK                                         |                              |
| specialist_id | uuid     | FK → specialist_profiles ON DELETE CASCADE |                              |
| weekday       | smallint | NOT NULL, 1..7                             | ISO: 1 = понедельник         |
| start_minute  | smallint | NOT NULL, 0..1439                          | минуты от локальной полуночи |
| end_minute    | smallint | NOT NULL, 1..1440, `> start_minute`        | 1440 = конец дня             |

- `EXCLUDE USING gist (specialist_id WITH =, weekday WITH =, int4range(start_minute, end_minute) WITH &&)` — интервалы одного дня не пересекаются.
- Интервалы через полночь (22:00–02:00) в MVP не поддерживаются: их можно разбить на два дня.
- Минуты вместо типа `time`: для `time` нет встроенного типа диапазона, а `int4range` даёт ограничение на непересечение «бесплатно».
- Отдельного индекса по `specialist_id` нет: GiST-индекс ограничения `(specialist_id, weekday, range)` обслуживает и выборку расписания специалиста.
- Правило хранится в локальном времени, а не в UTC: у повторяющегося правила нет единого UTC-эквивалента (смещение зависит от даты из-за летнего времени); перевод в UTC — для конкретной даты при расчёте слотов.

### days_off

| Колонка       | Тип         | Ограничения                                | Комментарий                        |
| ------------- | ----------- | ------------------------------------------ | ---------------------------------- |
| id            | uuid        | PK                                         |                                    |
| specialist_id | uuid        | FK → specialist_profiles ON DELETE CASCADE |                                    |
| date          | date        | NOT NULL                                   | локальная дата в поясе специалиста |
| created_at    | timestamptz | NOT NULL                                   |                                    |

- `UNIQUE (specialist_id, date)`.

### bookings

| Колонка                | Тип                                                                                | Ограничения                                | Комментарий            |
| ---------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------ | ---------------------- |
| id                     | uuid                                                                               | PK                                         |                        |
| specialist_id          | uuid                                                                               | FK → specialist_profiles, NOT NULL         |                        |
| client_id              | uuid                                                                               | FK → users, NOT NULL                       |                        |
| service_id             | uuid                                                                               | FK → services ON DELETE RESTRICT, NOT NULL |                        |
| service_name           | text                                                                               | NOT NULL                                   | снимок на момент брони |
| start_at               | timestamptz                                                                        | NOT NULL                                   |                        |
| end_at                 | timestamptz                                                                        | NOT NULL, `> start_at`                     | снимок длительности    |
| status                 | enum `booking_status` (`pending`, `confirmed`, `rejected`, `cancelled`, `expired`) | NOT NULL                                   |                        |
| expires_at             | timestamptz                                                                        | NULL                                       | только для `pending`   |
| cancelled_by           | enum `booking_actor` (`client`, `specialist`)                                      | NULL                                       | только для `cancelled` |
| status_reason          | text                                                                               | NULL, ≤ 500                                | причина отказа/отмены  |
| created_at, updated_at | timestamptz                                                                        | NOT NULL                                   |                        |

Ограничения:

- `CHECK (client_id <> specialist_id)` — нельзя записаться к себе.
- `CHECK ((status = 'pending') = (expires_at IS NOT NULL))` — срок есть ровно у `pending`.
- `CHECK ((status = 'cancelled') = (cancelled_by IS NOT NULL))`.
- Exclusion constraint из [ADR-003](../adr/003-double-booking-protection.md):
  `EXCLUDE USING gist (specialist_id WITH =, tstzrange(start_at, end_at, '[)') WITH &&) WHERE (status IN ('pending','confirmed'))`.

Индексы:

- GiST-индекс exclusion constraint обслуживает и поиск занятого времени специалиста за диапазон (вычисление слотов). Индекс частичный, поэтому запрос повторяет его условие `status IN ('pending','confirmed')`, а эффективный статус уточняет отдельно: `status = 'confirmed' OR expires_at > now`.
- `(client_id, start_at)` — список броней клиента.
- `(specialist_id, start_at)` — список броней специалиста с фильтром по времени.
- `(expires_at) WHERE status = 'pending'` — фоновое истечение.

Что **не** проверяется в БД (и почему):

- Допустимость переходов статусов — это процесс, он в доменном слое.
- Что бронь укладывается в расписание — расписание меняется, а прошлые брони остаются в силе (бронь — факт).
- Лимит `pending` на клиента (FR-56) — проверяется в транзакции создания брони.

### outbox_messages

Очередь исходящих событий для писем (FR-60–62). Запись создаётся **в той же транзакции**, что и изменение брони; отдельный обработчик читает очередь и отправляет письма с повторами.

| Колонка         | Тип                                | Ограничения                | Комментарий                  |
| --------------- | ---------------------------------- | -------------------------- | ---------------------------- |
| id              | uuid                               | PK                         |                              |
| type            | text                               | NOT NULL                   | например, `booking.created`  |
| payload         | jsonb                              | NOT NULL                   | данные, нужные для письма    |
| status          | enum (`pending`, `sent`, `failed`) | NOT NULL DEFAULT `pending` | `failed` — исчерпаны попытки |
| attempts        | integer                            | NOT NULL DEFAULT 0         |                              |
| next_attempt_at | timestamptz                        | NOT NULL DEFAULT now()     | для отложенных повторов      |
| last_error      | text                               | NULL                       |                              |
| created_at      | timestamptz                        | NOT NULL                   |                              |
| processed_at    | timestamptz                        | NULL                       |                              |

- Индекс `(next_attempt_at) WHERE status = 'pending'`; `CHECK (attempts >= 0)`.
- `next_attempt_at` служит и арендой: взятое в работу сообщение сдвигается на 5 минут вперёд.
- Почему не «отправить письмо сразу в коде»: если отправить до коммита — письмо уйдёт о брони, которая может откатиться; если после — падение процесса между коммитом и отправкой потеряет письмо. Outbox делает «изменение + намерение отправить» атомарным.
- Устройство обработчика (аренда, повторы, гарантия «как минимум один раз», удаление ссылок с токенами из payload) — [ADR-012](../adr/012-outbox-and-email-delivery.md).

## 4. Конкурентные изменения статуса брони

**Проблема (lost update).** Два запроса одновременно читают бронь в `pending`, оба проверяют «переход разрешён» и оба делают `UPDATE ... WHERE id = $1`. Второй перезаписывает результат первого. Последствия:

- бронь «воскресает» из конечного статуса (`cancelled` → `confirmed`), нарушая машину состояний;
- оба пользователя получают «успех», в outbox уходят противоречивые письма («подтверждено» и «отменено»).

Exclusion constraint здесь не помогает: он проверяет, что строка корректна сама по себе, а `confirmed` и `cancelled` — оба корректные состояния. Ошибка не в состоянии, а в **переходе**, сделанном на основе устаревшего чтения.

**Решение: условный UPDATE (compare-and-set).** Каждое изменение статуса обновляет строку, только если она всё ещё в том статусе, из которого домен разрешил переход:

```sql
UPDATE bookings
SET status = 'confirmed', expires_at = NULL, updated_at = now()
WHERE id = $1
  AND status = 'pending'          -- статус, который прочитали и проверили
  AND expires_at > now()          -- pending ещё не истёк
RETURNING *;
```

- 1 строка → переход выполнен.
- 0 строк → кто-то изменил бронь раньше → доменная ошибка «статус уже изменился» (409 Conflict).

Почему это работает в PostgreSQL (уровень изоляции READ COMMITTED по умолчанию): `UPDATE` берёт блокировку строки. Второй `UPDATE` ждёт коммита первого, затем **заново проверяет `WHERE` на новой версии строки** — видит `cancelled` и ничего не обновляет.

Рассмотренные альтернативы:

| Подход                                           | Когда уместен                                                                                       |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| Условный UPDATE по ожидаемому статусу            | ✅ Наш случай: короткие переходы машины состояний                                                   |
| `SELECT ... FOR UPDATE`, затем проверка и UPDATE | Когда решение требует сложной логики над несколькими строками; блокирует строку на время транзакции |
| Колонка `version` (optimistic locking)           | Когда пользователь долго редактирует форму на основе старых данных (например, профиль специалиста)  |

Правило для кода: **ни один UPDATE статуса брони не выполняется без условия на текущий статус**. Это проверяется тестами на каждый переход.

## 5. Открытые вопросы

- ~~Версия PostgreSQL~~ — решено в [ADR-010](../adr/010-development-environment.md): PostgreSQL 18, первичные ключи `DEFAULT uuidv7()`. Поддержка 18 хостингом — критерий выбора на этапе 9.
- Удаление аккаунта и персональных данных — вне MVP, но понадобится до реального использования.
