import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import http from 'http';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { Server } from 'socket.io';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const app = express();
const server = http.createServer(app);

const PORT = Number(process.env.PORT || 4000);
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret';

app.use(cors({ origin: CLIENT_URL, credentials: true }));
app.use(express.json({ limit: '2mb' }));

const io = new Server(server, {
  cors: {
    origin: CLIENT_URL,
    credentials: true
  }
});

function createToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role, name: user.name },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role
  };
}

async function authRequired(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return res.status(401).json({ message: 'Необходима авторизация' });

    const payload = jwt.verify(token, JWT_SECRET);
    const user = await prisma.user.findUnique({ where: { id: payload.id } });
    if (!user) return res.status(401).json({ message: 'Пользователь не найден' });

    req.user = user;
    next();
  } catch {
    res.status(401).json({ message: 'Недействительный токен' });
  }
}

function organizerOnly(req, res, next) {
  if (req.user?.role !== 'organizer') {
    return res.status(403).json({ message: 'Доступ только для организатора' });
  }
  next();
}

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i += 1) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

function sanitizeQuestion(question) {
  if (!question) return null;
  return {
    id: question.id,
    text: question.text,
    imageUrl: question.imageUrl,
    type: question.type,
    points: question.points,
    order: question.order,
    options: question.options.map((option) => ({
      id: option.id,
      text: option.text
    }))
  };
}

function compareNumberArrays(a, b) {
  const left = [...a].map(Number).sort((x, y) => x - y);
  const right = [...b].map(Number).sort((x, y) => x - y);
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

async function getRoomWithQuiz(roomCode) {
  return prisma.quizRoom.findUnique({
    where: { roomCode },
    include: {
      quiz: {
        include: {
          questions: {
            orderBy: { order: 'asc' },
            include: { options: true }
          },
          createdBy: true
        }
      },
      participants: {
        orderBy: [{ score: 'desc' }, { joinedAt: 'asc' }],
        include: { user: true }
      }
    }
  });
}

function roomState(room) {
  const currentQuestion = room.quiz.questions[room.currentQuestionIndex] || null;
  return {
    id: room.id,
    roomCode: room.roomCode,
    status: room.status,
    currentQuestionIndex: room.currentQuestionIndex,
    currentQuestionStartedAt: room.currentQuestionStartedAt,
    quiz: {
      id: room.quiz.id,
      title: room.quiz.title,
      description: room.quiz.description,
      category: room.quiz.category,
      timeLimit: room.quiz.timeLimit,
      questionsCount: room.quiz.questions.length
    },
    currentQuestion: sanitizeQuestion(currentQuestion),
    participants: room.participants.map((participant) => ({
      id: participant.id,
      userId: participant.userId,
      displayName: participant.displayName,
      score: participant.score
    }))
  };
}

async function emitRoomState(roomCode) {
  const room = await getRoomWithQuiz(roomCode);
  if (!room) return;
  io.to(roomCode).emit('room_state', roomState(room));
  io.to(roomCode).emit('leaderboard_update', roomState(room).participants);
}

async function assertRoomOwner(roomCode, userId) {
  const room = await getRoomWithQuiz(roomCode);
  if (!room) throw new Error('Комната не найдена');
  if (room.quiz.createdById !== userId) throw new Error('Нет доступа к управлению комнатой');
  return room;
}

app.get('/api/health', (req, res) => {
  res.json({ ok: true });
});

app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, password, role } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ message: 'Заполните имя, email и пароль' });
    }

    const normalizedRole = role === 'organizer' ? 'organizer' : 'participant';
    const exists = await prisma.user.findUnique({ where: { email } });
    if (exists) return res.status(409).json({ message: 'Пользователь с таким email уже существует' });

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: { name, email, passwordHash, role: normalizedRole }
    });

    res.status(201).json({ user: publicUser(user), token: createToken(user) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Ошибка регистрации' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return res.status(401).json({ message: 'Неверный email или пароль' });

    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) return res.status(401).json({ message: 'Неверный email или пароль' });

    res.json({ user: publicUser(user), token: createToken(user) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Ошибка входа' });
  }
});

