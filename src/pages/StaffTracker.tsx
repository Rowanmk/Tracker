import React, { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { useDate } from "../context/DateContext";
import { useAuth } from "../context/AuthContext";
import { useServices } from "../hooks/useServices";
import { useWorkingDays } from "../hooks/useWorkingDays";
import { useStaffLeaveAndHolidays } from "../hooks/useStaffLeaveAndHolidays";
import { MyTrackerProgressTiles } from "../components/MyTrackerProgressTiles";
import { StaffPerformanceBar } from "../components/StaffPerformanceBar";
import { supabase } from "../supabase/client";
import { loadTargets } from "../utils/loadTargets";

interface DailyEntry {
  date: string;
  day: number;
  isWeekend: boolean;
  isOnLeave: boolean;
  isBankHoliday: boolean;
  bankHolidayTitle?: string;
  services: Record<string, number>;
}

interface DailyActivityRow {
  staff_id: number;
  service_id: number;
  delivered_count: number;
  day: number;
}

interface StaffPerformance {
  staff_id: number;
  name: string;
  total: number;
}

type LocalInputState = Record<string, string>;

export const StaffTracker: React.FC = () => {
  const { selectedMonth, selectedFinancialYear } = useDate();
  const { currentStaff, selectedStaffId, allStaff } = useAuth();
  const { services, loading: servicesLoading } = useServices();

  const isTeamSelected = selectedStaffId === "team" || !selectedStaffId;

  const year =
    selectedMonth >= 4 ? selectedFinancialYear.start : selectedFinancialYear.end;

  const staffIdForWorkingDays =
    !isTeamSelected && currentStaff ? currentStaff.staff_id : undefined;

  const {
    teamWorkingDays,
    staffWorkingDays,
    workingDaysUpToToday,
    loading: workingDaysLoading,
  } = useWorkingDays({
    financialYear: selectedFinancialYear,
    month: selectedMonth,
    staffId: staffIdForWorkingDays,
  });

  const effectiveWorkingDays = isTeamSelected ? teamWorkingDays : staffWorkingDays;

  const { isDateOnLeave, isDateBankHoliday, loading: leaveHolidayLoading } =
    useStaffLeaveAndHolidays({
      staffId: currentStaff?.staff_id ?? 0,
      month: selectedMonth,
      year,
      homeRegion: currentStaff?.home_region || "england-and-wales",
    });

  const [dailyEntries, setDailyEntries] = useState<DailyEntry[]>([]);
  const [targets, setTargets] = useState<Record<string, number>>({});
  const [staffPerformance, setStaffPerformance] = useState<StaffPerformance[]>([]);
  const [localInputState, setLocalInputState] = useState<LocalInputState>({});
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  // Scroll position management
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const scrollPositionRef = useRef<number>(0);
  const isInitialLoadRef = useRef<boolean>(true);

  const daysInMonth = new Date(year, selectedMonth, 0).getDate();

  const staffIds = useMemo<number[]>(() => {
    if (isTeamSelected) return allStaff.map((s) => s.staff_id);
    if (currentStaff) return [currentStaff.staff_id];
    return [];
  }, [isTeamSelected, allStaff, currentStaff]);

  const getDayName = (day: number) =>
    ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][
      new Date(year, selectedMonth - 1, day).getDay()
    ];

  const dayMeta = useMemo(() => {
    return Array.from({ length: daysInMonth }, (_, i) => {
      const day = i + 1;
      const date = `${year}-${String(selectedMonth).padStart(2, "0")}-${String(
        day
      ).padStart(2, "0")}`;

      const bh = isDateBankHoliday(date);
      const dow = new Date(year, selectedMonth - 1, day).getDay();

      return {
        day,
        date,
        isWeekend: dow === 0 || dow === 6,
        isOnLeave: isDateOnLeave(date),
        isBankHoliday: !!bh,
        bankHolidayTitle: bh?.title,
      };
    });
  }, [daysInMonth, year, selectedMonth, isDateBankHoliday, isDateOnLeave]);

  const columnClass = (d: {
    isWeekend: boolean;
    isBankHoliday: boolean;
    isOnLeave: boolean;
  }) => {
    if (d.isBankHoliday) return "bg-blue-100";
    if (d.isWeekend) return "bg-blue-50";
    if (!isTeamSelected && d.isOnLeave) return "bg-gray-100";
    return "";
  };

  const buildBaseEntries = useCallback((): DailyEntry[] => {
    return dayMeta.map((d) => ({
      date: d.date,
      day: d.day,
      isWeekend: d.isWeekend,
      isOnLeave: d.isOnLeave,
      isBankHoliday: d.isBankHoliday,
      bankHolidayTitle: d.bankHolidayTitle,
      services: Object.fromEntries(services.map((s) => [s.service_name, 0])),
    }));
  }, [dayMeta, services]);

  const initLocalInputsFromEntries = useCallback(
    (entries: DailyEntry[]) => {
      const next: LocalInputState = {};
      services.forEach((s) => {
        entries.forEach((e) => {
          const key = `${s.service_id}-${e.day}`;
          next[key] = String(e.services[s.service_name] ?? 0);
        });
      });
      setLocalInputState(next);
    },
    [services]
  );

  // Save scroll position before state changes
  const saveScrollPosition = () => {
    if (scrollContainerRef.current) {
      scrollPositionRef.current = scrollContainerRef.current.scrollLeft;
    }
  };

  // Restore scroll position after render
  useEffect(() => {
    if (scrollContainerRef.current && !isInitialLoadRef.current) {
      scrollContainerRef.current.scrollLeft = scrollPositionRef.current;
    }
  }, [localInputState, dailyEntries]);

  const fetchData = async () => {
    if (services.length === 0 || staffIds.length === 0) {
      setDailyEntries([]);
      setTargets({});
      setStaffPerformance([]);
      setLocalInputState({});
      setLoading(false);
      return;
    }

    setLoading(true);
    const baseEntries = buildBaseEntries();

    const { data: activities } = await supabase
      .from("dailyactivity")
      .select("staff_id, service_id, delivered_count, day")
      .eq("month", selectedMonth)
      .eq("year", year)
      .in("staff_id", staffIds);

    (activities as DailyActivityRow[] | null)?.forEach((a) => {
      const service = services.find((s) => s.service_id === a.service_id);
      const entry = baseEntries.find((e) => e.day === a.day);
      if (service && entry) {
        entry.services[service.service_name] += a.delivered_count || 0;
      }
    });

    setDailyEntries(baseEntries);
    initLocalInputsFromEntries(baseEntries);

    const targetTotals: Record<string, number> = {};
    services.forEach((s) => (targetTotals[s.service_name] = 0));

    if (isTeamSelected) {
      for (const s of allStaff) {
        const { perService } = await loadTargets(
          selectedMonth,
          selectedFinancialYear,
          s.staff_id
        );
        services.forEach((svc) => {
          targetTotals[svc.service_name] += perService?.[svc.service_id] || 0;
        });
      }
    } else if (currentStaff) {
      const { perService } = await loadTargets(
        selectedMonth,
        selectedFinancialYear,
        currentStaff.staff_id
      );
      services.forEach((svc) => {
        targetTotals[svc.service_name] = perService?.[svc.service_id] || 0;
      });
    }

    setTargets(targetTotals);

    const totalsByStaff: Record<number, number> = {};
    (activities as DailyActivityRow[] | null)?.forEach((a) => {
      totalsByStaff[a.staff_id] =
        (totalsByStaff[a.staff_id] || 0) + (a.delivered_count || 0);
    });

    const perf: StaffPerformance[] = staffIds
      .map((id) => {
        const s = allStaff.find((x) => x.staff_id === id) || currentStaff;
        if (!s) return null;
        return { staff_id: id, name: s.name, total: totalsByStaff[id] || 0 };
      })
      .filter((x): x is StaffPerformance => x !== null);

    setStaffPerformance(perf);
    setLoading(false);
    isInitialLoadRef.current = false;
  };

  useEffect(() => {
    if (servicesLoading || leaveHolidayLoading) return;
    isInitialLoadRef.current = true;
    scrollPositionRef.current = 0;
    fetchData();
  }, [
    selectedMonth,
    selectedFinancialYear,
    selectedStaffId,
    servicesLoading,
    leaveHolidayLoading,
    allStaff.length,
  ]);

  useEffect(() => {
    const handler = () => fetchData();
    window.addEventListener("activity-updated", handler);
    return () => window.removeEventListener("activity-updated", handler);
  }, [selectedMonth, selectedFinancialYear, selectedStaffId]);

  const serviceTotals = useMemo(() => {
    return Object.fromEntries(
      services.map((s) => [
        s.service_name,
        dailyEntries.reduce(
          (sum, e) => sum + (e.services[s.service_name] || 0),
          0
        ),
      ])
    );
  }, [dailyEntries, services]);

  const onCellChange = (
    serviceId: number,
    serviceName: string,
    day: number,
    raw: string
  ) => {
    saveScrollPosition();
    const cleaned = raw.replace(/[^\d]/g, "");
    const key = `${serviceId}-${day}`;
    setLocalInputState((prev) => ({ ...prev, [key]: cleaned }));

    const nextValue = cleaned === "" ? 0 : Number(cleaned);

    setDailyEntries((prev) =>
      prev.map((e) =>
        e.day !== day
          ? e
          : {
              ...e,
              services: {
                ...e.services,
                [serviceName]: Number.isFinite(nextValue) ? nextValue : 0,
              },
            }
      )
    );
  };

  const saveCell = async (serviceId: number, day: number) => {
    if (isTeamSelected || !currentStaff) return;

    saveScrollPosition();

    const key = `${serviceId}-${day}`;
    const raw = localInputState[key] ?? "0";
    const value = raw === "" ? 0 : Number(raw);
    if (!Number.isFinite(value) || value < 0) return;

    setSavingKey(key);

    const date = `${year}-${String(selectedMonth).padStart(2, "0")}-${String(
      day
    ).padStart(2, "0")}`;

    try {
      await supabase
        .from("dailyactivity")
        .upsert(
          {
            staff_id: currentStaff.staff_id,
            service_id: serviceId,
            delivered_count: value,
            date,
            day,
            month: selectedMonth,
            year,
          },
          { onConflict: "staff_id,service_id,date" }
        );

      window.dispatchEvent(new Event("activity-updated"));
    } finally {
      setSavingKey(null);
    }
  };

  if (loading || servicesLoading || leaveHolidayLoading) {
    return <div className="py-6 text-center text-gray-500">Loading tracker…</div>;
  }

  return (
    <div className="space-y-4">
      <h2 className="text-2xl lg:text-3xl font-bold">My Tracker</h2>

      <StaffPerformanceBar staffPerformance={staffPerformance} />

      <MyTrackerProgressTiles
        services={services}
        serviceTotals={serviceTotals}
        targets={targets}
        workingDays={effectiveWorkingDays}
        workingDaysUpToToday={workingDaysUpToToday}
      />

      <div className="border rounded-xl overflow-hidden">
        <div className="bg-[#001B47] text-white px-4 py-2 flex items-center justify-between">
          <div className="font-semibold">
            {isTeamSelected ? "Team View (read-only)" : "Daily Entry Table"}
          </div>
          <div className="text-xs opacity-90">
            {isTeamSelected
              ? "Select a staff member to enter data"
              : "Edits save when you click out of a cell"}
          </div>
        </div>

        <div className="overflow-x-auto" ref={scrollContainerRef}>
          <table className="min-w-max w-full border-collapse">
            <thead>
              <tr className="bg-gray-50">
                <th
                  className="sticky left-0 bg-gray-50 z-10 text-left px-4 py-2 border-b border-r whitespace-nowrap"
                  style={{ minWidth: 220 }}
                >
                  Service
                </th>
                {dayMeta.map((d) => (
                  <th
                    key={d.day}
                    className={`text-center px-2 py-2 border-b whitespace-nowrap ${columnClass(
                      d
                    )}`}
                    title={
                      d.isBankHoliday
                        ? d.bankHolidayTitle || "Bank holiday"
                        : d.isOnLeave && !isTeamSelected
                        ? "On leave"
                        : d.isWeekend
                        ? "Weekend"
                        : ""
                    }
                    style={{ minWidth: 56 }}
                  >
                    <div className="font-semibold">{d.day}</div>
                    <div className="text-xs text-gray-600">
                      {getDayName(d.day)}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {services.map((s) => (
                <tr key={s.service_id} className="hover:bg-gray-50">
                  <td
                    className="sticky left-0 bg-white z-10 px-4 py-2 border-b border-r whitespace-nowrap font-medium"
                    style={{ minWidth: 220 }}
                  >
                    {s.service_name}
                  </td>

                  {dayMeta.map((d) => {
                    const key = `${s.service_id}-${d.day}`;
                    const disabled = isTeamSelected;
                    const isSaving = savingKey === key;

                    return (
                      <td
                        key={key}
                        className={`px-2 py-2 border-b text-center ${columnClass(
                          d
                        )}`}
                      >
                        <input
                          value={localInputState[key] ?? "0"}
                          onChange={(e) =>
                            onCellChange(
                              s.service_id,
                              s.service_name,
                              d.day,
                              e.target.value
                            )
                          }
                          onBlur={() => saveCell(s.service_id, d.day)}
                          disabled={disabled}
                          inputMode="numeric"
                          className={`w-12 text-center rounded-md border px-2 py-1 text-sm ${
                            disabled
                              ? "bg-gray-100 text-gray-500 cursor-not-allowed"
                              : "bg-white"
                          } ${isSaving ? "opacity-60" : ""}`}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}

              <tr className="bg-[#001B47]">
                <td
                  className="sticky left-0 bg-[#001B47] z-10 px-4 py-2 border-t border-r font-semibold whitespace-nowrap text-white"
                  style={{ minWidth: 220 }}
                >
                  Monthly Total
                </td>
                {dayMeta.map((d) => {
                  const dayTotal = services.reduce((sum, s) => {
                    const entry = dailyEntries.find((e) => e.day === d.day);
                    return sum + (entry?.services[s.service_name] || 0);
                  }, 0);

                  return (
                    <td
                      key={`total-${d.day}`}
                      className={`px-2 py-2 border-t text-center font-semibold text-white bg-[#001B47]`}
                    >
                      {dayTotal}
                    </td>
                  );
                })}
              </tr>
            </tbody>
          </table>
        </div>

        {workingDaysLoading && (
          <div className="px-4 py-2 text-xs text-gray-500">
            Calculating working days…
          </div>
        )}
      </div>
    </div>
  );
};