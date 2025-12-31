import React, { useState, useEffect, useRef } from 'react';
import { useDate } from '../context/DateContext';
import { useAuth } from '../context/AuthContext';
import { useServices } from '../hooks/useServices';
import { supabase } from '../supabase/client';
import { getFinancialYearMonths, getFinancialYears } from '../utils/financialYear';
import { loadTargets, saveTargets, isTargetInFinancialYear } from '../utils/loadTargets';
import { unparse } from 'papaparse';
import type { FinancialYear } from '../utils/financialYear';

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
  const { selectedMonth, selectedYear } = useDate();
  const { allStaff, loading: authLoading, error: authError } = useAuth();
  const { services, loading: servicesLoading, error: servicesError } = useServices();

  const [selectedFinancialYear, setSelectedFinancialYear] = useState<FinancialYear>(() => {
    const now = new Date();
    const month = now.getMonth() + 1;
    const year = now.getFullYear();
    if (month >= 4) {
      return { label: `${year}/${(year + 1).toString().slice(-2)}`, start: year, end: year + 1 };
    } else {
      return { label: `${year - 1}/${year.toString().slice(-2)}`, start: year - 1, end: year };
    }
  });

  const [targetData, setTargetData] = useState<TargetData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [localInputState, setLocalInputState] = useState<LocalInputState>({});
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);

  const inputRefs = useRef<Map<string, HTMLInputElement>>(new Map());
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const scrollPositionRef = useRef<number>(0);

  const fetchTargets = async (fy: FinancialYear) => {
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
            .select('month, service_id, target_value, year')
            .eq('staff_id', staff.staff_id)
            .in('year', [fy.start, fy.end]);

          if (dbErr) {
            console.error('Error fetching monthlytargets:', dbErr);
          }

          const targets: TargetData['targets'] = {};
          monthData.forEach((m) => {
            targets[m.number] = {};
            services.forEach((s) => (targets[m.number][s.service_name] = 0));
          });

          // CRITICAL: Only apply targets that belong to this financial year
          dbTargets?.forEach((t) => {
            // Validate month-year pairing
            if (!isTargetInFinancialYear(t.month, t.year, fy)) {
              console.warn(
                `Skipping target for staff ${staff.staff_id}: month=${t.month}, year=${t.year} not in FY ${fy.label}`
              );
              return;
            }

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
      setHasUnsavedChanges(false);
      inputRefs.current.clear();
    } catch (err) {
      console.error('Error fetching targets:', err);
      setError('Failed to load targets data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTargets(selectedFinancialYear);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFinancialYear, allStaff.length, services.length]);

  // Save scroll position before any state change that might cause re-render
  const saveScrollPosition = () => {
    if (scrollContainerRef.current) {
      scrollPositionRef.current = scrollContainerRef.current.scrollLeft;
    }
  };

  // Restore scroll position after render
  useEffect(() => {
    if (scrollContainerRef.current && scrollPositionRef.current > 0) {
      scrollContainerRef.current.scrollLeft = scrollPositionRef.current;
    }
  }, [targetData, localInputState]);

  const getInputKey = (staffId: number, month: number, serviceName: string): string => {
    return `${staffId}-${month}-${serviceName}`;
  };

  const handleInputChange = (
    staffId: number,
    month: number,
    serviceName: string,
    value: string
  ) => {
    saveScrollPosition();
    const key = getInputKey(staffId, month, serviceName);
    setLocalInputState(prev => ({
      ...prev,
      [key]: value
    }));
    setHasUnsavedChanges(true);
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
        setLocalInputState(prev => {
          const newState = { ...prev };
          delete newState[key];
          return newState;
        });
        return;
      }
    }

    saveScrollPosition();
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

    handleInputBlur(staffId, month, serviceName, value);

    const monthData = getFinancialYearMonths();
    const currentMonthIndex = monthData.findIndex(m => m.number === month);
    const currentServiceIndex = services.findIndex(s => s.service_name === serviceName);
    const currentStaffIndex = targetData.findIndex(s => s.staff_id === staffId);

    let nextStaffIndex = currentStaffIndex;
    let nextServiceIndex = currentServiceIndex;
    let nextMonthIndex = currentMonthIndex;

    if (e.shiftKey) {
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

    const nextStaff = targetData[nextStaffIndex];
    const nextService = services[nextServiceIndex];
    const nextMonth = monthData[nextMonthIndex];

    if (nextStaff && nextService && nextMonth) {
      const nextKey = getInputKey(nextStaff.staff_id, nextMonth.number, nextService.service_name);
      
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
      // Save targets for each staff member using the new saveTargets function
      await Promise.all(
        targetData.map(async (staff) => {
          // Collect all service targets for this staff
          const allServiceTargets: Record<number, number> = {};
          
          Object.entries(staff.targets).forEach(([monthStr, monthTargets]) => {
            const month = Number(monthStr);
            
            Object.entries(monthTargets).forEach(([serviceName, value]) => {
              const service = services.find((s) => s.service_name === serviceName);
              if (service) {
                // For each month, save targets individually
                // This ensures proper month-year pairing
                allServiceTargets[service.service_id] = value ?? 0;
              }
            });
          });

          // Delete all existing targets for this staff in this financial year
          await supabase
            .from('monthlytargets')
            .delete()
            .eq('staff_id', staff.staff_id)
            .in('year', [selectedFinancialYear.start, selectedFinancialYear.end]);

          // Insert targets month by month with correct year pairing
          const inserts: any[] = [];
          Object.entries(staff.targets).forEach(([monthStr, monthTargets]) => {
            const month = Number(monthStr);
            const year = month >= 4 ? selectedFinancialYear.start : selectedFinancialYear.end;

            Object.entries(monthTargets).forEach(([serviceName, value]) => {
              const service = services.find((s) => s.service_name === serviceName);
              if (service) {
                inserts.push({
                  staff_id: staff.staff_id,
                  service_id: service.service_id,
                  month,
                  year, // CRITICAL: Correct year for this month
                  target_value: value ?? 0,
                });
              }
            });
          });

          if (inserts.length > 0) {
            const { error: insertError } = await supabase
              .from('monthlytargets')
              .insert(inserts);

            if (insertError) throw insertError;
          }
        })
      );

      setHasUnsavedChanges(false);
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
        const year = month >= 4 ? selectedFinancialYear.start : selectedFinancialYear.end;

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

  const handleFinancialYearChange = (fy: FinancialYear) => {
    if (hasUnsavedChanges) {
      setPendingAction(() => () => {
        setSelectedFinancialYear(fy);
      });
      setShowConfirmDialog(true);
    } else {
      setSelectedFinancialYear(fy);
    }
  };

  const confirmNavigation = () => {
    setShowConfirmDialog(false);
    if (pendingAction) {
      pendingAction();
      setPendingAction(null);
    }
  };

  const cancelNavigation = () => {
    setShowConfirmDialog(false);
    setPendingAction(null);
  };

  // Prevent page navigation if unsaved changes
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = '';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedChanges]);

  const monthData = getFinancialYearMonths();
  const financialYears = getFinancialYears();

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

  const calculateServiceMonthlyTotal = (month: number, serviceName: string): number => {
    return targetData.reduce((sum, staff) => {
      return sum + (staff.targets[month]?.[serviceName] ?? 0);
    }, 0);
  };

  const calculateServiceAnnualTotal = (serviceName: string): number => {
    return monthData.reduce((sum, m) => {
      return sum + calculateServiceMonthlyTotal(m.number, serviceName);
    }, 0);
  };

  const getInputValue = (staffId: number, month: number, serviceName: string): string => {
    const key = getInputKey(staffId, month, serviceName);
    
    if (localInputState.hasOwnProperty(key)) {
      return localInputState[key];
    }
    
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

      {hasUnsavedChanges && (
        <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-md">
          <p className="text-yellow-800 dark:text-yellow-200">⚠️ You have unsaved changes. Remember to save before leaving.</p>
        </div>
      )}

      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Financial Year
          </label>
          <select
            value={`${selectedFinancialYear.start}-${selectedFinancialYear.end}`}
            onChange={(e) => {
              const [start, end] = e.target.value.split('-').map(Number);
              const fy = financialYears.find(f => f.start === start && f.end === end);
              if (fy) handleFinancialYearChange(fy);
            }}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            {financialYears.map((fy) => (
              <option key={`${fy.start}-${fy.end}`} value={`${fy.start}-${fy.end}`}>
                {fy.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex gap-3">
          <button
            onClick={handleExportCSV}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm font-medium"
          >
            📥 Export CSV
          </button>
          <button
            onClick={handleSaveTargets}
            disabled={!hasUnsavedChanges}
            className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            💾 Save Targets
          </button>
        </div>
      </div>

      <div className="space-y-3">
        {targetData.map((staff) => (
          <div
            key={staff.staff_id}
            className="bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-lg shadow-sm hover:shadow-md transition-shadow duration-200 overflow-hidden"
          >
            <div className="bg-gradient-to-r from-blue-600 to-blue-700 dark:from-blue-700 dark:to-blue-800 px-6 py-4">
              <h4 className="text-lg font-bold text-white">
                {staff.name}
              </h4>
            </div>

            <div 
              ref={scrollContainerRef}
              className="overflow-x-auto scrollbar-thin scrollbar-thumb-gray-400 dark:scrollbar-thumb-gray-600 scrollbar-track-gray-100 dark:scrollbar-track-gray-800"
              style={{ scrollBehavior: 'smooth' }}
            >
              {/* HEADER ROW */}
              <div className="flex w-full bg-gray-100 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600">
                {/* Service Column - Fixed Width */}
                <div className="w-32 flex-shrink-0 px-4 py-3 border-r border-gray-200 dark:border-gray-600">
                  <span className="text-xs font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wider">
                    Service
                  </span>
                </div>

                {/* Months Container - Flex 1 to expand */}
                <div className="flex flex-1 w-full">
                  {monthData.map((m) => (
                    <div key={m.number} className="flex-1 min-w-0 px-1 py-3 text-center border-r border-gray-200 dark:border-gray-600">
                      <span className="text-xs font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wider block">
                        {m.name}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Total Column - Fixed Width */}
                <div className="w-24 flex-shrink-0 px-3 py-3 text-center border-l border-gray-200 dark:border-gray-600">
                  <span className="text-xs font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wider">
                    Total
                  </span>
                </div>
              </div>

              {/* SERVICE ROWS */}
              <div className="divide-y divide-gray-200 dark:divide-gray-700">
                {services.map((service, serviceIdx) => {
                  const annualTotal = calculateAnnualTotal(staff.staff_id, service.service_name);
                  
                  return (
                    <div
                      key={service.service_id}
                      className={`flex w-full ${
                        serviceIdx % 2 === 0
                          ? 'bg-white dark:bg-gray-800'
                          : 'bg-gray-50 dark:bg-gray-750'
                      } hover:bg-blue-50 dark:hover:bg-gray-700/50 transition-colors duration-150`}
                    >
                      {/* Service Column - Fixed Width */}
                      <div className="w-32 flex-shrink-0 px-4 py-2 border-r border-gray-200 dark:border-gray-600 flex items-center">
                        <span className="text-sm font-semibold text-gray-900 dark:text-white">
                          {service.service_name}
                        </span>
                      </div>

                      {/* Months Container - Flex 1 to expand */}
                      <div className="flex flex-1 w-full">
                        {monthData.map((m) => {
                          const inputKey = getInputKey(staff.staff_id, m.number, service.service_name);
                          return (
                            <div key={m.number} className="flex-1 min-w-0 px-1 py-2 border-r border-gray-200 dark:border-gray-600">
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

                      {/* Total Column - Fixed Width */}
                      <div className="w-24 flex-shrink-0 px-3 py-2 border-l border-gray-200 dark:border-gray-600 flex items-center justify-center">
                        <div className="px-2 py-2 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md text-center text-sm font-bold text-gray-900 dark:text-white w-full">
                          {annualTotal}
                        </div>
                      </div>
                    </div>
                  );
                })}

                {/* MONTHLY TOTALS ROW */}
                <div className="flex w-full bg-gray-200 dark:bg-gray-600 border-t-2 border-gray-300 dark:border-gray-500">
                  {/* Service Column - Fixed Width */}
                  <div className="w-32 flex-shrink-0 px-4 py-3 border-r border-gray-300 dark:border-gray-500 flex items-center">
                    <span className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wider">
                      Monthly Total
                    </span>
                  </div>

                  {/* Months Container - Flex 1 to expand */}
                  <div className="flex flex-1 w-full">
                    {monthData.map((m) => {
                      const monthTotal = calculateMonthlyTotal(staff.staff_id, m.number);
                      return (
                        <div key={`total-${m.number}`} className="flex-1 min-w-0 px-1 py-2 border-r border-gray-300 dark:border-gray-500">
                          <div className="px-2 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md text-center text-sm font-bold text-gray-900 dark:text-white">
                            {monthTotal}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Total Column - Fixed Width */}
                  <div className="w-24 flex-shrink-0 px-3 py-2 border-l border-gray-300 dark:border-gray-500 flex items-center justify-center">
                    <div className="px-2 py-2 bg-blue-600 dark:bg-blue-700 border border-blue-700 dark:border-blue-800 rounded-md text-center text-sm font-bold text-white w-full">
                      {monthData.reduce((sum, m) => sum + calculateMonthlyTotal(staff.staff_id, m.number), 0)}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* SERVICE TOTALS SECTION */}
      <div className="bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-lg shadow-sm hover:shadow-md transition-shadow duration-200 overflow-hidden mt-8">
        <div className="bg-gradient-to-r from-purple-600 to-purple-700 dark:from-purple-700 dark:to-purple-800 px-6 py-4">
          <h4 className="text-lg font-bold text-white">
            Service Totals by Month
          </h4>
          <p className="text-sm text-purple-100 mt-1">
            Aggregated targets across all staff members (Read-Only)
          </p>
        </div>

        <div 
          className="overflow-x-auto scrollbar-thin scrollbar-thumb-gray-400 dark:scrollbar-thumb-gray-600 scrollbar-track-gray-100 dark:scrollbar-track-gray-800"
          style={{ scrollBehavior: 'smooth' }}
        >
          {/* HEADER ROW */}
          <div className="flex w-full bg-gray-100 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600">
            {/* Service Column - Fixed Width */}
            <div className="w-32 flex-shrink-0 px-4 py-3 border-r border-gray-200 dark:border-gray-600">
              <span className="text-xs font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wider">
                Service
              </span>
            </div>

            {/* Months Container - Flex 1 to expand */}
            <div className="flex flex-1 w-full">
              {monthData.map((m) => (
                <div key={m.number} className="flex-1 min-w-0 px-1 py-3 text-center border-r border-gray-200 dark:border-gray-600">
                  <span className="text-xs font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wider block">
                    {m.name}
                  </span>
                </div>
              ))}
            </div>

            {/* Total Column - Fixed Width */}
            <div className="w-24 flex-shrink-0 px-3 py-3 text-center border-l border-gray-200 dark:border-gray-600">
              <span className="text-xs font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wider">
                Total
              </span>
            </div>
          </div>

          {/* SERVICE ROWS */}
          <div className="divide-y divide-gray-200 dark:divide-gray-700">
            {services.map((service, serviceIdx) => {
              const annualTotal = calculateServiceAnnualTotal(service.service_name);
              
              return (
                <div
                  key={`service-total-${service.service_id}`}
                  className={`flex w-full ${
                    serviceIdx % 2 === 0
                      ? 'bg-white dark:bg-gray-800'
                      : 'bg-gray-50 dark:bg-gray-750'
                  } hover:bg-purple-50 dark:hover:bg-gray-700/50 transition-colors duration-150`}
                >
                  {/* Service Column - Fixed Width */}
                  <div className="w-32 flex-shrink-0 px-4 py-2 border-r border-gray-200 dark:border-gray-600 flex items-center">
                    <span className="text-sm font-semibold text-gray-900 dark:text-white">
                      {service.service_name}
                    </span>
                  </div>

                  {/* Months Container - Flex 1 to expand */}
                  <div className="flex flex-1 w-full">
                    {monthData.map((m) => {
                      const monthTotal = calculateServiceMonthlyTotal(m.number, service.service_name);
                      return (
                        <div key={`${service.service_id}-${m.number}`} className="flex-1 min-w-0 px-1 py-2 border-r border-gray-200 dark:border-gray-600">
                          <div className="px-2 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md text-center text-sm font-bold text-gray-900 dark:text-white">
                            {monthTotal}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Total Column - Fixed Width */}
                  <div className="w-24 flex-shrink-0 px-3 py-2 border-l border-gray-200 dark:border-gray-600 flex items-center justify-center">
                    <div className="px-2 py-2 bg-purple-100 dark:bg-purple-900/30 border border-purple-300 dark:border-purple-700 rounded-md text-center text-sm font-bold text-purple-900 dark:text-purple-200 w-full">
                      {annualTotal}
                    </div>
                  </div>
                </div>
              );
            })}

            {/* GRAND TOTAL ROW */}
            <div className="flex w-full bg-purple-200 dark:bg-purple-900/50 border-t-2 border-purple-300 dark:border-purple-700">
              {/* Service Column - Fixed Width */}
              <div className="w-32 flex-shrink-0 px-4 py-3 border-r border-purple-300 dark:border-purple-700 flex items-center">
                <span className="text-sm font-bold text-purple-900 dark:text-purple-100 uppercase tracking-wider">
                  Grand Total
                </span>
              </div>

              {/* Months Container - Flex 1 to expand */}
              <div className="flex flex-1 w-full">
                {monthData.map((m) => {
                  const monthGrandTotal = services.reduce((sum, service) => {
                    return sum + calculateServiceMonthlyTotal(m.number, service.service_name);
                  }, 0);
                  return (
                    <div key={`grand-${m.number}`} className="flex-1 min-w-0 px-1 py-2 border-r border-purple-300 dark:border-purple-700">
                      <div className="px-2 py-2 bg-white dark:bg-gray-700 border border-purple-300 dark:border-purple-700 rounded-md text-center text-sm font-bold text-purple-900 dark:text-purple-200">
                        {monthGrandTotal}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Total Column - Fixed Width */}
              <div className="w-24 flex-shrink-0 px-3 py-2 border-l border-purple-300 dark:border-purple-700 flex items-center justify-center">
                <div className="px-2 py-2 bg-purple-600 dark:bg-purple-700 border border-purple-700 dark:border-purple-800 rounded-md text-center text-sm font-bold text-white w-full">
                  {services.reduce((sum, service) => sum + calculateServiceAnnualTotal(service.service_name), 0)}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {showConfirmDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 max-w-sm mx-4">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">
              Unsaved Changes
            </h3>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              You have unsaved target changes. Do you want to save before leaving?
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={cancelNavigation}
                className="px-4 py-2 bg-gray-300 dark:bg-gray-600 text-gray-900 dark:text-white rounded-md hover:bg-gray-400 dark:hover:bg-gray-700 font-medium"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  handleSaveTargets();
                  confirmNavigation();
                }}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 font-medium"
              >
                Save & Continue
              </button>
              <button
                onClick={confirmNavigation}
                className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 font-medium"
              >
                Discard
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};