import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Link, Navigate, Route, Routes, useNavigate, useParams } from 'react-router-dom';
import api from './api.js';
import { createSocket } from './socket.js';

const AuthContext = createContext(null);

function useAuth() {
  return useContext(AuthContext);
}

function getError(error) {
  return error?.response?.data?.message || error?.message || 'Произошла ошибка';
}

function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(Boolean(localStorage.getItem('quiz_token')));

  useEffect(() => {
    const token = localStorage.getItem('quiz_token');
    if (!token) return;

    api.get('/me')
      .then((res) => setUser(res.data.user))
      .catch(() => localStorage.removeItem('quiz_token'))
      .finally(() => setLoading(false));
  }, []);

  async function login(email, password) {
    const res = await api.post('/auth/login', { email, password });
    localStorage.setItem('quiz_token', res.data.token);
    setUser(res.data.user);
  }

  async function register(payload) {
    const res = await api.post('/auth/register', payload);
    localStorage.setItem('quiz_token', res.data.token);
    setUser(res.data.user);
  }

  function logout() {
    localStorage.removeItem('quiz_token');
    setUser(null);
  }

  const value = useMemo(() => ({ user, loading, login, register, logout }), [user, loading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

function ProtectedRoute({ children, role }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="page"><div className="card">Загрузка...</div></div>;
  if (!user) return <Navigate to="/login" replace />;
  if (role && user.role !== role) return <Navigate to="/dashboard" replace />;
  return children;
}

function Layout({ children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate('/');
  }

  return (
    <>
      <header className="topbar">
        <Link className="brand" to="/">QuizRoom</Link>
        <nav>
          {user ? (
            <>
              <Link to="/dashboard">Кабинет</Link>
              <Link to="/join">Войти по коду</Link>
              <Link to="/history">История</Link>
              <span className="user-badge">{user.name} · {user.role === 'organizer' ? 'организатор' : 'участник'}</span>
              <button className="ghost" onClick={handleLogout}>Выйти</button>
            </>
          ) : (
            <>
              <Link to="/login">Вход</Link>
              <Link className="button small" to="/register">Регистрация</Link>
            </>
          )}
        </nav>
      </header>
      <main className="page">{children}</main>
    </>
  );
}

function HomePage() {
  const { user } = useAuth();
  return (
    <section className="hero">
      <div>
        <p className="eyebrow"></p>
        <h1>Квизы в реальном времени с подключением по коду комнаты</h1>
        <p>
          Организатор создаёт квиз, запускает комнату, участники подключаются по коду,
          отвечают на вопросы, а система считает баллы и показывает лидерборд.
        </p>
        <div className="actions">
          {user ? <Link className="button" to="/dashboard">Перейти в кабинет</Link> : <Link className="button" to="/register">Начать</Link>}
          <Link className="button secondary" to="/join">Войти по коду</Link>
        </div>
      </div>
      <div className="hero-card">
        <div className="room-code">A7K2P9</div>
        <p>Пример кода комнаты</p>
        <div className="leader-mini">
          <span>1. Иван — 250</span>
          <span>2. Екатерина — 200</span>
          <span>3. Андрей — 100</span>
        </div>
      </div>
    </section>
  );
}

function LoginPage() {
  const [email, setEmail] = useState('organizer@test.ru');
  const [password, setPassword] = useState('123456');
  const [error, setError] = useState('');
  const { login } = useAuth();
  const navigate = useNavigate();

  async function submit(e) {
    e.preventDefault();
    setError('');
    try {
      await login(email, password);
      navigate('/dashboard');
    } catch (err) {
      setError(getError(err));
    }
  }

  return (
    <AuthCard title="Вход">
      <form onSubmit={submit} className="form">
        <label>Email<input value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        <label>Пароль<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></label>
        {error && <div className="error">{error}</div>}
        <button className="button">Войти</button>
      </form>
      <p className="hint">Тест: organizer@test.ru / 123456 или participant@test.ru / 123456</p>
    </AuthCard>
  );
}

function RegisterPage() {
  const [payload, setPayload] = useState({ name: '', email: '', password: '', role: 'participant' });
  const [error, setError] = useState('');
  const { register } = useAuth();
  const navigate = useNavigate();

  function update(field, value) {
    setPayload((prev) => ({ ...prev, [field]: value }));
  }

  async function submit(e) {
    e.preventDefault();
    setError('');
    try {
      await register(payload);
      navigate('/dashboard');
    } catch (err) {
      setError(getError(err));
    }
  }

  return (
    <AuthCard title="Регистрация">
      <form onSubmit={submit} className="form">
        <label>Имя<input value={payload.name} onChange={(e) => update('name', e.target.value)} /></label>
        <label>Email<input value={payload.email} onChange={(e) => update('email', e.target.value)} /></label>
        <label>Пароль<input type="password" value={payload.password} onChange={(e) => update('password', e.target.value)} /></label>
        <label>Роль
          <select value={payload.role} onChange={(e) => update('role', e.target.value)}>
            <option value="participant">Участник</option>
            <option value="organizer">Организатор</option>
          </select>
        </label>
        {error && <div className="error">{error}</div>}
        <button className="button">Создать аккаунт</button>
      </form>
    </AuthCard>
  );
}

function AuthCard({ title, children }) {
  return (
    <div className="centered">
      <div className="card auth-card">
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  );
}

function DashboardPage() {
  const { user } = useAuth();
  const isOrganizer = user.role === 'organizer';
  return (
    <>
      <div className="page-head">
        <div>
          <p className="eyebrow">Личный кабинет</p>
          <h1>Здравствуйте, {user.name}</h1>
        </div>
      </div>
      <div className="grid cards-3">
        {isOrganizer ? (
          <>
            <FeatureCard title="Создать квиз" text="Добавьте вопросы, варианты ответов и время на ответ." link="/quizzes/new" />
            <FeatureCard title="Мои квизы" text="Редактирование квизов и запуск комнаты." link="/quizzes" />
            <FeatureCard title="История" text="Результаты проведённых комнат и участники." link="/history" />
          </>
        ) : (
          <>
            <FeatureCard title="Войти по коду" text="Введите код комнаты и подключитесь к активному квизу." link="/join" />
            <FeatureCard title="История участия" text="Посмотрите свои прошлые результаты." link="/history" />
          </>
        )}
      </div>
    </>
  );
}

function FeatureCard({ title, text, link }) {
  return (
    <Link className="card feature-card" to={link}>
      <h3>{title}</h3>
      <p>{text}</p>
    </Link>
  );
}

function QuizListPage() {
  const [quizzes, setQuizzes] = useState([]);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  async function load() {
    try {
      const res = await api.get('/quizzes');
      setQuizzes(res.data);
    } catch (err) {
      setError(getError(err));
    }
  }

  useEffect(() => { load(); }, []);

  async function createRoom(quizId) {
    try {
      const res = await api.post('/rooms', { quizId });
      navigate(`/host/${res.data.roomCode}`);
    } catch (err) {
      alert(getError(err));
    }
  }

  async function deleteQuiz(id) {
    if (!confirm('Удалить квиз?')) return;
    await api.delete(`/quizzes/${id}`);
    load();
  }

  return (
    <>
      <div className="page-head">
        <div>
          <p className="eyebrow">Организатор</p>
          <h1>Мои квизы</h1>
        </div>
        <Link className="button" to="/quizzes/new">Создать квиз</Link>
      </div>
      {error && <div className="error">{error}</div>}
      <div className="grid">
        {quizzes.map((quiz) => (
          <div className="card" key={quiz.id}>
            <h3>{quiz.title}</h3>
            <p>{quiz.description || 'Без описания'}</p>
            <p className="meta">Категория: {quiz.category || 'не указана'} · Вопросов: {quiz._count?.questions || 0} · Время: {quiz.timeLimit} сек.</p>
            <div className="actions wrap">
              <Link className="button secondary" to={`/quizzes/${quiz.id}/edit`}>Редактировать</Link>
              <button className="button" onClick={() => createRoom(quiz.id)}>Создать комнату</button>
              <button className="danger" onClick={() => deleteQuiz(quiz.id)}>Удалить</button>
            </div>
          </div>
        ))}
        {quizzes.length === 0 && <div className="card">Пока нет квизов.</div>}
      </div>
    </>
  );
}

function QuizEditorPage() {
  const params = useParams();
  const isNew = !params.id;
  const [quiz, setQuiz] = useState(null);
  const [form, setForm] = useState({ title: '', description: '', category: '', timeLimit: 30 });
  const [error, setError] = useState('');
  const navigate = useNavigate();

  async function load() {
    if (isNew) return;
    try {
      const res = await api.get(`/quizzes/${params.id}`);
      setQuiz(res.data);
      setForm({
        title: res.data.title,
        description: res.data.description || '',
        category: res.data.category || '',
        timeLimit: res.data.timeLimit
      });
    } catch (err) {
      setError(getError(err));
    }
  }

  useEffect(() => { load(); }, [params.id]);

  function update(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function save(e) {
    e.preventDefault();
    setError('');
    try {
      if (isNew) {
        const res = await api.post('/quizzes', form);
        navigate(`/quizzes/${res.data.id}/edit`);
      } else {
        await api.put(`/quizzes/${params.id}`, form);
        await load();
        alert('Квиз сохранён');
      }
    } catch (err) {
      setError(getError(err));
    }
  }

  async function deleteQuestion(id) {
    if (!confirm('Удалить вопрос?')) return;
    await api.delete(`/questions/${id}`);
    load();
  }

  return (
    <>
      <div className="page-head">
        <div>
          <p className="eyebrow">Редактор</p>
          <h1>{isNew ? 'Создание квиза' : 'Редактирование квиза'}</h1>
        </div>
        <Link className="button secondary" to="/quizzes">Назад</Link>
      </div>

      <div className="grid two">
        <div className="card">
          <h2>Основные настройки</h2>
          <form className="form" onSubmit={save}>
            <label>Название<input value={form.title} onChange={(e) => update('title', e.target.value)} /></label>
            <label>Описание<textarea value={form.description} onChange={(e) => update('description', e.target.value)} /></label>
            <label>Категория<input value={form.category} onChange={(e) => update('category', e.target.value)} /></label>
            <label>Время на вопрос, секунд<input type="number" min="5" value={form.timeLimit} onChange={(e) => update('timeLimit', e.target.value)} /></label>
            {error && <div className="error">{error}</div>}
            <button className="button">{isNew ? 'Создать' : 'Сохранить'}</button>
          </form>
        </div>

        {!isNew && (
          <div className="card">
            <h2>Добавить вопрос</h2>
            <QuestionForm quizId={params.id} onCreated={load} />
          </div>
        )}
      </div>

      {!isNew && quiz && (
        <section className="section">
          <h2>Вопросы</h2>
          <div className="grid">
            {quiz.questions.map((question, index) => (
              <div className="card question-card" key={question.id}>
                <div className="question-head">
                  <h3>{index + 1}. {question.text}</h3>
                  <button className="danger" onClick={() => deleteQuestion(question.id)}>Удалить</button>
                </div>
                {question.imageUrl && <img src={question.imageUrl} alt="Изображение вопроса" className="question-img" />}
                <p className="meta">Тип: {question.type === 'multiple_choice' ? 'множественный выбор' : 'одиночный выбор'} · Баллы: {question.points}</p>
                <ul className="option-list">
                  {question.options.map((option) => (
                    <li key={option.id} className={option.isCorrect ? 'correct' : ''}>{option.text}</li>
                  ))}
                </ul>
              </div>
            ))}
            {quiz.questions.length === 0 && <div className="card">Пока нет вопросов.</div>}
          </div>
        </section>
      )}
    </>
  );
}

function QuestionForm({ quizId, onCreated }) {
  const [question, setQuestion] = useState({
    text: '',
    imageUrl: '',
    type: 'single_choice',
    points: 100,
    options: [
      { text: '', isCorrect: true },
      { text: '', isCorrect: false },
      { text: '', isCorrect: false },
      { text: '', isCorrect: false }
    ]
  });
  const [error, setError] = useState('');

  function update(field, value) {
    setQuestion((prev) => ({ ...prev, [field]: value }));
  }

  function updateOption(index, field, value) {
    setQuestion((prev) => {
      const options = [...prev.options];
      options[index] = { ...options[index], [field]: value };
      if (field === 'isCorrect' && prev.type === 'single_choice' && value) {
        options.forEach((option, optionIndex) => {
          option.isCorrect = optionIndex === index;
        });
      }
      return { ...prev, options };
    });
  }

  function addOption() {
    setQuestion((prev) => ({ ...prev, options: [...prev.options, { text: '', isCorrect: false }] }));
  }

  async function submit(e) {
    e.preventDefault();
    setError('');
    try {
      const payload = {
        ...question,
        options: question.options.filter((option) => option.text.trim())
      };
      await api.post(`/quizzes/${quizId}/questions`, payload);
      setQuestion({
        text: '',
        imageUrl: '',
        type: 'single_choice',
        points: 100,
        options: [
          { text: '', isCorrect: true },
          { text: '', isCorrect: false },
          { text: '', isCorrect: false },
          { text: '', isCorrect: false }
        ]
      });
      onCreated();
    } catch (err) {
      setError(getError(err));
    }
  }

  return (
    <form className="form" onSubmit={submit}>
      <label>Текст вопроса<textarea value={question.text} onChange={(e) => update('text', e.target.value)} /></label>
      <label>URL изображения, необязательно<input value={question.imageUrl} onChange={(e) => update('imageUrl', e.target.value)} /></label>
      <label>Тип вопроса
        <select value={question.type} onChange={(e) => update('type', e.target.value)}>
          <option value="single_choice">Одиночный выбор</option>
          <option value="multiple_choice">Множественный выбор</option>
        </select>
      </label>
      <label>Баллы<input type="number" min="1" value={question.points} onChange={(e) => update('points', e.target.value)} /></label>
      <div className="options-editor">
        <strong>Варианты ответа</strong>
        {question.options.map((option, index) => (
          <div className="option-row" key={index}>
            <input
              value={option.text}
              placeholder={`Вариант ${index + 1}`}
              onChange={(e) => updateOption(index, 'text', e.target.value)}
            />
            <label className="check-label">
              <input
                type={question.type === 'single_choice' ? 'radio' : 'checkbox'}
                checked={option.isCorrect}
                onChange={(e) => updateOption(index, 'isCorrect', e.target.checked)}
              />
              верный
            </label>
          </div>
        ))}
        <button type="button" className="ghost" onClick={addOption}>+ вариант</button>
      </div>
      {error && <div className="error">{error}</div>}
      <button className="button">Добавить вопрос</button>
    </form>
  );
}

function JoinRoomPage() {
  const [code, setCode] = useState('');
  const navigate = useNavigate();

  function submit(e) {
    e.preventDefault();
    if (!code.trim()) return;
    navigate(`/play/${code.trim().toUpperCase()}`);
  }

  return (
    <div className="centered">
      <div className="card auth-card">
        <h2>Вход в комнату</h2>
        <form className="form" onSubmit={submit}>
          <label>Код комнаты<input className="code-input" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="A7K2P9" /></label>
          <button className="button">Подключиться</button>
        </form>
      </div>
    </div>
  );
}

function HostRoomPage() {
  const { roomCode } = useParams();
  const [state, setState] = useState(null);
  const [socket, setSocket] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const s = createSocket();
    setSocket(s);

    s.on('connect', () => {
      s.emit('host_room', { roomCode }, (res) => {
        if (!res?.ok) setError(res?.message || 'Не удалось подключиться к комнате');
      });
    });
    s.on('room_state', setState);
    s.on('connect_error', (err) => setError(err.message));

    return () => s.disconnect();
  }, [roomCode]);

  function emit(action) {
    if (!socket) return;
    socket.emit(action, { roomCode }, (res) => {
      if (!res?.ok) alert(res?.message || 'Ошибка');
    });
  }

  return (
    <>
      <div className="page-head">
        <div>
          <p className="eyebrow">Комната организатора</p>
          <h1>Код комнаты: <span className="accent">{roomCode}</span></h1>
        </div>
        <div className="actions wrap">
          <button className="button" onClick={() => emit('start_quiz')} disabled={state?.status === 'active'}>Начать квиз</button>
          <button className="button secondary" onClick={() => emit('next_question')} disabled={state?.status !== 'active'}>Следующий вопрос</button>
          <button className="danger" onClick={() => emit('finish_quiz')}>Завершить</button>
        </div>
      </div>

      {error && <div className="error">{error}</div>}
      {!state ? <div className="card">Подключение...</div> : (
        <div className="grid two">
          <div className="card">
            <h2>{state.quiz.title}</h2>
            <p className="meta">Статус: {state.status} · Вопрос {state.currentQuestionIndex + 1} из {state.quiz.questionsCount}</p>
            {state.currentQuestion ? (
              <QuestionPreview question={state.currentQuestion} timeLimit={state.quiz.timeLimit} startedAt={state.currentQuestionStartedAt} />
            ) : (
              <p>Ожидание запуска квиза.</p>
            )}
          </div>
          <div className="card">
            <h2>Участники и лидерборд</h2>
            <Leaderboard participants={state.participants} />
          </div>
        </div>
      )}
    </>
  );
}

function PlayRoomPage() {
  const { roomCode } = useParams();
  const [state, setState] = useState(null);
  const [socket, setSocket] = useState(null);
  const [selected, setSelected] = useState([]);
  const [answerInfo, setAnswerInfo] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const s = createSocket();
    setSocket(s);

    s.on('connect', () => {
      s.emit('join_room', { roomCode }, (res) => {
        if (!res?.ok) setError(res?.message || 'Не удалось войти в комнату');
      });
    });
    s.on('room_state', (roomState) => {
      setState(roomState);
      setSelected([]);
      setAnswerInfo('');
    });
    s.on('connect_error', (err) => setError(err.message));

    return () => s.disconnect();
  }, [roomCode]);

  const question = state?.currentQuestion;

  function toggle(optionId) {
    if (!question) return;
    setSelected((prev) => {
      if (question.type === 'single_choice') return [optionId];
      return prev.includes(optionId) ? prev.filter((id) => id !== optionId) : [...prev, optionId];
    });
  }

  function submitAnswer() {
    if (!socket || !question) return;
    socket.emit('submit_answer', {
      roomCode,
      questionId: question.id,
      selectedOptionIds: selected
    }, (res) => {
      if (!res?.ok) {
        setAnswerInfo(res?.message || 'Ошибка отправки ответа');
        return;
      }
      setAnswerInfo(res.isCorrect ? `Верно! +${res.earnedPoints}` : 'Неверно, 0 баллов');
    });
  }

  return (
    <>
      <div className="page-head">
        <div>
          <p className="eyebrow">Комната участника</p>
          <h1>Код комнаты: <span className="accent">{roomCode}</span></h1>
        </div>
      </div>

      {error && <div className="error">{error}</div>}
      {!state ? <div className="card">Подключение...</div> : (
        <div className="grid two">
          <div className="card play-card">
            <h2>{state.quiz.title}</h2>
            {state.status === 'waiting' && <p>Ожидание запуска квиза организатором.</p>}
            {state.status === 'finished' && <p>Квиз завершён. Итоговый лидерборд справа.</p>}
            {state.status === 'active' && question && (
              <>
                <QuestionPreview question={question} timeLimit={state.quiz.timeLimit} startedAt={state.currentQuestionStartedAt} />
                <div className="answer-list">
                  {question.options.map((option) => (
                    <button
                      key={option.id}
                      className={selected.includes(option.id) ? 'answer selected' : 'answer'}
                      onClick={() => toggle(option.id)}
                      disabled={Boolean(answerInfo)}
                    >
                      {option.text}
                    </button>
                  ))}
                </div>
                <button className="button" onClick={submitAnswer} disabled={selected.length === 0 || Boolean(answerInfo)}>
                  Отправить ответ
                </button>
                {answerInfo && <div className="notice">{answerInfo}</div>}
              </>
            )}
          </div>
          <div className="card">
            <h2>Лидерборд</h2>
            <Leaderboard participants={state.participants} />
          </div>
        </div>
      )}
    </>
  );
}

