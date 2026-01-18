import React, { useState, useMemo } from 'react';
import { useDate } from '../context/DateContext';
import { useAuth } from '../context/AuthContext';
import { useServices } from '../hooks/useServices';
import { useSelfAssessmentProgress } from '../hooks/useSelfAssessmentProgress';
import { FinancialYearSelector } from '../components/FinancialYearSelector';
import { getFinancialYears } from '../utils/financialYear';
import type { FinancialYear } from '../utils/financialYear';

export const SelfAssessmentProgress: React.FC = () => {
  const { selectedFinancialYear } = useDate();
  const { allStaff, loading: authLoading } = useAuth();
  const { services, loading: servicesLoading } = useServices();

  // Calculate the last completed tax year (previous FY)
  const lastCompletedFinancialYear = useMemo(() => {
    const allYears = getFinancialYears();
    const currentFY = selectedFinancialYear;
    
    // Find the FY that ends one year before the current FY's end
    const lastCompleted = allYears.find(
      (fy) => fy.end === currentFY.start
    );
    
    return lastCompleted || currentFY;
  }, [selectedFinancialYear]);

  const [localFinancialYear, setLocalFinancialYear] =
    useState<FinancialYear>(lastCompletedFinancialYear);

  const { staffProgress, loading, error } = useSelfAssessmentProgress(
    localFinancialYear,
    allStaff,
    services
  );

  const handleFinancialYearChange = (fy: FinancialYear) => {
    setLocalFinancialYear(fy);
  };

  /* ---------------------------------------------------------
     Filter staff to display
     Rule: show only if target > 0 OR submitted > 0
  --------------------------------------------------------- */
  const visibleStaff = staffProgress.filter(
    (staff) => staff.fullYearTarget > 0 || staff.submitted > 0
  );

  /* ---------------------------------------------------------
     Totals (based on visible staff only)
  --------------------------------------------------------- */
  const totals = visibleStaff.reduce(
    (acc, staff) => {
      acc.fullYearTarget += staff.fullYearTarget;
      acc.submitted += staff.submitted;
      acc.leftToDo += staff.leftToDo;
      return acc;
    },
    { fullYearTarget: 0, submitted: 0, leftToDo: 0 }
  );

  const totalPercentAchieved =
    totals.fullYearTarget > 0
      ? (totals.submitted / totals.fullYearTarget) * 100
      : 0;

  if (loading || authLoading || servicesLoading) {
    return (
      <div className="py-6 text-center text-gray-500">
        Loading Self Assessment Progress…
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md">
        <p className="text-red-800 dark:text-red-200">⚠️ {error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h2 className="text-2xl lg:text-3xl font-bold text-gray-900 dark:text-white mb-1">
            Self Assessment Progress
          </h2>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Tax year to April {localFinancialYear.end}
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Financial Year
          </label>
          <FinancialYearSelector
            selectedFinancialYear={localFinancialYear}
            onFinancialYearChange={handleFinancialYearChange}
            className="w-full lg:w-48"
          />
        </div>
      </div>

      {visibleStaff.length === 0 ? (
        <div className="p-6 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 text-center">
          <p className="text-gray-600 dark:text-gray-400">
            No staff members with Self Assessment targets or actuals in this financial year.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-700">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-bold uppercase tracking-wider">
                  Staff Member
                </th>
                <th className="px-6 py-3 text-center text-xs font-bold uppercase tracking-wider">
                  Full Year Target
                </th>
                <th className="px-6 py-3 text-center text-xs font-bold uppercase tracking-wider">
                  Submitted
                </th>
                <th className="px-6 py-3 text-center text-xs font-bold uppercase tracking-wider">
                  Left to Do
                </th>
                <th className="px-6 py-3 text-center text-xs font-bold uppercase tracking-wider">
                  % Achieved
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {visibleStaff.map((staff, idx) => {
                const percentAchieved =
                  staff.fullYearTarget > 0
                    ? (staff.submitted / staff.fullYearTarget) * 100
                    : 0;

                return (
                  <tr
                    key={staff.staff_id}
                    className={`transition-colors ${
                      idx % 2 === 0
                        ? 'bg-white dark:bg-gray-800'
                        : 'bg-gray-50 dark:bg-gray-750'
                    } hover:bg-blue-50 dark:hover:bg-gray-700/50`}
                  >
                    <td className="px-6 py-4 text-sm font-medium">
                      {staff.name}
                    </td>
                    <td className="px-6 py-4 text-sm text-center font-semibold">
                      {staff.fullYearTarget}
                    </td>
                    <td className="px-6 py-4 text-sm text-center font-semibold">
                      {staff.submitted}
                    </td>
                    <td className="px-6 py-4 text-sm text-center font-semibold">
                      {staff.leftToDo}
                    </td>
                    <td className="px-6 py-4 text-sm text-center font-semibold">
                      {percentAchieved.toFixed(1)}%
                    </td>
                  </tr>
                );
              })}
            </tbody>

            <tfoot className="bg-gray-100 dark:bg-gray-700 border-t border-gray-300 dark:border-gray-600">
              <tr>
                <td className="px-6 py-4 text-sm font-bold">
                  Total
                </td>
                <td className="px-6 py-4 text-sm text-center font-bold">
                  {totals.fullYearTarget}
                </td>
                <td className="px-6 py-4 text-sm text-center font-bold">
                  {totals.submitted}
                </td>
                <td className="px-6 py-4 text-sm text-center font-bold">
                  {totals.leftToDo}
                </td>
                <td className="px-6 py-4 text-sm text-center font-bold">
                  {totalPercentAchieved.toFixed(1)}%
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
};