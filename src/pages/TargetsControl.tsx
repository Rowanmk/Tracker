import React, { useState, useEffect } from 'react';
import { useDate } from '../context/DateContext';
import { useAuth } from '../context/AuthContext';
import { useServices } from '../hooks/useServices';
import { supabase } from '../supabase/client';
import { getFinancialYearMonths } from '../utils/financialYear';
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
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const [distributionRules, setDistributionRules] = useState<
    SADistributionRule[]
  >([]);

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

  const fetchTargets = async () => {
    if (!allStaff.length || !services.length) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const rules = await fetchDistributionRules();
      setDistributionRules(rules);

      const monthData = getFinancialYearMonths();

      const data = await Promise.all(
        allStaff.map(async (staff) => {
          const { data: dbTargets, error: dbErr } = await supabase
            .from('monthlytargets')
            .select('month, service_id, target_value')
            .eq('staff_id', staff.staff_id)
            .in('year', [selectedFinancialYear.start, selectedFinancialYear.end]);

          if (dbErr) {
            console.error('Error fetching monthlytargets:', dbErr);
          }

          const targets: TargetData['targets'] = {};
          monthData.forEach((m) => {
            targets[m.number] = {};
            services.forEach((s) => (targets[m.number][s.service_name] = 0));
          });

          dbTargets?.forEach((t) => {
            const service = services.find((s) => s.service_id === t.service_id);
            if (service) {
              targets[t.month][service.service_name] = t.target_value ?? 0;
            }
          });

          return { staff_id: staff.staff_id, name: staff.name, targets };
        })
      );

      setTargetData(data);
    } catch (err) {
      console.error('Error fetching targets:', err);
      setError('Failed to load targets data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTargets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFinancialYear, allStaff.length, services.length]);

  const handleTargetChange = (
    staffId: number,
    month: number,
    serviceName: string,
    value: string
  ) => {
    const numValue = value === '' ? 0 : parseInt(value, 10);
    if (isNaN(numValue) || numValue < 0) return;

    setTargetData((prev) =>
      prev.map((staff) =>
        staff.staff_id === staffId
          ? {
              ...staff,
              targets: {
                ...staff.targets,
                [month]: {
                  ...staff.targets[month],
                  [serviceName]: numValue,
                },
              },
            }
          : staff
      )
    );
  };

  const handleSaveTargets = async () => {
    setSaveMessage(null);
    setError(null);

    try {
      const inserts: any[] = [];

      targetData.forEach((staff) => {
        Object.entries(staff.targets).forEach(([monthStr, monthTargets]) => {
          const month = Number(monthStr);
          const year =
            month >= 4 ? selectedFinancialYear.start : selectedFinancialYear.end;

          Object.entries(monthTargets).forEach(([serviceName, value]) => {
            const service = services.find((s) => s.service_name === serviceName);
            if (service) {
              inserts.push({
                staff_id: staff.staff_id,
                service_id: service.service_id,
                month,
                year,
                target_value: value ?? 0,
              });
            }
          });
        });
      });

      // Replace ALL targets for the financial year (safe + consistent)
      await supabase
        .from('monthlytargets')
        .delete()
        .in('year', [selectedFinancialYear.start, selectedFinancialYear.end]);

      const { error: insertError } = await supabase
        .from('monthlytargets')
        .insert(inserts);

      if (insertError) throw insertError;

      setSaveMessage('✅ Targets saved successfully');
      setTimeout(() => setSaveMessage(null), 3000);
    } catch (err) {
      console.error('Error saving targets:', err);
      setError('Failed to save targets');
    }
  };

  const handleExportCSV = () => {
    const rows: CSVRow[] = [];

    targetData.forEach((staff) => {
      Object.entries(staff.targets).forEach(([monthStr, monthTargets]) => {
        const month = Number(monthStr);
        const year =
          month >= 4 ? selectedFinancialYear.start : selectedFinancialYear.end;

        Object.entries(monthTargets).forEach(([serviceName, value]) => {
          const service = services.find((s) => s.service_name === serviceName);
          if (service) {
            rows.push({
              staff_id: staff.staff_id,
              staff_name: staff.name,
              service_id: service.service_id,
              service_name: serviceName,
              month,
              year,
              target_value: value ?? 0,
            });
          }
        });
      });
    });

    const csv = unparse(rows);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `targets_${selectedFinancialYear.label}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const monthData = getFinancialYearMonths();

  if (loading || authLoading || servicesLoading) {
    return (
      <div className="py-6 text-center text-gray-500">
        Loading targets...
      </div>
    );
  }

  if (authError || servicesError) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded-md">
        <p className="text-red-800">⚠️ {authError || servicesError}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl lg:text-3xl font-bold text-gray-900 dark:text-white mb-2">
          Targets Control
        </h2>
        <p className="text-gray-600 dark:text-gray-400">
          Set monthly targets for {selectedFinancialYear.label}
        </p>
      </div>

      {error && (
        <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md">
          <p className="text-red-800 dark:text-red-200">❌ {error}</p>
        </div>
      )}

      {saveMessage && (
        <div className="p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-md">
          <p className="text-green-800 dark:text-green-200">{saveMessage}</p>
        </div>
      )}

      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
          Monthly Targets by Staff Member
        </h3>
        <div className="flex gap-3">
          <button
            onClick={handleExportCSV}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm font-medium"
          >
            📥 Export CSV
          </button>
          <button
            onClick={handleSaveTargets}
            className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 text-sm font-medium"
          >
            💾 Save Targets
          </button>
        </div>
      </div>

      <div className="space-y-6">
        {targetData.map((staff) => (
          <div
            key={staff.staff_id}
            className="bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-lg shadow-sm hover:shadow-md transition-shadow duration-200"
          >
            {/* Staff Member Header */}
            <div className="bg-gradient-to-r from-blue-600 to-blue-700 dark:from-blue-700 dark:to-blue-800 px-6 py-4 rounded-t-[calc(0.5rem-2px)]">
              <h4 className="text-lg font-bold text-white">
                {staff.name}
              </h4>
            </div>

            {/* Service Rows Container */}
            <div className="divide-y divide-gray-200 dark:divide-gray-700">
              {services.map((service, serviceIdx) => (
                <div
                  key={service.service_id}
                  className={`px-6 py-4 ${
                    serviceIdx % 2 === 0
                      ? 'bg-white dark:bg-gray-800'
                      : 'bg-gray-50 dark:bg-gray-750'
                  }`}
                >
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-sm font-semibold text-gray-900 dark:text-white">
                      {service.service_name}
                    </span>
                  </div>

                  {/* Month Input Grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                    {monthData.map((m) => (
                      <div key={m.number} className="flex flex-col">
                        <label className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                          {m.name}
                        </label>
                        <input
                          type="number"
                          min="0"
                          value={staff.targets[m.number]?.[service.service_name] ?? 0}
                          onChange={(e) =>
                            handleTargetChange(
                              staff.staff_id,
                              m.number,
                              service.service_name,
                              e.target.value
                            )
                          }
                          className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-center text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Distribution Rules
        </h3>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-700">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Period
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Months
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Percentage
                </th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
              {distributionRules.map((rule, idx) => (
                <tr
                  key={rule.id}
                  className={idx % 2 === 0 ? 'bg-white dark:bg-gray-800' : 'bg-gray-50 dark:bg-gray-700'}
                >
                  <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-white">
                    {rule.period_name}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                    {rule.months.join(', ')}
                  </td>
                  <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-white">
                    {rule.percentage}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};