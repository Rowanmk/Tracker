export interface FinancialYear {
  label: string;
  start: number;
  end: number;
}

/**
 * Derive Financial Year from calendar month and year
 * UK rules: April → March
 * Apr–Dec → FY starts same year
 * Jan–Mar → FY starts previous year
 */
export const getFinancialYearFromMonth = (month: number, year: number): FinancialYear => {
  const startYear = month >= 4 ? year : year - 1;
  return {
    label: `${startYear}/${String(startYear + 1).slice(-2)}`,
    start: startYear,
    end: startYear + 1,
  };
};

/**
 * Returns the supported financial years: 2025/26 and 2026/27.
 */
export const getFinancialYears = (): FinancialYear[] => {
  return [
    {
      label: '2025/26',
      start: 2025,
      end: 2026,
    },
    {
      label: '2026/27',
      start: 2026,
      end: 2027,
    }
  ];
};

export const getCurrentFinancialYear = (): FinancialYear => {
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  const fy = getFinancialYearFromMonth(month, year);
  
  // Clamp to supported range if outside
  if (fy.start < 2025) return { label: '2025/26', start: 2025, end: 2026 };
  if (fy.start > 2026) return { label: '2026/27', start: 2026, end: 2027 };
  return fy;
};

export const getFinancialYearDateRange = (fy: FinancialYear) => {
  return {
    startDate: new Date(fy.start, 3, 1),
    endDate: new Date(fy.end, 2, 31),
  };
};

export const getFinancialYearMonths = () => {
  return [
    { name: 'Apr', number: 4 },
    { name: 'May', number: 5 },
    { name: 'Jun', number: 6 },
    { name: 'Jul', number: 7 },
    { name: 'Aug', number: 8 },
    { name: 'Sep', number: 9 },
    { name: 'Oct', number: 10 },
    { name: 'Nov', number: 11 },
    { name: 'Dec', number: 12 },
    { name: 'Jan', number: 1 },
    { name: 'Feb', number: 2 },
    { name: 'Mar', number: 3 },
  ];
};

export const isDateInFinancialYear = (date: Date, fy: FinancialYear): boolean => {
  const { startDate, endDate } = getFinancialYearDateRange(fy);
  return date >= startDate && date <= endDate;
};

export const getFinancialYearFromDate = (date: Date): FinancialYear => {
  return getFinancialYearFromMonth(date.getMonth() + 1, date.getFullYear());
};