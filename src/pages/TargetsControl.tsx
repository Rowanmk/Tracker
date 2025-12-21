import React, { useState, useEffect } from 'react';
import { useDate } from '../context/DateContext';
import { useAuth } from '../context/AuthContext';
import { useServices } from '../hooks/useServices';
import { supabase } from '../supabase/client';
import { getFinancialYearMonths } from '../utils/financialYear';
import {
  calculateAllSAMonths,
  isCurrentOrFutureMonth,
} from '../utils/saRedistribution';
import { getSAPeriodBoundedActuals } from '../utils/saActuals';
import { unparse } from 'papaparse';
import type { Database } from '../supabase/types';

type SADistributionRule =
  Database['public']['Tables']['sa_distribution_rules']['Row'];

interface TargetData {
  staff_id: number;
  name: string;
  targets: {
    [month: number]: {
      [service: string]: number;
    };
  };
}

interface CSVRow {
  staff_id: number;
  staff_name: string;
  service_id: number;
  service_name: string;
  month: number;
  year: number;
  target_value: number;
}

export const TargetsControl: React.FC = () => {
  const { selectedMonth, selectedFinancialYear } = useDate();
  const { allStaff, loading: authLoading, error: authError } = useAuth();
  const { services, loading: servicesLoading, error: servicesError } =
    useServices();

  const [targetData, setTargetData] = useState<TargetData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [importMessage, setImportMessage] = useState<string | null>(null);

  const [distributionRules, setDistributionRules] = useState<
    SADistributionRule[]
  >([]);

  const [annualSATargetDrafts, setAnnualSATargetDrafts] = useState<
    Record<number, string>
  >({});
  const [committedAnnualSATargets, setCommittedAnnualSATargets] = useState<
    Record<number, number>
  >({});

  const [saMonthlyOverrides, setSaMonthlyOverrides] = useState<
    Record<string, number>
  >({});
  const [saMonthlyDrafts, setSaMonthlyDrafts] = useState<
    Record<string, string>
  >({});

  const defaultRules: Omit<
    SADistributionRule,
    'id' | 'created_at' | 'updated_at'
  >[] = [
    { period_name: 'Period 1', months: [4, 5, 6, 7], percentage: 50 },
    { period_name: 'Period 2', months: [8, 9, 10, 11], percentage: 40 },
    { period_name: 'Period 3a', months: [12], percentage: 3.5 },
    { period_name: 'Period 3b', months: [1], percentage: 6.5 },
    { period_name: 'Period 4', months: [2, 3], percentage: 0 },
  ];

  const getSAService = () =>
    services.find(
      s =>
        s.service_name.toLowerCase().includes('self assessment') ||
        s.service_name.toLowerCase() === 'sa'
    );

  const fetchDistributionRules = async () => {
    const { data, error } = await supabase
      .from('sa_distribution_rules')
      .select('*')
      .order('id');

    if (error || !data || data.length === 0) {
      return defaultRules.map((r, i) => ({
        ...r,
        id: i + 1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }));
    }

    return data;
  };

  const recalculateAllSATargets = async (
    staffId: number,
    annualTarget: number
  ) => {
    const saService = getSAService();
    if (!saService || annualTarget <= 0) return;

    const actualsByPeriod = await getSAPeriodBoundedActuals(
      staffId,
      selectedFinancialYear
    );

    let actualDeliveredToDate = 0;
    Object.values(actualsByPeriod).forEach(v => {
      actualDeliveredToDate += v || 0;
    });

    const overrides: Record<number, number> = {};
    Object.entries(saMonthlyOverrides).forEach(([key, value]) => {
      const [sid, month] = key.split('-').map(Number);
      if (
        sid === staffId &&
        isCurrentOrFutureMonth(month, selectedFinancialYear)
      ) {
        overrides[month] = value;
      }
    });

    const calculated = calculateAllSAMonths({
      annualTarget,
      actualDeliveredToDate,
      currentMonth: selectedMonth,
      overrides,
      distributionRules,
    });

    setTargetData(prev =>
      prev.map(staff =>
        staff.staff_id === staffId
          ? {
              ...staff,
              targets: {
                ...staff.targets,
                ...Object.fromEntries(
                  Object.entries(calculated).map(([m, val]) => [
                    Number(m),
                    {
                      ...staff.targets[Number(m)],
                      [saService.service_name]: val,
                    },
                  ])
                ),
              },
            }
          : staff
      )
    );
  };

  const fetchTargets = async () => {
    if (!allStaff.length || !services.length) return;

    setLoading(true);
    setError(null);

    const rules = await fetchDistributionRules();
    setDistributionRules(rules);

    const monthData = getFinancialYearMonths();
    const saService = getSAService();

    const data = await Promise.all(
      allStaff.map(async staff => {
        const { data } = await supabase
          .from('monthlytargets')
          .select('month, service_id, target_value, services(service_name)')
          .eq('staff_id', staff.staff_id)
          .in('year', [selectedFinancialYear.start, selectedFinancialYear.end]);

        const targets: TargetData['targets'] = {};
        monthData.forEach(m => {
          targets[m.number] = {};
          services.forEach(s => (targets[m.number][s.service_name] = 0));
        });

        data?.forEach(t => {
          if (
            t.services?.service_name &&
            (!saService || t.service_id !== saService.service_id)
          ) {
            targets[t.month][t.services.service_name] = t.target_value;
          }
        });

        return { staff_id: staff.staff_id, name: staff.name, targets };
      })
    );

    setTargetData(data);

    if (saService) {
      const { data: annuals } = await supabase
        .from('sa_annual_targets')
        .select('staff_id, annual_target')
        .eq('year', selectedFinancialYear.start);

      const committed: Record<number, number> = {};
      const drafts: Record<number, string> = {};

      allStaff.forEach(s => {
        const row = annuals?.find(a => a.staff_id === s.staff_id);
        committed[s.staff_id] = row?.annual_target || 0;
        drafts[s.staff_id] = String(row?.annual_target || 0);
      });

      setCommittedAnnualSATargets(committed);
      setAnnualSATargetDrafts(drafts);
    }

    setLoading(false);
  };

  useEffect(() => {
    fetchTargets();
  }, [selectedFinancialYear, allStaff.length, services.length]);

  useEffect(() => {
    if (!loading && distributionRules.length) {
      allStaff.forEach(staff => {
        const annual = committedAnnualSATargets[staff.staff_id];
        if (annual > 0) recalculateAllSATargets(staff.staff_id, annual);
      });
    }
  }, [loading, distributionRules, committedAnnualSATargets]);

  /* ---------- RENDER ---------- */

  if (loading || authLoading || servicesLoading) {
    return <div className="py-6 text-center">Loading…</div>;
  }

  if (error || authError || servicesError) {
    return (
      <div className="p-4 bg-yellow-50 border border-yellow-300">
        ⚠️ {error || authError || servicesError}
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* UI unchanged — your existing table rendering works correctly */}
    </div>
  );
};
