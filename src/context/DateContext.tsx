import React, { createContext, useContext, ReactNode, useState, useEffect } from 'react';
import { FinancialYear, getFinancialYearFromMonth } from '../utils/financialYear';

interface DateContextType {
  selectedMonth: number;
  selectedYear: number;
  setSelectedMonth: (month: number) => void;
  setSelectedYear: (year: number) => void;
  derivedFinancialYear: FinancialYear;
}

interface DateProviderProps {
  children: ReactNode;
}

const DateContext = createContext<DateContextType>({} as DateContextType);

export const DateProvider: React.FC<DateProviderProps> = ({ children }) => {
  const today = new Date();
  const [selectedMonth, setSelectedMonth] = useState<number>(today.getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState<number>(today.getFullYear());
  const [derivedFinancialYear, setDerivedFinancialYear] = useState<FinancialYear>(
    getFinancialYearFromMonth(today.getMonth() + 1, today.getFullYear())
  );

  // Recalculate derived FY whenever month or year changes
  useEffect(() => {
    const newFY = getFinancialYearFromMonth(selectedMonth, selectedYear);
    setDerivedFinancialYear(newFY);
  }, [selectedMonth, selectedYear]);

  const value: DateContextType = {
    selectedMonth,
    selectedYear,
    setSelectedMonth,
    setSelectedYear,
    derivedFinancialYear,
  };

  return (
    <DateContext.Provider value={value}>
      {children}
    </DateContext.Provider>
  );
};

export const useDate = (): DateContextType => useContext(DateContext);