import React, { createContext, useContext, ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FinancialYear, getFinancialYearFromMonth } from '../utils/financialYear';

interface DateContextType {
  selectedMonth: number;
  selectedYear: number;
  setSelectedMonth: (month: number) => void;
  setSelectedYear: (year: number) => void;
  financialYear: FinancialYear;
  selectedFinancialYear: FinancialYear;
  setSelectedFinancialYear: (fy: FinancialYear) => void;
  derivedFinancialYear: FinancialYear;
}

const DateContext = createContext<DateContextType>({} as DateContextType);

const getCurrentCalendarSelection = () => {
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();

  return {
    month,
    year,
    financialYear: getFinancialYearFromMonth(month, year),
  };
};

export const DateProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const initialSelection = useMemo(() => getCurrentCalendarSelection(), []);

  const [selectedMonth, setSelectedMonthState] = useState(initialSelection.month);
  const [selectedYear, setSelectedYearState] = useState(initialSelection.year);
  const [selectedFinancialYear, setSelectedFinancialYearState] = useState<FinancialYear>(
    initialSelection.financialYear
  );

  const observedCurrentDateRef = useRef({
    month: initialSelection.month,
    year: initialSelection.year,
  });

  const setSelectedMonth = useCallback((month: number) => {
    setSelectedMonthState(month);
    setSelectedFinancialYearState((currentFinancialYear) => {
      const nextYear = month >= 4 ? currentFinancialYear.start : currentFinancialYear.end;
      return getFinancialYearFromMonth(month, nextYear);
    });
  }, []);

  const setSelectedYear = useCallback((year: number) => {
    setSelectedYearState(year);
    setSelectedFinancialYearState((currentFinancialYear) => {
      const monthForYear = selectedMonth || (currentFinancialYear.start === year ? 4 : 1);
      return getFinancialYearFromMonth(monthForYear, year);
    });
  }, [selectedMonth]);

  const setSelectedFinancialYear = useCallback((fy: FinancialYear) => {
    setSelectedFinancialYearState(fy);
  }, []);

  useEffect(() => {
    const checkForMonthRollover = () => {
      const currentSelection = getCurrentCalendarSelection();
      const previousObserved = observedCurrentDateRef.current;

      const userWasOnObservedCurrentMonth =
        selectedMonth === previousObserved.month && selectedYear === previousObserved.year;

      observedCurrentDateRef.current = {
        month: currentSelection.month,
        year: currentSelection.year,
      };

      if (
        userWasOnObservedCurrentMonth &&
        (currentSelection.month !== previousObserved.month || currentSelection.year !== previousObserved.year)
      ) {
        setSelectedMonthState(currentSelection.month);
        setSelectedYearState(currentSelection.year);
        setSelectedFinancialYearState(currentSelection.financialYear);
      }
    };

    const intervalId = window.setInterval(checkForMonthRollover, 60_000);
    return () => window.clearInterval(intervalId);
  }, [selectedMonth, selectedYear]);

  const financialYear = useMemo(
    () => getFinancialYearFromMonth(selectedMonth, selectedYear),
    [selectedMonth, selectedYear]
  );

  const derivedFinancialYear = useMemo(
    () => getFinancialYearFromMonth(selectedMonth, selectedYear),
    [selectedMonth, selectedYear]
  );

  return (
    <DateContext.Provider
      value={{
        selectedMonth,
        selectedYear,
        setSelectedMonth,
        setSelectedYear,
        financialYear,
        selectedFinancialYear,
        setSelectedFinancialYear,
        derivedFinancialYear,
      }}
    >
      {children}
    </DateContext.Provider>
  );
};

export const useDate = () => useContext(DateContext);