app.get('/api/me', authRequired, (req, res) => {
  res.json({ user: publicUser(req.user) });
});

app.get('/api/quizzes', authRequired, organizerOnly, async (req, res) => {
  const quizzes = await prisma.quiz.findMany({
    where: { createdById: req.user.id },
    orderBy: { updatedAt: 'desc' },
    include: { _count: { select: { questions: true, rooms: true } } }
  });
  res.json(quizzes);
});

app.post('/api/quizzes', authRequired, organizerOnly, async (req, res) => {
  try {
    const { title, description, category, timeLimit } = req.body;
    if (!title) return res.status(400).json({ message: 'Название квиза обязательно' });

    const quiz = await prisma.quiz.create({
      data: {
        title,
        description: description || '',
        category: category || '',
        timeLimit: Number(timeLimit || 30),
        createdById: req.user.id
      }
    });

    res.status(201).json(quiz);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Не удалось создать квиз' });
  }
});

app.get('/api/quizzes/:id', authRequired, organizerOnly, async (req, res) => {
  const quiz = await prisma.quiz.findFirst({
    where: { id: Number(req.params.id), createdById: req.user.id },
    include: {
      questions: {
        orderBy: { order: 'asc' },
        include: { options: true }
      }
    }
  });

  if (!quiz) return res.status(404).json({ message: 'Квиз не найден' });
  res.json(quiz);
});

app.put('/api/quizzes/:id', authRequired, organizerOnly, async (req, res) => {
  const quizId = Number(req.params.id);
  const quiz = await prisma.quiz.findFirst({ where: { id: quizId, createdById: req.user.id } });
  if (!quiz) return res.status(404).json({ message: 'Квиз не найден' });

  const { title, description, category, timeLimit } = req.body;
  const updated = await prisma.quiz.update({
    where: { id: quizId },
    data: {
      title: title || quiz.title,
      description: description ?? quiz.description,
      category: category ?? quiz.category,
      timeLimit: Number(timeLimit || quiz.timeLimit)
    }
  });
  res.json(updated);
});

app.delete('/api/quizzes/:id', authRequired, organizerOnly, async (req, res) => {
  const quizId = Number(req.params.id);
  const quiz = await prisma.quiz.findFirst({ where: { id: quizId, createdById: req.user.id } });
  if (!quiz) return res.status(404).json({ message: 'Квиз не найден' });

  await prisma.quiz.delete({ where: { id: quizId } });
  res.json({ ok: true });
});

app.post('/api/quizzes/:id/questions', authRequired, organizerOnly, async (req, res) => {
  try {
    const quizId = Number(req.params.id);
    const quiz = await prisma.quiz.findFirst({
      where: { id: quizId, createdById: req.user.id },
      include: { _count: { select: { questions: true } } }
    });
    if (!quiz) return res.status(404).json({ message: 'Квиз не найден' });

    const { text, imageUrl, type, points, options } = req.body;
    if (!text) return res.status(400).json({ message: 'Текст вопроса обязателен' });
    if (!Array.isArray(options) || options.length < 2) {
      return res.status(400).json({ message: 'Добавьте минимум два варианта ответа' });
    }
    if (!options.some((option) => option.isCorrect)) {
      return res.status(400).json({ message: 'Отметьте хотя бы один правильный ответ' });
    }

    const question = await prisma.question.create({
      data: {
        quizId,
        text,
        imageUrl: imageUrl || null,
        type: type === 'multiple_choice' ? 'multiple_choice' : 'single_choice',
        points: Number(points || 100),
        order: quiz._count.questions + 1,
        options: {
          create: options.map((option) => ({
            text: option.text,
            isCorrect: Boolean(option.isCorrect)
          }))
        }
      },
      include: { options: true }
    });

    res.status(201).json(question);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Не удалось добавить вопрос' });
  }
});

app.delete('/api/questions/:id', authRequired, organizerOnly, async (req, res) => {
  const questionId = Number(req.params.id);
  const question = await prisma.question.findUnique({
    where: { id: questionId },
    include: { quiz: true }
  });

  if (!question || question.quiz.createdById !== req.user.id) {
    return res.status(404).json({ message: 'Вопрос не найден' });
  }

  await prisma.question.delete({ where: { id: questionId } });
  res.json({ ok: true });
});

