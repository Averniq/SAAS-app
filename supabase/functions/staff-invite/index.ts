import { createStaffInviteHandler } from './handler.mjs';
// AVENIQ_* settings are function-only configuration. Do not use SUPABASE_SERVICE_ROLE_KEY.
Deno.serve(createStaffInviteHandler({
  supabaseUrl: Deno.env.get('AVENIQ_SUPABASE_INTERNAL_URL') || Deno.env.get('SUPABASE_URL'),
  publicKey: Deno.env.get('AVENIQ_SUPABASE_PUBLISHABLE_KEY') || Deno.env.get('SUPABASE_ANON_KEY'),
  appOrigin: Deno.env.get('AVENIQ_APP_ORIGIN'),
}));
