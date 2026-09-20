export type AppErrorCode =
  | 'AUTH_REQUIRED'
  | 'NETWORK'
  | 'PERMISSION_DENIED'
  | 'VALIDATION'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'UNKNOWN';

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly userMessage: string;

  constructor(code: AppErrorCode, userMessage: string, detail?: unknown) {
    super(userMessage);
    this.name = 'AppError';
    this.code = code;
    this.userMessage = userMessage;
    if (detail !== undefined) {
      this.cause = detail;
    }
  }
}

const USER_MESSAGES: Record<AppErrorCode, string> = {
  AUTH_REQUIRED: 'Please sign in to continue.',
  NETWORK: 'Network problem. Check your connection and try again.',
  PERMISSION_DENIED: 'Permission is required for this feature.',
  VALIDATION: 'Some details are invalid. Please review and try again.',
  NOT_FOUND: 'We could not find what you were looking for.',
  CONFLICT: 'That action is no longer available. Please refresh.',
  UNKNOWN: 'Something went wrong. Please try again.',
};

export const toUserMessage = (error: unknown): string => {
  if (error instanceof AppError) {
    return error.userMessage;
  }
  return USER_MESSAGES.UNKNOWN;
};

export const wrapError = (error: unknown): AppError => {
  if (error instanceof AppError) {
    return error;
  }
  return new AppError('UNKNOWN', USER_MESSAGES.UNKNOWN, error);
};

export const reportError = (context: string, error: unknown): void => {
  // Production builds should forward this to a crash-reporting service
  // (e.g. Sentry) via a transport configured at app start-up.
  if (__DEV__) {
    console.warn(`[READY/NEEDY] ${context}:`, error);
  }
};