app.post('/api/rooms', authRequired, organizerOnly, async (req, res) => {
  try {
    const { quizId } = req.body;
    const quiz = await prisma.quiz.findFirst({
      where: { id: Number(quizId), createdById: req.user.id },
      include: { questions: true }
    });
    if (!quiz) return res.status(404).json({ message: 'Квиз не найден' });
    if (quiz.questions.length === 0) {
      return res.status(400).json({ message: 'Нельзя запустить квиз без вопросов' });
    }

    let roomCode = generateRoomCode();
    while (await prisma.quizRoom.findUnique({ where: { roomCode } })) {
      roomCode = generateRoomCode();
    }

    const room = await prisma.quizRoom.create({
      data: {
        quizId: quiz.id,
        roomCode,
        status: 'waiting'
      }
    });

    res.status(201).json(room);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Не удалось создать комнату' });
  }
});

app.get('/api/rooms/:roomCode/state', authRequired, async (req, res) => {
  const room = await getRoomWithQuiz(req.params.roomCode.toUpperCase());
  if (!room) return res.status(404).json({ message: 'Комната не найдена' });

  const isOwner = room.quiz.createdById === req.user.id;
  const isParticipant = room.participants.some((participant) => participant.userId === req.user.id);
  if (!isOwner && !isParticipant && req.user.role !== 'participant') {
    return res.status(403).json({ message: 'Нет доступа к комнате' });
  }

  res.json(roomState(room));
});

app.get('/api/history', authRequired, async (req, res) => {
  if (req.user.role === 'organizer') {
    const rooms = await prisma.quizRoom.findMany({
      where: { quiz: { createdById: req.user.id } },
      orderBy: { createdAt: 'desc' },
      include: {
        quiz: true,
        participants: {
          orderBy: { score: 'desc' },
          include: { user: true }
        }
      }
    });
    return res.json({ type: 'organizer', rooms });
  }

  const participations = await prisma.roomParticipant.findMany({
    where: { userId: req.user.id },
    orderBy: { joinedAt: 'desc' },
    include: {
      room: {
        include: { quiz: true }
      }
    }
  });

  res.json({ type: 'participant', participations });
});

io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('Необходима авторизация'));

    const payload = jwt.verify(token, JWT_SECRET);
    const user = await prisma.user.findUnique({ where: { id: payload.id } });
    if (!user) return next(new Error('Пользователь не найден'));

    socket.user = publicUser(user);
    next();
  } catch {
    next(new Error('Ошибка авторизации сокета'));
  }
});

