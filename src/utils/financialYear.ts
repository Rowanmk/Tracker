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
  if (month >= 4) {
    // April onwards: FY starts this year
    return {
      label: `${year}/${(year + 1).toString().slice(-2)}`,
      start: year,
      end: year + 1,
    };
  } else {
    // January to March: FY starts previous year
    return {
      label: `${year - 1}/${year.toString().slice(-2)}`,
      start: year - 1,
      end: year,
    };
  }
};

export const getFinancialYears = (): FinancialYear[] => {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  
  const currentFYStart = currentMonth >= 4 ? currentYear : currentYear - 1;
  
  const years: FinancialYear[] = [];
  for (let i = -2; i <= 1; i++) {
    const startYear = currentFYStart + i;
    const endYear = startYear + 1;
    years.push({
      label: `${startYear}/${endYear.toString().slice(-2)}`,
      start: startYear,
      end: endYear,
    });
  }
  
  return years;
};

export const getCurrentFinancialYear = (): FinancialYear => {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  
  return getFinancialYearFromMonth(currentMonth, currentYear);
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
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  return getFinancialYearFromMonth(month, year);
};