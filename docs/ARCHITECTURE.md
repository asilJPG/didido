# Архитектура проекта «Это сделано?»

## 1. Краткое описание

«Это сделано?» — личный веб-трекер повторяющихся бытовых проверок: пользователь создаёт задачи вроде «Закрыл дверь?», видит их статус «ДА / не отмечено», отмечает выполнение одним нажатием и ведёт несколько отдельных профилей задач внутри одного аккаунта. Клиент авторизуется в Supabase; данные задач и профилей изолированы Row Level Security. Проект рассчитан на личное использование в браузере и вызовы из Apple Shortcuts/Back Tap.

## 2. Стек

| Область | Технология | Текущее состояние |
| --- | --- | --- |
| Язык | JavaScript (ES modules на сервере, browser JS на клиенте), SQL | TypeScript отсутствует |
| UI | Нативный HTML/CSS/DOM API | Без React, Next.js, сборщика и роутинга |
| Backend | Node.js `node:http` | Один сервер `server.mjs`, только статика и runtime-config |
| БД | Supabase Postgres | Схема в `supabase.sql` |
| Auth | Supabase Auth, e-mail/password | Логин преобразуется в технический адрес `<login>@didido.local` |
| Клиент БД | `@supabase/supabase-js@2` через jsDelivr CDN | Внешний `<script>` в `public/index.html` |
| Хостинг | Планируется Vercel | Конфигурация Vercel отсутствует; см. ограничения |
| Внешние API | Supabase Auth API и PostgREST API | Вызываются из браузера и Apple Shortcuts |
| CI/CD | Нет | GitHub Actions, тесты и автодеплой не настроены |

## 3. Файловая структура

```text
didido/
├── .env.example             # Шаблон двух публичных переменных Supabase
├── .gitignore               # Не позволяет закоммитить .env и node_modules
├── README.md                # Короткий запуск и инструкции для Shortcuts
├── package.json             # npm scripts: dev/start → node server.mjs
├── server.mjs               # Node HTTP-сервер и GET /config.js
├── supabase.sql             # Единственная SQL-миграция: таблицы, RLS, trigger
├── docs/
│   └── ARCHITECTURE.md      # Этот документ
└── public/
    ├── index.html           # Разметка авторизации, трекера и диалога профилей
    ├── app.js               # Вся клиентская логика, auth и обращения к Supabase
    └── style.css            # Адаптивный интерфейс и стили dialog/auth/task cards
```

Локальный `.env` существует только на машине разработчика и намеренно не указан в дереве как отслеживаемый файл.

## 4. Переменные окружения

| Переменная | Где читается | Назначение | Обязательна |
| --- | --- | --- | --- |
| `PORT` | `server.mjs` | Порт Node HTTP-сервера; fallback — `3000` | Нет |
| `NEXT_PUBLIC_SUPABASE_URL` | `server.mjs` → `/config.js` → `public/app.js` | Базовый HTTPS URL Supabase-проекта | Да |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `server.mjs` → `/config.js` → `public/app.js` | Supabase anon/publishable key для Auth и PostgREST | Да |

`envValue(name)` сначала берёт `process.env[name]`, затем ищет строку `NAME=value` в `.env`. Значения не должны попадать в Git. Anon key по природе доступен браузеру; **никогда** не добавлять `SUPABASE_SERVICE_ROLE_KEY` в `/config.js`, браузер или Apple Shortcut.

## 5. Модули и функции

### `server.mjs`

Назначение: минимальный Node-сервер. Выдаёт файлы из `public/` и динамически создаёт `GET /config.js` с публичной конфигурацией Supabase.

| Элемент | Входы → выходы | Логика |
| --- | --- | --- |
| `send(res, status, body, type)` | Node `ServerResponse`, HTTP status, строка/Buffer/объект → HTTP response | Добавляет `Content-Type` и `Cache-Control: no-store`; объект сериализует JSON, Buffer не сериализует. |
| `envValue(name)` | Имя переменной → строка или `''` | Читает `process.env`, затем `.env`; если файл/ключ отсутствует, возвращает пустую строку. Retry и кэша нет. |
| HTTP handler | `IncomingMessage` → статика/config/error | `GET /config.js` отдаёт `window.DIDIDO_CONFIG={url,key}`. `/` мапится на `/index.html`. Путь нормализуется и проверяется `file.startsWith(publicDir)`, чтобы заблокировать traversal. Неизвестный файл → 404. |