io.on('connection', (socket) => {
  socket.on('host_room', async ({ roomCode }, callback) => {
    try {
      const code = String(roomCode || '').trim().toUpperCase();
      await assertRoomOwner(code, socket.user.id);
      socket.join(code);
      await emitRoomState(code);
      callback?.({ ok: true });
    } catch (error) {
      callback?.({ ok: false, message: error.message });
    }
  });

  socket.on('join_room', async ({ roomCode }, callback) => {
    try {
      const code = String(roomCode || '').trim().toUpperCase();
      const room = await getRoomWithQuiz(code);
      if (!room) throw new Error('Комната не найдена');
      if (room.status === 'finished') throw new Error('Квиз уже завершён');

      const participant = await prisma.roomParticipant.upsert({
        where: { roomId_userId: { roomId: room.id, userId: socket.user.id } },
        update: { displayName: socket.user.name },
        create: {
          roomId: room.id,
          userId: socket.user.id,
          displayName: socket.user.name
        }
      });

      socket.join(code);
      await emitRoomState(code);
      callback?.({ ok: true, participantId: participant.id });
    } catch (error) {
      callback?.({ ok: false, message: error.message });
    }
  });

  socket.on('start_quiz', async ({ roomCode }, callback) => {
    try {
      const code = String(roomCode || '').trim().toUpperCase();
      const room = await assertRoomOwner(code, socket.user.id);
      if (room.quiz.questions.length === 0) throw new Error('В квизе нет вопросов');

      await prisma.quizRoom.update({
        where: { id: room.id },
        data: {
          status: 'active',
          currentQuestionIndex: 0,
          currentQuestionStartedAt: new Date(),
          startedAt: new Date()
        }
      });

      await emitRoomState(code);
      callback?.({ ok: true });
    } catch (error) {
      callback?.({ ok: false, message: error.message });
    }
  });

  socket.on('next_question', async ({ roomCode }, callback) => {
    try {
      const code = String(roomCode || '').trim().toUpperCase();
      const room = await assertRoomOwner(code, socket.user.id);
      const nextIndex = room.currentQuestionIndex + 1;

      if (nextIndex >= room.quiz.questions.length) {
        await prisma.quizRoom.update({
          where: { id: room.id },
          data: { status: 'finished', finishedAt: new Date() }
        });
        await emitRoomState(code);
        io.to(code).emit('quiz_finished');
        return callback?.({ ok: true, finished: true });
      }

      await prisma.quizRoom.update({
        where: { id: room.id },
        data: {
          status: 'active',
          currentQuestionIndex: nextIndex,
          currentQuestionStartedAt: new Date()
        }
      });

      await emitRoomState(code);
      callback?.({ ok: true });
    } catch (error) {
      callback?.({ ok: false, message: error.message });
    }
  });

  socket.on('finish_quiz', async ({ roomCode }, callback) => {
    try {
      const code = String(roomCode || '').trim().toUpperCase();
      const room = await assertRoomOwner(code, socket.user.id);
      await prisma.quizRoom.update({
        where: { id: room.id },
        data: { status: 'finished', finishedAt: new Date() }
      });
      await emitRoomState(code);
      io.to(code).emit('quiz_finished');
      callback?.({ ok: true });
    } catch (error) {
      callback?.({ ok: false, message: error.message });
    }
  });

  socket.on('submit_answer', async ({ roomCode, questionId, selectedOptionIds }, callback) => {
    try {
      const code = String(roomCode || '').trim().toUpperCase();
      const room = await getRoomWithQuiz(code);
      if (!room) throw new Error('Комната не найдена');
      if (room.status !== 'active') throw new Error('Квиз сейчас не активен');

      const question = room.quiz.questions[room.currentQuestionIndex];
      if (!question || question.id !== Number(questionId)) {
        throw new Error('Этот вопрос сейчас недоступен');
      }

      if (room.currentQuestionStartedAt) {
        const started = new Date(room.currentQuestionStartedAt).getTime();
        const now = Date.now();
        const limitMs = (room.quiz.timeLimit + 2) * 1000;
        if (now - started > limitMs) {
          throw new Error('Время ответа истекло');
        }
      }

      const participant = await prisma.roomParticipant.findUnique({
        where: { roomId_userId: { roomId: room.id, userId: socket.user.id } }
      });
      if (!participant) throw new Error('Вы не подключены к этой комнате');

      const selected = Array.isArray(selectedOptionIds) ? selectedOptionIds.map(Number) : [];
      if (selected.length === 0) throw new Error('Выберите вариант ответа');

      const correctIds = question.options
        .filter((option) => option.isCorrect)
        .map((option) => option.id);

      const isCorrect = compareNumberArrays(selected, correctIds);
      const earnedPoints = isCorrect ? question.points : 0;

      const existing = await prisma.participantAnswer.findUnique({
        where: { participantId_questionId: { participantId: participant.id, questionId: question.id } }
      });
      if (existing) throw new Error('Ответ на этот вопрос уже отправлен');

      await prisma.$transaction([
        prisma.participantAnswer.create({
          data: {
            participantId: participant.id,
            questionId: question.id,
            selectedOptionIds: JSON.stringify(selected),
            isCorrect,
            earnedPoints
          }
        }),
        prisma.roomParticipant.update({
          where: { id: participant.id },
          data: { score: { increment: earnedPoints } }
        })
      ]);

      await emitRoomState(code);
      callback?.({ ok: true, isCorrect, earnedPoints });
    } catch (error) {
      callback?.({ ok: false, message: error.message });
    }
  });
});

server.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
