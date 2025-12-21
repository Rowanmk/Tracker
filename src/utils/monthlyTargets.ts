import type { SupabaseClient } from '@supabase/supabase-js';
    import type { Database } from '../supabase/types';

    type ViewMode = "team" | "individual";

    export async function getMonthlyTargets({
      supabase,
      viewMode,
      staffId,
      financialYear,
      month,
    }: {
      supabase: SupabaseClient<Database>;
      viewMode: ViewMode;
      staffId?: number;
      financialYear: string;
      month: number;
    }) {
      let query = supabase
        .from("monthlytargets")
        .select("staff_id, service_id, target_value")
        .eq("month", month)
        .eq("year", financialYear);

      if (viewMode === "individual" && staffId) {
        query = query.eq("staff_id", staffId);
      }

      const { data, error } = await query;
      if (error) throw error;

      const byService: Record<number, number> = {};
      let total = 0;

      (data ?? []).forEach(row => {
        const val = row.target_value ?? 0;
        const sid = row.service_id;
        if (sid) {
          byService[sid] = (byService[sid] || 0) + val;
          total += val;
        }
      });

      return { byService, total };
    }

    // Legacy function for backward compatibility - remove after migration
    export async function getMonthlyTargetsForView({
      supabase,
      mode,
      staffId,
      month,
      year,
    }: {
      supabase: SupabaseClient<Database>;
      mode: ViewMode;
      staffId?: number;
      month: number;
      year: number;
    }) {
      const { byService, total } = await getMonthlyTargets({
        supabase,
        viewMode: mode,
        staffId,
        financialYear: year.toString(),
        month,
      });

      const perService = byService;
      const totalTarget = total;

      return { rows: [], perService, totalTarget };
    }