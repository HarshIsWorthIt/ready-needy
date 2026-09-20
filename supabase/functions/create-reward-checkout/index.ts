import Stripe from 'https://esm.sh/stripe@14.25.0?target=deno';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
  apiVersion: '2024-06-20',
  httpClient: Stripe.createFetchHttpClient(),
});

const allowedOrigins = (Deno.env.get('ALLOWED_ORIGINS') ?? '*').split(',').map((o) => o.trim());

const corsHeaders = (origin: string | null): Record<string, string> => ({
  'Access-Control-Allow-Origin':
    allowedOrigins.includes('*') || (origin && allowedOrigins.includes(origin))
      ? (origin ?? '*')
      : allowedOrigins[0] ?? '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
});

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders(request.headers.get('origin')) });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: request.headers.get('Authorization') ?? '' } } },
    );
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders(request.headers.get('origin')), 'Content-Type': 'application/json' } });
    }

    const { requestId } = await request.json();
    if (!requestId || typeof requestId !== 'string' || !UUID_PATTERN.test(requestId)) {
      return new Response(JSON.stringify({ error: 'requestId must be a valid UUID' }), { status: 400, headers: { ...corsHeaders(request.headers.get('origin')), 'Content-Type': 'application/json' } });
    }

    const { data: dispatchRequest, error } = await supabase
      .from('requests')
      .select('id, task_description, reward_per_helper, helpers_required, needy_user_id')
      .eq('id', requestId)
      .eq('needy_user_id', user.id)
      .single();
    if (error || !dispatchRequest) {
      return new Response(JSON.stringify({ error: 'Request not found' }), { status: 404, headers: { ...corsHeaders(request.headers.get('origin')), 'Content-Type': 'application/json' } });
    }

    const amount = dispatchRequest.reward_per_helper * dispatchRequest.helpers_required * 100;
    if (!Number.isFinite(amount) || amount <= 0) {
      return new Response(JSON.stringify({ error: 'Request has no payable reward configured' }), { status: 422, headers: { ...corsHeaders(request.headers.get('origin')), 'Content-Type': 'application/json' } });
    }

    const session = await stripe.checkout.sessions.create(
      {
        mode: 'payment',
        line_items: [{
          price_data: {
            currency: 'inr',
            product_data: { name: `READY/NEEDY: ${dispatchRequest.task_description}` },
            unit_amount: amount,
          },
          quantity: 1,
        }],
        metadata: { requestId: dispatchRequest.id },
        success_url: 'readynedy://payment/success?session_id={CHECKOUT_SESSION_ID}',
        cancel_url: 'readynedy://payment/cancelled',
      },
      // Idempotency keys travel as request options, never inside the params
      // body - Stripe rejects an `idempotency_key` field as an unknown
      // parameter. Keyed per request so double-taps never double-charge.
      { idempotencyKey: `reward-checkout:${dispatchRequest.id}` },
    );

    return new Response(JSON.stringify({ checkoutUrl: session.url }), { headers: { ...corsHeaders(request.headers.get('origin')), 'Content-Type': 'application/json' } });
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Payment setup failed' }), { status: 500, headers: { ...corsHeaders(request.headers.get('origin')), 'Content-Type': 'application/json' } });
  }
});
