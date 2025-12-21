export interface FinancialYear {
      label: string;
      start: number;
      end: number;
    }

    export const getFinancialYears = (): FinancialYear[] => {
      const currentYear = new Date().getFullYear();
      const years: FinancialYear[] = [];
      
      for (let i = -2; i <= 2; i++) {
        const startYear = currentYear + i;
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
      
      if (currentMonth >= 4) {
        return {
          label: `${currentYear}/${(currentYear + 1).toString().slice(-2)}`,
          start: currentYear,
          end: currentYear + 1,
        };
      } else {
        return {
          label: `${currentYear - 1}/${currentYear.toString().slice(-2)}`,
          start: currentYear - 1,
          end: currentYear,
        };
      }
    };

    export const getFinancialYearDateRange = (fy: FinancialYear) => {
      return {
        startDate: new Date(fy.start, 3, 1), // April 1st
        endDate: new Date(fy.end, 2, 31),   // March 31st
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
      
      if (month >= 4) {
        return {
          label: `${year}/${(year + 1).toString().slice(-2)}`,
          start: year,
          end: year + 1,
        };
      } else {
        return {
          label: `${year - 1}/${year.toString().slice(-2)}`,
          start: year - 1,
          end: year,
        };
      }
    };