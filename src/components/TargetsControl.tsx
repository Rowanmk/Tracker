import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { useServices } from '../hooks/useServices';
import { supabase } from '../supabase/client';
import { getFinancialYearMonths, getFinancialYears } from '../utils/financialYear';
import { isTargetInFinancialYear } from '../utils/loadTargets';
import { unparse } from 'papaparse';
import type { FinancialYear } from '../utils/financialYear';

interface TargetData {
  team_id: number;
  name: string;
  targets: {
    [month: number]: {
      [service: string]: number;
    };
  };
}

interface CSVRow {
  team_id: number;
  team_name: string;
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
  const { teams, loading: authLoading, error: authError } = useAuth();
  const { services, loading: servicesLoading, error: servicesError } = useServices();

  const targetableServices = useMemo(() => services.filter(s => s.service_name !== 'Bagel Days'), [services]);

  const [selectedFinancialYear, setSelectedFinancialYear] = useState<FinancialYear>({
    label: '2025/26',
    start: 2025,
    end: 2026
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
    if (!teams.length || !targetableServices.length) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const monthData = getFinancialYearMonths();

      const data = await Promise.all(
        teams.map(async (team) => {
          const { data: dbTargets } = await supabase
            .from('monthlytargets')
            .select('month, service_id, target_value, year')
            .eq('team_id', team.id)
            .in('year', [fy.start, fy.end]);

          const targets: TargetData['targets'] = {};
          monthData.forEach((m) => {
            targets[m.number] = {};
            targetableServices.forEach((s) => (targets[m.number][s.service_name] = 0));
          });

          dbTargets?.forEach((t) => {
            if (!isTargetInFinancialYear(t.month, t.year, fy)) {
              return;
            }

            const service = targetableServices.find((s) => s.service_id === t.service_id);
            if (service) {
              targets[t.month][service.service_name] = t.target_value ?? 0;
            }
          });

          return { team_id: team.id, name: team.name, targets };
        })
      );

      setTargetData(data);
      setLocalInputState({});
      setHasUnsavedChanges(false);
      inputRefs.current.clear();
    } catch {
      setError('Failed to load targets data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTargets(selectedFinancialYear);
  }, [selectedFinancialYear, teams.length, targetableServices.length]);

  const saveScrollPosition = () => {
    if (scrollContainerRef.current) {
      scrollPositionRef.current = scrollContainerRef.current.scrollLeft;
    }
  };

  useEffect(() => {
    if (scrollContainerRef.current && scrollPositionRef.current > 0) {
      scrollContainerRef.current.scrollLeft = scrollPositionRef.current;
    }
  }, [targetData, localInputState]);

  const getInputKey = (teamId: number, month: number, serviceName: string): string => {
    return `${teamId}-${month}-${serviceName}`;
  };

  const handleInputChange = (
    teamId: number,
    month: number,
    serviceName: string,
    value: string
  ) => {
    saveScrollPosition();
    const key = getInputKey(teamId, month, serviceName);
    setLocalInputState(prev => ({
      ...prev,
      [key]: value
    }));
    setHasUnsavedChanges(true);
  };

  const handleInputBlur = (
    teamId: number,
    month: number,
    serviceName: string,
    value: string
  ) => {
    const key = getInputKey(teamId, month, serviceName);

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
      prev.map((team) =>
        team.team_id === teamId
          ? {
              ...team,
              targets: {
                ...team.targets,
                [month]: {
                  ...team.targets[month],
                  [serviceName]: numValue,
                },
              },
            }
          : team
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
    teamId: number,
    month: number,
    serviceName: string,
    value: string
  ) => {
    if (e.key !== 'Tab') return;

    e.preventDefault();

    handleInputBlur(teamId, month, serviceName, value);

    const monthData = getFinancialYearMonths();
    const currentMonthIndex = monthData.findIndex(m => m.number === month);
    const currentServiceIndex = targetableServices.findIndex(s => s.service_name === serviceName);
    const currentTeamIndex = targetData.findIndex(t => t.team_id === teamId);

    let nextTeamIndex = currentTeamIndex;
    let nextServiceIndex = currentServiceIndex;
    let nextMonthIndex = currentMonthIndex;

    if (e.shiftKey) {
      nextMonthIndex--;
      if (nextMonthIndex < 0) {
        nextServiceIndex--;
        if (nextServiceIndex < 0) {
          nextTeamIndex--;
          if (nextTeamIndex < 0) {
            nextTeamIndex = targetData.length - 1;
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
          nextTeamIndex++;
          if (nextTeamIndex >= targetData.length) {
            nextTeamIndex = 0;
          }
          nextServiceIndex = 0;
        }
        nextMonthIndex = 0;
      }
    }

    const nextTeam = targetData[nextTeamIndex];
    const nextService = targetableServices[nextServiceIndex];
    const nextMonth = monthData[nextMonthIndex];

    if (nextTeam && nextService && nextMonth) {
      const nextKey = getInputKey(nextTeam.team_id, nextMonth.number, nextService.service_name);

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
        targetData.map(async (team) => {
          await supabase
            .from('monthlytargets')
            .delete()
            .eq('team_id', team.team_id)
            .in('year', [selectedFinancialYear.start, selectedFinancialYear.end]);

          const inserts: Array<{
            team_id: number;
            service_id: number;
            month: number;
            year: number;
            target_value: number;
          }> = [];

          Object.entries(team.targets).forEach(([monthStr, monthTargets]) => {
            const month = Number(monthStr);
            const year = month >= 4 ? selectedFinancialYear.start : selectedFinancialYear.end;

            Object.entries(monthTargets).forEach(([serviceName, value]) => {
              const service = targetableServices.find((s) => s.service_name === serviceName);
              if (service) {
                inserts.push({
                  team_id: team.team_id,
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

    targetData.forEach((team) => {
      Object.entries(team.targets).forEach(([monthStr, monthTargets]) => {
        const month = Number(monthStr);
        const year = month >= 4 ? selectedFinancialYear.start : selectedFinancialYear.end;

        Object.entries(monthTargets).forEach(([serviceName, value]) => {
          const service = targetableServices.find((s) => s.service_name === serviceName);
          if (service) {
            rows.push({
              team_id: team.team_id,
              team_name: team.name,
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

  const calculateMonthlyTotal = (teamId: number, month: number): number => {
    const team = targetData.find(t => t.team_id === teamId);
    if (!team) return 0;

    return targetableServices.reduce((sum, service) => {
      return sum + (team.targets[month]?.[service.service_name] ?? 0);
    }, 0);
  };

  const calculateAnnualTotal = (teamId: number, serviceName: string): number => {
    const team = targetData.find(t => t.team_id === teamId);
    if (!team) return 0;

    return monthData.reduce((sum, m) => {
      return sum + (team.targets[m.number]?.[serviceName] ?? 0);
    }, 0);
  };

  const calculateServiceMonthlyTotal = (month: number, serviceName: string): number => {
    return targetData.reduce((sum, team) => {
      return sum + (team.targets[month]?.[serviceName] ?? 0);
    }, 0);
  };

  const calculateServiceAnnualTotal = (serviceName: string): number => {
    return monthData.reduce((sum, m) => {
      return sum + calculateServiceMonthlyTotal(m.number, serviceName);
    }, 0);
  };

  const getInputValue = (teamId: number, month: number, serviceName: string): string => {
    const key = getInputKey(teamId, month, serviceName);

    if (Object.prototype.hasOwnProperty.call(localInputState, key)) {
      return localInputState[key];
    }

    const team = targetData.find(t => t.team_id === teamId);
    const value = team?.targets[month]?.[serviceName] ?? 0;
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

      {hasUnsavedChanges && (
        <div className="fixed bottom-8 right-8 bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 p-5 z-50 flex flex-col gap-4 animate-slide-up max-w-sm">
          <div className="flex items-start gap-3">
            <div className="bg-yellow-100 dark:bg-yellow-900/30 p-2 rounded-full">
              <svg className="w-6 h-6 text-yellow-600 dark:text-yellow-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <div>
              <h4 className="text-base font-bold text-gray-900 dark:text-white">Unsaved Entries</h4>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">You have entries that have not yet been saved. Please choose an action.</p>
            </div>
          </div>
          <div className="flex justify-end gap-3 mt-2">
            <button
              onClick={() => fetchTargets(selectedFinancialYear)}
              className="px-4 py-2 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 text-sm font-bold rounded-md transition-colors"
            >
              Ignore
            </button>
            <button
              onClick={() => handleSaveTargets()}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-md transition-colors shadow-sm"
            >
              save updates
            </button>
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

      <div className="space-y-3">
        {targetData.map((team) => (
          <div
            key={team.team_id}
            className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm hover:shadow-md transition-shadow duration-200 overflow-hidden"
          >
            <div className="bg-gradient-to-r from-blue-600 to-blue-700 dark:from-blue-700 dark:to-blue-800 px-4 py-2">
              <h4 className="text-base font-bold text-white">
                {team.name}
              </h4>
            </div>

            <div
              ref={scrollContainerRef}
              className="overflow-x-auto scrollbar-thin scrollbar-thumb-gray-400 dark:scrollbar-thumb-gray-600 scrollbar-track-gray-100 dark:scrollbar-track-gray-800"
              style={{ scrollBehavior: 'smooth' }}
            >
              <div className="flex w-full bg-gray-100 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600">
                <div className="w-36 flex-shrink-0 px-3 py-2 border-r border-gray-200 dark:border-gray-600">
                  <span className="text-[10px] font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wider whitespace-nowrap overflow-hidden text-ellipsis block">
                    Service
                  </span>
                </div>

                <div className="flex flex-1 w-full">
                  {monthData.map((m) => (
                    <div key={m.number} className="flex-1 min-w-0 px-1 py-2 text-center border-r border-gray-200 dark:border-gray-600">
                      <span className="text-[10px] font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wider block">
                        {m.name}
                      </span>
                    </div>
                  ))}
                </div>

                <div className="w-20 flex-shrink-0 px-2 py-2 text-center border-l border-gray-200 dark:border-gray-600">
                  <span className="text-[10px] font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wider whitespace-nowrap overflow-hidden text-ellipsis block">
                    Total
                  </span>
                </div>
              </div>

              <div className="divide-y divide-gray-200 dark:divide-gray-700">
                {targetableServices.map((service, serviceIdx) => {
                  const annualTotal = calculateAnnualTotal(team.team_id, service.service_name);

                  return (
                    <div
                      key={service.service_id}
                      className={`flex w-full ${
                        serviceIdx % 2 === 0
                          ? 'bg-white dark:bg-gray-800'
                          : 'bg-gray-50 dark:bg-gray-700'
                      } hover:bg-blue-50 dark:hover:bg-gray-700/50 transition-colors duration-150`}
                    >
                      <div className="w-36 flex-shrink-0 px-3 py-1.5 border-r border-gray-200 dark:border-gray-600 flex items-center">
                        <span className="text-xs font-semibold text-gray-900 dark:text-white whitespace-nowrap overflow-hidden text-ellipsis">
                          {service.service_name}
                        </span>
                      </div>

                      <div className="flex flex-1 w-full">
                        {monthData.map((m) => {
                          const inputKey = getInputKey(team.team_id, m.number, service.service_name);
                          return (
                            <div key={m.number} className="flex-1 min-w-0 px-1 py-1 border-r border-gray-200 dark:border-gray-600">
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
                                value={getInputValue(team.team_id, m.number, service.service_name)}
                                onFocus={(e) => {
                                  e.currentTarget.select();
                                }}
                                onChange={(e) =>
                                  handleInputChange(
                                    team.team_id,
                                    m.number,
                                    service.service_name,
                                    e.target.value
                                  )
                                }
                                onBlur={(e) =>
                                  handleInputBlur(
                                    team.team_id,
                                    m.number,
                                    service.service_name,
                                    e.target.value
                                  )
                                }
                                onKeyDown={(e) =>
                                  handleKeyDown(
                                    e,
                                    team.team_id,
                                    m.number,
                                    service.service_name,
                                    e.currentTarget.value
                                  )
                                }
                                className="w-full px-1 py-1 h-7 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-center text-xs font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
                              />
                            </div>
                          );
                        })}
                      </div>

                      <div className="w-20 flex-shrink-0 px-2 py-1.5 border-l border-gray-200 dark:border-gray-600 flex items-center justify-center">
                        <div className="px-1 py-1 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md text-center text-xs font-bold text-gray-900 dark:text-white w-full">
                          {annualTotal}
                        </div>
                      </div>
                    </div>
                  );
                })}

                <div className="flex w-full bg-gray-200 dark:bg-gray-600 border-t border-gray-300 dark:border-gray-500">
                  <div className="w-36 flex-shrink-0 px-3 py-2 border-r border-gray-300 dark:border-gray-500 flex items-center">
                    <span className="text-xs font-bold text-gray-900 dark:text-white uppercase tracking-wider whitespace-nowrap overflow-hidden text-ellipsis">
                      Monthly Total
                    </span>
                  </div>

                  <div className="flex flex-1 w-full">
                    {monthData.map((m) => {
                      const monthTotal = calculateMonthlyTotal(team.team_id, m.number);
                      return (
                        <div key={`total-${m.number}`} className="flex-1 min-w-0 px-1 py-1.5 border-r border-gray-300 dark:border-gray-500">
                          <div className="px-1 py-1 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md text-center text-xs font-bold text-gray-900 dark:text-white">
                            {monthTotal}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="w-20 flex-shrink-0 px-2 py-1.5 border-l border-gray-300 dark:border-gray-500 flex items-center justify-center">
                    <div className="px-1 py-1 bg-blue-600 dark:bg-blue-700 border border-blue-700 dark:border-blue-800 rounded-md text-center text-xs font-bold text-white w-full">
                      {monthData.reduce((sum, m) => sum + calculateMonthlyTotal(team.team_id, m.number), 0)}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm hover:shadow-md transition-shadow duration-200 overflow-hidden mt-4">
        <div className="bg-gradient-to-r from-purple-600 to-purple-700 dark:from-purple-700 dark:to-purple-800 px-4 py-2">
          <h4 className="text-base font-bold text-white">
            Service Totals by Month
          </h4>
          <p className="text-xs text-purple-100 mt-0.5">
            Aggregated targets across all accountants (Read-Only)
          </p>
        </div>

        <div
          className="overflow-x-auto scrollbar-thin scrollbar-thumb-gray-400 dark:scrollbar-thumb-gray-600 scrollbar-track-gray-100 dark:scrollbar-track-gray-800"
          style={{ scrollBehavior: 'smooth' }}
        >
          <div className="flex w-full bg-gray-100 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600">
            <div className="w-36 flex-shrink-0 px-3 py-2 border-r border-gray-200 dark:border-gray-600">
              <span className="text-[10px] font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wider whitespace-nowrap overflow-hidden text-ellipsis block">
                Service
              </span>
            </div>

            <div className="flex flex-1 w-full">
              {monthData.map((m) => (
                <div key={m.number} className="flex-1 min-w-0 px-1 py-2 text-center border-r border-gray-200 dark:border-gray-600">
                  <span className="text-[10px] font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wider block">
                    {m.name}
                  </span>
                </div>
              ))}
            </div>

            <div className="w-20 flex-shrink-0 px-2 py-2 text-center border-l border-gray-200 dark:border-gray-600">
              <span className="text-[10px] font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wider whitespace-nowrap overflow-hidden text-ellipsis block">
                Total
              </span>
            </div>
          </div>

          <div className="divide-y divide-gray-200 dark:divide-gray-700">
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
                  <div className="w-36 flex-shrink-0 px-3 py-1.5 border-r border-gray-200 dark:border-gray-600 flex items-center">
                    <span className="text-xs font-semibold text-gray-900 dark:text-white whitespace-nowrap overflow-hidden text-ellipsis">
                      {service.service_name}
                    </span>
                  </div>

                  <div className="flex flex-1 w-full">
                    {monthData.map((m) => {
                      const monthTotal = calculateServiceMonthlyTotal(m.number, service.service_name);
                      return (
                        <div key={`${service.service_id}-${m.number}`} className="flex-1 min-w-0 px-1 py-1.5 border-r border-gray-200 dark:border-gray-600">
                          <div className="px-1 py-1 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md text-center text-xs font-bold text-gray-900 dark:text-white">
                            {monthTotal}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="w-20 flex-shrink-0 px-2 py-1.5 border-l border-gray-200 dark:border-gray-600 flex items-center justify-center">
                    <div className="px-1 py-1 bg-purple-100 dark:bg-purple-900/30 border border-purple-300 dark:border-purple-700 rounded-md text-center text-xs font-bold text-purple-900 dark:text-purple-200 w-full">
                      {annualTotal}
                    </div>
                  </div>
                </div>
              );
            })}

            <div className="flex w-full bg-purple-200 dark:bg-purple-900/50 border-t border-purple-300 dark:border-purple-700">
              <div className="w-36 flex-shrink-0 px-3 py-2 border-r border-purple-300 dark:border-purple-700 flex items-center">
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
                    <div key={`grand-${m.number}`} className="flex-1 min-w-0 px-1 py-1.5 border-r border-purple-300 dark:border-purple-700">
                      <div className="px-1 py-1 bg-white dark:bg-gray-700 border border-purple-300 dark:border-purple-700 rounded-md text-center text-xs font-bold text-purple-900 dark:text-purple-200">
                        {monthGrandTotal}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="w-20 flex-shrink-0 px-2 py-1.5 border-l border-purple-300 dark:border-purple-700 flex items-center justify-center">
                <div className="px-1 py-1 bg-purple-600 dark:bg-purple-700 border border-purple-700 dark:border-purple-800 rounded-md text-center text-xs font-bold text-white w-full">
                  {targetableServices.reduce((sum, service) => sum + calculateServiceAnnualTotal(service.service_name), 0)}
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
                className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white rounded-md hover:bg-gray-300 dark:hover:bg-gray-600 font-medium"
              >
                Cancel
              </button>
              <button
                onClick={confirmNavigation}
                className="px-4 py-2 bg-gray-300 dark:bg-gray-600 text-gray-900 dark:text-white rounded-md hover:bg-gray-400 dark:hover:bg-gray-700 font-medium"
              >
                Ignore
              </button>
              <button
                onClick={async () => {
                  const success = await handleSaveTargets();
                  if (success) {
                    confirmNavigation();
                  }
                }}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 font-medium"
              >
                save updates
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};