Не создаёт REST endpoint-ы задач: все запросы идут напрямую в Supabase.

### `public/index.html`

Назначение: единственная HTML-страница.

| Блок/ID | Использование |
| --- | --- |
| `#auth-screen`, `#auth-form`, `#username`, `#password` | Вход и регистрация; логин ограничен regex `[a-zA-Z0-9_-]{3,30}`. |
| `#app` | Основной UI, скрыт до наличия Supabase session. |
| `#task-list`, `#task-template` | Контейнер и DOM-template одной карточки задачи. |
| `#add-form`, `#task-title` | Создание задачи. |
| `#profiles-dialog`, `#profiles-list`, `#profile-form` | Выбор и создание профиля. |
| `/config.js` | Должен загрузиться до `app.js`, иначе `window.DIDIDO_CONFIG` undefined. |
| jsDelivr `@supabase/supabase-js@2` | Должен загрузиться до `app.js`, иначе `window.supabase` undefined. |

### `public/app.js`

Назначение: хранит состояние UI, подписывает обработчики и вызывает Supabase SDK.

| Функция/состояние | Входы → выходы | Алгоритм |
| --- | --- | --- |
| `$` | CSS selector → DOM element | Обёртка `document.querySelector`; отсутствующий элемент вызовет ошибку позже. |
| `db` | `DIDIDO_CONFIG.url`, `DIDIDO_CONFIG.key` → Supabase client | Создаётся один раз через `window.supabase.createClient`. |
| `technicalEmail(username)` | Логин → `<lowercase-trimmed-login>@didido.local` | Даёт Supabase обязательный e-mail, не раскрывая e-mail в UI. Коллизия равна коллизии логинов без учёта регистра. |
| `dayLabel()` | Текущая дата → русская локализованная строка | `Intl.DateTimeFormat('ru-RU')`. |
| `completedAt(done_at)` | ISO timestamp/null → подпись | Форматирует локальное время или возвращает `Ещё не отмечено`. |
| `render()` | Глобальный `tasks` → DOM | Сортирует копию: незавершённые выше (`Number(done)`), клонирует template, показывает прогресс и пустое состояние. |
| `toggle(task)` | Объект task → обновлённый UI | Выполняет `UPDATE didido_tasks SET done, done_at WHERE id = task.id`; затем меняет локальный объект и вызывает `render`. Ошибка выводится через `alert`. |
| `loadTasks()` | `activeProfileId` → `tasks` | `SELECT * FROM didido_tasks WHERE profile_id = activeProfileId ORDER BY created_at DESC`; при отсутствии ID выходит без запроса. |
| `showApp()` | session уже есть → основной экран | Скрывает auth, показывает app, выставляет дату, запускает `loadProfiles()` без `await`. |
| `loadProfiles()` | Supabase session → `profiles`, `activeProfileId`, задачи | Загружает профили по `created_at`; если сохранённый ID не принадлежит списку, выбирает первый. Сохраняет ID в `localStorage['didido-active-profile']`, перерисовывает профили, загружает задачи. |
| `renderProfiles()` | `profiles`, `activeProfileId` → кнопки dialog | Выбор профиля обновляет `localStorage`, закрывает dialog и перезагружает задачи. |

Обработчики форм:

| Событие | Запрос | Успех / ошибка |
| --- | --- | --- |
| `#auth-form submit` | `auth.signUp({email,password,options:{data:{username}}})` либо `auth.signInWithPassword({email,password})` | При наличии `session` запускает `showApp()`. При регистрации без сессии показывает подсказку про Confirm email. |
| `#auth-switch click` | Нет | Меняет режим `creatingAccount`, подписи и `autocomplete` password. |
| `#add-form submit` | `INSERT public.didido_tasks(profile_id,title,icon) RETURNING *` | Новая задача добавляется в начало локального массива. |
| `#profile-form submit` | `auth.getUser()`, затем `INSERT public.didido_profiles(owner_id,name)` | Очищает input и вызывает `loadProfiles()`. |
| `#sign-out click` | `auth.signOut()` | Удаляет активный profile ID и делает `location.reload()`. |
| bootstrap | `auth.getSession()` | Существующая сессия сразу открывает приложение. Нет подписки `onAuthStateChange`. |

