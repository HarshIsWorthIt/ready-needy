export type Screen =
  | 'welcome'
  | 'login'
  | 'verification'
  | 'requirements'
  | 'home'
  | 'ready'
  | 'need'
  | 'signal'
  | 'active'
  | 'complete'
  | 'account'
  | 'settings';

export type UserMode = 'OFFLINE' | 'READY' | 'NEEDY';

export type RequestStatus =
  | 'SEARCHING'
  | 'PARTIALLY_MATCHED'
  | 'MATCHED'
  | 'ARRIVING'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'EXPIRED';

export type ReadyUser = {
  id: string;
  name: string;
  rating: string;
  verified: boolean;
};

export type Signal = {
  id: string;
  task: string;
  distance: string;
  helpersRequired: number;
  reward: number;
  duration: string;
  accepted: number;
  status: 'SEARCHING' | 'PARTIALLY_MATCHED' | 'MATCHED';
};

export type RequestFormState = {
  task: string;
  helpers: string;
  reward: string;
  duration: string;
  radius: string;
};
