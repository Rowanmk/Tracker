import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useServices } from '../hooks/useServices';
import { supabase } from '../supabase/client';
import { getFinancialYearMonths, getFinancialYears } from '../utils/financialYear';
import { isTargetInFinancialYear } from '../utils/loadTargets';
import { unparse } from 'papaparse';
import type { FinancialYear } from '../utils/financialYear';
import type { Database } from '../supabase/types';
import { logMonthlyTargetsSaved } from '../utils/auditLog';

type Staff = Database['public']['Tables']['staff']['Row'];

interface TargetData {
  staff_id: number;
  name: string;
  team_id?: number | null;
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

const isAccountant = (staffMember: Staff) => {
  const role = (staffMember.role || '').toLowerCase();
  return role === 'staff' || role === 'admin';
};

/**
 * Returns the correct calendar year for a given month within a financial year.
 * Months April (4) through December (12) belong to fy.start year.
 * Months January (1) through March (3) belong to fy.end year.
 */
const getYearForMonth = (month: number, fy: FinancialYear): number => {
  return month >= 4 ? fy.start : fy.end;
};

export const TargetsControl: React.FC = () => {
  const navigate = useNavigate();
  const {
    allStaff,
    loading: authLoading,
    error: authError,
    currentStaff,
  } = useAuth();
  const { services, loading: servicesLoading, error: servicesError } = useServices();

  const targetableServices = useMemo(() => services.filter(s => s.service_name !== 'Bagel Days'), [services]);

  const activeAccountants = useMemo<Staff[]>(
    () =>
      allStaff
        .filter((staffMember) => !staffMember.is_hidden && isAccountant(staffMember))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [allStaff]
  );

  const [selectedFinancialYear, setSelectedFinancialYear] = useState<FinancialYear>({
    label: '2025/26',
    start: 2025,
    end: 2026
  });

  const [targetData, setTargetData] = useState<TargetData[]>([]);
  const [lastSavedSnapshot, setLastSavedSnapshot] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [localInputState, setLocalInputState] = useState<LocalInputState>({});
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);

  const inputRefs = useRef<Map<string, HTMLInputElement>>(new Map());
  const scrollPositionsRef = useRef<Record<number, number>>({});

  const buildSnapshot = (data: TargetData[]) => {
    const snapshot: Record<string, number> = {};
    data.forEach((staffMember) => {
      Object.entries(staffMember.targets).forEach(([monthStr, monthTargets]) => {
        const month = Number(monthStr);
        Object.entries(monthTargets).forEach(([serviceName, value]) => {
          snapshot[`${staffMember.staff_id}-${month}-${serviceName}`] = value ?? 0;
        });
      });
    });
    return snapshot;
  };

