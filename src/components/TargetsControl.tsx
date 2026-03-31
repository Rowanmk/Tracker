import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useServices } from '../hooks/useServices';
import { supabase } from '../supabase/client';
import { getFinancialYearMonths, getFinancialYears } from '../utils/financialYear';
import { isTargetInFinancialYear } from '../utils/loadTargets';
import { unparse, parse } from 'papaparse';
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

// New wide-format CSV row: one row per service+accountant, months as columns
interface WideCSVRow {
  service_name: string;
  accountant_name: string;
  staff_id: number;
  service_id: number;
  [monthCol: string]: string | number; // e.g. "Apr_2025", "May_2025", ...
}

interface LocalInputState {
  [key: string]: string;
}

interface ImportDiffRow {
  staff_id: number;
  staff_name: string;
  service_name: string;
  month: number;
  month_label: string;
  year: number;
  current_value: number;
  import_value: number;
  changed: boolean;
}

interface ParsedImportCell {
  staff_id: number;
  staff_name: string;
  service_id: number;
  service_name: string;
  month: number;
  year: number;
  target_value: number;
}

interface ImportState {
  step: 'idle' | 'select-fy' | 'preview' | 'importing' | 'done';
  selectedFY: FinancialYear | null;
  parsedRows: ParsedImportCell[];
  diffRows: ImportDiffRow[];
  error: string | null;
}

const isAccountant = (staffMember: Staff) => {
  const role = (staffMember.role || '').toLowerCase();
  return role === 'staff' || role === 'admin';
};

const getYearForMonth = (month: number, fy: FinancialYear): number => {
  return month >= 4 ? fy.start : fy.end;
};

