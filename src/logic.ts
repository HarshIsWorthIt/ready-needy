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

export const clampRequestCount = (value: string, fallback = 3) =>
  Number(value) > 0 ? Number(value) : fallback;
