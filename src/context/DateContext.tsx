import React, { createContext, useContext, ReactNode, useState, useMemo } from 'react';
import { FinancialYear, getFinancialYearFromMonth } from '../utils/financialYear';

interface DateContextType {
  selectedMonth: number;
  selectedYear: number;
  setSelectedMonth: (month: number) => void;
  setSelectedYear: (year: number) => void;
  financialYear: FinancialYear;
}

const DateContext = createContext<DateContextType>({} as DateContextType);

export const DateProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const today = new Date();

  const [selectedMonth, setSelectedMonth] = useState(today.getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(today.getFullYear());

  const financialYear = useMemo(
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
      }}
    >
      {children}
    </DateContext.Provider>
  );
};

export const useDate = () => useContext(DateContext);
