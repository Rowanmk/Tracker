import React, { useEffect, useMemo, useState, useCallback } from "react";
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
  services: Record<string, number>;
}

export const StaffTracker: React.FC = () => {
  const { selectedMonth, selectedFinancialYear } = useDate();
  const { currentStaff, allStaff } = useAuth();
  const { services } = useServices();
  const [dailyEntries, setDailyEntries] = useState<DailyEntry[]>([]);
  const [teamTargets, setTeamTargets] = useState<Record<string, number>>({});
  const [teamTotals, setTeamTotals] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  const year = selectedMonth >= 4 ? selectedFinancialYear.start : selectedFinancialYear.end;
  const daysInMonth = new Date(year, selectedMonth, 0).getDate();

  const { teamWorkingDays, workingDaysUpToToday } = useWorkingDays({
    financialYear: selectedFinancialYear,
    month: selectedMonth,
  });

  const fetchTeamData = async () => {
    if (!currentStaff || !currentStaff.team_id) return;
    setLoading(true);

    const teamStaff = allStaff.filter(s => s.team_id === currentStaff.team_id);
    const staffIds = teamStaff.map(s => s.staff_id);

    // 1. Fetch Team Activities
    const { data: activities } = await supabase
      .from("dailyactivity")
      .select("service_id, delivered_count, day, staff_id")
      .eq("month", selectedMonth)
      .eq("year", year)
      .in("staff_id", staffIds);

    // 2. Fetch Team Targets
    const targetTotals: Record<string, number> = {};
    const currentTotals: Record<string, number> = {};
    services.forEach(s => {
      targetTotals[s.service_name] = 0;
      currentTotals[s.service_name] = 0;
    });

    for (const s of teamStaff) {
      const { perService } = await loadTargets(selectedMonth, selectedFinancialYear, s.staff_id);
      services.forEach(svc => targetTotals[svc.service_name] += perService?.[svc.service_id] || 0);
    }

    // 3. Build Entry Table (Personal)
    const entries: DailyEntry[] = Array.from({ length: daysInMonth }, (_, i) => ({
      date: `${year}-${String(selectedMonth).padStart(2, "0")}-${String(i + 1).padStart(2, "0")}`,
      day: i + 1,
      services: Object.fromEntries(services.map(s => [s.service_name, 0]))
    }));

    activities?.forEach(a => {
      const svc = services.find(s => s.service_id === a.service_id);
      if (svc) {
        currentTotals[svc.service_name] += a.delivered_count;
        if (a.staff_id === currentStaff.staff_id) {
          const entry = entries.find(e => e.day === a.day);
          if (entry) entry.services[svc.service_name] = a.delivered_count;
        }
      }
    });

    setDailyEntries(entries);
    setTeamTargets(targetTotals);
    setTeamTotals(currentTotals);
    setLoading(false);
  };

  useEffect(() => {
    fetchTeamData();
  }, [selectedMonth, selectedFinancialYear, currentStaff?.staff_id]);

  const onCellChange = async (serviceId: number, serviceName: string, day: number, value: string) => {
    if (!currentStaff) return;
    const numValue = parseInt(value) || 0;
    const date = `${year}-${String(selectedMonth).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

    await supabase.from("dailyactivity").upsert({
      staff_id: currentStaff.staff_id,
      service_id: serviceId,
      delivered_count: numValue,
      date, day, month: selectedMonth, year
    }, { onConflict: "staff_id,service_id,date" });

    fetchTeamData();
  };

  if (loading) return <div className="py-6 text-center text-gray-500">Loading tracker…</div>;

  return (
    <div className="space-y-4">
      <h2 className="text-2xl lg:text-3xl font-bold">My Team's Progress</h2>
      <MyTrackerProgressTiles
        services={services}
        serviceTotals={teamTotals}
        targets={teamTargets}
        workingDays={teamWorkingDays}
        workingDaysUpToToday={workingDaysUpToToday}
      />
      <div className="border rounded-xl overflow-hidden">
        <div className="bg-[#001B47] text-white px-4 py-2 font-semibold">Personal Data Entry</div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-gray-50">
                <th className="text-left px-3 py-2 border-b border-r text-sm">Service</th>
                {dailyEntries.map(e => <th key={e.day} className="text-center py-2 border-b text-xs">{e.day}</th>)}
              </tr>
            </thead>
            <tbody>
              {services.map(s => (
                <tr key={s.service_id}>
                  <td className="px-3 py-1.5 border-b border-r text-sm">{s.service_name}</td>
                  {dailyEntries.map(e => (
                    <td key={e.day} className="py-1.5 border-b text-center">
                      <input
                        type="number"
                        value={e.services[s.service_name]}
                        onChange={(ev) => onCellChange(s.service_id, s.service_name, e.day, ev.target.value)}
                        className="w-10 text-center border rounded text-xs"
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};