  const fetchTargets = async (fy: FinancialYear) => {
    if (!activeAccountants.length || !targetableServices.length) {
      setTargetData([]);
      setLastSavedSnapshot({});
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const monthData = getFinancialYearMonths();

      const data = await Promise.all(
        activeAccountants.map(async (staffMember) => {
          // Fetch targets for both years that this financial year spans.
          // fy.start covers April–December, fy.end covers January–March.
          const { data: dbTargets } = await supabase
            .from('monthlytargets')
            .select('month, service_id, target_value, year')
            .eq('staff_id', staffMember.staff_id)
            .in('year', [fy.start, fy.end]);

          const targets: TargetData['targets'] = {};
          monthData.forEach((m) => {
            targets[m.number] = {};
            targetableServices.forEach((s) => (targets[m.number][s.service_name] = 0));
          });

          dbTargets?.forEach((t) => {
            // Only include this target row if it belongs to this financial year.
            // This prevents Jan/Feb/Mar of fy.start from being loaded when they
            // actually belong to the previous financial year (fy.start - 1 / fy.start).
            if (!isTargetInFinancialYear(t.month, t.year, fy)) {
              return;
            }

            const service = targetableServices.find((s) => s.service_id === t.service_id);
            if (service) {
              targets[t.month][service.service_name] = t.target_value ?? 0;
            }
          });

          return { staff_id: staffMember.staff_id, name: staffMember.name, team_id: staffMember.team_id, targets };
        })
      );

      setTargetData(data);
      setLastSavedSnapshot(buildSnapshot(data));
      setLocalInputState({});
      setHasUnsavedChanges(false);
      inputRefs.current.clear();
      scrollPositionsRef.current = {};
    } catch {
      setError('Failed to load targets data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTargets(selectedFinancialYear);
  }, [selectedFinancialYear, activeAccountants, targetableServices]);

  const saveScrollPosition = (staffId: number, scrollLeft: number) => {
    scrollPositionsRef.current[staffId] = scrollLeft;
  };

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

    setTargetData((prev) =>
      prev.map((staffMember) =>
        staffMember.staff_id === staffId
          ? {
              ...staffMember,
              targets: {
                ...staffMember.targets,
                [month]: {
                  ...staffMember.targets[month],
                  [serviceName]: numValue,
                },
              },
            }
          : staffMember
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
    const currentServiceIndex = targetableServices.findIndex(s => s.service_name === serviceName);
    const currentStaffIndex = targetData.findIndex(t => t.staff_id === staffId);

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
          nextServiceIndex = targetableServices.length - 1;
        }
        nextMonthIndex = monthData.length - 1;
      }
    } else {
      nextMonthIndex++;
      if (nextMonthIndex >= monthData.length) {
        nextServiceIndex++;
        if (nextServiceIndex >= targetableServices.length) {
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
    const nextService = targetableServices[nextServiceIndex];
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

  const handleSaveTargets = async (): Promise<boolean> => {
    setSaveMessage(null);
    setError(null);

    try {
      await Promise.all(
        targetData.map(async (staffMember) => {
          // Build the exact set of (month, year) pairs that belong to this financial year.
          // We must delete only the rows that belong to THIS financial year, not all rows
          // for fy.start or fy.end years, because those years are shared with adjacent FYs.
          //
          // Financial year months and their correct calendar years:
          //   Apr–Dec → fy.start year
          //   Jan–Mar → fy.end year
          //
          // We delete month-by-month to avoid wiping adjacent FY data.
          const monthData = getFinancialYearMonths();

          // Group months by their calendar year to batch deletes efficiently.
          const monthsByYear: Record<number, number[]> = {};
          monthData.forEach((m) => {
            const calYear = getYearForMonth(m.number, selectedFinancialYear);
            if (!monthsByYear[calYear]) monthsByYear[calYear] = [];
            monthsByYear[calYear].push(m.number);
          });

          // Delete only the specific month+year combinations that belong to this FY.
          for (const [calYearStr, months] of Object.entries(monthsByYear)) {
            const calYear = Number(calYearStr);
            await supabase
              .from('monthlytargets')
              .delete()
              .eq('staff_id', staffMember.staff_id)
              .eq('year', calYear)
              .in('month', months);
          }

          const inserts: Array<{
            staff_id: number;
            service_id: number;
            month: number;
            year: number;
            target_value: number;
          }> = [];

          Object.entries(staffMember.targets).forEach(([monthStr, monthTargets]) => {
            const month = Number(monthStr);
            // Use the correct calendar year for this month within the financial year.
            const year = getYearForMonth(month, selectedFinancialYear);

            Object.entries(monthTargets).forEach(([serviceName, value]) => {
              const service = targetableServices.find((s) => s.service_name === serviceName);
              if (service) {
                inserts.push({
                  staff_id: staffMember.staff_id,
                  service_id: service.service_id,
                  month,
                  year,
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

      const changedStaffSummaries = targetData
        .map((staffMember) => {
          const changedKeys = Object.entries(staffMember.targets).flatMap(([monthStr, monthTargets]) => {
            const month = Number(monthStr);
            return Object.entries(monthTargets)
              .filter(([serviceName, value]) => {
                const key = `${staffMember.staff_id}-${month}-${serviceName}`;
                return (lastSavedSnapshot[key] ?? 0) !== (value ?? 0);
              })
              .map(([serviceName, value]) => ({
                month,
                serviceName,
                previousValue: lastSavedSnapshot[`${staffMember.staff_id}-${month}-${serviceName}`] ?? 0,
                newValue: value ?? 0,
              }));
          });

          return {
            staff_id: staffMember.staff_id,
            name: staffMember.name,
            team_id: staffMember.team_id,
            changed_cells: changedKeys.length,
            changed_months: Array.from(new Set(changedKeys.map((item) => item.month))).sort((a, b) => a - b),
            changed_services: Array.from(new Set(changedKeys.map((item) => item.serviceName))).sort(),
            changes: changedKeys.map((item) => ({
              month: item.month,
              service_name: item.serviceName,
              previous_value: item.previousValue,
              new_value: item.newValue,
            })),
          };
        })
        .filter((staffMember) => staffMember.changed_cells > 0);

      if (currentStaff && changedStaffSummaries.length > 0) {
        await logMonthlyTargetsSaved({
          actorStaffId: currentStaff.staff_id,
          actorName: currentStaff.name,
          financialYearLabel: selectedFinancialYear.label,
          changedStaffSummaries,
          totalsByStaff: targetData.map((staffMember) => ({
            staff_id: staffMember.staff_id,
            name: staffMember.name,
            annual_total: monthData.reduce((sum, m) => sum + calculateMonthlyTotal(staffMember.staff_id, m.number), 0),
          })),
        });
      }

      setLastSavedSnapshot(buildSnapshot(targetData));
      setHasUnsavedChanges(false);
      setSaveMessage('✅ Targets saved successfully');
      setTimeout(() => setSaveMessage(null), 3000);
      return true;
    } catch {
      setError('Failed to save targets');
      return false;
    }
  };

  const handleExportCSV = () => {
    const rows: CSVRow[] = [];

    targetData.forEach((staffMember) => {
      Object.entries(staffMember.targets).forEach(([monthStr, monthTargets]) => {
        const month = Number(monthStr);
        const year = getYearForMonth(month, selectedFinancialYear);

        Object.entries(monthTargets).forEach(([serviceName, value]) => {
          const service = targetableServices.find((s) => s.service_name === serviceName);
          if (service) {
            rows.push({
              staff_id: staffMember.staff_id,
              staff_name: staffMember.name,
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

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (!hasUnsavedChanges) return;
      if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;

      const target = e.target as HTMLElement;
      const anchor = target.closest('a');

      if (anchor && anchor.href) {
        const url = new URL(anchor.href);
        if (url.origin === window.location.origin && url.pathname !== window.location.pathname) {
          e.preventDefault();
          e.stopPropagation();
          setPendingAction(() => () => navigate(url.pathname + url.search + url.hash));
          setShowConfirmDialog(true);
        }
      }
    };

    document.addEventListener('click', handleClick, { capture: true });
    return () => document.removeEventListener('click', handleClick, { capture: true });
  }, [hasUnsavedChanges, navigate]);

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
    const staffMember = targetData.find(t => t.staff_id === staffId);
    if (!staffMember) return 0;

    return targetableServices.reduce((sum, service) => {
      return sum + (staffMember.targets[month]?.[service.service_name] ?? 0);
    }, 0);
  };

  const calculateAnnualTotal = (staffId: number, serviceName: string): number => {
    const staffMember = targetData.find(t => t.staff_id === staffId);
    if (!staffMember) return 0;

    return monthData.reduce((sum, m) => {
      return sum + (staffMember.targets[m.number]?.[serviceName] ?? 0);
    }, 0);
  };

  const calculateServiceMonthlyTotal = (month: number, serviceName: string): number => {
    return targetData.reduce((sum, staffMember) => {
      return sum + (staffMember.targets[month]?.[serviceName] ?? 0);
    }, 0);
  };

  const calculateServiceAnnualTotal = (serviceName: string): number => {
    return monthData.reduce((sum, m) => {
      return sum + calculateServiceMonthlyTotal(m.number, serviceName);
    }, 0);
  };

  const getInputValue = (staffId: number, month: number, serviceName: string): string => {
    const key = getInputKey(staffId, month, serviceName);

    if (Object.prototype.hasOwnProperty.call(localInputState, key)) {
      return localInputState[key];
    }

    const staffMember = targetData.find(t => t.staff_id === staffId);
    const value = staffMember?.targets[month]?.[serviceName] ?? 0;
    return value.toString();
  };

  return (
    <div className="space-y-4">
      <div className="page-header mb-4">
        <h2 className="page-title">Targets Control</h2>
        <p className="page-subtitle">
          Set monthly targets for {selectedFinancialYear.label}
        </p>
      </div>

      {error && (
        <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md text-sm">
          <p className="text-red-800 dark:text-red-200">❌ {error}</p>
        </div>
      )}

      {saveMessage && (
        <div className="p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-md text-sm">
          <p className="text-green-800 dark:text-green-200">{saveMessage}</p>
        </div>
      )}

      {showConfirmDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100]">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 max-w-md mx-4 w-full animate-slide-up">
            <div className="flex items-start gap-3 mb-6">
              <div className="bg-yellow-100 dark:bg-yellow-900/30 p-2 rounded-full flex-shrink-0">
                <svg className="w-6 h-6 text-yellow-600 dark:text-yellow-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                  Unsaved Changes
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                  You have entries that have not yet been saved. Please choose an action.
                </p>
              </div>
            </div>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => {
                  setShowConfirmDialog(false);
                  setHasUnsavedChanges(false);
                  if (pendingAction) {
                    pendingAction();
                    setPendingAction(null);
                  }
                }}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 text-sm font-bold rounded-md transition-colors"
              >
                Ignore
              </button>
              <button
                onClick={async () => {
                  const success = await handleSaveTargets();
                  if (success) {
                    setShowConfirmDialog(false);
                    if (pendingAction) {
                      pendingAction();
                      setPendingAction(null);
                    }
                  }
                }}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-md transition-colors shadow-sm"
              >
                save updates
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-gray-700 dark:text-gray-300">
            Financial Year
          </label>
          <select
            value={`${selectedFinancialYear.start}-${selectedFinancialYear.end}`}
            onChange={(e) => {
              const [start, end] = e.target.value.split('-').map(Number);
              const fy = financialYears.find(f => f.start === start && f.end === end);
              if (fy) handleFinancialYearChange(fy);
            }}
            className="px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
          >
            {financialYears.map((fy) => (
              <option key={`${fy.start}-${fy.end}`} value={`${fy.start}-${fy.end}`}>
                {fy.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex gap-2">
          <button
            onClick={handleExportCSV}
            className="px-3 py-1.5 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs font-medium"
          >
            📥 Export CSV
          </button>
          <button
            onClick={() => {
              void handleSaveTargets();
            }}
            disabled={!hasUnsavedChanges}
            className="px-3 py-1.5 bg-green-600 text-white rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            💾 Save Targets
          </button>
        </div>
      </div>

      <div className="space-y-4">
        {targetData.map((staffMember) => (
          <div
            key={staffMember.staff_id}
            className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm hover:shadow-md transition-shadow duration-200 overflow-hidden"
          >
            <div className="bg-gradient-to-r from-blue-600 to-blue-700 dark:from-blue-700 dark:to-blue-800 px-4 py-2">
              <h4 className="text-base font-bold text-white">
                {staffMember.name}
              </h4>
            </div>

            <div
              className="overflow-x-auto scrollbar-thin scrollbar-thumb-gray-400 dark:scrollbar-thumb-gray-600 scrollbar-track-gray-100 dark:scrollbar-track-gray-800"
              style={{ scrollBehavior: 'smooth' }}
              onScroll={(e) => saveScrollPosition(staffMember.staff_id, e.currentTarget.scrollLeft)}
              ref={(el) => {
                if (el) {
                  const savedScroll = scrollPositionsRef.current[staffMember.staff_id] || 0;
                  if (el.scrollLeft !== savedScroll) {
                    el.scrollLeft = savedScroll;
                  }
                }
              }}
            >
              <div className="flex w-full bg-gray-100 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600">
                <div className="w-36 flex-shrink-0 px-2 py-1.5 border-r border-gray-200 dark:border-gray-600">
                  <span className="text-[10px] font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wider whitespace-nowrap overflow-hidden text-ellipsis block">
                    Service
                  </span>
                </div>

                <div className="flex flex-1 w-full">
                  {monthData.map((m) => {
                    const calYear = getYearForMonth(m.number, selectedFinancialYear);
                    return (
                      <div key={m.number} className="flex-1 min-w-0 px-1 py-1.5 text-center border-r border-gray-200 dark:border-gray-600">
                        <span className="text-[10px] font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wider block">
                          {m.name}
                        </span>
                        <span className="text-[9px] text-gray-400 dark:text-gray-500 block">
                          {calYear}
                        </span>
                      </div>
                    );
                  })}
                </div>

                <div className="w-20 flex-shrink-0 px-2 py-1.5 text-center border-l border-gray-200 dark:border-gray-600">
                  <span className="text-[10px] font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wider whitespace-nowrap overflow-hidden text-ellipsis block">
                    Total
                  </span>
                </div>
              </div>

              <div className="border-b border-gray-200 dark:border-gray-700">
                {targetableServices.map((service, serviceIdx) => {
                  const annualTotal = calculateAnnualTotal(staffMember.staff_id, service.service_name);

                  return (
                    <div
                      key={service.service_id}
                      className={`flex w-full ${
                        serviceIdx % 2 === 0
                          ? 'bg-white dark:bg-gray-800'
                          : 'bg-gray-50 dark:bg-gray-700'
                      } hover:bg-blue-50 dark:hover:bg-gray-700/50 transition-colors duration-150`}
                    >
                      <div className="w-36 flex-shrink-0 px-2 py-1.5 border-r border-gray-200 dark:border-gray-600 flex items-center">
                        <span className="text-xs font-semibold text-gray-900 dark:text-white whitespace-nowrap overflow-hidden text-ellipsis">
                          {service.service_name}
                        </span>
                      </div>

                      <div className="flex flex-1 w-full">
                        {monthData.map((m) => {
                          const inputKey = getInputKey(staffMember.staff_id, m.number, service.service_name);
                          return (
                            <div key={m.number} className="flex-1 min-w-0 p-0 border-r border-gray-200 dark:border-gray-600">
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
                                value={getInputValue(staffMember.staff_id, m.number, service.service_name)}
                                onFocus={(e) => {
                                  e.currentTarget.select();
                                }}
                                onChange={(e) =>
                                  handleInputChange(
                                    staffMember.staff_id,
                                    m.number,
                                    service.service_name,
                                    e.target.value
                                  )
                                }
                                onBlur={(e) =>
                                  handleInputBlur(
                                    staffMember.staff_id,
                                    m.number,
                                    service.service_name,
                                    e.target.value
                                  )
                                }
                                onKeyDown={(e) =>
                                  handleKeyDown(
                                    e,
                                    staffMember.staff_id,
                                    m.number,
                                    service.service_name,
                                    e.currentTarget.value
                                  )
                                }
                                className="w-full h-full px-1 py-1.5 bg-transparent border-0 text-center text-xs font-medium text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500 transition-colors no-spinner"
                              />
                            </div>
                          );
                        })}
                      </div>

                      <div className="w-20 flex-shrink-0 p-0 border-l border-gray-200 dark:border-gray-600 flex items-center justify-center bg-gray-50 dark:bg-gray-700/50">
                        <span className="text-xs font-bold text-gray-900 dark:text-white py-1.5">
                          {annualTotal}
                        </span>
                      </div>
                    </div>
                  );
                })}

                <div className="flex w-full bg-gray-200 dark:bg-gray-600 border-t border-gray-300 dark:border-gray-500">
                  <div className="w-36 flex-shrink-0 px-2 py-1.5 border-r border-gray-300 dark:border-gray-500 flex items-center">
                    <span className="text-xs font-bold text-gray-900 dark:text-white uppercase tracking-wider whitespace-nowrap overflow-hidden text-ellipsis">
                      Monthly Total
                    </span>
                  </div>

                  <div className="flex flex-1 w-full">
                    {monthData.map((m) => {
                      const monthTotal = calculateMonthlyTotal(staffMember.staff_id, m.number);
                      return (
                        <div key={`total-${m.number}`} className="flex-1 min-w-0 p-0 border-r border-gray-300 dark:border-gray-500 flex items-center justify-center">
                          <span className="text-xs font-bold text-gray-900 dark:text-white py-1.5">
                            {monthTotal}
                          </span>
                        </div>
                      );
                    })}
                  </div>

                  <div className="w-20 flex-shrink-0 p-0 border-l border-gray-300 dark:border-gray-500 flex items-center justify-center bg-blue-600 dark:bg-blue-700">
                    <span className="text-xs font-bold text-white py-1.5">
                      {monthData.reduce((sum, m) => sum + calculateMonthlyTotal(staffMember.staff_id, m.number), 0)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ))}

        {targetData.length === 0 && (
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm p-6">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              No active accountants found for this year.
            </p>
          </div>
        )}
      </div>

      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm hover:shadow-md transition-shadow duration-200 overflow-hidden mt-4">
        <div className="bg-gradient-to-r from-purple-600 to-purple-700 dark:from-purple-700 dark:to-purple-800 px-4 py-2">
          <h4 className="text-base font-bold text-white">
            Service Totals by Month
          </h4>
          <p className="text-xs text-purple-100 mt-0.5">
            Aggregated targets across all active accountants (Read-Only)
          </p>
        </div>

        <div
          className="overflow-x-auto scrollbar-thin scrollbar-thumb-gray-400 dark:scrollbar-thumb-gray-600 scrollbar-track-gray-100 dark:scrollbar-track-gray-800"
          style={{ scrollBehavior: 'smooth' }}
        >
          <div className="flex w-full bg-gray-100 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600">
            <div className="w-36 flex-shrink-0 px-2 py-1.5 border-r border-gray-200 dark:border-gray-600">
              <span className="text-[10px] font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wider whitespace-nowrap overflow-hidden text-ellipsis block">
                Service
              </span>
            </div>

            <div className="flex flex-1 w-full">
              {monthData.map((m) => {
                const calYear = getYearForMonth(m.number, selectedFinancialYear);
                return (
                  <div key={m.number} className="flex-1 min-w-0 px-1 py-1.5 text-center border-r border-gray-200 dark:border-gray-600">
                    <span className="text-[10px] font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wider block">
                      {m.name}
                    </span>
                    <span className="text-[9px] text-gray-400 dark:text-gray-500 block">
                      {calYear}
                    </span>
                  </div>
                );
              })}
            </div>

            <div className="w-20 flex-shrink-0 px-2 py-1.5 text-center border-l border-gray-200 dark:border-gray-600">
              <span className="text-[10px] font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wider whitespace-nowrap overflow-hidden text-ellipsis block">
                Total
              </span>
            </div>
          </div>

          <div className="border-b border-gray-200 dark:border-gray-700">
            {targetableServices.map((service, serviceIdx) => {
              const annualTotal = calculateServiceAnnualTotal(service.service_name);

              return (
                <div
                  key={`service-total-${service.service_id}`}
                  className={`flex w-full ${
                    serviceIdx % 2 === 0
                      ? 'bg-white dark:bg-gray-800'
                      : 'bg-gray-50 dark:bg-gray-700'
                  } hover:bg-purple-50 dark:hover:bg-gray-700/50 transition-colors duration-150`}
                >
                  <div className="w-36 flex-shrink-0 px-2 py-1.5 border-r border-gray-200 dark:border-gray-600 flex items-center">
                    <span className="text-xs font-semibold text-gray-900 dark:text-white whitespace-nowrap overflow-hidden text-ellipsis">
                      {service.service_name}
                    </span>
                  </div>

                  <div className="flex flex-1 w-full">
                    {monthData.map((m) => {
                      const monthTotal = calculateServiceMonthlyTotal(m.number, service.service_name);
                      return (
                        <div key={`${service.service_id}-${m.number}`} className="flex-1 min-w-0 p-0 border-r border-gray-200 dark:border-gray-600 flex items-center justify-center">
                          <span className="text-xs font-bold text-gray-900 dark:text-white py-1.5">
                            {monthTotal}
                          </span>
                        </div>
                      );
                    })}
                  </div>

                  <div className="w-20 flex-shrink-0 p-0 border-l border-gray-200 dark:border-gray-600 flex items-center justify-center bg-purple-50 dark:bg-purple-900/20">
                    <span className="text-xs font-bold text-purple-900 dark:text-purple-200 py-1.5">
                      {annualTotal}
                    </span>
                  </div>
                </div>
              );
            })}

            <div className="flex w-full bg-purple-200 dark:bg-purple-900/50 border-t border-purple-300 dark:border-purple-700">
              <div className="w-36 flex-shrink-0 px-2 py-1.5 border-r border-purple-300 dark:border-purple-700 flex items-center">
                <span className="text-xs font-bold text-purple-900 dark:text-purple-100 uppercase tracking-wider whitespace-nowrap overflow-hidden text-ellipsis">
                  Grand Total
                </span>
              </div>

              <div className="flex flex-1 w-full">
                {monthData.map((m) => {
                  const monthGrandTotal = targetableServices.reduce((sum, service) => {
                    return sum + calculateServiceMonthlyTotal(m.number, service.service_name);
                  }, 0);
                  return (
                    <div key={`grand-${m.number}`} className="flex-1 min-w-0 p-0 border-r border-purple-300 dark:border-purple-700 flex items-center justify-center">
                      <span className="text-xs font-bold text-purple-900 dark:text-purple-200 py-1.5">
                        {monthGrandTotal}
                      </span>
                    </div>
                  );
                })}
              </div>

              <div className="w-20 flex-shrink-0 p-0 border-l border-purple-300 dark:border-purple-700 flex items-center justify-center bg-purple-600 dark:bg-purple-700">
                <span className="text-xs font-bold text-white py-1.5">
                  {targetableServices.reduce((sum, service) => sum + calculateServiceAnnualTotal(service.service_name), 0)}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};