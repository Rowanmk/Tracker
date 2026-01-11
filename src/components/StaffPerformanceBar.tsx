import React, { useEffect, useMemo, useState } from "react";
import { loadTargets } from "../utils/loadTargets";
import { useAuth } from "../context/AuthContext";
import { useDate } from "../context/DateContext";
import { useWorkingDays } from "../hooks/useWorkingDays";

interface StaffPerformance {
  staff_id: number;
  name: string;
  total: number;
}

interface Props {
  staffPerformance: StaffPerformance[];
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export const StaffPerformanceBar: React.FC<Props> = ({ staffPerformance }) => {
  const { selectedStaffId, currentStaff, staff } = useAuth();
  const {
    selectedMonth,
    selectedYear,
    setSelectedMonth,
    setSelectedYear,
    selectedFinancialYear,
  } = useDate();

  // ✅ SINGLE SOURCE OF TRUTH (Team is a pseudo-staff selection)
  const isTeam = selectedStaffId === "team" || !selectedStaffId;

  // Build FY month options deterministically:
  // FY assumed Apr -> Mar (standard UK)
  const monthYearOptions = useMemo(() => {
    const fyStart = selectedFinancialYear.start;
    const fyEnd = selectedFinancialYear.end;

    const order = [4, 5, 6, 7, 8, 9, 10, 11, 12, 1, 2, 3]; // Apr..Mar

    return order.map((m) => ({
      month: m,
      year: m >= 4 ? fyStart : fyEnd,
      label: `${MONTHS[m - 1]} ${m >= 4 ? fyStart : fyEnd}`,
      value: `${m}-${m >= 4 ? fyStart : fyEnd}`,
    }));
  }, [selectedFinancialYear]);

  const selectedValue = `${selectedMonth}-${selectedYear}`;

  const { teamWorkingDays, staffWorkingDays, workingDaysUpToToday } =
    useWorkingDays({
      financialYear: selectedFinancialYear,
      month: selectedMonth,
      staffId: isTeam ? undefined : currentStaff?.staff_id,
    });

  const workingDays = isTeam ? teamWorkingDays : staffWorkingDays;

  const [targetTotal, setTargetTotal] = useState(0);

  // ACTUALS
  const actualTotal = useMemo(() => {
    return isTeam
      ? staffPerformance.reduce((sum, s) => sum + s.total, 0)
      : staffPerformance[0]?.total ?? 0;
  }, [isTeam, staffPerformance]);

  // TARGETS
  useEffect(() => {
    const load = async () => {
      if (isTeam) {
        let total = 0;
        for (const s of staff) {
          const { totalTarget } = await loadTargets(
            selectedMonth,
            selectedFinancialYear,
            s.staff_id
          );
          total += totalTarget;
        }
        setTargetTotal(total);
      } else if (currentStaff) {
        const { totalTarget } = await loadTargets(
          selectedMonth,
          selectedFinancialYear,
          currentStaff.staff_id
        );
        setTargetTotal(totalTarget);
      } else {
        setTargetTotal(0);
      }
    };

    load();
  }, [isTeam, staff, currentStaff, selectedMonth, selectedFinancialYear]);

  // EXPECTED (PRO-RATED)
  const expectedByNow =
    workingDays > 0
      ? (targetTotal / workingDays) *
        Math.min(workingDaysUpToToday, workingDays)
      : 0;

  const variance = actualTotal - expectedByNow;

  let statusText = "No target set";
  if (targetTotal > 0) {
    statusText =
      variance >= 0
        ? `Ahead by ${Math.round(variance)} items`
        : `Behind by ${Math.abs(Math.round(variance))} items`;
  }

  const handleMonthYearChange = (value: string) => {
    const [mStr, yStr] = value.split("-");
    const m = parseInt(mStr, 10);
    const y = parseInt(yStr, 10);
    if (!Number.isNaN(m) && !Number.isNaN(y)) {
      setSelectedMonth(m);
      setSelectedYear(y);
    }
  };

  return (
    <div
      className="rounded-lg px-6 py-4 relative"
      style={{ backgroundColor: "#001B47" }}
    >
      {/* Left: Month-Year selector (re-instated) */}
      <div className="absolute left-4 top-1/2 -translate-y-1/2">
        <select
          value={selectedValue}
          onChange={(e) => handleMonthYearChange(e.target.value)}
          className="px-3 py-2 rounded-md bg-white text-gray-900 text-sm shadow-sm border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {monthYearOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {/* Center: performance text */}
      <div className="text-white font-semibold text-center">
        {statusText}
        {" | "}Delivered: {Math.round(actualTotal)}
        {" | "}Expected: {Math.round(expectedByNow)}
      </div>
    </div>
  );
};
