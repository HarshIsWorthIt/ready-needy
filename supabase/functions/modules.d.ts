// Ambient declarations that map the `esm.sh` URL specifiers used by Supabase
// Edge Functions onto real types.
//
// Deno resolves `https://esm.sh/...` at runtime, but the TypeScript language
// service has no resolver for URL specifiers - without these declarations every
// import in `create-reward-checkout/index.ts` fails with TS2307.
//
// Keep this file free of top-level `import`/`export`: it must stay a global
// script, otherwise `declare module` is treated as module *augmentation* and
// errors with TS2664 instead of declaring a new ambient module.

// `@supabase/supabase-js` is already a direct dependency of this repository, so
// the URL specifier re-exports the genuine package types instead of a
// hand-written copy that could drift from the real API.
declare module 'https://esm.sh/@supabase/supabase-js@2' {
  export * from '@supabase/supabase-js';
}

// Stripe is *not* installed as a Node dependency (the edge function only ever
// loads it from esm.sh), so the surface actually used by the function is
// declared explicitly. Only add members here that the function genuinely calls,
// and copy the shapes from https://github.com/stripe/stripe-node.
declare module 'https://esm.sh/stripe@14.25.0?target=deno' {
  export interface HttpClient {
    getClientName(): string;
  }

  export interface StripeConfig {
    apiVersion?: string;
    httpClient?: HttpClient;
    maxNetworkRetries?: number;
    timeout?: number;
    host?: string;
    port?: string | number;
    protocol?: 'http' | 'https';
    telemetry?: boolean;
    typescript?: true;
  }

  /**
   * Per-request options. These are the SDK's second argument and are the only
   * supported way to send an idempotency key - Stripe rejects an
   * `idempotency_key` field inside the params body as an unknown parameter.
   */
  export interface RequestOptions {
    idempotencyKey?: string;
    apiVersion?: string;
    maxNetworkRetries?: number;
    timeout?: number;
  }

  export namespace Checkout {
    export interface PriceData {
      currency: string;
      product_data?: {
        name: string;
        description?: string;
        metadata?: Record<string, string>;
      };
      product?: string;
      unit_amount?: number;
      unit_amount_decimal?: string;
    }

    export interface LineItem {
      price?: string;
      price_data?: PriceData;
      quantity: number;
    }

    export interface SessionCreateParams {
      mode: 'payment' | 'setup' | 'subscription';
      success_url: string;
      line_items?: LineItem[];
      cancel_url?: string;
      client_reference_id?: string;
      customer?: string;
      customer_email?: string;
      metadata?: Record<string, string>;
      payment_intent_data?: {
        metadata?: Record<string, string>;
      };
      expires_at?: number;
    }

    export interface Session {
      id: string;
      object: 'checkout.session';
      url: string | null;
      status: 'open' | 'complete' | 'expired' | null;
      payment_status: 'paid' | 'unpaid' | 'no_payment_required';
      amount_total: number | null;
      currency: string | null;
      metadata: Record<string, string> | null;
    }

    export interface SessionsResource {
      create(
        params: SessionCreateParams,
        options?: RequestOptions,
      ): Promise<Session>;
      retrieve(
        id: string,
        options?: RequestOptions,
      ): Promise<Session>;
    }
  }

  export class Stripe {
    constructor(apiKey: string, config?: StripeConfig);

    static createFetchHttpClient(): HttpClient;
    static createNodeHttpClient(): HttpClient;

    readonly checkout: {
      sessions: Checkout.SessionsResource;
    };
  }

  export default Stripe;
}
