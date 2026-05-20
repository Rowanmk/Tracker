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

export const BAGEL_SERVICE_ID = -999;
export const BAGEL_SERVICE_NAME = 'Bagel Days';

export function generateBagelDays<TActivity extends Activity>(
  activities: TActivity[],
  bankHolidays: BankHoliday[],
  staffList: Staff[],
  bagelServiceId: number,
  startDate: Date,
  endDate: Date
): TActivity[] {
  const bagelActivities: Activity[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const actualEndDate = endDate > today ? today : endDate;

  const activityMap = new Map<string, number>();
  for (const activity of activities) {
    if (!activity.staff_id || !activity.date) continue;
    const key = `${activity.date}_${activity.staff_id}`;
    activityMap.set(key, (activityMap.get(key) || 0) + (activity.delivered_count || 0));
  }

  const holidayMap = new Set<string>();
  for (const holiday of bankHolidays) {
    holidayMap.add(`${holiday.date}_${holiday.region}`);
  }

  const curr = new Date(startDate);
  curr.setHours(0, 0, 0, 0);

  while (curr <= actualEndDate) {
    const dayOfWeek = curr.getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

    if (!isWeekend) {
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

  return bagelActivities as TActivity[];
}