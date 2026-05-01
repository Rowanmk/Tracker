export interface FinancialYear {
  label: string;
  start: number;
  end: number;
}

/**
 * Derive Financial Year from calendar month and year.
 * UK rules: April → March.
 * Apr–Dec → FY starts same year.
 * Jan–Mar → FY starts previous year.
 */
export const getFinancialYearFromMonth = (month: number, year: number): FinancialYear => {
  const startYear = month >= 4 ? year : year - 1;
  return {
    label: `${startYear}/${String(startYear + 1).slice(-2)}`,
    start: startYear,
    end: startYear + 1,
  };
};

export const getCurrentFinancialYear = (): FinancialYear => {
  const now = new Date();
  return getFinancialYearFromMonth(now.getMonth() + 1, now.getFullYear());
};

/**
 * Returns supported financial years, including the current financial year and the next year.
 * This prevents the app from falling out of range when the calendar rolls into a new FY.
 */
export const getFinancialYears = (): FinancialYear[] => {
  const currentFinancialYear = getCurrentFinancialYear();
  const minimumStartYear = 2024;
  const maximumStartYear = Math.max(2026, currentFinancialYear.start + 1);

  return Array.from(
    { length: maximumStartYear - minimumStartYear + 1 },
    (_, index) => {
      const start = minimumStartYear + index;
      return {
        label: `${start}/${String(start + 1).slice(-2)}`,
        start,
        end: start + 1,
      };
    }
  );
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