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
  // Default to current calendar month and year
  const now = new Date();
  const initialMonth = now.getMonth() + 1;
  const initialYear = now.getFullYear();
  
  // Derive initial financial year from current date
  const initialFY = getFinancialYearFromMonth(initialMonth, initialYear);

  const [selectedMonth, setSelectedMonth] = useState(initialMonth);
  const [selectedYear, setSelectedYear] = useState(initialYear);
  
  const [selectedFinancialYear, setSelectedFinancialYear] = useState<FinancialYear>(initialFY);

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