Нетривиальная логика: retry, офлайн-очередь, кэширование данных, debounce, rate limiting и optimistic rollback **не реализованы**. `toggle` — частично optimistic: локальное состояние меняется только после ответа БД, но несоответствие `done_at` может составить миллисекунды.

### `public/style.css`

Назначение: весь визуальный слой. Использует Google Fonts `DM Sans` и `Fraunces` через `@import`; задаёт розово-кремовый фон, task cards, dialog и мобильный breakpoint `max-width: 480px`. CSS не содержит логики или переменных темы.

### `supabase.sql`

Назначение: idempotent только для extension; таблицы, policies и trigger не используют `if not exists`. Скрипт должен запускаться ровно один раз на чистом проекте. Повторный запуск упадёт на уже существующих объектах.

### `package.json`

Назначение: не содержит зависимостей. `npm run dev` и `npm start` выполняют один и тот же `node server.mjs`.

### `README.md`, `.env.example`, `.gitignore`

README — краткий запуск и API-справка. `.env.example` — названия обязательных переменных без значений. `.gitignore` исключает `.env` и `node_modules/`.

## 6. Схема БД

### Связи

```text
auth.users (Supabase Auth)
  1 ──── * public.didido_profiles.owner_id
                 1 ──── * public.didido_tasks.profile_id
```

### `public.didido_profiles`

| Поле | Тип | Ограничения / default | Назначение |
| --- | --- | --- | --- |
| `id` | `uuid` | PK, `gen_random_uuid()` | ID профиля; хранится в `localStorage` и используется в query tasks. |
| `owner_id` | `uuid` | NOT NULL, FK → `auth.users(id) ON DELETE CASCADE` | Supabase Auth user, которому принадлежит профиль. |
| `name` | `text` | NOT NULL, длина 1–80 | Видимое название профиля. |
| `created_at` | `timestamptz` | NOT NULL, `now()` | Сортировка списка профилей. |

### `public.didido_tasks`

| Поле | Тип | Ограничения / default | Назначение |
| --- | --- | --- | --- |
| `id` | `uuid` | PK, `gen_random_uuid()` | ID задачи; используется в update/PATCH. |
| `profile_id` | `uuid` | NOT NULL, FK → `didido_profiles(id) ON DELETE CASCADE` | Профиль-владелец. |
| `title` | `text` | NOT NULL, длина 1–100 | Вопрос/задача в карточке. |
| `icon` | `text` | NOT NULL, default `'✓'`, длина 1–8 | Emoji/icon в UI. |
| `done` | `boolean` | NOT NULL, default `false` | Текущий статус. |
| `done_at` | `timestamptz` | nullable | Время последнего выполнения; должно быть `NULL` когда `done=false` — это обеспечивает клиент, не constraint. |
| `created_at` | `timestamptz` | NOT NULL, `now()` | Сортировка загрузки. |

### Trigger и RLS

| Объект | Срабатывание / правило |
| --- | --- |
| `public.didido_create_initial_profile()` | `AFTER INSERT` на `auth.users`; добавляет первый profile с `owner_id=new.id` и `name=new.raw_user_meta_data->>'username'`, fallback `Мой профиль`. |
| `didido owners manage profiles` | `FOR ALL`: читать/писать profile можно только при `owner_id = auth.uid()`. |
| `didido owners manage tasks` | `FOR ALL`: доступ к task есть, если существует связанный profile с `owner_id = auth.uid()`. |

## 7. Внешние API

### Supabase Auth

| Параметр | Значение |
| --- | --- |
| Base URL | `https://<SUPABASE_PROJECT_REF>.supabase.co/auth/v1` |
| Авторизация | SDK передаёт `apikey: <anon key>`; credentials хранятся Supabase Auth. |
| Используемые методы SDK | `auth.signUp`, `auth.signInWithPassword`, `auth.getSession`, `auth.getUser`, `auth.signOut` |
| Обязательная настройка | Для мгновенной регистрации технических `@didido.local` адресов выключить Confirm email в Dashboard → Authentication → Providers → Email. |

Прямой запрос Shortcuts на получение session:

```http
POST /auth/v1/token?grant_type=password
apikey: <NEXT_PUBLIC_SUPABASE_ANON_KEY>
Content-Type: application/json

{"email":"<login>@didido.local","password":"<password>"}
```

