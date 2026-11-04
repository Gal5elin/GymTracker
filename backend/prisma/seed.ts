import 'dotenv/config';
import { PrismaClient, Role } from '@prisma/client';
import { hash, argon2id } from 'argon2';
import { z } from 'zod';

const prisma = new PrismaClient();
async function main() {
  if (process.env.NODE_ENV === 'production') throw new Error('Development seed is disabled in production');
  const password = z.string().min(12).parse(process.env.SEED_PASSWORD);
  const passwordHash = await hash(password, { type: argon2id });
  await prisma.$transaction(async (tx) => {
    for (const role of Object.values(Role)) {
      const email = `${role.toLowerCase()}@gymtracker.local`;
      const data = { displayName: `Demo ${role.toLowerCase()}`, role, passwordHash, isActive: true };
      await tx.user.upsert({ where: { email }, update: data, create: { email, ...data } });
    }
    const exercises = [
      ['Squat', 'Legs', 'Barbell'],
      ['Bench press', 'Chest', 'Barbell'],
      ['Deadlift', 'Back', 'Barbell'],
      ['Overhead press', 'Shoulders', 'Dumbbells'],
      ['Pull-up', 'Back', 'Pull-up bar'],
      ['Push-up', 'Chest', 'Bodyweight'],
    ];
    for (const [index, [name, muscleGroup, equipment]] of exercises.entries()) {
      const id = `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`;
      const data = { name, muscleGroup, equipment, isActive: true };
      await tx.exercise.upsert({ where: { id }, update: data, create: { id, ...data } });
    }
  });
  console.log('Development seed loaded: 3 demo accounts and 6 catalog exercises.');
}
main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
