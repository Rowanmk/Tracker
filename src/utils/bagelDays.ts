// src/utils/bagelDays.ts

type Activity = {
  staff_id?: number | null;
  service_id?: number | null;
  delivered_count?: number;
  date?: string;
  day?: number;
  month?: number;
  year?: number;
};

type BankHoliday = {
  date: string;
  region: string;
};

type Staff = {
  staff_id: number;
  home_region?: string | null;
};

export function generateBagelDays(
  activities: Activity[],
  bankHolidays: BankHoliday[],
  staffList: Staff[],
  bagelServiceId: number,
  startDate: Date,
  endDate: Date
): Activity[] {
  const bagelActivities: Activity[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Bagel days can only be calculated up to today
  const actualEndDate = endDate > today ? today : endDate;

  // Map activities by date and staff_id for quick lookup
  const activityMap = new Map<string, number>(); // key: "YYYY-MM-DD_staffId", value: total_delivered
  for (const a of activities) {
    if (!a.staff_id || !a.date) continue;
    const key = `${a.date}_${a.staff_id}`;
    activityMap.set(key, (activityMap.get(key) || 0) + (a.delivered_count || 0));
  }

  // Map bank holidays by region and date
  const holidayMap = new Set<string>(); // key: "YYYY-MM-DD_region"
  for (const h of bankHolidays) {
    holidayMap.add(`${h.date}_${h.region}`);
  }

  const curr = new Date(startDate);
  curr.setHours(0, 0, 0, 0);

  while (curr <= actualEndDate) {
    const dayOfWeek = curr.getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

    if (!isWeekend) {
      // Format date as YYYY-MM-DD locally to avoid timezone issues
      const year = curr.getFullYear();
      const month = String(curr.getMonth() + 1).padStart(2, '0');
      const day = String(curr.getDate()).padStart(2, '0');
      const dateStr = `${year}-${month}-${day}`;

      for (const staff of staffList) {
        const region = staff.home_region || 'england-and-wales';
        const isHoliday = holidayMap.has(`${dateStr}_${region}`);

        if (!isHoliday) {
          const key = `${dateStr}_${staff.staff_id}`;
          const totalDelivered = activityMap.get(key) || 0;

          // If no submissions for any service on this working day, it's a Bagel Day
          if (totalDelivered === 0) {
            bagelActivities.push({
              staff_id: staff.staff_id,
              service_id: bagelServiceId,
              delivered_count: 1,
              date: dateStr,
              day: curr.getDate(),
              month: curr.getMonth() + 1,
              year: curr.getFullYear(),
            });
          }
        }
      }
    }
    curr.setDate(curr.getDate() + 1);
  }

  return bagelActivities;
}