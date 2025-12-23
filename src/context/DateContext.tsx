import React, { createContext, useContext, ReactNode, useState } from 'react';
import { FinancialYear, getCurrentFinancialYear } from '../utils/financialYear';

interface DateContextType {
  selectedMonth: number;
  setSelectedMonth: (month: number) => void;
  selectedFinancialYear: FinancialYear;
  setSelectedFinancialYear: (fy: FinancialYear) => void;
}

interface DateProviderProps {
  children: ReactNode;
}

const DateContext = createContext<DateContextType>({} as DateContextType);

export const DateProvider: React.FC<DateProviderProps> = ({ children }) => {
  const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth() + 1);
  const [selectedFinancialYear, setSelectedFinancialYear] = useState<FinancialYear>(getCurrentFinancialYear());

  const value: DateContextType = {
    selectedMonth,
    setSelectedMonth,
    selectedFinancialYear,
    setSelectedFinancialYear,
  };

  return (
    <DateContext.Provider value={value}>
      {children}
    </DateContext.Provider>
  );
};

export const useDate = (): DateContextType => useContext(DateContext);