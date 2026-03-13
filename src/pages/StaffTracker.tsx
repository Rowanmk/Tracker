import React, { useEffect, useState, useRef } from "react";
import { useDate } from "../context/DateContext";
import { useAuth } from "../context/AuthContext";
import { useServices } from "../hooks/useServices";
import { useWorkingDays } from "../hooks/useWorkingDays";
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
  const { currentStaff } = useAuth();
  const { services } = useServices();
  const { staffPerformance } = useStaffPerformance("desc");
  
  const [dailyEntries, setDailyEntries] = useState<DailyEntry[]>([]);
  const [personalTargets, setPersonalTargets] = useState<Record<string, number>>({});
  const [personalTotals, setPersonalTotals] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  
  // Local state for input values to prevent re-renders while typing
  const [localValues, setLocalValues] = useState<Record<string, string>>({});
  const inputRefs = useRef<Map<string, HTMLInputElement>>(new Map());

  const year = selectedMonth >= 4 ? selectedFinancialYear.start : selectedFinancialYear.end;
  const daysInMonth = new Date(year, selectedMonth, 0).getDate();

  const { staffWorkingDays, workingDaysUpToToday } = useWorkingDays({
    financialYear: selectedFinancialYear,
    month: selectedMonth,
    staffId: currentStaff?.staff_id,
  });

  const fetchPersonalData = async (isInitial = false) => {
    if (!currentStaff) return;
    if (isInitial) setLoading(true);

    // 1. Fetch Personal Activities
    const { data: activities } = await supabase
      .from("dailyactivity")
      .select("service_id, delivered_count, day")
      .eq("month", selectedMonth)
      .eq("year", year)
      .eq("staff_id", currentStaff.staff_id);

    // 2. Fetch Personal Targets
    const { perService } = await loadTargets(selectedMonth, selectedFinancialYear, currentStaff.staff_id);
    
    const targetTotals: Record<string, number> = {};
    const currentTotals: Record<string, number> = {};
    services.forEach(s => {
      targetTotals[s.service_name] = perService?.[s.service_id] || 0;
      currentTotals[s.service_name] = 0;
    });

    // 3. Build Entry Table
    const entries: DailyEntry[] = Array.from({ length: daysInMonth }, (_, i) => ({
      date: `${year}-${String(selectedMonth).padStart(2, "0")}-${String(i + 1).padStart(2, "0")}`,
      day: i + 1,
      services: Object.fromEntries(services.map(s => [s.service_name, 0]))
    }));

    const newLocalValues: Record<string, string> = {};

    activities?.forEach(a => {
      const svc = services.find(s => s.service_id === a.service_id);
      if (svc) {
        currentTotals[svc.service_name] += a.delivered_count;
        const entry = entries.find(e => e.day === a.day);
        if (entry) {
          entry.services[svc.service_name] = a.delivered_count;
          newLocalValues[`${svc.service_id}-${a.day}`] = String(a.delivered_count);
        }
      }
    });

    setDailyEntries(entries);
    setPersonalTargets(targetTotals);
    setPersonalTotals(currentTotals);
    setLocalValues(newLocalValues);
    if (isInitial) setLoading(false);
  };

  useEffect(() => {
    fetchPersonalData(true);
  }, [selectedMonth, selectedFinancialYear, currentStaff?.staff_id, services.length]);

  const getCellKey = (serviceId: number, day: number) => `${serviceId}-${day}`;

  const handleInputChange = (serviceId: number, day: number, value: string) => {
    setLocalValues(prev => ({
      ...prev,
      [getCellKey(serviceId, day)]: value
    }));
  };

  const handleInputBlur = async (serviceId: number, day: number, value: string) => {
    if (!currentStaff) return;
    const numValue = parseInt(value) || 0;
    const date = `${year}-${String(selectedMonth).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

    await supabase.from("dailyactivity").upsert({
      staff_id: currentStaff.staff_id,
      service_id: serviceId,
      delivered_count: numValue,
      date, day, month: selectedMonth, year
    }, { onConflict: "staff_id,service_id,date" });

    // Refresh totals in background without full loading state
    fetchPersonalData(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, serviceId: number, day: number) => {
    if (e.key !== 'Tab') return;

    // Find current indices
    const serviceIndex = services.findIndex(s => s.service_id === serviceId);
    const dayIndex = day - 1; // 0-based

    let nextServiceIndex = serviceIndex;
    let nextDayIndex = dayIndex;

    if (e.shiftKey) {
      // Move left
      nextDayIndex--;
      if (nextDayIndex < 0) {
        nextDayIndex = daysInMonth - 1;
        nextServiceIndex--;
        if (nextServiceIndex < 0) {
          nextServiceIndex = services.length - 1;
        }
      }
    } else {
      // Move right
      nextDayIndex++;
      if (nextDayIndex >= daysInMonth) {
        nextDayIndex = 0;
        nextServiceIndex++;
        if (nextServiceIndex >= services.length) {
          nextServiceIndex = 0;
        }
      }
    }

    const nextService = services[nextServiceIndex];
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

  if (loading) return <div className="py-6 text-center text-gray-500">Loading tracker…</div>;

  return (
    <div className="space-y-6">
      <h2 className="text-2xl lg:text-3xl font-bold">My Progress</h2>
      
      <div className="mb-6">
        <StaffPerformanceBar staffPerformance={staffPerformance} />
      </div>

      <MyTrackerProgressTiles
        services={services}
        serviceTotals={personalTotals}
        targets={personalTargets}
        workingDays={staffWorkingDays}
        workingDaysUpToToday={workingDaysUpToToday}
      />
      
      <div className="border rounded-xl overflow-hidden shadow-sm bg-white dark:bg-gray-800">
        <div className="bg-[#001B47] text-white px-4 py-2 font-semibold">Daily Activity Entry</div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-700">
                <th className="text-left px-3 py-2 border-b border-r dark:border-gray-600 text-sm text-gray-700 dark:text-gray-200 sticky left-0 bg-gray-50 dark:bg-gray-700 z-10">Service</th>
                {dailyEntries.map(e => {
                  const weekend = isWeekend(e.date);
                  return (
                    <th 
                      key={e.day} 
                      className={`text-center py-2 border-b dark:border-gray-600 text-xs min-w-[40px] transition-colors ${
                        weekend 
                          ? 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 font-bold' 
                          : 'text-gray-600 dark:text-gray-300'
                      }`}
                    >
                      {e.day}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {services.map(s => (
                <tr key={s.service_id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                  <td className="px-3 py-1.5 border-b border-r dark:border-gray-600 text-sm font-medium text-gray-900 dark:text-white sticky left-0 bg-white dark:bg-gray-800 z-10">
                    {s.service_name}
                  </td>
                  {dailyEntries.map(e => {
                    const cellKey = getCellKey(s.service_id, e.day);
                    const weekend = isWeekend(e.date);
                    return (
                      <td 
                        key={e.day} 
                        className={`py-1.5 border-b dark:border-gray-600 text-center transition-colors ${
                          weekend ? 'bg-red-50/50 dark:bg-red-900/10' : ''
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
                          onChange={(ev) => handleInputChange(s.service_id, e.day, ev.target.value)}
                          onBlur={(ev) => handleInputBlur(s.service_id, e.day, ev.target.value)}
                          onKeyDown={(ev) => handleKeyDown(ev, s.service_id, e.day)}
                          className={`w-10 text-center border dark:border-gray-600 rounded text-xs no-spinner focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-colors ${
                            weekend 
                              ? 'bg-red-50/80 dark:bg-red-900/20 text-red-900 dark:text-red-100' 
                              : 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white'
                          }`}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};