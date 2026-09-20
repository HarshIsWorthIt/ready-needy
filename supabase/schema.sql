CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE public.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text UNIQUE NOT NULL,
  phone text,
  profile_photo text,
  rating numeric(3,2) DEFAULT 0,
  verification_status text DEFAULT 'UNVERIFIED',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.user_modes (
  user_id uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  mode text NOT NULL CHECK (mode IN ('OFFLINE', 'READY', 'NEEDY')),
  latitude double precision,
  longitude double precision,
  location_updated_at timestamptz,
  ready_since timestamptz,
  availability_status text NOT NULL DEFAULT 'AVAILABLE'
);

CREATE TABLE public.user_preferences (
  user_id uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  notifications_enabled boolean NOT NULL DEFAULT true,
  location_sharing_enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  needy_user_id uuid NOT NULL REFERENCES public.users(id),
  task_description text NOT NULL,
  helpers_required integer NOT NULL CHECK (helpers_required > 0),
  reward_per_helper integer NOT NULL DEFAULT 0,
  duration text,
  latitude double precision NOT NULL,
  longitude double precision NOT NULL,
  search_radius integer NOT NULL DEFAULT 1000,
  status text NOT NULL CHECK (
    status IN (
      'DRAFT',
      'SEARCHING',
      'PARTIALLY_MATCHED',
      'MATCHED',
      'ARRIVING',
      'IN_PROGRESS',
      'COMPLETED',
      'CANCELLED',
      'EXPIRED',
      'DISPUTED'
    )
  ),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.request_helpers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.requests(id) ON DELETE CASCADE,
  ready_user_id uuid NOT NULL REFERENCES public.users(id),
  accepted_at timestamptz,
  status text NOT NULL CHECK (
    status IN (
      'SIGNALLED',
      'ACCEPTED',
      'REJECTED',
      'ASSIGNED',
      'TRAVELLING',
      'ARRIVED',
      'WORKING',
      'COMPLETED',
      'CANCELLED'
    )
  ),
  arrival_time timestamptz,
  completed_at timestamptz
);

CREATE TABLE public.ratings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.requests(id) ON DELETE CASCADE,
  from_user_id uuid NOT NULL REFERENCES public.users(id),
  to_user_id uuid NOT NULL REFERENCES public.users(id),
  rating integer NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.device_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  token text NOT NULL,
  platform text NOT NULL CHECK (platform IN ('android', 'ios', 'web')),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, token)
);

CREATE INDEX idx_user_modes_ready
  ON public.user_modes (mode, location_updated_at);

CREATE INDEX idx_requests_nearby
  ON public.requests (latitude, longitude, status);

CREATE INDEX idx_request_helpers_request
  ON public.request_helpers (request_id, ready_user_id);

CREATE INDEX idx_device_tokens_user ON public.device_tokens (user_id);

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_modes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.request_helpers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ratings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.device_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS users_own_record ON public.users;
CREATE POLICY users_own_record ON public.users
  FOR ALL USING (id = auth.uid()) WITH CHECK (id = auth.uid());