function QuestionPreview({ question, timeLimit, startedAt }) {
  const [left, setLeft] = useState(timeLimit);

  useEffect(() => {
    if (!startedAt) return;
    const interval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000);
      setLeft(Math.max(0, timeLimit - elapsed));
    }, 500);
    return () => clearInterval(interval);
  }, [startedAt, timeLimit, question.id]);

  return (
    <div className="question-preview">
      <div className="timer">Осталось: {left} сек.</div>
      <h3>{question.text}</h3>
      {question.imageUrl && <img className="question-img" src={question.imageUrl} alt="Изображение вопроса" />}
      <p className="meta">Тип: {question.type === 'multiple_choice' ? 'множественный выбор' : 'одиночный выбор'} · Баллы: {question.points}</p>
    </div>
  );
}

function Leaderboard({ participants }) {
  if (!participants?.length) return <p>Пока нет участников.</p>;
  return (
    <ol className="leaderboard">
      {participants.map((participant) => (
        <li key={participant.id}>
          <span>{participant.displayName}</span>
          <strong>{participant.score}</strong>
        </li>
      ))}
    </ol>
  );
}

function HistoryPage() {
  const [history, setHistory] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/history')
      .then((res) => setHistory(res.data))
      .catch((err) => setError(getError(err)));
  }, []);

  if (error) return <div className="error">{error}</div>;
  if (!history) return <div className="card">Загрузка истории...</div>;

  return (
    <>
      <div className="page-head">
        <div>
          <p className="eyebrow">Личный кабинет</p>
          <h1>История</h1>
        </div>
      </div>

      {history.type === 'organizer' ? (
        <div className="grid">
          {history.rooms.map((room) => (
            <div className="card" key={room.id}>
              <h3>{room.quiz.title}</h3>
              <p className="meta">Код: {room.roomCode} · Статус: {room.status} · Участников: {room.participants.length}</p>
              <Leaderboard participants={room.participants.map((p) => ({ id: p.id, displayName: p.displayName, score: p.score }))} />
            </div>
          ))}
          {history.rooms.length === 0 && <div className="card">Проведённых квизов пока нет.</div>}
        </div>
      ) : (
        <div className="grid">
          {history.participations.map((item) => (
            <div className="card" key={item.id}>
              <h3>{item.room.quiz.title}</h3>
              <p className="meta">Код: {item.room.roomCode} · Статус: {item.room.status}</p>
              <div className="score-big">{item.score} баллов</div>
            </div>
          ))}
          {history.participations.length === 0 && <div className="card">Вы ещё не участвовали в квизах.</div>}
        </div>
      )}
    </>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Layout>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/dashboard" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
          <Route path="/join" element={<ProtectedRoute><JoinRoomPage /></ProtectedRoute>} />
          <Route path="/play/:roomCode" element={<ProtectedRoute><PlayRoomPage /></ProtectedRoute>} />
          <Route path="/history" element={<ProtectedRoute><HistoryPage /></ProtectedRoute>} />
          <Route path="/quizzes" element={<ProtectedRoute role="organizer"><QuizListPage /></ProtectedRoute>} />
          <Route path="/quizzes/new" element={<ProtectedRoute role="organizer"><QuizEditorPage /></ProtectedRoute>} />
          <Route path="/quizzes/:id/edit" element={<ProtectedRoute role="organizer"><QuizEditorPage /></ProtectedRoute>} />
          <Route path="/host/:roomCode" element={<ProtectedRoute role="organizer"><HostRoomPage /></ProtectedRoute>} />
        </Routes>
      </Layout>
    </AuthProvider>
  );
}
