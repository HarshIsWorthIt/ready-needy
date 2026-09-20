import { helperProfiles } from './mockData';
import { dispatchLimits } from './config';
import { AppError } from './errors';
import { getAuthenticatedUserId, supabase, usesSupabase } from './supabase';
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

/** Formats a raw metre distance into a human-readable label. */
export const formatDistance = (meters: number | null | undefined): string => {
  if (meters === null || meters === undefined || !Number.isFinite(meters)) {
    return 'nearby';
  }
  if (meters < 1000) {
    return `${Math.max(1, Math.round(meters))} m away`;
  }
  return `${(meters / 1000).toFixed(1)} km away`;
};

export const updateUserModeRemote = async (
  mode: 'OFFLINE' | 'READY' | 'NEEDY',
  location?: { latitude: number; longitude: number } | null,
) => {
  if (!usesSupabase || !supabase) {
    return;
  }

  const userId = await getAuthenticatedUserId();
  if (!userId) {
    return;
  }

  const { error } = await supabase.from('user_modes').upsert({
    user_id: userId,
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
  if (!usesSupabase || !supabase) {
    return;
  }

  const userId = await getAuthenticatedUserId();
  if (!userId) {
    return;
  }

  const { error } = await supabase.from('user_preferences').upsert({
    user_id: userId,
    notifications_enabled: preferences.notificationsEnabled,
    location_sharing_enabled: preferences.locationSharingEnabled,
    updated_at: new Date().toISOString(),
  });
  if (error) {
    throw error;
  }
};

export const createNeedRequest = (form: RequestFormState): Signal => {
  const helpersRequired = Number(form.helpers) || dispatchLimits.defaultHelpers;
  const radiusKm = Number.parseFloat(form.radius) || dispatchLimits.defaultRadiusKm;

  const request: DispatchRequest = {
    id: `req-${Date.now()}`,
    needyUserId: 'local-user',
    task: form.task || 'Move furniture',
    helpersRequired,
    rewardPerHelper: Number(form.reward) || dispatchLimits.defaultReward,
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
    distance: formatDistance(radiusKm * 650),
    helpersRequired: request.helpersRequired,
    reward: request.rewardPerHelper,
    duration: request.duration,
    accepted: request.acceptedUserIds.length,
    status: 'SEARCHING',
  };
};

export const requestToSignal = (
  request: DispatchRequest,
  distanceMeters?: number | null,
): Signal => ({
  id: request.id,
  task: request.task,
  distance: distanceMeters != null ? formatDistance(distanceMeters) : formatDistance(request.radiusKm * 650),
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
  if (!usesSupabase || !supabase) {
    return createNeedRequest(form);
  }

  const userId = await getAuthenticatedUserId();
  if (!userId) {
    throw new AppError('AUTH_REQUIRED', 'Sign in to dispatch requests.');
  }

  const radiusKm = Number.parseFloat(form.radius) || dispatchLimits.defaultRadiusKm;
  const { data, error } = await supabase
    .from('requests')
    .insert({
      needy_user_id: userId,
      task_description: form.task,
      helpers_required: Number(form.helpers) || dispatchLimits.defaultHelpers,
      reward_per_helper: Number(form.reward) || dispatchLimits.defaultReward,
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
    distance: formatDistance(data.search_radius * 0.65),
    helpersRequired: data.helpers_required,
    reward: data.reward_per_helper,
    duration: data.duration ?? 'Approximately 1 hour',
    accepted: 0,
    status: 'SEARCHING',
  };
};

export const findNearbyReadyUsersRemote = async (radiusKm = 1) => {
  if (!usesSupabase || !supabase) {
    return dispatchStore.readyUsers.filter((user) => user.radiusKm <= radiusKm);
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
): Promise<Signal | null> => {
  if (!usesSupabase || !supabase) {
    const request = dispatchStore.requests.find((item) => item.id === requestId);
    if (!request) {
      return null;
    }
    if (request.acceptedUserIds.length >= request.helpersRequired) {
      request.status = 'MATCHED';
      return null;
    }
    request.acceptedUserIds.push('local-ready-user');
    const accepted = request.acceptedUserIds.length;
    const status: Signal['status'] =
      accepted >= request.helpersRequired ? 'MATCHED' : 'PARTIALLY_MATCHED';
    if (accepted >= request.helpersRequired) {
      request.status = 'MATCHED';
    }
    return {
      id: request.id,
      task: request.task,
      distance: formatDistance(request.radiusKm * 650),
      helpersRequired: request.helpersRequired,
      reward: request.rewardPerHelper,
      duration: request.duration,
      accepted,
      status,
    };
  }

  const userId = await getAuthenticatedUserId();
  if (!userId) {
    throw new AppError('AUTH_REQUIRED', 'Sign in to accept requests.');
  }

  const { data, error } = await supabase.rpc('accept_helper_for_request', {
    p_request_id: requestId,
    p_ready_user_id: userId,
  });

  if (error) {
    throw error;
  }

  if (!data || data.length === 0) {
    return null;
  }

  const row = data[0];
  return {
    id: row.id,
    task: row.task_description,
    distance: formatDistance(row.search_radius * 0.65),
    helpersRequired: row.helpers_required,
    reward: row.reward_per_helper,
    duration: row.duration ?? 'Approximately 1 hour',
    accepted: row.accepted_count,
    status: row.status === 'MATCHED' ? 'MATCHED' : 'PARTIALLY_MATCHED',
  };
};

export const cancelRequestRemote = async (requestId: string) => {
  if (!usesSupabase || !supabase) {
    dispatchStore.requests = dispatchStore.requests.filter((item) => item.id !== requestId);
    return;
  }

  const userId = await getAuthenticatedUserId();
  if (!userId) {
    throw new AppError('AUTH_REQUIRED', 'Sign in to manage your requests.');
  }

  const { error } = await supabase
    .from('requests')
    .update({ status: 'CANCELLED', updated_at: new Date().toISOString() })
    .eq('id', requestId)
    .eq('needy_user_id', userId)
    .in('status', ['SEARCHING', 'PARTIALLY_MATCHED', 'MATCHED']);

  if (error) {
    throw error;
  }
};

export const completeRequestRemote = async (requestId: string) => {
  if (!usesSupabase || !supabase) {
    const request = dispatchStore.requests.find((item) => item.id === requestId);
    if (request) {
      request.status = 'COMPLETED';
    }
    return;
  }

  const userId = await getAuthenticatedUserId();
  if (!userId) {
    throw new AppError('AUTH_REQUIRED', 'Sign in to manage your requests.');
  }

  const { error } = await supabase
    .from('requests')
    .update({ status: 'COMPLETED', updated_at: new Date().toISOString() })
    .eq('id', requestId)
    .eq('needy_user_id', userId);

  if (error) {
    throw error;
  }
};

export const submitRatingRemote = async (
  requestId: string,
  rating: number,
  comment?: string,
) => {
  if (rating < 1 || rating > 5) {
    throw new AppError('VALIDATION', 'Rating must be between 1 and 5 stars.');
  }

  if (!usesSupabase || !supabase) {
    return { local: true as const };
  }

  const userId = await getAuthenticatedUserId();
  if (!userId) {
    throw new AppError('AUTH_REQUIRED', 'Sign in to rate your helpers.');
  }

  // Resolve the first accepted helper for this request so the rating is
  // attributed to the person who actually showed up.
  const { data: helpers, error: helpersError } = await supabase
    .from('request_helpers')
    .select('ready_user_id')
    .eq('request_id', requestId)
    .in('status', ['ACCEPTED', 'ASSIGNED', 'TRAVELLING', 'ARRIVED', 'WORKING', 'COMPLETED'])
    .order('accepted_at', { ascending: true })
    .limit(1);

  if (helpersError) {
    throw helpersError;
  }

  const toUserId = helpers?.[0]?.ready_user_id;
  if (!toUserId) {
    // Nothing to rate yet — the request is completed without a rating.
    return { local: false as const, rated: false as const };
  }

  const { error } = await supabase.from('ratings').insert({
    request_id: requestId,
    from_user_id: userId,
    to_user_id: toUserId,
    rating,
    comment: comment ?? null,
  });

  if (error) {
    throw error;
  }
  return { local: false as const, rated: true as const };
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
        const row = payload.new as {
          id: string;
          task_description: string;
          helpers_required: number;
          reward_per_helper: number;
          duration: string | null;
          search_radius: number;
          status: RequestStatus;
        };
        onSignal({
          id: row.id,
          task: row.task_description,
          distance: formatDistance(row.search_radius * 0.65),
          helpersRequired: row.helpers_required,
          reward: row.reward_per_helper,
          duration: row.duration ?? 'Approximately 1 hour',
          accepted: 0,
          status: row.status === 'MATCHED' ? 'MATCHED' : row.status === 'PARTIALLY_MATCHED' ? 'PARTIALLY_MATCHED' : 'SEARCHING',
        });
      },
    )
    .subscribe();

  return () => {
    void client.removeChannel(channel);
  };
};
