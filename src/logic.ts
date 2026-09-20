import { dispatchLimits } from './config';
import { AppError } from './errors';
import { Signal } from './types';

export const computeNextSignalState = (signal: Signal) => {
  const nextAccepted = Math.min(signal.accepted + 1, signal.helpersRequired);
  const nextStatus: Signal['status'] =
    nextAccepted >= signal.helpersRequired ? 'MATCHED' : 'PARTIALLY_MATCHED';

  return {
    ...signal,
    accepted: nextAccepted,
    status: nextStatus,
  } satisfies Signal;
};

export const clampRequestCount = (value: string, fallback = dispatchLimits.defaultHelpers) =>
  Number(value) > 0 ? Number(value) : fallback;

export type ParsedRequestForm = {
  task: string;
  helpersRequired: number;
  rewardPerHelper: number;
  duration: string;
  radiusKm: number;
};

/**
 * Validates and normalises the broadcast form. Throws a single `AppError`
 * with a user-facing message for the first problem found.
 */
export const parseRequestForm = (form: {
  task: string;
  helpers: string;
  reward: string;
  duration: string;
  radius: string;
}): ParsedRequestForm => {
  const task = form.task.trim();
  if (task.length < 5) {
    throw new AppError(
      'VALIDATION',
      'Add a short description (at least 5 characters) so nearby helpers know what you need.',
    );
  }

  const helpersRequired = Number(form.helpers);
  if (!Number.isInteger(helpersRequired) || helpersRequired < dispatchLimits.minHelpers || helpersRequired > dispatchLimits.maxHelpers) {
    throw new AppError('VALIDATION', `Choose between ${dispatchLimits.minHelpers} and ${dispatchLimits.maxHelpers} helpers.`);
  }

  const rewardPerHelper = Number(form.reward);
  if (!Number.isFinite(rewardPerHelper) || rewardPerHelper < dispatchLimits.minReward) {
    throw new AppError('VALIDATION', 'Add a valid reward per helper.');
  }

  const radiusKm = Number.parseFloat(form.radius);
  if (!Number.isFinite(radiusKm) || radiusKm < dispatchLimits.minRadiusKm || radiusKm > dispatchLimits.maxRadiusKm) {
    throw new AppError('VALIDATION', `Use a search radius between ${dispatchLimits.minRadiusKm} and ${dispatchLimits.maxRadiusKm} km.`);
  }

  return {
    task,
    helpersRequired,
    rewardPerHelper,
    duration: form.duration.trim() || 'Approximately 1 hour',
    radiusKm,
  };
};

export const isValidEmail = (email: string): boolean =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