Успешный ответ содержит `access_token`, `refresh_token`, `expires_in`, `user`. Не выводить `access_token` в публичный лог/скриншот; хранить в Shortcut как приватное значение. Access token истекает, а refresh flow в текущей инструкции Shortcuts не реализован.

### Supabase PostgREST

| Параметр | Значение |
| --- | --- |
| Base URL | `https://<SUPABASE_PROJECT_REF>.supabase.co/rest/v1` |
| Авторизация | `apikey: <anon key>` и `Authorization: Bearer <access_token>` |
| Защита | RLS policies из `supabase.sql`; client не должен использовать service role key. |

| Операция | HTTP | Endpoint | Пример body / ответ |
| --- | --- | --- | --- |
| Список профилей | `GET` | `/didido_profiles?select=id,name` | Ответ: `[{'id':'uuid','name':'Asil'}]` (JSON с двойными кавычками). |
| Список задач профиля | `GET` | `/didido_tasks?profile_id=eq.<PROFILE_ID>&select=*` | Ответ: массив строк `didido_tasks`. |
| Создать задачу | `POST` | `/didido_tasks` | Body: `{"profile_id":"uuid","title":"Закрыл дверь?","icon":"🔑"}`. Для возврата строки нужен `Prefer: return=representation`. |
| Отметить задачу | `PATCH` | `/didido_tasks?id=eq.<TASK_ID>` | Body: `{"done":true,"done_at":"<ISO-8601>"}`; для снятия отметки использовать `false` и `null`. |

Подводные камни: REST API не знает выбранный в UI профиль; Shortcut обязан получить/сохранить корректный `PROFILE_ID`. PostgREST применяет RLS к каждой операции, поэтому чужие ID вернут пустой ответ или ошибку, а не данные другого пользователя.

### jsDelivr и Google Fonts

| Сервис | URL | Риск |
| --- | --- | --- |
| jsDelivr | `https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2` | Версия закреплена только на major `2`; обновление minor может изменить поведение. При недоступности CDN сайт не авторизуется. |
| Google Fonts | URL в первой строке `public/style.css` | При блокировке сети интерфейс использует system/Georgia fallback. |

## 8. Бизнес-логика и пользовательские сценарии

### Регистрация первого аккаунта

1. Пользователь открывает `/`; `auth-screen` виден.
2. Нажимает «Создать аккаунт», вводит логин и пароль.
3. `technicalEmail()` переводит, например, `asil` в `asil@didido.local`.
4. `db.auth.signUp()` создаёт `auth.users` с `raw_user_meta_data.username`.
5. DB trigger `didido_on_auth_user_created` создаёт стартовую строку `didido_profiles`.
6. При session UI показывает приложение; `loadProfiles()` выбирает первый profile, затем `loadTasks()`.

### Вход

1. Пользователь вводит логин и пароль, не выбирая create mode.
2. `signInWithPassword` вызывается с техническим e-mail.
3. Supabase возвращает session; SDK хранит её в browser storage.
4. UI загружает только профили данного `auth.uid()` благодаря RLS.

### Создание и отметка задачи

1. Пользователь выбирает профиль (или остаётся на активном из `localStorage`).
2. Вводит текст в `#task-title`, нажимает «Добавить».
3. Клиент вставляет `profile_id`, `title`, icon из циклического массива `icons`; Postgres проверяет длину текста и RLS.
4. Нажатие на круглый check или кнопку «ДА/—» вызывает `toggle(task)`.
5. Update сохраняет `done` и ISO `done_at`; локальный список пересортировывается, так что выполненные уходят вниз.

### Дополнительный профиль

1. Пользователь нажимает `•••`.
2. В dialog вводит имя в `#profile-name`.
3. Клиент получает `user.id` и вставляет `didido_profiles(owner_id,name)`.
4. `loadProfiles()` обновляет переключатель; RLS разрешает запись только с текущим `auth.uid()`.

### Apple Shortcuts / Back Tap

1. Shortcut получает access token через password grant.
2. Запрашивает список профилей, выбирает ID.
3. Запрашивает `didido_tasks` с `profile_id=eq.<ID>` и показывает результат (или PATCH-ит определённый `task.id`).
4. Пользователь назначает Shortcut на Back Tap в iOS Accessibility settings.

