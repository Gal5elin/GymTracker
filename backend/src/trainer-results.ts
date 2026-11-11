import { Router } from 'express';
import { authenticatedUser, requireAcceptedMember, requireRoles } from './permissions.js';
import { createWorkoutHistoryRouter } from './workout-history.js';
import { createProgressRouter } from './progress.js';

export const trainerResultsRouter = Router();
trainerResultsRouter.use(requireRoles('TRAINER'));
// Recheck current consent for every request, including subsequent history pages.
trainerResultsRouter.use('/:memberId', async (req, res, next) => {
  await requireAcceptedMember(authenticatedUser(res), req.params.memberId);
  next();
});
trainerResultsRouter.use('/:memberId/workout-sessions/history', createWorkoutHistoryRouter(async req => String(req.params.memberId)));
trainerResultsRouter.use('/:memberId/progress', createProgressRouter(async req => String(req.params.memberId)));
