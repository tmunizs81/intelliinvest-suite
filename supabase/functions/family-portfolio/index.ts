import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
    }

    // Create client with user's token to get their identity
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
    }

    const { owner_id } = await req.json();
    if (!owner_id) {
      return new Response(JSON.stringify({ error: 'owner_id required' }), { status: 400, headers: corsHeaders });
    }

    // Use service role to check family membership
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    // Verify user is an active family member of the owner
    const { data: membership, error: memberError } = await adminClient
      .from('family_members')
      .select('*')
      .eq('owner_id', owner_id)
      .eq('member_id', user.id)
      .eq('status', 'active')
      .maybeSingle();

    if (memberError || !membership) {
      return new Response(JSON.stringify({ error: 'Acesso negado. Você não é membro desta família.' }), {
        status: 403, headers: corsHeaders,
      });
    }

    // Fetch owner's holdings
    const { data: holdings, error: holdingsError } = await adminClient
      .from('holdings')
      .select('*')
      .eq('user_id', owner_id);

    if (holdingsError) throw holdingsError;

    // Fetch owner's profile
    const { data: profile } = await adminClient
      .from('profiles')
      .select('display_name')
      .eq('user_id', owner_id)
      .maybeSingle();

    // Fetch owner's cash balance
    const { data: cashData } = await adminClient
      .from('cash_balance')
      .select('balance, broker')
      .eq('user_id', owner_id);

    const totalCash = (cashData || []).reduce((s: number, r: any) => s + Number(r.balance), 0);

    return new Response(JSON.stringify({
      holdings: holdings || [],
      ownerName: profile?.display_name || 'Proprietário',
      cashBalance: totalCash,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
  }
});
