import React, { useState, useEffect, useRef } from 'react';
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

interface LocalInputState {
  [key: string]: string;
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
  const [localInputState, setLocalInputState] = useState<LocalInputState>({});

  const inputRefs = useRef<Map<string, HTMLInputElement>>(new Map());

  const fetchTargets = async () => {
    if (!allStaff.length || !services.length) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
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
      setLocalInputState({});
      inputRefs.current.clear();
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

  const getInputKey = (staffId: number, month: number, serviceName: string): string => {
    return `${staffId}-${month}-${serviceName}`;
  };

  const handleInputChange = (
    staffId: number,
    month: number,
    serviceName: string,
    value: string
  ) => {
    const key = getInputKey(staffId, month, serviceName);
    setLocalInputState(prev => ({
      ...prev,
      [key]: value
    }));
  };

  const handleInputBlur = (
    staffId: number,
    month: number,
    serviceName: string,
    value: string
  ) => {
    const key = getInputKey(staffId, month, serviceName);
    
    let numValue = 0;
    if (value.trim() !== '') {
      const parsed = parseInt(value, 10);
      if (!isNaN(parsed) && parsed >= 0) {
        numValue = parsed;
      } else {
        // Invalid input - revert to previous value
        setLocalInputState(prev => {
          const newState = { ...prev };
          delete newState[key];
          return newState;
        });
        return;
      }
    }

    // Commit the validated value to main state
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

    // Clear local input state for this cell
    setLocalInputState(prev => {
      const newState = { ...prev };
      delete newState[key];
      return newState;
    });
  };

  const handleKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
    staffId: number,
    month: number,
    serviceName: string,
    value: string
  ) => {
    if (e.key !== 'Tab') return;

    e.preventDefault();

    // First, commit the current cell's value
    handleInputBlur(staffId, month, serviceName, value);

    // Find the next cell to focus
    const monthData = getFinancialYearMonths();
    const currentMonthIndex = monthData.findIndex(m => m.number === month);
    const currentServiceIndex = services.findIndex(s => s.service_name === serviceName);
    const currentStaffIndex = targetData.findIndex(s => s.staff_id === staffId);

    let nextStaffIndex = currentStaffIndex;
    let nextServiceIndex = currentServiceIndex;
    let nextMonthIndex = currentMonthIndex;

    if (e.shiftKey) {
      // Shift+Tab: move backwards
      nextMonthIndex--;
      if (nextMonthIndex < 0) {
        nextServiceIndex--;
        if (nextServiceIndex < 0) {
          nextStaffIndex--;
          if (nextStaffIndex < 0) {
            nextStaffIndex = targetData.length - 1;
          }
          nextServiceIndex = services.length - 1;
        }
        nextMonthIndex = monthData.length - 1;
      }
    } else {
      // Tab: move forwards
      nextMonthIndex++;
      if (nextMonthIndex >= monthData.length) {
        nextServiceIndex++;
        if (nextServiceIndex >= services.length) {
          nextStaffIndex++;
          if (nextStaffIndex >= targetData.length) {
            nextStaffIndex = 0;
          }
          nextServiceIndex = 0;
        }
        nextMonthIndex = 0;
      }
    }

    // Focus the next cell
    const nextStaff = targetData[nextStaffIndex];
    const nextService = services[nextServiceIndex];
    const nextMonth = monthData[nextMonthIndex];

    if (nextStaff && nextService && nextMonth) {
      const nextKey = getInputKey(nextStaff.staff_id, nextMonth.number, nextService.service_name);
      
      // Use requestAnimationFrame to ensure DOM is updated before focusing
      requestAnimationFrame(() => {
        const nextInput = inputRefs.current.get(nextKey);
        if (nextInput) {
          nextInput.focus();
          nextInput.select();
        }
      });
    }
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

  const calculateMonthlyTotal = (staffId: number, month: number): number => {
    const staff = targetData.find(s => s.staff_id === staffId);
    if (!staff) return 0;
    
    return services.reduce((sum, service) => {
      return sum + (staff.targets[month]?.[service.service_name] ?? 0);
    }, 0);
  };

  const calculateAnnualTotal = (staffId: number, serviceName: string): number => {
    const staff = targetData.find(s => s.staff_id === staffId);
    if (!staff) return 0;
    
    return monthData.reduce((sum, m) => {
      return sum + (staff.targets[m.number]?.[serviceName] ?? 0);
    }, 0);
  };

  const getInputValue = (staffId: number, month: number, serviceName: string): string => {
    const key = getInputKey(staffId, month, serviceName);
    
    // If there's a local input state, use it (user is editing)
    if (localInputState.hasOwnProperty(key)) {
      return localInputState[key];
    }
    
    // Otherwise use the committed value from targetData
    const staff = targetData.find(s => s.staff_id === staffId);
    const value = staff?.targets[month]?.[serviceName] ?? 0;
    return value.toString();
  };

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
            key={`${staff.staff_id}-${JSON.stringify(staff.targets)}`}
            className="bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-lg shadow-sm hover:shadow-md transition-shadow duration-200 overflow-hidden"
          >
            {/* Staff Member Header */}
            <div className="bg-gradient-to-r from-blue-600 to-blue-700 dark:from-blue-700 dark:to-blue-800 px-6 py-4">
              <h4 className="text-lg font-bold text-white">
                {staff.name}
              </h4>
            </div>

            {/* Month Headers Row */}
            <div className="px-6 py-3 bg-gray-100 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600">
              <div className="flex items-center gap-4">
                {/* Service Name Column Header */}
                <div className="w-32 flex-shrink-0">
                  <span className="text-xs font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wider">
                    Service
                  </span>
                </div>

                {/* Month Headers - Flex to Fill Available Space */}
                <div className="flex-1 flex gap-0">
                  {monthData.map((m) => (
                    <div key={m.number} className="flex-1 text-center px-1">
                      <span className="text-xs font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wider block">
                        {m.name}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Annual Header */}
                <div className="w-24 flex-shrink-0 text-center">
                  <span className="text-xs font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wider">
                    Annual
                  </span>
                </div>
              </div>
            </div>

            {/* Service Rows */}
            <div className="divide-y divide-gray-200 dark:divide-gray-700">
              {services.map((service, serviceIdx) => {
                const annualTotal = calculateAnnualTotal(staff.staff_id, service.service_name);
                
                return (
                  <div
                    key={`${staff.staff_id}-${service.service_id}`}
                    className={`px-6 py-3 flex items-center gap-4 ${
                      serviceIdx % 2 === 0
                        ? 'bg-white dark:bg-gray-800'
                        : 'bg-gray-50 dark:bg-gray-750'
                    } hover:bg-blue-50 dark:hover:bg-gray-700/50 transition-colors duration-150`}
                  >
                    {/* Service Name - Fixed Width */}
                    <div className="w-32 flex-shrink-0">
                      <span className="text-sm font-semibold text-gray-900 dark:text-white">
                        {service.service_name}
                      </span>
                    </div>

                    {/* Monthly Inputs - Flex to Fill Space */}
                    <div className="flex-1 flex gap-0">
                      {monthData.map((m) => {
                        const inputKey = getInputKey(staff.staff_id, m.number, service.service_name);
                        return (
                          <div key={m.number} className="flex-1 px-1">
                            <input
                              ref={(el) => {
                                if (el) {
                                  inputRefs.current.set(inputKey, el);
                                } else {
                                  inputRefs.current.delete(inputKey);
                                }
                              }}
                              type="number"
                              min="0"
                              value={getInputValue(staff.staff_id, m.number, service.service_name)}
                              onFocus={(e) => {
                                e.currentTarget.select();
                              }}
                              onChange={(e) =>
                                handleInputChange(
                                  staff.staff_id,
                                  m.number,
                                  service.service_name,
                                  e.target.value
                                )
                              }
                              onBlur={(e) =>
                                handleInputBlur(
                                  staff.staff_id,
                                  m.number,
                                  service.service_name,
                                  e.target.value
                                )
                              }
                              onKeyDown={(e) =>
                                handleKeyDown(
                                  e,
                                  staff.staff_id,
                                  m.number,
                                  service.service_name,
                                  e.currentTarget.value
                                )
                              }
                              className="w-full px-2 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-center text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
                            />
                          </div>
                        );
                      })}
                    </div>

                    {/* Annual Total - Fixed Width, Read-Only */}
                    <div className="w-24 flex-shrink-0">
                      <div className="px-2 py-2 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md text-center text-sm font-bold text-gray-900 dark:text-white">
                        {annualTotal}
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* Monthly Totals Row */}
              <div className="px-6 py-3 bg-gray-200 dark:bg-gray-600 border-t-2 border-gray-300 dark:border-gray-500 flex items-center gap-4">
                {/* Row Label */}
                <div className="w-32 flex-shrink-0">
                  <span className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wider">
                    Monthly Total
                  </span>
                </div>

                {/* Monthly Totals - Flex to Fill Space */}
                <div className="flex-1 flex gap-0">
                  {monthData.map((m) => {
                    const monthTotal = calculateMonthlyTotal(staff.staff_id, m.number);
                    return (
                      <div key={`total-${m.number}`} className="flex-1 px-1">
                        <div className="px-2 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md text-center text-sm font-bold text-gray-900 dark:text-white">
                          {monthTotal}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Annual Grand Total - Fixed Width */}
                <div className="w-24 flex-shrink-0">
                  <div className="px-2 py-2 bg-blue-600 dark:bg-blue-700 border border-blue-700 dark:border-blue-800 rounded-md text-center text-sm font-bold text-white">
                    {monthData.reduce((sum, m) => sum + calculateMonthlyTotal(staff.staff_id, m.number), 0)}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};