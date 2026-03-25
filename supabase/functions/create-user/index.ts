import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Content-Type": "application/json",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        headers: corsHeaders,
        status: 405,
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify the caller is an admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing Authorization header");
    const token = authHeader.replace("Bearer ", "");
    
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) throw new Error("Unauthorized");

    const { data: callerStaff } = await supabase
      .from("staff")
      .select("role")
      .eq("user_id", user.id)
      .single();
      
    if (callerStaff?.role !== "admin") throw new Error("Forbidden: Admins only");

    const { email, password, name, role, home_region } = await req.json();

    // Create user in Supabase Auth
    const { data: authData, error: createAuthError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (createAuthError) throw createAuthError;

    // Insert into staff table
    const { data: staffData, error: staffError } = await supabase
      .from("staff")
      .insert({
        user_id: authData.user.id,
        email,
        name,
        role,
        home_region,
        is_hidden: false,
      })
      .select()
      .single();

    if (staffError) {
      // Rollback auth user creation if staff insert fails
      await supabase.auth.admin.deleteUser(authData.user.id);
      throw staffError;
    }

    return new Response(JSON.stringify({ user: staffData }), {
      headers: corsHeaders,
      status: 200,
    });
  } catch (err) {
    console.error("Supabase Edge error:", err);

    return new Response(JSON.stringify({ error: String(err) }), {
      headers: corsHeaders,
      status: 500,
    });
  }
});