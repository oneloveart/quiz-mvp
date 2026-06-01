# QuizRoom MVP

Работоспособный MVP веб-приложения для проведения квизов в реальном времени.

## Что реализовано

- регистрация и авторизация пользователей;
- роли `participant` и `organizer`;
- создание и редактирование квизов организатором;
- вопросы с одиночным и множественным выбором;
- поддержка текстовых вопросов и вопросов с изображением по URL;
- создание комнаты квиза с кодом подключения;
- подключение участников по коду комнаты;
- показ вопросов в реальном времени через Socket.IO;
- отправка ответов только во время активного вопроса;
- подсчёт баллов;
- лидерборд;
- история участия и проведённых квизов.

## Стек

- Frontend: React + Vite
- Backend: Node.js + Express
- Real-time: Socket.IO
- Database: SQLite через Prisma ORM
- Auth: JWT + bcryptjs

## Структура

```text
quiz-mvp/
├── client/      # React-приложение
└── server/      # Express + Socket.IO + Prisma
```

## Запуск сервера

```bash
cd server
copy .env.example .env
npm install
npx prisma migrate dev --name init
npm run seed
npm run dev
```

Для macOS/Linux вместо `copy`:

```bash
cp .env.example .env
```

Сервер будет доступен по адресу:

```text
http://localhost:4000
```

## Запуск клиента

Откройте второй терминал:

```bash
cd client
npm install
npm run dev
```

Клиент будет доступен по адресу:

```text
http://localhost:5173
```

## Тестовые пользователи после `npm run seed`

### Организатор

```text
email: organizer@test.ru
password: 123456
```

### Участник

```text
email: participant@test.ru
password: 123456
```

