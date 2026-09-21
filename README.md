# Это сделано? — Supabase-версия

Задачи и профили хранятся в Supabase. Row Level Security гарантирует, что пользователь читает и меняет только свои профили и задачи.

## Первый запуск

1. Вставьте содержимое [supabase.sql](supabase.sql) в **Supabase Dashboard → SQL Editor** и нажмите Run.
2. В **Authentication → Providers → Email** отключите **Confirm email**: это даст моментальный вход после регистрации без реального e-mail.
3. Запустите сайт:

```bash
npm run dev
```

Переменные Supabase уже записаны в `.env`; этот файл не попадёт в Git. Шаблон — [.env.example](.env.example).

## Логин и профили

Supabase использует e-mail + пароль, но интерфейс показывает только логин. Например, при входе `asil` приложение безопасно и невидимо преобразует его в `asil@didido.local`. Для первого использования нажмите «Создать аккаунт» и укажите `asil` с паролем. После входа меню `•••` позволяет добавлять и переключать отдельные профили задач.

Для опубликованного сайта замените простой пароль на уникальный, длинный пароль.

## Apple Shortcuts / Back Tap API

Shortcuts вызывает Supabase напрямую через HTTPS как авторизованный пользователь.

1. Получите сессию: `POST https://qrfdpzigcarbethrsioe.supabase.co/auth/v1/token?grant_type=password`.
   Передайте заголовки `apikey: <NEXT_PUBLIC_SUPABASE_ANON_KEY>` и `Content-Type: application/json`, JSON: `{ "email": "asil@didido.local", "password": "ВАШ_ПАРОЛЬ" }`. Сохраните поле `access_token`.
2. Запросите профили: `GET https://qrfdpzigcarbethrsioe.supabase.co/rest/v1/profiles?select=id,name`.
3. Загрузите задачи нужного профиля: `GET https://qrfdpzigcarbethrsioe.supabase.co/rest/v1/tasks?profile_id=eq.<PROFILE_ID>&select=*`.

Для каждого REST-вызова используйте два заголовка: `apikey: <ANON_KEY>` и `Authorization: Bearer <access_token>`. В Shortcuts покажите полученный список действием **Show Result**, затем назначьте команду на «Настройки → Универсальный доступ → Касание → Касание задней панели».

Отметить задачу: `PATCH /rest/v1/tasks?id=eq.<TASK_ID>` с JSON `{ "done": true, "done_at": "2026-09-21T12:00:00Z" }` и заголовком `Content-Type: application/json`.
