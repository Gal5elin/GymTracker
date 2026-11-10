import type { RequestHandler, Response } from 'express';
import type { Prisma, Role, User } from '@prisma/client';
import { z } from 'zod';
import { prisma } from './db.js';

export type AuthenticatedUser = Pick<User, 'id' | 'role' | 'isActive'>;
export class HttpError extends Error {
  constructor(public status: 400 | 401 | 403 | 404 | 409, message: string) { super(message); }
}
export function authenticatedUser(res: Response): AuthenticatedUser {
  const user = res.locals.user as AuthenticatedUser | undefined;
  if (!user?.isActive) throw new HttpError(401, 'Authentication required');
  return user;
}
export function assertRole(user: AuthenticatedUser, ...roles: Role[]) {
  if (!user.isActive) throw new HttpError(401, 'Authentication required');
  if (!roles.includes(user.role)) throw new HttpError(403, 'Forbidden');
}
export function requireRoles(...roles: Role[]): RequestHandler {
  return (_req, res, next) => {
    try { assertRole(authenticatedUser(res), ...roles); next(); }
    catch (error) { next(error); }
  };
}
function validId(id: string) {
  if (!z.uuid().safeParse(id).success) throw new HttpError(400, 'Invalid record ID');
}

// Trainers retain member functions for their own records; admins have no override.
export async function requireProgramOwner(user: AuthenticatedUser, programId: string) {
  assertRole(user, 'MEMBER', 'TRAINER');
  validId(programId);
  const program = await prisma.workoutProgram.findUnique({ where: { id: programId } });
  if (!program) throw new HttpError(404, 'Program not found');
  if (program.ownerId !== user.id) throw new HttpError(403, 'Forbidden');
  return program;
}
export async function requireDayOwner(user: AuthenticatedUser, dayId: string) {
  assertRole(user, 'MEMBER', 'TRAINER');
  validId(dayId);
  const day = await prisma.programDay.findUnique({ where: { id: dayId }, include: { program: true } });
  if (!day) throw new HttpError(404, 'Program day not found');
  if (day.program.ownerId !== user.id) throw new HttpError(403, 'Forbidden');
  return day;
}
export async function requireWorkoutOwner(user: AuthenticatedUser, sessionId: string) {
  assertRole(user, 'MEMBER', 'TRAINER');
  validId(sessionId);
  const session = await prisma.workoutSession.findUnique({ where: { id: sessionId } });
  if (!session) throw new HttpError(404, 'Workout not found');
  if (session.memberId !== user.id) throw new HttpError(403, 'Forbidden');
  return session;
}
export async function requireAcceptedMember(user: AuthenticatedUser, memberId: string) {
  assertRole(user, 'TRAINER');
  validId(memberId);
  const link = await prisma.trainerLink.findFirst({ where: {
    trainerId: user.id, memberId, status: 'ACCEPTED', member: { role: 'MEMBER', isActive: true },
  } });
  if (!link) throw new HttpError(403, 'Forbidden');
  return link;
}
export async function requireMemberResultsAccess(user: AuthenticatedUser, memberId: string) {
  assertRole(user, 'MEMBER', 'TRAINER');
  validId(memberId);
  if (user.id !== memberId) await requireAcceptedMember(user, memberId);
}
export async function requireTrainerAssignment(user: AuthenticatedUser, programId: string, memberId: string) {
  assertRole(user, 'TRAINER');
  const program = await requireProgramOwner(user, programId);
  await requireAcceptedMember(user, memberId);
  return program;
}

// Set recording and workout completion must share this row lock and check state after acquiring it.
export async function lockOwnedWorkout(tx: Prisma.TransactionClient, user: AuthenticatedUser, sessionId: string) {
  assertRole(user, 'MEMBER', 'TRAINER');
  validId(sessionId);
  const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM workout_sessions WHERE id = ${sessionId}::uuid FOR UPDATE`;
  if (!rows.length) throw new HttpError(404, 'Workout not found');
  const workout = await tx.workoutSession.findUniqueOrThrow({ where: { id: sessionId } });
  if (workout.memberId !== user.id) throw new HttpError(403, 'Forbidden');
  return workout;
}
