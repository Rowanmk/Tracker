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
  // Even if called with other dates, we now strictly return 25/26 as per requirement
  return {
    label: '2025/26',
    start: 2025,
    end: 2026,
  };
};

/**
 * Returns only the 2025/26 financial year as per requirement.
 */
export const getFinancialYears = (): FinancialYear[] => {
  return [
    {
      label: '2025/26',
      start: 2025,
      end: 2026,
    }
  ];
};

export const getCurrentFinancialYear = (): FinancialYear => {
  return {
    label: '2025/26',
    start: 2025,
    end: 2026,
  };
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
  return {
    label: '2025/26',
    start: 2025,
    end: 2026,
  };
};