DROP POLICY IF EXISTS user_modes_own_record ON public.user_modes;
CREATE POLICY user_modes_own_record ON public.user_modes
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS user_preferences_own_record ON public.user_preferences;
CREATE POLICY user_preferences_own_record ON public.user_preferences
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS requests_participant_access ON public.requests;
CREATE POLICY requests_participant_access ON public.requests
  FOR SELECT USING (
    needy_user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.request_helpers rh
      WHERE rh.request_id = requests.id AND rh.ready_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS requests_owner_insert ON public.requests;
CREATE POLICY requests_owner_insert ON public.requests
  FOR INSERT WITH CHECK (needy_user_id = auth.uid());

DROP POLICY IF EXISTS requests_owner_update ON public.requests;
CREATE POLICY requests_owner_update ON public.requests
  FOR UPDATE USING (needy_user_id = auth.uid()) WITH CHECK (needy_user_id = auth.uid());

DROP POLICY IF EXISTS request_helpers_participant_access ON public.request_helpers;
CREATE POLICY request_helpers_participant_access ON public.request_helpers
  FOR SELECT USING (
    ready_user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.requests r
      WHERE r.id = request_helpers.request_id AND r.needy_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS ratings_participant_access ON public.ratings;
CREATE POLICY ratings_participant_access ON public.ratings
  FOR ALL USING (from_user_id = auth.uid() OR to_user_id = auth.uid())
  WITH CHECK (from_user_id = auth.uid());

DROP POLICY IF EXISTS device_tokens_own_record ON public.device_tokens;
CREATE POLICY device_tokens_own_record ON public.device_tokens
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE UNIQUE INDEX idx_request_helpers_unique_user
  ON public.request_helpers (request_id, ready_user_id);

CREATE OR REPLACE FUNCTION public.find_nearby_ready_users(
  p_latitude double precision,
  p_longitude double precision,
  p_radius_meters integer DEFAULT 1000
)
RETURNS TABLE (
  user_id uuid,
  name text,
  rating numeric,
  distance_meters double precision
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    u.id,
    u.name,
    u.rating,
    ST_Distance(
      ST_SetSRID(ST_MakePoint(um.longitude, um.latitude), 4326)::geography,
      ST_SetSRID(ST_MakePoint(p_longitude, p_latitude), 4326)::geography
    ) AS distance_meters
  FROM public.users AS u
  JOIN public.user_modes AS um ON um.user_id = u.id
  WHERE um.mode = 'READY'
    AND um.latitude IS NOT NULL
    AND um.longitude IS NOT NULL
    AND ST_DWithin(
      ST_SetSRID(ST_MakePoint(um.longitude, um.latitude), 4326)::geography,
      ST_SetSRID(ST_MakePoint(p_longitude, p_latitude), 4326)::geography,
      p_radius_meters
    )
  ORDER BY distance_meters;
$$;

CREATE OR REPLACE FUNCTION public.accept_helper_for_request(
  p_request_id uuid,
  p_ready_user_id uuid
)
RETURNS TABLE (
  id uuid,
  task_description text,
  helpers_required integer,
  reward_per_helper integer,
  duration text,
  search_radius integer,
  accepted_count integer,
  status text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  current_request public.requests%ROWTYPE;
  current_count integer;
BEGIN
  SELECT * INTO current_request
  FROM public.requests
  WHERE public.requests.id = p_request_id
  FOR UPDATE;

  IF NOT FOUND OR current_request.status NOT IN ('SEARCHING', 'PARTIALLY_MATCHED') THEN
    RETURN;
  END IF;

  INSERT INTO public.request_helpers (request_id, ready_user_id, accepted_at, status)
  VALUES (p_request_id, p_ready_user_id, now(), 'ACCEPTED')
  ON CONFLICT (request_id, ready_user_id) DO NOTHING;

  SELECT count(*)::integer INTO current_count
  FROM public.request_helpers
  WHERE request_helpers.request_id = p_request_id
    AND request_helpers.status IN ('ACCEPTED', 'ASSIGNED', 'TRAVELLING', 'ARRIVED', 'WORKING', 'COMPLETED');

  UPDATE public.requests
  SET status = CASE
    WHEN current_count >= current_request.helpers_required THEN 'MATCHED'
    ELSE 'PARTIALLY_MATCHED'
  END,
  updated_at = now()
  WHERE requests.id = p_request_id;

  RETURN QUERY
  SELECT
    current_request.id,
    current_request.task_description,
    current_request.helpers_required,
    current_request.reward_per_helper,
    current_request.duration,
    current_request.search_radius,
    current_count,
    CASE
      WHEN current_count >= current_request.helpers_required THEN 'MATCHED'
      ELSE 'PARTIALLY_MATCHED'
    END;
END;
$$;

ALTER PUBLICATION supabase_realtime ADD TABLE public.requests;
