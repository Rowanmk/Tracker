import React, { useState, useMemo } from 'react';
import { useDate } from '../context/DateContext';
import { useAuth } from '../context/AuthContext';
import { useServices } from '../hooks/useServices';
import { useSelfAssessmentProgress } from '../hooks/useSelfAssessmentProgress';
import { SelfAssessmentProgressChart } from '../components/SelfAssessmentProgressChart';
import { FinancialYearSelector } from '../components/FinancialYearSelector';
import { getFinancialYears, getFinancialYearMonths } from '../utils/financialYear';
import { supabase } from '../supabase/client';
import type { FinancialYear } from '../utils/financialYear';

export const SelfAssessmentProgress: React.FC = () => {
  const { selectedFinancialYear } = useDate();
  const { allStaff, loading: authLoading } = useAuth();
  const { services, loading: servicesLoading } = useServices();

  /* ---------------------------------------------
     Shared selection state (Option 3)
  --------------------------------------------- */
  const [activeStaffId, setActiveStaffId] = useState<number | null>(null);

  const lastCompletedFinancialYear = useMemo(() => {
    const allYears = getFinancialYears();
    const currentFY = selectedFinancialYear;
    const lastCompleted = allYears.find((fy) => fy.end === currentFY.start);
    return lastCompleted || currentFY;
  }, [selectedFinancialYear]);

  const [localFinancialYear, setLocalFinancialYear] =
    useState<FinancialYear>(lastCompletedFinancialYear);

  const { staffProgress, loading, error } = useSelfAssessmentProgress(
    localFinancialYear,
    allStaff,
    services
  );

  // Monthly breakdown data for chart
  const [monthlyData, setMonthlyData] = useState<
    Record<number, Record<number, { submitted: number; target: number }>>
  >({});
  const [loadingMonthly, setLoadingMonthly] = useState(false);

  React.useEffect(() => {
    const fetchMonthlyData = async () => {
      if (services.length === 0) return;

      setLoadingMonthly(true);

      try {
        const saService = services.find(
          (s) => s.service_name === 'Self Assessments'
        );

        if (!saService) {
          setMonthlyData({});
          return;
        }

        const deliveryStartYear = localFinancialYear.end;
        const deliveryEndYear = localFinancialYear.end + 1;

        const deliveryStartIso = new Date(deliveryStartYear, 3, 1)
          .toISOString()
          .slice(0, 10);
        const deliveryEndIso = new Date(deliveryEndYear, 0, 31)
          .toISOString()
          .slice(0, 10);

        const { data: activities } = await supabase
          .from('dailyactivity')
          .select('staff_id, delivered_count, date')
          .eq('service_id', saService.service_id)
          .gte('date', deliveryStartIso)
          .lte('date', deliveryEndIso);

        const { data: targets } = await supabase
          .from('monthlytargets')
          .select('staff_id, month, year, target_value')
          .eq('service_id', saService.service_id)
          .in('year', [deliveryStartYear, deliveryEndYear]);

        const breakdown: Record<
          number,
          Record<number, { submitted: number; target: number }>
        > = {};

        // Initialise all staff + all FY months
        staffProgress.forEach((staff) => {
          breakdown[staff.staff_id] = {};
          getFinancialYearMonths().forEach((m) => {
            breakdown[staff.staff_id][m.number] = { submitted: 0, target: 0 };
          });
        });

        // Actuals
        (activities || []).forEach((a) => {
          if (a.staff_id && breakdown[a.staff_id]) {
            const m = new Date(a.date).getMonth() + 1;
            if (!breakdown[a.staff_id][m]) {
              breakdown[a.staff_id][m] = { submitted: 0, target: 0 };
            }
            breakdown[a.staff_id][m].submitted += a.delivered_count || 0;
          }
        });

        // Targets
        (targets || []).forEach((t) => {
          if (t.staff_id && breakdown[t.staff_id]) {
            if (!breakdown[t.staff_id][t.month]) {
              breakdown[t.staff_id][t.month] = { submitted: 0, target: 0 };
            }
            breakdown[t.staff_id][t.month].target += t.target_value || 0;
          }
        });

        setMonthlyData(breakdown);
      } catch (e) {
        console.error('Error fetching monthly data:', e);
        setMonthlyData({});
      } finally {
        setLoadingMonthly(false);
      }
    };

    fetchMonthlyData();
  }, [localFinancialYear, services, staffProgress.length]);

  // Visible staff rule: show if target > 0 OR submitted > 0
  const visibleStaff = staffProgress.filter(
    (s) => s.fullYearTarget > 0 || s.submitted > 0
  );

  // Sort by % achieved (highest to lowest)
  const sortedVisibleStaff = useMemo(() => {
    return [...visibleStaff].sort((a, b) => {
      const percentA = a.fullYearTarget > 0 ? (a.submitted / a.fullYearTarget) * 100 : 0;
      const percentB = b.fullYearTarget > 0 ? (b.submitted / b.fullYearTarget) * 100 : 0;
      return percentB - percentA; // Descending order (highest first)
    });
  }, [visibleStaff]);

  const totals = sortedVisibleStaff.reduce(
    (acc, s) => {
      acc.fullYearTarget += s.fullYearTarget;
      acc.submitted += s.submitted;
      acc.leftToDo += s.leftToDo;
      return acc;
    },
    { fullYearTarget: 0, submitted: 0, leftToDo: 0 }
  );

  const totalPercentAchieved =
    totals.fullYearTarget > 0
      ? (totals.submitted / totals.fullYearTarget) * 100
      : 0;

  if (loading || authLoading || servicesLoading) {
    return <div className="py-6 text-center text-gray-500">Loading…</div>;
  }

  if (error) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded-md">
        ⚠️ {error}
      </div>
    );
  }

  return (
    <div className="max-w-[1600px] mx-auto px-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold">Self Assessment Progress</h2>
          <p className="text-sm text-gray-600">
            Tax year to April {localFinancialYear.end}
          </p>
        </div>

        <div className="w-full lg:w-48">
          <FinancialYearSelector
            selectedFinancialYear={localFinancialYear}
            onFinancialYearChange={setLocalFinancialYear}
          />
        </div>
      </div>

      {/* Layout rebalance — Option 1 (more natural proportions) */}
      <div className="grid grid-cols-1 xl:grid-cols-[45%_55%] gap-6">
        {/* TABLE */}
        <div className="bg-white rounded-xl shadow-md border tile-brand overflow-hidden flex flex-col">
          <div className="tile-header px-4 py-1.5">Self Assessment Data</div>

          {/* This makes the table fill the tile height */}
          <div className="flex-1 overflow-auto">
            <table className="w-full divide-y">
              <thead className="bg-gray-50 sticky top-0 z-10">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-bold uppercase">
                    Staff
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-bold uppercase">
                    Target
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-bold uppercase">
                    Submitted
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-bold uppercase">
                    %
                  </th>
                </tr>
              </thead>

              <tbody>
                {sortedVisibleStaff.map((staff) => {
                  const pct =
                    staff.fullYearTarget > 0
                      ? (staff.submitted / staff.fullYearTarget) * 100
                      : 0;

                  const isActive = activeStaffId === staff.staff_id;

                  return (
                    <tr
                      key={staff.staff_id}
                      className={`transition-colors ${
                        isActive
                          ? 'bg-blue-50 ring-1 ring-blue-300'
                          : 'hover:bg-gray-50'
                      }`}
                    >
                      <td className="px-4 py-3 font-medium">{staff.name}</td>
                      <td className="px-4 py-3 text-center font-semibold">
                        {staff.fullYearTarget}
                      </td>
                      <td className="px-4 py-3 text-center font-semibold">
                        {staff.submitted}
                      </td>
                      <td className="px-4 py-3 text-center font-semibold">
                        {pct.toFixed(1)}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>

              <tfoot className="bg-gray-100 font-bold sticky bottom-0">
                <tr>
                  <td className="px-4 py-3">Total</td>
                  <td className="px-4 py-3 text-center">{totals.fullYearTarget}</td>
                  <td className="px-4 py-3 text-center">{totals.submitted}</td>
                  <td className="px-4 py-3 text-center">
                    {totalPercentAchieved.toFixed(1)}%
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* CHART */}
        <div className="bg-white rounded-xl shadow-md border tile-brand overflow-hidden flex flex-col">
          <div className="tile-header px-4 py-1.5">Monthly Progress</div>

          <div className="flex-1 p-4">
            {loadingMonthly ? (
              <div className="h-full flex items-center justify-center text-gray-500">
                Loading chart data…
              </div>
            ) : (
              <SelfAssessmentProgressChart
                staffProgress={sortedVisibleStaff}
                financialYear={localFinancialYear}
                monthlyData={monthlyData}
                activeStaffId={activeStaffId}
                onActiveStaffChange={setActiveStaffId}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
};