import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash('123456', 10);

  const organizer = await prisma.user.upsert({
    where: { email: 'organizer@test.ru' },
    update: {},
    create: {
      name: 'Тестовый организатор',
      email: 'organizer@test.ru',
      passwordHash,
      role: 'organizer'
    }
  });

  await prisma.user.upsert({
    where: { email: 'participant@test.ru' },
    update: {},
    create: {
      name: 'Тестовый участник',
      email: 'participant@test.ru',
      passwordHash,
      role: 'participant'
    }
  });

  const existing = await prisma.quiz.findFirst({
    where: { title: 'Демо-квиз по IT', createdById: organizer.id }
  });

  if (!existing) {
    const quiz = await prisma.quiz.create({
      data: {
        title: 'Демо-квиз по IT',
        description: 'Пример квиза для проверки работы MVP.',
        category: 'Информационные технологии',
        timeLimit: 30,
        createdById: organizer.id
      }
    });

    await prisma.question.create({
      data: {
        quizId: quiz.id,
        text: 'Что означает HTML?',
        type: 'single_choice',
        points: 100,
        order: 1,
        options: {
          create: [
            { text: 'HyperText Markup Language', isCorrect: true },
            { text: 'HighText Machine Language', isCorrect: false },
            { text: 'Hyper Transfer Main Link', isCorrect: false },
            { text: 'Home Tool Markup Logic', isCorrect: false }
          ]
        }
      }
    });

    await prisma.question.create({
      data: {
        quizId: quiz.id,
        text: 'Какие технологии относятся к frontend-разработке?',
        type: 'multiple_choice',
        points: 150,
        order: 2,
        options: {
          create: [
            { text: 'HTML', isCorrect: true },
            { text: 'CSS', isCorrect: true },
            { text: 'React', isCorrect: true },
            { text: 'PostgreSQL', isCorrect: false }
          ]
        }
      }
    });
  }

  console.log('Seed completed');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
