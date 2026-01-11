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

export const StaffPerformanceBar: React.FC<Props> = ({ staffPerformance }) => {
  const { selectedStaffId, currentStaff, staff } = useAuth();
  const { selectedMonth, selectedFinancialYear } = useDate();

  const isTeam = selectedStaffId === "team" || !selectedStaffId;

  const {
    teamWorkingDays,
    staffWorkingDays,
    workingDaysUpToToday,
  } = useWorkingDays({
    financialYear: selectedFinancialYear,
    month: selectedMonth,
    staffId: isTeam ? undefined : currentStaff?.staff_id,
  });

  const workingDays = isTeam ? teamWorkingDays : staffWorkingDays;

  const [targetTotal, setTargetTotal] = useState(0);

  const actualTotal = useMemo(() => {
    return isTeam
      ? staffPerformance.reduce((sum, s) => sum + s.total, 0)
      : staffPerformance[0]?.total ?? 0;
  }, [isTeam, staffPerformance]);

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

  return (
    <div
      className="text-white rounded-lg px-6 py-4 flex items-center justify-center"
      style={{ backgroundColor: "#001B47" }}
    >
      <div className="font-semibold text-center">
        {statusText}
        {" | "}Delivered: {Math.round(actualTotal)}
        {" | "}Expected: {Math.round(expectedByNow)}
      </div>
    </div>
  );
};
