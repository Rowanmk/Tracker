import React, { createContext, useContext, ReactNode, useState, useMemo } from 'react';
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

export const DateProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const today = new Date();

  const [selectedMonth, setSelectedMonth] = useState(today.getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(today.getFullYear());
  const [selectedFinancialYear, setSelectedFinancialYear] = useState<FinancialYear>(() => {
    const fy = getFinancialYearFromMonth(today.getMonth() + 1, today.getFullYear());
    return fy;
  });

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