// Build column key for a month in the wide CSV format: e.g. "Apr_2025"
const buildMonthColKey = (monthName: string, year: number) => `${monthName}_${year}`;

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

  const [importState, setImportState] = useState<ImportState>({
    step: 'idle',
    selectedFY: null,
    parsedRows: [],
    diffRows: [],
    error: null,
  });

  const fileInputRef = useRef<HTMLInputElement>(null);
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
          const monthData = getFinancialYearMonths();

          const monthsByYear: Record<number, number[]> = {};
          monthData.forEach((m) => {
            const calYear = getYearForMonth(m.number, selectedFinancialYear);
            if (!monthsByYear[calYear]) monthsByYear[calYear] = [];
            monthsByYear[calYear].push(m.number);
          });

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

      const monthData = getFinancialYearMonths();

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

  // ── Export: wide format (Service | Accountant | Apr_YYYY | May_YYYY | ... | Mar_YYYY) ──
  const handleExportCSV = () => {
    const monthData = getFinancialYearMonths();

    // Build column headers for months
    const monthCols = monthData.map((m) => {
      const year = getYearForMonth(m.number, selectedFinancialYear);
      return { key: buildMonthColKey(m.name, year), month: m, year };
    });

    const rows: Record<string, string | number>[] = [];

    targetableServices.forEach((service) => {
      targetData.forEach((staffMember) => {
        const row: Record<string, string | number> = {
          service_name: service.service_name,
          accountant_name: staffMember.name,
          staff_id: staffMember.staff_id,
          service_id: service.service_id,
        };

        monthCols.forEach(({ key, month, year }) => {
          row[key] = staffMember.targets[month.number]?.[service.service_name] ?? 0;
        });

        rows.push(row);
      });
    });

    // Define column order explicitly
    const fields = [
      'service_name',
      'accountant_name',
      'staff_id',
      'service_id',
      ...monthCols.map((c) => c.key),
    ];

    const csv = unparse({ fields, data: rows });
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `targets_${selectedFinancialYear.label}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  // ── Import flow ──────────────────────────────────────────────────────────────

  const handleImportClick = () => {
    setImportState({
      step: 'select-fy',
      selectedFY: selectedFinancialYear,
      parsedRows: [],
      diffRows: [],
      error: null,
    });
  };

  const handleImportFYConfirm = () => {
    if (!importState.selectedFY) return;
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
      fileInputRef.current.click();
    }
  };

  const handleFileSelected = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file || !importState.selectedFY) return;

      const reader = new FileReader();
      reader.onload = (evt) => {
        const text = evt.target?.result as string;
        if (!text) {
          setImportState(prev => ({ ...prev, error: 'Could not read file.' }));
          return;
        }

        const result = parse<Record<string, string>>(text, {
          header: true,
          skipEmptyLines: true,
        });

        if (result.errors.length > 0) {
          setImportState(prev => ({
            ...prev,
            error: `CSV parse error: ${result.errors[0].message}`,
          }));
          return;
        }

        const headers = result.meta.fields || [];

        // Validate required base columns
        const requiredBase = ['service_name', 'accountant_name', 'staff_id', 'service_id'];
        const missingBase = requiredBase.filter(col => !headers.includes(col));
        if (missingBase.length > 0) {
          setImportState(prev => ({
            ...prev,
            error: `CSV is missing required columns: ${missingBase.join(', ')}. Please export a fresh CSV and re-edit it.`,
          }));
          return;
        }

        const fy = importState.selectedFY!;
        const monthData = getFinancialYearMonths();

        // Build expected month column keys for this FY
        const expectedMonthCols = monthData.map((m) => {
          const year = getYearForMonth(m.number, fy);
          return { key: buildMonthColKey(m.name, year), month: m.number, year };
        });

        // Check at least some month columns exist
        const foundMonthCols = expectedMonthCols.filter(mc => headers.includes(mc.key));
        if (foundMonthCols.length === 0) {
          setImportState(prev => ({
            ...prev,
            error: `No month columns found for FY ${fy.label}. Expected columns like "${expectedMonthCols[0].key}". Please export a fresh CSV for this financial year.`,
          }));
          return;
        }

        const parsedRows: ParsedImportCell[] = [];
        const parseErrors: string[] = [];

        result.data.forEach((row, idx) => {
          const staffId = parseInt(row.staff_id, 10);
          const serviceId = parseInt(row.service_id, 10);
          const staffName = row.accountant_name || '';
          const serviceName = row.service_name || '';

          if (isNaN(staffId) || isNaN(serviceId)) {
            parseErrors.push(`Row ${idx + 2}: invalid staff_id or service_id.`);
            return;
          }

          // For each month column, emit one ParsedImportCell
          foundMonthCols.forEach(({ key, month, year }) => {
            const rawVal = row[key];
            const targetValue = rawVal !== undefined && rawVal !== '' ? parseInt(rawVal, 10) : 0;

            if (isNaN(targetValue)) {
              parseErrors.push(`Row ${idx + 2}, column "${key}": invalid numeric value "${rawVal}".`);
              return;
            }

            if (!isTargetInFinancialYear(month, year, fy)) {
              parseErrors.push(`Row ${idx + 2}: month ${month} / year ${year} does not belong to FY ${fy.label}.`);
              return;
            }

            parsedRows.push({
              staff_id: staffId,
              staff_name: staffName,
              service_id: serviceId,
              service_name: serviceName,
              month,
              year,
              target_value: Math.max(0, targetValue),
            });
          });
        });

        if (parseErrors.length > 0) {
          setImportState(prev => ({
            ...prev,
            error: `Import validation failed:\n${parseErrors.slice(0, 5).join('\n')}${parseErrors.length > 5 ? `\n…and ${parseErrors.length - 5} more` : ''}`,
          }));
          return;
        }

        // Build diff against current targetData
        const monthLabelMap: Record<number, string> = {};
        monthData.forEach(m => { monthLabelMap[m.number] = m.name; });

        const diffRows: ImportDiffRow[] = [];

        parsedRows.forEach(row => {
          const existingStaff = targetData.find(t => t.staff_id === row.staff_id);
          const currentValue = existingStaff?.targets[row.month]?.[row.service_name] ?? 0;
          const changed = currentValue !== row.target_value;

          diffRows.push({
            staff_id: row.staff_id,
            staff_name: row.staff_name,
            service_name: row.service_name,
            month: row.month,
            month_label: monthLabelMap[row.month] || String(row.month),
            year: row.year,
            current_value: currentValue,
            import_value: row.target_value,
            changed,
          });
        });

        // Sort: service → accountant → month
        diffRows.sort((a, b) => {
          if (a.service_name !== b.service_name) return a.service_name.localeCompare(b.service_name);
          if (a.staff_name !== b.staff_name) return a.staff_name.localeCompare(b.staff_name);
          return a.month - b.month;
        });

        setImportState(prev => ({
          ...prev,
          step: 'preview',
          parsedRows,
          diffRows,
          error: null,
        }));
      };

      reader.readAsText(file);
    },
    [importState.selectedFY, targetData, targetableServices]
  );

  const handleConfirmImport = async () => {
    if (!importState.selectedFY || importState.parsedRows.length === 0) return;

    setImportState(prev => ({ ...prev, step: 'importing', error: null }));

    try {
      const fy = importState.selectedFY;

      const newTargetData: TargetData[] = targetData.map(staffMember => {
        const monthData = getFinancialYearMonths();
        const newTargets: TargetData['targets'] = {};

        monthData.forEach(m => {
          newTargets[m.number] = { ...staffMember.targets[m.number] };
        });

        importState.parsedRows
          .filter(row => row.staff_id === staffMember.staff_id)
          .forEach(row => {
            if (newTargets[row.month]) {
              newTargets[row.month][row.service_name] = row.target_value;
            }
          });

        return { ...staffMember, targets: newTargets };
      });

      await Promise.all(
        newTargetData.map(async (staffMember) => {
          const monthData = getFinancialYearMonths();
          const monthsByYear: Record<number, number[]> = {};
          monthData.forEach((m) => {
            const calYear = getYearForMonth(m.number, fy);
            if (!monthsByYear[calYear]) monthsByYear[calYear] = [];
            monthsByYear[calYear].push(m.number);
          });

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
            const year = getYearForMonth(month, fy);

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

      setTargetData(newTargetData);
      setLastSavedSnapshot(buildSnapshot(newTargetData));
      setHasUnsavedChanges(false);

      setImportState(prev => ({ ...prev, step: 'done' }));
      setSaveMessage(`✅ Import complete — ${importState.diffRows.filter(r => r.changed).length} value(s) updated for FY ${fy.label}`);
      setTimeout(() => setSaveMessage(null), 5000);
    } catch {
      setImportState(prev => ({ ...prev, step: 'preview', error: 'Import failed. Please try again.' }));
    }
  };

  const handleCancelImport = () => {
    setImportState({
      step: 'idle',
      selectedFY: null,
      parsedRows: [],
      diffRows: [],
      error: null,
    });
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // ── Navigation guard ─────────────────────────────────────────────────────────

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

  const changedCount = importState.diffRows.filter(r => r.changed).length;

  // Build month columns for the diff preview table (grouped by service → accountant)
  const diffMonthData = getFinancialYearMonths();

  return (
    <div className="space-y-4">
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv"
        className="hidden"
        onChange={handleFileSelected}
      />

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

      {/* Unsaved changes dialog */}
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
                Save updates
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Import — FY selection modal */}
      {importState.step === 'select-fy' && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100]">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 max-w-sm mx-4 w-full animate-slide-up">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">Import Targets</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              Select the financial year you are importing targets for. Only month columns matching this financial year will be accepted.
            </p>
            <div className="mb-5">
              <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Financial Year</label>
              <select
                value={importState.selectedFY ? `${importState.selectedFY.start}-${importState.selectedFY.end}` : ''}
                onChange={(e) => {
                  const [start, end] = e.target.value.split('-').map(Number);
                  const fy = financialYears.find(f => f.start === start && f.end === end);
                  if (fy) setImportState(prev => ({ ...prev, selectedFY: fy }));
                }}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {financialYears.map((fy) => (
                  <option key={`${fy.start}-${fy.end}`} value={`${fy.start}-${fy.end}`}>
                    {fy.label}
                  </option>
                ))}
              </select>
            </div>
            {importState.error && (
              <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md text-xs text-red-800 dark:text-red-200 whitespace-pre-line">
                {importState.error}
              </div>
            )}
            <div className="flex gap-3 justify-end">
              <button
                onClick={handleCancelImport}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 text-sm font-bold rounded-md transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleImportFYConfirm}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-md transition-colors shadow-sm"
              >
                Choose CSV File
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Import — Preview / diff modal (wide format: months across top) */}
      {(importState.step === 'preview' || importState.step === 'importing') && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-6xl max-h-[90vh] flex flex-col animate-slide-up">
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between flex-shrink-0">
              <div>
                <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                  Import Preview — FY {importState.selectedFY?.label}
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                  {importState.parsedRows.length} cell(s) in file •{' '}
                  <span className={changedCount > 0 ? 'text-amber-600 font-semibold' : 'text-green-600 font-semibold'}>
                    {changedCount} change(s)
                  </span>
                  {' '}detected vs current data
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-green-100 text-green-800">
                  <span className="w-2 h-2 rounded-full bg-green-500 inline-block"></span> No change
                </span>
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-100 text-amber-800">
                  <span className="w-2 h-2 rounded-full bg-amber-500 inline-block"></span> Changed
                </span>
              </div>
            </div>

            {importState.error && (
              <div className="mx-6 mt-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md text-xs text-red-800 dark:text-red-200 whitespace-pre-line flex-shrink-0">
                {importState.error}
              </div>
            )}

            {/* Wide-format diff table: Service | Accountant | Apr | May | ... | Mar */}
            <div className="flex-1 overflow-auto">
              {(() => {
                // Group diffRows by service+accountant, then pivot months as columns
                const fy = importState.selectedFY;
                if (!fy) return null;

                const monthCols = diffMonthData.map((m) => {
                  const year = getYearForMonth(m.number, fy);
                  return { month: m.number, name: m.name, year };
                });

                // Build a map: service → accountant → month → diffRow
                type DiffKey = string; // `${service_name}||${staff_name}||${staff_id}`
                const grouped = new Map<DiffKey, Map<number, ImportDiffRow>>();

                importState.diffRows.forEach(row => {
                  const key: DiffKey = `${row.service_name}||${row.staff_name}||${row.staff_id}`;
                  if (!grouped.has(key)) grouped.set(key, new Map());
                  grouped.get(key)!.set(row.month, row);
                });

                // Sort keys: service first, then accountant
                const sortedKeys = Array.from(grouped.keys()).sort((a, b) => {
                  const [sA, nA] = a.split('||');
                  const [sB, nB] = b.split('||');
                  if (sA !== sB) return sA.localeCompare(sB);
                  return nA.localeCompare(nB);
                });

                return (
                  <table className="w-full text-sm border-collapse" style={{ minWidth: '900px' }}>
                    <thead className="sticky top-0 bg-gray-50 dark:bg-gray-700 z-10">
                      <tr>
                        <th className="px-3 py-2.5 text-left text-xs font-bold uppercase text-gray-600 dark:text-gray-300 border-b border-gray-200 dark:border-gray-600 whitespace-nowrap">Service</th>
                        <th className="px-3 py-2.5 text-left text-xs font-bold uppercase text-gray-600 dark:text-gray-300 border-b border-gray-200 dark:border-gray-600 whitespace-nowrap">Accountant</th>
                        {monthCols.map(mc => (
                          <th key={`${mc.month}-${mc.year}`} className="px-2 py-2.5 text-center text-xs font-bold uppercase text-gray-600 dark:text-gray-300 border-b border-gray-200 dark:border-gray-600 whitespace-nowrap">
                            <div>{mc.name}</div>
                            <div className="text-[9px] font-normal text-gray-400">{mc.year}</div>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {sortedKeys.map((key, idx) => {
                        const monthMap = grouped.get(key)!;
                        const [serviceName, staffName] = key.split('||');
                        const rowHasChange = monthCols.some(mc => monthMap.get(mc.month)?.changed);

                        return (
                          <tr
                            key={key}
                            className={`${idx % 2 === 0 ? 'bg-white dark:bg-gray-800' : 'bg-gray-50/50 dark:bg-gray-700/30'} ${rowHasChange ? 'ring-1 ring-inset ring-amber-200 dark:ring-amber-700' : ''}`}
                          >
                            <td className="px-3 py-2 text-gray-900 dark:text-white font-semibold whitespace-nowrap">{serviceName}</td>
                            <td className="px-3 py-2 text-gray-700 dark:text-gray-300 whitespace-nowrap">{staffName}</td>
                            {monthCols.map(mc => {
                              const cell = monthMap.get(mc.month);
                              const changed = cell?.changed ?? false;
                              const currentVal = cell?.current_value ?? 0;
                              const importVal = cell?.import_value ?? 0;

                              return (
                                <td key={`${mc.month}-${mc.year}`} className={`px-2 py-2 text-center ${changed ? 'bg-amber-50 dark:bg-amber-900/20' : ''}`}>
                                  {changed ? (
                                    <div className="flex flex-col items-center gap-0.5">
                                      <span className="text-xs text-gray-400 line-through">{currentVal}</span>
                                      <span className="text-xs font-bold text-amber-700 dark:text-amber-400">{importVal}</span>
                                    </div>
                                  ) : (
                                    <span className="text-xs font-mono text-gray-600 dark:text-gray-400">{importVal}</span>
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                );
              })()}
            </div>

            <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between flex-shrink-0 bg-white dark:bg-gray-800">
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {changedCount === 0
                  ? 'No changes detected. The imported file matches the current data.'
                  : `Confirming will overwrite ${changedCount} value(s) in the database for FY ${importState.selectedFY?.label}. Changed cells show old → new.`}
              </p>
              <div className="flex gap-3">
                <button
                  onClick={handleCancelImport}
                  disabled={importState.step === 'importing'}
                  className="px-4 py-2 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 text-sm font-bold rounded-md transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmImport}
                  disabled={importState.step === 'importing' || changedCount === 0}
                  className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-bold rounded-md transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {importState.step === 'importing' ? 'Importing…' : `Confirm Import (${changedCount} change${changedCount !== 1 ? 's' : ''})`}
                </button>
              </div>
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
            onClick={handleImportClick}
            className="px-3 py-1.5 bg-purple-600 text-white rounded-md hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-500 text-xs font-medium"
          >
            📤 Import CSV
          </button>
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