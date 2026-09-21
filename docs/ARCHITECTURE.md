# Архитектура проекта «Это сделано?»

## 1. Краткое описание

«Это сделано?» — личный веб-трекер повторяющихся бытовых проверок: пользователь создаёт задачи вроде «Закрыл дверь?», видит их статус «ДА / не отмечено», отмечает выполнение одним нажатием и ведёт несколько отдельных профилей задач внутри одного аккаунта. Авторизация и данные хранятся напрямую в базе данных Supabase (PostgreSQL) с хешированием паролей. Проект рассчитан на личное использование в браузере и вызовы из Apple Shortcuts/Back Tap.

## 2. Стек

| Область | Технология | Текущее состояние |
| --- | --- | --- |
| Язык | JavaScript (ES modules на сервере, browser JS на клиенте), SQL | TypeScript отсутствует |
| UI | Нативный HTML/CSS/DOM API | Без React, Next.js, сборщика и роутинга |
| Backend | Node.js `node:http` | Один сервер `server.mjs`, только статика и runtime-config |
| БД | Supabase Postgres | Схема в `supabase.sql` (`didido_users`, `didido_profiles`, `didido_tasks`) |
| Auth | Пользовательская авторизация в БД (RPC `didido_login`, `didido_register`, `pgcrypto`) | Без сторонних email-провайдеров |
| Клиент БД | `@supabase/supabase-js@2` через jsDelivr CDN | Внешний `<script>` в `public/index.html` |
| Хостинг | Планируется Vercel | Конфигурация Vercel отсутствует; см. ограничения |
| Внешние API | Supabase PostgREST & RPC | Вызываются из браузера и Apple Shortcuts |
| CI/CD | Нет | GitHub Actions, тесты и автодеплой не настроены |

## 3. Файловая структура

```text
didido/
├── .env.example             # Шаблон двух публичных переменных Supabase
├── .gitignore               # Не позволяет закоммитить .env и node_modules
├── README.md                # Короткий запуск и инструкции для Shortcuts
├── package.json             # npm scripts: dev/start → node server.mjs
├── server.mjs               # Node HTTP-сервер и GET /config.js
├── supabase.sql             # SQL-миграция: таблицы, trigger, RPC login/register
├── docs/
│   └── ARCHITECTURE.md      # Этот документ
└── public/
    ├── index.html           # Разметка авторизации, трекера и диалога профилей
    ├── app.js               # Вся клиентская логика и обращения к Supabase
    └── style.css            # Адаптивный интерфейс и стили dialog/auth/task cards
```

Локальный `.env` существует только на машине разработчика и намеренно не указан в дереве как отслеживаемый файл.

## 4. Переменные окружения

| Переменная | Где читается | Назначение | Обязательна |
| --- | --- | --- | --- |
| `PORT` | `server.mjs` | Порт Node HTTP-сервера; fallback — `3000` | Нет |
| `NEXT_PUBLIC_SUPABASE_URL` | `server.mjs` → `/config.js` → `public/app.js` | Базовый HTTPS URL Supabase-проекта | Да |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `server.mjs` → `/config.js` → `public/app.js` | Supabase anon/publishable key | Да |

`envValue(name)` сначала берёт `process.env[name]`, затем ищет строку `NAME=value` в `.env`. Значения не должны попадать в Git.

## 5. Модули и функции

### `server.mjs`

Назначение: минимальный Node-сервер. Выдаёт файлы из `public/` и динамически создаёт `GET /config.js` с публичной конфигурацией Supabase.

### `public/index.html`

Назначение: единственная HTML-страница. Содержит экран входа/регистрации, форму добавления задач, список задач и диалог управления профилями.

### `public/app.js`

Назначение: хранит состояние UI, подписывает обработчики и вызывает Supabase RPC и PostgREST.

| Функция/состояние | Описание |
| --- | --- |
| `currentUser` | Данные текущего пользователя `{ id, username }`, сохраняемые в `localStorage['didido_user']`. |
| `activeProfileId` | ID выбранного профиля, сохраняемый в `localStorage['didido-active-profile']`. |
| `didido_register` / `didido_login` | Supabase RPC функции для безопасной регистрации и входа. |
| `loadProfiles()` | Загружает профили текущего пользователя по `owner_id = currentUser.id`. |
| `loadTasks()` | Загружает задачи выбранного профиля. |
| `toggle(task)` | Переключает статус задачи (`done`, `done_at`) в `didido_tasks`. |

## 6. Схема БД

### Связи

```text
public.didido_users
  1 ──── * public.didido_profiles.owner_id
                 1 ──── * public.didido_tasks.profile_id
```

### `public.didido_users`

| Поле | Тип | Ограничения / default | Назначение |
| --- | --- | --- | --- |
| `id` | `uuid` | PK, `gen_random_uuid()` | ID пользователя. |
| `username` | `text` | NOT NULL, UNIQUE, длина 3–30 | Уникальный логин пользователя. |
| `password_hash` | `text` | NOT NULL | Хеш пароля (`crypt` + `bf salt`). |
| `created_at` | `timestamptz` | NOT NULL, `now()` | Время регистрации. |

### `public.didido_profiles`

| Поле | Тип | Ограничения / default | Назначение |
| --- | --- | --- | --- |
| `id` | `uuid` | PK, `gen_random_uuid()` | ID профиля. |
| `owner_id` | `uuid` | NOT NULL, FK → `didido_users(id) ON DELETE CASCADE` | Владелец профиля. |
| `name` | `text` | NOT NULL, длина 1–80 | Название профиля. |
| `created_at` | `timestamptz` | NOT NULL, `now()` | Время создания. |

### `public.didido_tasks`

| Поле | Тип | Ограничения / default | Назначение |
| --- | --- | --- | --- |
| `id` | `uuid` | PK, `gen_random_uuid()` | ID задачи. |
| `profile_id` | `uuid` | NOT NULL, FK → `didido_profiles(id) ON DELETE CASCADE` | Профиль задачи. |
| `title` | `text` | NOT NULL, длина 1–100 | Текст проверки/вопроса. |
| `icon` | `text` | NOT NULL, default `'✓'`, длина 1–8 | Иконка. |
| `done` | `boolean` | NOT NULL, default `false` | Статус выполнения. |
| `done_at` | `timestamptz` | nullable | Время выполнения. |
| `created_at` | `timestamptz` | NOT NULL, `now()` | Время добавления. |

## 7. Внешние API для Apple Shortcuts

1. Вход: `POST /rest/v1/rpc/didido_login` с `{ "p_username": "...", "p_password": "..." }`
2. Профили: `GET /rest/v1/didido_profiles?owner_id=eq.<USER_ID>&select=id,name`
3. Задачи: `GET /rest/v1/didido_tasks?profile_id=eq.<PROFILE_ID>&select=*`
4. Переключение: `PATCH /rest/v1/didido_tasks?id=eq.<TASK_ID>`
