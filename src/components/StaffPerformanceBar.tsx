import React, { useMemo, useState, useRef, useEffect } from "react";
import { useDate } from "../context/DateContext";
import { useWorkingDays } from "../hooks/useWorkingDays";
import { getFinancialYears, getFinancialYearFromMonth } from "../utils/financialYear";

interface StaffPerformance {
  staff_id: number;
  name: string;
  total: number;
  target: number;
}

interface Props {
  staffPerformance: StaffPerformance[];
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export const StaffPerformanceBar: React.FC<Props> = ({ staffPerformance }) => {
  const {
    selectedMonth,
    selectedYear,
    setSelectedMonth,
    setSelectedYear,
    selectedFinancialYear,
    setSelectedFinancialYear,
  } = useDate();

  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const monthYearOptions = useMemo(() => {
    const allFYs = getFinancialYears();
    const order = [4, 5, 6, 7, 8, 9, 10, 11, 12, 1, 2, 3];

    return allFYs.flatMap((fy) => {
      const fyStart = fy.start;
      const fyEnd = fy.end;
      return order.map((m) => ({
        value: `${m}-${m >= 4 ? fyStart : fyEnd}`,
        label: `${MONTHS[m - 1]} ${m >= 4 ? fyStart : fyEnd}`,
        month: m,
        year: m >= 4 ? fyStart : fyEnd
      }));
    });
  }, []);

  const selectedValue = `${selectedMonth}-${selectedYear}`;
  const selectedLabel = useMemo(() => {
    const found = monthYearOptions.find(opt => opt.value === selectedValue);
    return found ? found.label : `${MONTHS[selectedMonth - 1]} ${selectedYear}`;
  }, [selectedValue, monthYearOptions, selectedMonth, selectedYear]);

  const today = new Date();
  const todayValue = `${today.getMonth() + 1}-${today.getFullYear()}`;

  const { teamWorkingDays, workingDaysUpToToday } =
    useWorkingDays({
      financialYear: selectedFinancialYear,
      month: selectedMonth,
    });

  const workingDays = teamWorkingDays;

  const { actualTotal, targetTotal } = useMemo(() => {
    return staffPerformance.reduce(
      (acc, s) => ({
        actualTotal: acc.actualTotal + (s.total || 0),
        targetTotal: acc.targetTotal + (s.target || 0),
      }),
      { actualTotal: 0, targetTotal: 0 }
    );
  }, [staffPerformance]);

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
    const m = Number(mStr);
    const y = Number(yStr);
    if (!Number.isNaN(m) && !Number.isNaN(y)) {
      setSelectedMonth(m);
      setSelectedYear(y);
      setSelectedFinancialYear(getFinancialYearFromMonth(m, y));
      setIsDropdownOpen(false);
    }
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (isDropdownOpen && listRef.current) {
      const todayIndex = monthYearOptions.findIndex(opt => opt.value === todayValue);
      if (todayIndex !== -1) {
        const container = listRef.current;
        const items = container.querySelectorAll('.dropdown-item');
        const todayItem = items[todayIndex] as HTMLElement;

        if (todayItem) {
          const scrollPos = todayItem.offsetTop - (container.offsetHeight / 2) + (todayItem.offsetHeight / 2);
          container.scrollTop = scrollPos;
        }
      }
    }
  }, [isDropdownOpen, monthYearOptions, todayValue]);

  return (
    <div
      className="rounded-lg px-6 py-5 relative min-h-[72px] flex items-center justify-center z-20"
      style={{ backgroundColor: "#001B47" }}
    >
      <div className="absolute left-4 top-1/2 -translate-y-1/2" ref={dropdownRef}>
        <button
          onClick={() => setIsDropdownOpen(!isDropdownOpen)}
          className="flex items-center justify-between gap-2 px-3 py-2 rounded-md bg-white text-gray-900 text-sm border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-[160px]"
        >
          <span>{selectedLabel}</span>
          <svg
            className={`w-4 h-4 transition-transform ${isDropdownOpen ? "rotate-180" : ""}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {isDropdownOpen && (
          <div
            ref={listRef}
            className="absolute left-0 mt-1 w-56 max-h-64 overflow-y-auto bg-white rounded-md shadow-xl border border-gray-200 z-[60] scroll-smooth"
          >
            {monthYearOptions.map((opt) => {
              const isToday = opt.value === todayValue;
              const isSelected = opt.value === selectedValue;

              return (
                <button
                  key={opt.value}
                  onClick={() => handleMonthYearChange(opt.value)}
                  className={`dropdown-item w-full text-left px-4 py-2.5 text-sm transition-colors flex items-center justify-between ${
                    isSelected
                      ? "bg-blue-50 text-blue-700 font-bold"
                      : isToday
                        ? "bg-orange-50 text-orange-700 font-semibold"
                        : "text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  <span>{opt.label}</span>
                  {isToday && (
                    <span className="text-[10px] uppercase tracking-wider bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded font-bold">
                      Current
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="text-white text-xl font-semibold text-center leading-tight">
        {statusText}
        {" | "}Delivered: {Math.round(actualTotal)}
        {" | "}Expected: {Math.round(expectedByNow)}
      </div>
    </div>
  );
};