## 9. Деплой

### Локально

```bash
cp .env.example .env
# заполнить .env
npm run dev
```

Приложение будет на `http://localhost:3000`.

### Vercel: текущая ситуация и необходимые действия

В репозитории **нет** `vercel.json`, Vercel Functions и framework preset. `server.mjs` — долгоживущий Node server с `listen()`, а Vercel по умолчанию ожидает статический build или serverless function. Нельзя считать, что текущий `npm start` автоматически будет работать на Vercel.

Перед деплоем на Vercel выбрать и реализовать один из вариантов:

| Вариант | Что изменить |
| --- | --- |
| Статический хостинг | Убрать runtime `/config.js`, заменить его статическим `public/config.js` на этапе build; задать Vercel build command, который генерирует этот файл из env. |
| Vercel Function | Перенести handler из `server.mjs` в `api/config.js`, статические файлы оставить Vercel static output. |
| Next.js | Мигрировать UI и config route в Next.js; текущие имена `NEXT_PUBLIC_*` уже совместимы. |

В Vercel добавить Environment Variables для Preview и Production:

| Имя | Значение |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | URL проекта Supabase; без завершающего `/`. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon/publishable key Supabase. |

После деплоя проверить в браузере `<deployment-url>/config.js`, регистрацию и загрузку `didido_profiles`. В Supabase Auth добавить production URL в разрешённые redirect URLs, если в будущем будут email/OAuth flows.

## 10. Известные проблемы и ограничения

| Приоритет | Проблема | Последствие / workaround |
| --- | --- | --- |
| Высокий | `supabase.sql` не запускался автоматически и не является повторно запускаемым | Выполнить один раз вручную в SQL Editor; затем вести миграции отдельно. |
| Высокий | Деплой на Vercel не реализован | Сначала выполнить один из вариантов из раздела 9. |
| Высокий | Пароль из первоначального примера слабый | Использовать уникальный пароль минимум 12+ символов; не хранить его в коде/README. |
| Средний | Логин не является настоящим e-mail, адрес всегда `@didido.local` | Нельзя включать email confirmation/password reset без изменения auth-дизайна. |
| Средний | Нет обновления daily/custom reset | `done` никогда не сбрасывается автоматически; это пока не habit tracker. |
| Средний | Нет API aggregation для Shortcuts | Shortcut получает token, profile ID и считает/форматирует список самостоятельно. |
| Средний | Нет refresh flow в Shortcut | После истечения `access_token` команда перестанет работать, пока не добавлен `refresh_token` flow или повторный password grant. |
| Средний | Нет graceful UI ошибок | Используется `alert`; нет loading state, retry и offline support. |
| Низкий | CDN не закреплён на точную версию | В будущем фиксировать конкретную версию Supabase JS и по возможности добавить SRI. |
| Низкий | Нет тестов, линтера, форматтера, CI | Любая логика меняется без автоматической проверки. |

## 11. Важные правила

1. Не помещать `SUPABASE_SERVICE_ROLE_KEY`, Database password или пользовательские access/refresh tokens в `.env.example`, Git, `public/`, `/config.js`, README или Shortcut screenshot.
2. Не отключать RLS на `public.didido_profiles` и `public.didido_tasks`. Любая новая таблица с пользовательскими данными должна включать RLS до запуска UI.
3. Не менять `technicalEmail()` без миграционного плана: существующие Auth users привязаны к текущему `<username>@didido.local` формату.
4. Не создавать задачу без `profile_id` и не добавлять в UI способ выбрать чужой profile ID: доступ контролирует RLS, но UX должен оставаться однозначным.
5. При добавлении автоматического сброса не перетирать `done_at` без истории: текущая схема хранит только последнее выполнение. Для аналитики/heatmap сначала добавить отдельную таблицу событий, например `task_completions`.
6. При добавлении редактирования/удаления использовать `eq('id', id)` **и** полагаться на RLS; не принимать `owner_id` от клиента для задач.
7. Сначала реализовать Vercel-адаптацию из раздела 9, затем указывать production URL в Shortcuts. Локальный `localhost:3000` не доступен iPhone.
8. Если включается Confirm email или password reset, заменить фиктивный домен `didido.local` на реальный верифицируемый email flow или добавить отдельный auth provider.
