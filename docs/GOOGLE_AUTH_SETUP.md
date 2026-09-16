# Вход через Google

Локальная реализация от 16 сентября 2026; публикация и настоящая проверка Google требуют настроенного OAuth-клиента. Наличие кода и тестов не означает, что Google Cloud уже настроен.

## Настройка

1. В Google Cloud / Google Auth Platform выбрать проект игры. Настроить Branding и Audience; для режима Testing добавить тестовые Google-аккаунты.
2. Создать OAuth Client типа **Web application**. Разрешить точный redirect URI для каждого используемого окружения:
   - `http://localhost:4732/auth/google/callback` для локального входа;
   - `https://<домен-игры>/auth/google/callback` для сервера.
3. Передать серверному процессу `GAME_PUBLIC_ORIGIN` (только origin без пути), `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`. Например origin локально — `http://localhost:4732`; браузер должен открывать именно этот origin. `127.0.0.1` и `localhost` — разные адреса.
4. Секрет хранить только в закрытом окружении сервера / исключённом из Git env-файле. Не помещать его в HTML, клиентскую сборку, коммит или журнал. Docker Compose должен явно передать переменные контейнеру.
5. Проверить реальный цикл Google → выбор персонажа → игра → выход → повторный вход на локальном и опубликованном origin отдельно. Доменные ограничения и статус OAuth-приложения проверяются в выбранном Google-проекте; технический временный домен не гарантирует успешной публикации OAuth.

Без трёх параметров `/auth/google` возвращает 503 с понятным сообщением; гостевого обхода нет. `GAME_PUBLIC_ORIGIN` допускает HTTP только для loopback; публичный вход требует HTTPS. Host и X-Forwarded-* не определяют адрес возврата.

## Контракт и защита

`createGoogleAuth(store, options)` предоставляет `configured`, `handle(req,res)`, `authenticate(req)`, `checkOrigin(req)`, `issueSession(account,res)`.

- GET `/auth/google`: сервер создаёт ограниченный по размеру набор одноразовых OAuth-состояний на 10 минут, привязывает состояние к HttpOnly-cookie браузера, отправляет nonce и PKCE S256.
- GET `/auth/google/callback`: проверяет браузерную привязку и одноразовый state, обменивает code сервером, проверяет RS256-подпись Google через `jose`/Google JWKS, issuer, audience, exp, iat, nonce, azp и `email_verified`. Аккаунт определяется Google `sub`, не email. OAuth access/refresh tokens не сохраняются и в браузер не возвращаются.
- Сессия игры хранится в PostgreSQL как SHA-256 случайного 256-битного секрета; cookie `ashen_session` имеет `HttpOnly; SameSite=Lax; Path=/`, срок 30 дней и Secure на HTTPS/production. Перезапуск не инвалидирует действующие DB-сессии; незаконченный OAuth-вход при рестарте нужно повторить.
- POST `/auth/logout` требует точный Origin, удаляет DB-сессию и вызывает `onSessionRevoked(sessionHash)` для закрытия соответствующего игрового соединения. Root-сервер отдельно обеспечивает одну игровую сессию на аккаунт.
- Ошибки провайдера не раскрываются в URL/ответах/логах. Возврат всегда на `/` с фиксированным кодом ошибки; произвольного `returnTo` нет.
- Конструктор принимает зависимость провайдера только для тестов подписанных JWT; переменной окружения для подмены провайдера или HTTP-обхода Google нет. `issueSession` является внутренним методом, не публичным HTTP-маршрутом.

## Изолированные проверки

`test/google-auth.test.mjs` использует настоящие RSA-подписи и локальный JWKS без Google-аккаунтов/production-БД. Покрыты выдача/повтор OAuth-состояния, отсутствие cookie-привязки, nonce, email verification, authorized party, audience, issuer, expiry, неверная подпись, выход/CSRF, отсутствие настройки, дубликаты cookie и истечение сессии. Полная интеграционная проверка выполняется координатором после объединения модуля с HTTP/WS и PostgreSQL.

Основа протокола: [Google OpenID Connect](https://developers.google.com/identity/openid-connect/openid-connect), [jose](https://github.com/panva/jose).
