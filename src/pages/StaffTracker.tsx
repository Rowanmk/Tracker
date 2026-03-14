import React, { useEffect, useMemo, useState, useRef } from "react";
import { useDate } from "../context/DateContext";
import { useAuth } from "../context/AuthContext";
import { useServices } from "../hooks/useServices";
import { useWorkingDays } from "../hooks/useWorkingDays";
import { useStaffLeaveAndHolidays } from "../hooks/useStaffLeaveAndHolidays";
import { MyTrackerProgressTiles } from "../components/MyTrackerProgressTiles";
import { StaffPerformanceBar } from "../components/StaffPerformanceBar";
import { useStaffPerformance } from "../hooks/useStaffPerformance";
import { supabase } from "../supabase/client";
import { loadTargets } from "../utils/loadTargets";

interface DailyEntry {
  date: string;
  day: number;
  services: Record<string, number>;
}

export const StaffTracker: React.FC = () => {
  const { selectedMonth, selectedFinancialYear } = useDate();
  const { currentStaff, selectedTeamId, teams, allStaff } = useAuth();
  const { services } = useServices();
  const { staffPerformance } = useStaffPerformance("desc");

  const displayServices = useMemo(() => services.filter(s => s.service_name !== 'Bagel Days'), [services]);

  const [dailyEntries, setDailyEntries] = useState<DailyEntry[]>([]);
  const [personalTargets, setPersonalTargets] = useState<Record<string, number>>({});
  const [personalTotals, setPersonalTotals] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  const [localValues, setLocalValues] = useState<Record<string, string>>({});
  const inputRefs = useRef<Map<string, HTMLInputElement>>(new Map());

  const year = selectedMonth >= 4 ? selectedFinancialYear.start : selectedFinancialYear.end;
  const daysInMonth = new Date(year, selectedMonth, 0).getDate();

  const selectedTeamMembers = useMemo(() => {
    if (selectedTeamId === "all" || !selectedTeamId) {
      return allStaff.filter((staff) => !staff.is_hidden);
    }

    return allStaff.filter(
      (staff) => !staff.is_hidden && String(staff.team_id) === selectedTeamId
    );
  }, [allStaff, selectedTeamId]);

  const editableStaffIds = useMemo(
    () => selectedTeamMembers.map((staff) => staff.staff_id),
    [selectedTeamMembers]
  );

  const tableLabel = useMemo(() => {
    if (selectedTeamId === "all") {
      return "All Teams";
    }

    return teams.find((team) => team.id.toString() === selectedTeamId)?.name || "My";
  }, [selectedTeamId, teams]);

  const { staffWorkingDays, workingDaysUpToToday } = useWorkingDays({
    financialYear: selectedFinancialYear,
    month: selectedMonth,
    staffId: currentStaff?.staff_id,
  });

  const { bankHolidays } = useStaffLeaveAndHolidays({
    staffId: currentStaff?.staff_id || 0,
    month: selectedMonth,
    year,
    homeRegion: currentStaff?.home_region || "england-and-wales",
  });

  const fetchTeamTrackerData = async (isInitial = false) => {
    if (!currentStaff || displayServices.length === 0) return;
    if (isInitial) setLoading(true);

    const entries: DailyEntry[] = Array.from({ length: daysInMonth }, (_, i) => ({
      date: `${year}-${String(selectedMonth).padStart(2, "0")}-${String(i + 1).padStart(2, "0")}`,
      day: i + 1,
      services: Object.fromEntries(displayServices.map((service) => [service.service_name, 0])),
    }));

    const nextTargets: Record<string, number> = {};
    const nextTotals: Record<string, number> = {};
    displayServices.forEach((service) => {
      nextTargets[service.service_name] = 0;
      nextTotals[service.service_name] = 0;
    });

    const nextLocalValues: Record<string, string> = {};

    if (editableStaffIds.length === 0) {
      setDailyEntries(entries);
      setPersonalTargets(nextTargets);
      setPersonalTotals(nextTotals);
      setLocalValues(nextLocalValues);
      if (isInitial) setLoading(false);
      return;
    }

    const [{ data: activities }, targetResults] = await Promise.all([
      supabase
        .from("dailyactivity")
        .select("service_id, delivered_count, day, staff_id, date")
        .eq("month", selectedMonth)
        .eq("year", year)
        .in("staff_id", editableStaffIds),
      Promise.all(
        editableStaffIds.map((staffId) =>
          loadTargets(selectedMonth, selectedFinancialYear, staffId)
        )
      ),
    ]);

    let finalActivities = activities || [];

    targetResults.forEach(({ perService }) => {
      displayServices.forEach((service) => {
        nextTargets[service.service_name] += perService?.[service.service_id] || 0;
      });
    });

    finalActivities.forEach((activity) => {
      const service = displayServices.find((item) => item.service_id === activity.service_id);
      if (!service) return;

      nextTotals[service.service_name] += activity.delivered_count || 0;

      const entry = entries.find((item) => item.day === activity.day);
      if (entry) {
        entry.services[service.service_name] += activity.delivered_count || 0;
      }
    });

    displayServices.forEach((service) => {
      entries.forEach((entry) => {
        nextLocalValues[`${service.service_id}-${entry.day}`] = String(
          entry.services[service.service_name] || 0
        );
      });
    });

    setDailyEntries(entries);
    setPersonalTargets(nextTargets);
    setPersonalTotals(nextTotals);
    setLocalValues(nextLocalValues);
    if (isInitial) setLoading(false);
  };

  useEffect(() => {
    fetchTeamTrackerData(true);
  }, [selectedMonth, selectedFinancialYear, selectedTeamId, currentStaff?.staff_id, displayServices.length, editableStaffIds.join(",")]);

  const getCellKey = (serviceId: number, day: number) => `${serviceId}-${day}`;

  const handleInputChange = (serviceId: number, day: number, value: string) => {
    setLocalValues((prev) => ({
      ...prev,
      [getCellKey(serviceId, day)]: value,
    }));
  };

  const handleInputBlur = async (serviceId: number, day: number, value: string) => {
    if (editableStaffIds.length === 0) return;

    const parsedValue = parseInt(value, 10);
    const numValue = Number.isNaN(parsedValue) ? 0 : Math.max(parsedValue, 0);
    const date = `${year}-${String(selectedMonth).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

    const { data: existingRows } = await supabase
      .from("dailyactivity")
      .select("activity_id, delivered_count, staff_id")
      .eq("service_id", serviceId)
      .eq("day", day)
      .eq("month", selectedMonth)
      .eq("year", year)
      .in("staff_id", editableStaffIds);

    const existingTotal =
      existingRows?.reduce((sum, row) => sum + (row.delivered_count || 0), 0) || 0;

    if (existingRows && existingRows.length > 0) {
      if (numValue === 0) {
        await supabase
          .from("dailyactivity")
          .delete()
          .in(
            "activity_id",
            existingRows.map((row) => row.activity_id)
          );
      } else {
        const primaryRow = existingRows[0];
        await supabase
          .from("dailyactivity")
          .update({
            delivered_count: numValue,
            date,
            day,
            month: selectedMonth,
            year,
          })
          .eq("activity_id", primaryRow.activity_id);

        const extraRowIds = existingRows.slice(1).map((row) => row.activity_id);
        if (extraRowIds.length > 0) {
          await supabase.from("dailyactivity").delete().in("activity_id", extraRowIds);
        }
      }
    } else if (numValue > 0) {
      const primaryStaffId = editableStaffIds[0];
      await supabase.from("dailyactivity").insert({
        staff_id: primaryStaffId,
        service_id: serviceId,
        delivered_count: numValue,
        date,
        day,
        month: selectedMonth,
        year,
      });
    }

    if (existingTotal !== numValue) {
      window.dispatchEvent(new Event("activity-updated"));
    }

    await fetchTeamTrackerData(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, serviceId: number, day: number) => {
    const isTab = e.key === "Tab";
    const isArrow = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key);

    if (!isTab && !isArrow) return;

    const serviceIndex = displayServices.findIndex((service) => service.service_id === serviceId);
    const dayIndex = day - 1;

    let nextServiceIndex = serviceIndex;
    let nextDayIndex = dayIndex;

    if (isTab) {
      if (e.shiftKey) {
        nextDayIndex--;
        if (nextDayIndex < 0) {
          nextDayIndex = daysInMonth - 1;
          nextServiceIndex--;
          if (nextServiceIndex < 0) {
            nextServiceIndex = displayServices.length - 1;
          }
        }
      } else {
        nextDayIndex++;
        if (nextDayIndex >= daysInMonth) {
          nextDayIndex = 0;
          nextServiceIndex++;
          if (nextServiceIndex >= displayServices.length) {
            nextServiceIndex = 0;
          }
        }
      }
    } else if (isArrow) {
      if (e.key === "ArrowUp") {
        nextServiceIndex--;
      } else if (e.key === "ArrowDown") {
        nextServiceIndex++;
      } else if (e.key === "ArrowLeft") {
        nextDayIndex--;
      } else if (e.key === "ArrowRight") {
        nextDayIndex++;
      }

      if (
        nextServiceIndex < 0 ||
        nextServiceIndex >= displayServices.length ||
        nextDayIndex < 0 ||
        nextDayIndex >= daysInMonth
      ) {
        return;
      }
    }

    const nextService = displayServices[nextServiceIndex];
    const nextDay = nextDayIndex + 1;
    const nextKey = getCellKey(nextService.service_id, nextDay);

    const nextInput = inputRefs.current.get(nextKey);
    if (nextInput) {
      e.preventDefault();
      nextInput.focus();
      nextInput.select();
    }
  };

  const isWeekend = (dateStr: string) => {
    const d = new Date(dateStr);
    const day = d.getDay();
    return day === 0 || day === 6;
  };

  const isPublicHoliday = (dateStr: string) => {
    return bankHolidays.some((holiday) => holiday.date === dateStr);
  };

  if (loading) return <div className="py-6 text-center text-gray-500">Loading tracker…</div>;

  return (
    <div className="space-y-6">
      <div className="page-header">
        <h2 className="page-title">{tableLabel} Tracker</h2>
      </div>

      <div className="mb-6">
        <StaffPerformanceBar staffPerformance={staffPerformance} />
      </div>

      <MyTrackerProgressTiles
        services={displayServices}
        serviceTotals={personalTotals}
        targets={personalTargets}
        workingDays={staffWorkingDays}
        workingDaysUpToToday={workingDaysUpToToday}
      />

      <div className="border rounded-xl overflow-hidden shadow-sm bg-white dark:bg-gray-800">
        <div className="bg-[#001B47] text-white px-4 py-2 font-semibold">
          Daily Activity Entry
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse table-fixed">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-700">
                <th className="text-left px-3 py-2 border-b border-r dark:border-gray-600 text-sm text-gray-700 dark:text-gray-200 sticky left-0 bg-gray-50 dark:bg-gray-700 z-10 w-40">
                  Service
                </th>
                {dailyEntries.map((entry) => {
                  const highlight = isWeekend(entry.date) || isPublicHoliday(entry.date);
                  return (
                    <th
                      key={entry.day}
                      className={`text-center py-2 border-b border-r last:border-r-0 dark:border-gray-600 text-xs transition-colors px-0 ${
                        highlight
                          ? "bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 font-bold"
                          : "text-gray-600 dark:text-gray-300"
                      }`}
                    >
                      {entry.day}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {displayServices.map((service) => {
                return (
                  <tr
                    key={service.service_id}
                    className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                  >
                    <td className="px-3 py-1.5 border-b border-r dark:border-gray-600 text-sm font-medium text-gray-900 dark:text-white sticky left-0 bg-white dark:bg-gray-800 z-10 truncate">
                      {service.service_name}
                    </td>
                    {dailyEntries.map((entry) => {
                      const cellKey = getCellKey(service.service_id, entry.day);
                      const highlight = isWeekend(entry.date) || isPublicHoliday(entry.date);
                      return (
                        <td
                          key={entry.day}
                          className={`p-0 border-b border-r last:border-r-0 dark:border-gray-600 text-center transition-colors ${
                            highlight ? "bg-red-50/50 dark:bg-red-900/10" : ""
                          }`}
                        >
                          <input
                            ref={(el) => {
                              if (el) inputRefs.current.set(cellKey, el);
                              else inputRefs.current.delete(cellKey);
                            }}
                            type="number"
                            value={localValues[cellKey] || "0"}
                            onFocus={(ev) => ev.target.select()}
                            onChange={(ev) => handleInputChange(service.service_id, entry.day, ev.target.value)}
                            onBlur={(ev) => handleInputBlur(service.service_id, entry.day, ev.target.value)}
                            onKeyDown={(ev) => handleKeyDown(ev, service.service_id, entry.day)}
                            className={`w-full h-10 text-center border-0 dark:bg-gray-700 text-xs no-spinner focus:ring-2 focus:ring-inset focus:ring-blue-500 outline-none transition-colors ${
                              highlight
                                ? "bg-red-50/80 dark:bg-red-900/20 text-red-900 dark:text-red-100"
                                : "bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                            }`}
                          />
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-gray-100 dark:bg-gray-700 font-bold">
                <td className="px-3 py-2 border-r dark:border-gray-600 text-sm text-gray-900 dark:text-white sticky left-0 bg-gray-100 dark:bg-gray-700 z-10">
                  Total
                </td>
                {dailyEntries.map((entry) => {
                  const dayTotal = displayServices.reduce((sum, service) => {
                    const val = localValues[getCellKey(service.service_id, entry.day)] || "0";
                    return sum + (parseInt(val, 10) || 0);
                  }, 0);
                  const highlight = isWeekend(entry.date) || isPublicHoliday(entry.date);
                  return (
                    <td
                      key={entry.day}
                      className={`text-center py-2 border-r last:border-r-0 dark:border-gray-600 text-xs transition-colors ${
                        highlight
                          ? "bg-red-200/50 dark:bg-red-900/60 text-red-800 dark:text-red-200"
                          : "text-gray-900 dark:text-white"
                      }`}
                    >
                      {dayTotal}
                    </td>
                  );
                })}
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
};