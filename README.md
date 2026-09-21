# Это сделано? — Supabase-версия

Личный веб-трекер повторяющихся бытовых проверок. Данные пользователей, профили и задачи хранятся напрямую в базе данных Supabase (PostgreSQL).

## Первый запуск

1. Вставьте содержимое [supabase.sql](supabase.sql) в **Supabase Dashboard → SQL Editor** и нажмите Run.
2. Запустите сайт:

```bash
npm run dev
```

Переменные Supabase уже записаны в `.env`; этот файл не попадёт в Git. Шаблон — [.env.example](.env.example).

## Логин и профили

Авторизация работает напрямую через таблицу пользователей в базе данных с безопасным хешированием паролей (`pgcrypto`/`bcrypt`).
- Для первого использования выберите **«Создать аккаунт»**, укажите логин и пароль.
- При регистрации автоматически создаётся стартовый профиль с вашим именем.
- После входа меню `•••` позволяет добавлять и переключать отдельные профили задач.

## Apple Shortcuts / Back Tap API

Shortcuts может работать с задачами напрямую через REST API Supabase:

1. Авторизация через RPC:
   `POST https://<SUPABASE_PROJECT_REF>.supabase.co/rest/v1/rpc/didido_login`
   Заголовки: `apikey: <NEXT_PUBLIC_SUPABASE_ANON_KEY>`, `Content-Type: application/json`
   JSON: `{"p_username": "<username>", "p_password": "<password>"}`
   Ответ вернёт объект `{"id": "<user_id>", "username": "<username>"}`.

2. Запрос списка профилей пользователя:
   `GET https://<SUPABASE_PROJECT_REF>.supabase.co/rest/v1/didido_profiles?owner_id=eq.<USER_ID>&select=id,name`
   Заголовки: `apikey: <NEXT_PUBLIC_SUPABASE_ANON_KEY>`

3. Загрузка задач выбранного профиля:
   `GET https://<SUPABASE_PROJECT_REF>.supabase.co/rest/v1/didido_tasks?profile_id=eq.<PROFILE_ID>&select=*`
   Заголовки: `apikey: <NEXT_PUBLIC_SUPABASE_ANON_KEY>`

4. Отметка задачи:
   `PATCH https://<SUPABASE_PROJECT_REF>.supabase.co/rest/v1/didido_tasks?id=eq.<TASK_ID>`
   Заголовки: `apikey: <NEXT_PUBLIC_SUPABASE_ANON_KEY>`, `Content-Type: application/json`
   JSON: `{"done": true, "done_at": "2026-09-21T12:00:00Z"}`
