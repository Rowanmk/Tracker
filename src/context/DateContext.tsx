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
  // Default to April 2025 (start of FY 25/26)
  const [selectedMonth, setSelectedMonth] = useState(4);
  const [selectedYear, setSelectedYear] = useState(2025);
  
  const [selectedFinancialYear, setSelectedFinancialYear] = useState<FinancialYear>({
    label: '2025/26',
    start: 2025,
    end: 2026,
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