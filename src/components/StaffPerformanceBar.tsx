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

  const isTeam = selectedStaffId === "team";

  const {
    workingDays,
    workingDaysUpToToday,
  } = useWorkingDays({
    financialYear: selectedFinancialYear,
    month: selectedMonth,
    staffId: isTeam ? undefined : currentStaff?.staff_id,
  });

  const [targetTotal, setTargetTotal] = useState(0);

  // ---------------------------------------------------------------------------
  // ACTUALS
  // ---------------------------------------------------------------------------
  const actualTotal = useMemo(() => {
    if (isTeam) {
      return staffPerformance.reduce((sum, s) => sum + s.total, 0);
    }
    return staffPerformance[0]?.total ?? 0;
  }, [isTeam, staffPerformance]);

  // ---------------------------------------------------------------------------
  // TARGETS
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const load = async () => {
      if (isTeam) {
        let teamTarget = 0;

        for (const s of staff) {
          const { totalTarget } = await loadTargets(
            selectedMonth,
            selectedFinancialYear,
            s.staff_id
          );
          teamTarget += totalTarget;
        }

        setTargetTotal(teamTarget);
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
  }, [
    isTeam,
    staff,
    currentStaff,
    selectedMonth,
    selectedFinancialYear,
  ]);

  // ---------------------------------------------------------------------------
  // EXPECTED (PRO-RATED)
  // ---------------------------------------------------------------------------
  const expectedByNow =
    workingDays > 0
      ? (targetTotal / workingDays) *
        Math.min(workingDaysUpToToday, workingDays)
      : 0;

  const variance = actualTotal - expectedByNow;

  // ---------------------------------------------------------------------------
  // LABEL
  // ---------------------------------------------------------------------------
  let statusText = "No target set";

  if (targetTotal > 0) {
    if (variance >= 0) {
      statusText = `Ahead by ${Math.round(variance)} items`;
    } else {
      statusText = `Behind by ${Math.abs(Math.round(variance))} items`;
    }
  }

  // ---------------------------------------------------------------------------
  // RENDER
  // ---------------------------------------------------------------------------
  return (
    <div className="bg-brand-blue text-white rounded-lg px-6 py-4 flex items-center justify-between">
      <div className="font-semibold">
        {statusText}
        {" | "}Delivered: {Math.round(actualTotal)}
        {" | "}Expected: {Math.round(expectedByNow)}
      </div>
    </div>
  );
};
