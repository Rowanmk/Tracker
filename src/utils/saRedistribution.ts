/**
     * DISABLED: Self Assessment auto-distribution is permanently disabled.
     * SA targets are now fully manual, per-month values with no recalculation.
     *
     * This file is kept as a stub for backward compatibility only.
     * Do not use. All SA targets must be entered manually via TargetsControl.
     */

    export function calculateAllSAMonths(): Record<number, number> {
      return {};
    }

    export async function getSADistributionRules(): Promise<never[]> {
      return [];
    }

    export async function getSAPeriodBoundedActuals(): Promise<Record<number, number>> {
      return {};
    }

    export function isCurrentOrFutureMonth(): boolean {
      return false;
    }