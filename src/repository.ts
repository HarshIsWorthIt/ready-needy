import { helperProfiles } from './mockData';
import { backendUserId, supabase, usesSupabase } from './supabase';
import { RequestFormState, RequestStatus, Signal } from './types';

export type DispatchRequest = {
  id: string;
  needyUserId: string;
  task: string;
  helpersRequired: number;
  rewardPerHelper: number;
  duration: string;
  radiusKm: number;
  status: RequestStatus;
  createdAt: string;
  acceptedUserIds: string[];
};

export const dispatchStore = {
  readyUsers: helperProfiles.map((user) => ({
    ...user,
    mode: 'READY' as const,
    locationLastUpdated: new Date().toISOString(),
    radiusKm: 1,
  })),
  requests: [] as DispatchRequest[],
};

export const findNearbyReadyUsers = (radiusKm = 1) =>
  dispatchStore.readyUsers.filter((user) => user.radiusKm <= radiusKm);

export const updateUserModeRemote = async (
  mode: 'OFFLINE' | 'READY' | 'NEEDY',
  location?: { latitude: number; longitude: number } | null,
) => {
  if (!usesSupabase || !supabase || !backendUserId) {
    return;
  }

  const { error } = await supabase.from('user_modes').upsert({
    user_id: backendUserId,
    mode,
    latitude: location?.latitude ?? null,
    longitude: location?.longitude ?? null,
    location_updated_at: location ? new Date().toISOString() : null,
    ready_since: mode === 'READY' ? new Date().toISOString() : null,
    availability_status: mode === 'READY' ? 'AVAILABLE' : 'UNAVAILABLE',
  });
  if (error) {
    throw error;
  }
};

export const updateUserPreferencesRemote = async (preferences: {
  notificationsEnabled: boolean;
  locationSharingEnabled: boolean;
}) => {
  if (!usesSupabase || !supabase || !backendUserId) {
    return;
  }

  const { error } = await supabase.from('user_preferences').upsert({
    user_id: backendUserId,
    notifications_enabled: preferences.notificationsEnabled,
    location_sharing_enabled: preferences.locationSharingEnabled,
    updated_at: new Date().toISOString(),
  });
  if (error) {
    throw error;
  }
};

export const createNeedRequest = (form: RequestFormState): Signal => {
  const helpersRequired = Number(form.helpers) || 3;
  const radiusKm = Number.parseFloat(form.radius) || 1;

  const request: DispatchRequest = {
    id: `req-${Date.now()}`,
    needyUserId: 'user-aman',
    task: form.task || 'Move furniture',
    helpersRequired,
    rewardPerHelper: Number(form.reward) || 300,
    duration: form.duration || 'Approximately 1 hour',
    radiusKm,
    status: 'SEARCHING',
    createdAt: new Date().toISOString(),
    acceptedUserIds: [],
  };

  dispatchStore.requests.push(request);

  return {
    id: request.id,
    task: request.task,
    distance: `${Math.round(radiusKm * 650)} m away`,
    helpersRequired: request.helpersRequired,
    reward: request.rewardPerHelper,
    duration: request.duration,
    accepted: request.acceptedUserIds.length,
    status: 'SEARCHING',
  };
};

const requestToSignal = (request: DispatchRequest): Signal => ({
  id: request.id,
  task: request.task,
  distance: `${Math.round(request.radiusKm * 650)} m away`,
  helpersRequired: request.helpersRequired,
  reward: request.rewardPerHelper,
  duration: request.duration,
  accepted: request.acceptedUserIds.length,
  status:
    request.status === 'MATCHED'
      ? 'MATCHED'
      : request.acceptedUserIds.length > 0
        ? 'PARTIALLY_MATCHED'
        : 'SEARCHING',
});

