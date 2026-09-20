import { ReadyUser, Signal } from './types';

export const userName = 'Aman';

export const helperProfiles: ReadyUser[] = [
  { id: 'u1', name: 'Aman', rating: '4.2', verified: true },
  { id: 'u2', name: 'Rohan', rating: '4.8', verified: true },
  { id: 'u3', name: 'Kunal', rating: '4.5', verified: true },
  { id: 'u4', name: 'Rahul', rating: '4.7', verified: true },
  { id: 'u5', name: 'Vikas', rating: '4.4', verified: false },
];

export const defaultRequest = {
  task: 'Move furniture',
  helpers: '3',
  reward: '300',
  duration: 'Approximately 1 hour',
  radius: '1 km',
};

export const seedSignals: Signal[] = [
  {
    id: 'sig-1',
    task: 'Hostel shifting help',
    distance: '650 m away',
    helpersRequired: 3,
    reward: 300,
    duration: 'Approximately 1 hour',
    accepted: 1,
    status: 'PARTIALLY_MATCHED',
  },
  {
    id: 'sig-2',
    task: 'Event setup',
    distance: '820 m away',
    helpersRequired: 2,
    reward: 250,
    duration: 'Approximately 45 mins',
    accepted: 0,
    status: 'SEARCHING',
  },
];
