// Ambient declarations for the Deno runtime APIs used by Supabase Edge Functions.
//
// Edge Functions execute on Deno, not Node, so the Expo/React Native TypeScript
// project cannot type them. This file (together with `modules.d.ts`) is picked
// up only by `supabase/functions/tsconfig.json`, which scopes a Deno-shaped
// environment to this folder and keeps it out of the app project.
//
// Keep this file free of top-level `import`/`export`: it must stay a global
// script so the `Deno` namespace below is ambient rather than module-scoped.

declare namespace Deno {
  interface Env {
    get(key: string): string | undefined;
    set(key: string, value: string): void;
    has(key: string): boolean;
    delete(key: string): void;
    toObject(): Record<string, string>;
  }

  const env: Env;

  interface ServeHandlerInfo {
    remoteAddr: {
      hostname: string;
      port: number;
      transport: 'tcp' | 'udp';
    };
  }

  interface ServeOptions {
    port?: number;
    hostname?: string;
    signal?: AbortSignal;
    onListen?: (params: { hostname: string; port: number }) => void;
    onError?: (error: unknown) => Response | Promise<Response>;
  }

  type ServeHandler = (
    request: Request,
    info: ServeHandlerInfo,
  ) => Response | Promise<Response>;

  function serve(handler: ServeHandler): void;
  function serve(options: ServeOptions, handler: ServeHandler): void;

  function exit(code?: number): never;

  const version: {
    deno: string;
    v8: string;
    typescript: string;
  };
}