export const createNeedRequestRemote = async (form: RequestFormState): Promise<Signal> => {
  if (!usesSupabase || !supabase || !backendUserId) {
    return createNeedRequest(form);
  }

  const radiusKm = Number.parseFloat(form.radius) || 1;
  const { data, error } = await supabase
    .from('requests')
    .insert({
      needy_user_id: backendUserId,
      task_description: form.task || 'Move furniture',
      helpers_required: Number(form.helpers) || 3,
      reward_per_helper: Number(form.reward) || 300,
      duration: form.duration || 'Approximately 1 hour',
      latitude: 28.6,
      longitude: 77.4,
      search_radius: Math.round(radiusKm * 1000),
      status: 'SEARCHING',
    })
    .select('id, task_description, helpers_required, reward_per_helper, duration, search_radius, status')
    .single();

  if (error || !data) {
    throw error ?? new Error('Supabase did not return the created request.');
  }

  return {
    id: data.id,
    task: data.task_description,
    distance: `${Math.round(data.search_radius * 0.65)} m away`,
    helpersRequired: data.helpers_required,
    reward: data.reward_per_helper,
    duration: data.duration ?? 'Approximately 1 hour',
    accepted: 0,
    status: 'SEARCHING',
  };
};

export const findNearbyReadyUsersRemote = async (radiusKm = 1) => {
  if (!usesSupabase || !supabase) {
    return findNearbyReadyUsers(radiusKm);
  }

  const { data, error } = await supabase.rpc('find_nearby_ready_users', {
    p_latitude: 28.6,
    p_longitude: 77.4,
    p_radius_meters: Math.round(radiusKm * 1000),
  });

  if (error) {
    throw error;
  }

  return data ?? [];
};

export const acceptHelperForRequestRemote = async (
  requestId: string,
  readyUserId: string,
): Promise<Signal | null> => {
  if (!usesSupabase || !supabase) {
    return acceptHelperForRequest(requestId, readyUserId);
  }

  const { data, error } = await supabase.rpc('accept_helper_for_request', {
    p_request_id: requestId,
    p_ready_user_id: readyUserId,
  });

  if (error) {
    throw error;
  }

  if (!data) {
    return null;
  }

  return {
    id: data.id,
    task: data.task_description,
    distance: `${Math.round(data.search_radius * 0.65)} m away`,
    helpersRequired: data.helpers_required,
    reward: data.reward_per_helper,
    duration: data.duration ?? 'Approximately 1 hour',
    accepted: data.accepted_count,
    status: data.status === 'MATCHED' ? 'MATCHED' : 'PARTIALLY_MATCHED',
  };
};

export const subscribeToRequest = (requestId: string, onSignal: (signal: Signal) => void) => {
  if (!usesSupabase || !supabase) {
    return () => undefined;
  }

  const client = supabase;

  const channel = client
    .channel(`request:${requestId}`)
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'requests', filter: `id=eq.${requestId}` },
      (payload) => {
        const request = payload.new as DispatchRequest & {
          task_description: string;
          helpers_required: number;
          reward_per_helper: number;
          search_radius: number;
        };
        onSignal(
          requestToSignal({
            ...request,
            task: request.task_description,
            helpersRequired: request.helpers_required,
            rewardPerHelper: request.reward_per_helper,
            radiusKm: request.search_radius / 1000,
            acceptedUserIds: [],
          }),
        );
      },
    )
    .subscribe();

  return () => {
    void client.removeChannel(channel);
  };
};

export const acceptHelperForRequest = (requestId: string, readyUserId: string): Signal | null => {
  const request = dispatchStore.requests.find((item) => item.id === requestId);

  if (!request) {
    return null;
  }

  if (request.acceptedUserIds.length >= request.helpersRequired) {
    request.status = 'MATCHED';
    return null;
  }

  request.acceptedUserIds.push(readyUserId);

  const accepted = request.acceptedUserIds.length;
  const status: Signal['status'] =
    accepted >= request.helpersRequired ? 'MATCHED' : 'PARTIALLY_MATCHED';

  if (accepted >= request.helpersRequired) {
    request.status = 'MATCHED';
  }

  return {
    id: request.id,
    task: request.task,
    distance: `${Math.round(request.radiusKm * 650)} m away`,
    helpersRequired: request.helpersRequired,
    reward: request.rewardPerHelper,
    duration: request.duration,
    accepted,
    status,
  };
};
