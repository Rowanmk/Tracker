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

    if (!supabaseUrl) {
      return new Response(JSON.stringify({
        error: "Missing Supabase environment configuration: SUPABASE_URL is not set for the edge function deployment",
      }), {
        headers: corsHeaders,
        status: 500,
      });
    }

    if (!supabaseServiceKey) {
      return new Response(JSON.stringify({
        error: "Missing Supabase service role configuration: SUPABASE_SERVICE_ROLE_KEY is not set in this edge function deployment. Add it in Supabase project secrets, then redeploy the create-user function.",
      }), {
        headers: corsHeaders,
        status: 500,
      });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json();
    const { email, password, name, role, home_region, actorStaffId } = body ?? {};

    if (!email || !password || !name || !role) {
      return new Response(JSON.stringify({ error: "Missing required user fields" }), {
        headers: corsHeaders,
        status: 400,
      });
    }

    let callerIsAdmin = false;
    let callerAuthUserId: string | null = null;

    const authHeader = req.headers.get("Authorization");

    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.replace("Bearer ", "").trim();

      if (token) {
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
    }

    if (!callerIsAdmin && typeof actorStaffId === "number") {
      const { data: fallbackCallerStaff, error: fallbackCallerError } = await supabase
        .from("staff")
        .select("staff_id, role, name, is_hidden")
        .eq("staff_id", actorStaffId)
        .maybeSingle();

      if (fallbackCallerError) {
        return new Response(JSON.stringify({ error: fallbackCallerError.message }), {
          headers: corsHeaders,
          status: 400,
        });
      }

      if (
        fallbackCallerStaff &&
        fallbackCallerStaff.is_hidden !== true &&
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
    const trimmedPassword = String(password);
    const normalizedRole = String(role).trim();

    const { data: existingStaffByName, error: existingStaffByNameError } = await supabase
      .from("staff")
      .select("staff_id")
      .eq("name", trimmedName)
      .maybeSingle();

    if (existingStaffByNameError) {
      return new Response(JSON.stringify({ error: existingStaffByNameError.message }), {
        headers: corsHeaders,
        status: 400,
      });
    }

    if (existingStaffByName) {
      return new Response(JSON.stringify({ error: "A staff record with this name already exists" }), {
        headers: corsHeaders,
        status: 400,
      });
    }

    const { data: staffRowsByUserId, error: duplicateUserIdCheckError } = await supabase
      .from("staff")
      .select("staff_id, user_id")
      .not("user_id", "is", null);

    if (duplicateUserIdCheckError) {
      return new Response(JSON.stringify({ error: duplicateUserIdCheckError.message }), {
        headers: corsHeaders,
        status: 400,
      });
    }

    const { data: existingUsers, error: listUsersError } = await supabase.auth.admin.listUsers();

    if (listUsersError) {
      return new Response(JSON.stringify({
        error: `Failed to list auth users: ${listUsersError.message}. This usually means the service role key is missing, invalid, or the function deployment is stale.`,
      }), {
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
      password: trimmedPassword,
      email_confirm: true,
      user_metadata: { name: trimmedName, created_by: callerAuthUserId || actorStaffId || null },
    });

    if (createAuthError || !authData.user) {
      return new Response(JSON.stringify({
        error: createAuthError?.message || "Failed to create auth user. Check the service role key configuration and function deployment.",
      }), {
        headers: corsHeaders,
        status: 400,
      });
    }

    const existingLinkedUserId = (staffRowsByUserId || []).some(
      (row) => row.user_id === authData.user.id
    );

    if (existingLinkedUserId) {
      await supabase.auth.admin.deleteUser(authData.user.id);

      return new Response(JSON.stringify({ error: "The new auth user was created but is already linked to an existing staff record" }), {
        headers: corsHeaders,
        status: 400,
      });
    }

    const { data: staffData, error: staffError } = await supabase
      .from("staff")
      .insert({
        user_id: authData.user.id,
        name: trimmedName,
        role: normalizedRole,
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