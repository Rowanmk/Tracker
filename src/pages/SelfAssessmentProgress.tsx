import React, { useState, useEffect } from 'react';
import { useDate } from '../context/DateContext';
import { useAuth } from '../context/AuthContext';
import { useServices } from '../hooks/useServices';
import { useSelfAssessmentProgress } from '../hooks/useSelfAssessmentProgress';
import { FinancialYearSelector } from '../components/FinancialYearSelector';
import { getFinancialYears } from '../utils/financialYear';
import type { FinancialYear } from '../utils/financialYear';

export const SelfAssessmentProgress: React.FC = () => {
  const { selectedFinancialYear, setSelectedFinancialYear } = useDate();
  const { allStaff, loading: authLoading } = useAuth();
  const { services, loading: servicesLoading } = useServices();

  const [localFinancialYear, setLocalFinancialYear] = useState<FinancialYear>(selectedFinancialYear);

  const { staffProgress, loading, error } = useSelfAssessmentProgress(
    localFinancialYear,
    allStaff,
    services
  );

  const handleFinancialYearChange = (fy: FinancialYear) => {
    setLocalFinancialYear(fy);
  };

  const financialYears = getFinancialYears();

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

      {staffProgress.length === 0 ? (
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
                <th className="px-6 py-3 text-left text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300">
                  Staff Member
                </th>
                <th className="px-6 py-3 text-center text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300">
                  Full Year Target
                </th>
                <th className="px-6 py-3 text-center text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300">
                  Submitted
                </th>
                <th className="px-6 py-3 text-center text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300">
                  Left to Do
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {staffProgress.map((staff, idx) => (
                <tr
                  key={staff.staff_id}
                  className={`transition-colors ${
                    idx % 2 === 0
                      ? 'bg-white dark:bg-gray-800'
                      : 'bg-gray-50 dark:bg-gray-750'
                  } hover:bg-blue-50 dark:hover:bg-gray-700/50`}
                >
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">
                    {staff.name}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-center font-semibold text-gray-900 dark:text-white">
                    {staff.fullYearTarget}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-center font-semibold text-gray-900 dark:text-white">
                    {staff.submitted}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-center font-semibold text-gray-900 dark:text-white">
                    {staff.leftToDo}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};