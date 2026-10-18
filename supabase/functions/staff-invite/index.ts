import { createStaffInviteHandler } from './handler.mjs';
// Private reservation credential is server-only; never include it in frontend build configuration.
Deno.serve(createStaffInviteHandler({
  supabaseUrl: Deno.env.get('AVENIQ_SUPABASE_INTERNAL_URL') || Deno.env.get('SUPABASE_URL'),
  publicKey: Deno.env.get('AVENIQ_SUPABASE_PUBLISHABLE_KEY') || Deno.env.get('SUPABASE_ANON_KEY'),
  serverKey: Deno.env.get('AVENIQ_STAFF_INVITE_SERVER_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
  appOrigin: Deno.env.get('AVENIQ_APP_ORIGIN'),
}));
