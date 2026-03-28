import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Content-Type": "application/json",
};

const normalizeFirstName = (name?: string | null) =>
  (name || "").split(" ")[0]?.trim().toLowerCase() || "";

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

    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response(JSON.stringify({ error: "Missing Supabase environment configuration" }), {
        headers: corsHeaders,
        status: 500,
      });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json();
    const { email, password, name, role, home_region, actorStaffId } = body;

    if (!email || !password || !name || !role) {
      return new Response(JSON.stringify({ error: "Missing required user fields" }), {
        headers: corsHeaders,
        status: 400,
      });
    }

    let callerIsAdmin = false;
    let callerAuthUserId: string | null = null;

    const authHeader = req.headers.get("Authorization");

    if (authHeader) {
      const token = authHeader.replace("Bearer ", "");
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser(token);

      if (!authError && user) {
        callerAuthUserId = user.id;

        const { data: callerStaff } = await supabase
          .from("staff")
          .select("role, name")
          .eq("user_id", user.id)
          .maybeSingle();

        if (
          callerStaff?.role === "admin" ||
          normalizeFirstName(callerStaff?.name) === "rowan" ||
          normalizeFirstName(callerStaff?.name) === "admin"
        ) {
          callerIsAdmin = true;
        }
      }
    }

    if (!callerIsAdmin && typeof actorStaffId === "number") {
      const { data: fallbackCallerStaff } = await supabase
        .from("staff")
        .select("staff_id, role, name")
        .eq("staff_id", actorStaffId)
        .maybeSingle();

      if (
        fallbackCallerStaff &&
        (
          fallbackCallerStaff.role === "admin" ||
          normalizeFirstName(fallbackCallerStaff.name) === "rowan" ||
          normalizeFirstName(fallbackCallerStaff.name) === "admin"
        )
      ) {
        callerIsAdmin = true;
      }
    }

    if (!callerIsAdmin) {
      return new Response(JSON.stringify({ error: "Forbidden: Admins only" }), {
        headers: corsHeaders,
        status: 403,
      });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const trimmedName = String(name).trim();

    const { data: existingStaff } = await supabase
      .from("staff")
      .select("staff_id")
      .eq("name", trimmedName)
      .maybeSingle();

    if (existingStaff) {
      return new Response(JSON.stringify({ error: "A staff record with this name already exists" }), {
        headers: corsHeaders,
        status: 400,
      });
    }

    const { data: existingUsers, error: listUsersError } = await supabase.auth.admin.listUsers();

    if (listUsersError) {
      return new Response(JSON.stringify({ error: listUsersError.message }), {
        headers: corsHeaders,
        status: 500,
      });
    }

    const emailAlreadyExists = existingUsers.users.some(
      (user) => (user.email || "").trim().toLowerCase() === normalizedEmail
    );

    if (emailAlreadyExists) {
      return new Response(JSON.stringify({ error: "A user with this email already exists" }), {
        headers: corsHeaders,
        status: 400,
      });
    }

    const { data: authData, error: createAuthError } = await supabase.auth.admin.createUser({
      email: normalizedEmail,
      password: String(password),
      email_confirm: true,
      user_metadata: { name: trimmedName, created_by: callerAuthUserId || actorStaffId || null },
    });

    if (createAuthError || !authData.user) {
      return new Response(JSON.stringify({ error: createAuthError?.message || "Failed to create auth user" }), {
        headers: corsHeaders,
        status: 400,
      });
    }

    const { data: staffData, error: staffError } = await supabase
      .from("staff")
      .insert({
        user_id: authData.user.id,
        name: trimmedName,
        role: String(role),
        home_region: home_region || "england-and-wales",
        is_hidden: false,
      })
      .select()
      .single();

    if (staffError) {
      await supabase.auth.admin.deleteUser(authData.user.id);

      return new Response(JSON.stringify({ error: staffError.message }), {
        headers: corsHeaders,
        status: 400,
      });
    }

    return new Response(JSON.stringify({ user: staffData }), {
      headers: corsHeaders,
      status: 200,
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      headers: corsHeaders,
      status: 500,
    });
  }
});