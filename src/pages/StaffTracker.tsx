import React, { useState, useEffect, useRef, useLayoutEffect } from 'react';
import { useDate } from '../context/DateContext';
import { useAuth } from '../context/AuthContext';
import { useServices } from '../hooks/useServices';
import { useWorkingDays } from '../hooks/useWorkingDays';
import { useStaffLeaveAndHolidays } from '../hooks/useStaffLeaveAndHolidays';
import { supabase } from '../supabase/client';
import { loadTargets } from '../utils/loadTargets';

interface DailyEntry {
  date: string;
  day: number;
  isWeekend: boolean;
  isOnLeave: boolean;
  isBankHoliday: boolean;
  bankHolidayTitle?: string;
  services: {
    [key: string]: number;
  };
}

export const StaffTracker: React.FC = () => {
  const { selectedMonth, selectedFinancialYear, setSelectedMonth, setSelectedFinancialYear } = useDate();
  const [dailyEntries, setDailyEntries] = useState<DailyEntry[]>([]);
  const [targets, setTargets] = useState<{ [key: string]: number }>({});
  const [loading, setLoading] = useState(true);
  const [activeCol, setActiveCol] = useState<number | null>(null);

  const { currentStaff } = useAuth();
  const { services } = useServices();
  
  const year = selectedMonth >= 4 ? selectedFinancialYear.start : selectedFinancialYear.end;
  const { workingDays, workingDaysUpToToday } = useWorkingDays(selectedMonth, year);

  const { 
    isDateOnLeave, 
    isDateBankHoliday, 
    loading: leaveHolidayLoading 
  } = useStaffLeaveAndHolidays({
    staffId: currentStaff?.staff_id || 0,
    month: selectedMonth,
    year,
    homeRegion: currentStaff?.home_region || 'england-and-wales'
  });

  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollInterval = useRef<NodeJS.Timeout | null>(null);
  const scrollSpeed = useRef(5);
  const savedScrollLeft = useRef(0);

  const preserveScroll = () => {
    if (!scrollRef.current) return;
    savedScrollLeft.current = scrollRef.current.scrollLeft;
  };

  const restoreScroll = () => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollLeft = savedScrollLeft.current;
  };

  useLayoutEffect(() => {
    restoreScroll();
  });

  const scrollCellIntoView = (row: number, col: number) => {
    const cell = document.getElementById(`cell-${row}-${col}`);
    if (!cell || !scrollRef.current) return;

    const container = scrollRef.current;

    const cellLeft = cell.offsetLeft;
    const cellRight = cell.offsetLeft + cell.offsetWidth;

    const containerLeft = container.scrollLeft;
    const containerRight = container.scrollLeft + container.clientWidth;

    if (cellRight > containerRight) {
      container.scrollTo({
        left: cellRight - container.clientWidth + 20,
        behavior: "smooth",
      });
    }

    if (cellLeft < containerLeft) {
      container.scrollTo({
        left: cellLeft - 20,
        behavior: "smooth",
      });
    }
  };

  const handleSmoothScroll = (key: string) => {
    if (scrollInterval.current) return;

    scrollSpeed.current = 5;

    scrollInterval.current = setInterval(() => {
      if (!scrollRef.current) return;

      scrollRef.current.scrollLeft += key === "ArrowRight"
        ? scrollSpeed.current
        : -scrollSpeed.current;

      scrollSpeed.current = Math.min(scrollSpeed.current + 1, 60);
    }, 16);
  };

  const stopSmoothScroll = () => {
    if (scrollInterval.current) {
      clearInterval(scrollInterval.current);
      scrollInterval.current = null;
    }
  };

  const fetchData = async () => {
    if (!currentStaff || services.length === 0) return;

    setLoading(true);

    const daysInMonth = new Date(year, selectedMonth, 0).getDate();

    const entries: DailyEntry[] = Array.from({ length: daysInMonth }, (_, index) => {
      const day = index + 1;
      const date = new Date(year, selectedMonth - 1, day);
      const dayOfWeek = date.getDay();
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
      const dateStr = `${year}-${selectedMonth.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
      
      const isOnLeave = isDateOnLeave(dateStr);
      const bankHoliday = isDateBankHoliday(dateStr);
      const isBankHoliday = !!bankHoliday;
      
      return {
        date: dateStr,
        day,
        isWeekend,
        isOnLeave,
        isBankHoliday,
        bankHolidayTitle: bankHoliday?.title,
        services: {},
      };
    });

    entries.forEach(entry => {
      services.forEach(service => {
        entry.services[service.service_name] = 0;
      });
    });

    const { data: activities } = await supabase
      .from('dailyactivity')
      .select('day, service_id, delivered_count')
      .eq('staff_id', currentStaff.staff_id)
      .eq('month', selectedMonth)
      .eq('year', year);

    const deliveredMap: Record<number, Record<number, number>> = {};
    activities?.forEach(activity => {
      if (activity.service_id) {
        if (!deliveredMap[activity.service_id]) {
          deliveredMap[activity.service_id] = {};
        }
        deliveredMap[activity.service_id][activity.day] = activity.delivered_count;
      }
    });

    services.forEach(service => {
      const serviceActivities = deliveredMap[service.service_id] || {};
      entries.forEach(entry => {
        entry.services[service.service_name] = serviceActivities[entry.day] || 0;
      });
    });

    const { perService } = await loadTargets(selectedMonth, selectedFinancialYear, currentStaff.staff_id);

    const targetsMapByName: { [key: string]: number } = {};
    services.forEach(service => {
      targetsMapByName[service.service_name] = perService[service.service_id] || 0;
    });

    setDailyEntries(prev => {
      if (prev.length === entries.length) {
        return prev.map((entry, index) => {
          const loaded = entries[index];
          return {
            ...entry,
            isWeekend: loaded.isWeekend,
            isOnLeave: loaded.isOnLeave,
            isBankHoliday: loaded.isBankHoliday,
            bankHolidayTitle: loaded.bankHolidayTitle,
            services: {
              ...entry.services,
              ...loaded.services
            }
          };
        });
      }
      return entries;
    });

    setTargets(targetsMapByName);
    setLoading(false);
  };

  useEffect(() => {
    if (!leaveHolidayLoading) {
      fetchData();
    }
  }, [currentStaff?.staff_id, services.length, selectedMonth, selectedFinancialYear, leaveHolidayLoading]);

  useEffect(() => {
    const handler = () => fetchData();
    window.addEventListener('activity-updated', handler);
    return () => window.removeEventListener('activity-updated', handler);
  }, [currentStaff?.staff_id, services.length, selectedMonth, selectedFinancialYear]);

  const handleKeyNavigation = (e: React.KeyboardEvent, row: number, col: number) => {
    const key = e.key;

    if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Enter", "Tab"].includes(key)) {
      if (key !== "Tab") {
        e.preventDefault();
      }
      preserveScroll();
    }

    let nextRow = row;
    let nextCol = col;

    switch (key) {
      case "ArrowRight":
        if (e.repeat) {
          handleSmoothScroll(key);
          return;
        }
        nextCol = col + 1;
        break;
      case "ArrowLeft":
        if (e.repeat) {
          handleSmoothScroll(key);
          return;
        }
        nextCol = col - 1;
        break;
      case "Enter":
        nextCol = col + 1;
        break;
      case "ArrowDown":
        nextRow = row + 1;
        break;
      case "ArrowUp":
        nextRow = row - 1;
        break;
      case "Tab":
        if (e.shiftKey) {
          nextCol = col - 1;
          if (nextCol < 1) {
            nextRow = row - 1;
            nextCol = 31;
          }
        } else {
          nextCol = col + 1;
          if (nextCol > 31) {
            nextRow = row + 1;
            nextCol = 1;
          }
        }
        e.preventDefault();
        break;
    }

    if (nextRow < 0 || nextRow >= services.length) return;
    if (nextCol < 1 || nextCol > 31) return;

    const nextCell = document.getElementById(`cell-${nextRow}-${nextCol}`);
    if (nextCell) {
      nextCell.focus({ preventScroll: true });
      scrollCellIntoView(nextRow, nextCol);
    }

    setTimeout(restoreScroll, 0);
  };

  const handleKeyUp = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      stopSmoothScroll();
    }
  };

  const handleEntryChange = async (day: number, serviceName: string, value: string) => {
    if (!currentStaff) return;

    const service = services.find(s => s.service_name === serviceName);
    if (!service) return;

    let numericValue = 0;
    if (value.trim() !== '') {
      const parsed = parseInt(value, 10);
      if (!isNaN(parsed) && parsed >= 0) {
        numericValue = parsed;
      } else {
        return;
      }
    }

    const date = `${year}-${selectedMonth.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;

    preserveScroll();

    setDailyEntries(prev => prev.map(entry => 
      entry.day === day 
        ? { ...entry, services: { ...entry.services, [serviceName]: numericValue } }
        : entry
    ));

    try {
      const { error } = await supabase
        .from('dailyactivity')
        .upsert({
          staff_id: currentStaff.staff_id,
          date,
          day,
          month: selectedMonth,
          year,
          service_id: service.service_id,
          delivered_count: numericValue,
        }, {
          onConflict: 'staff_id,date,service_id'
        });

      if (error) {
        console.error('Error updating activity:', error);
        const previousEntry = dailyEntries.find(e => e.day === day);
        const previousValue = previousEntry?.services[serviceName] || 0;
        
        setDailyEntries(prev => prev.map(entry => 
          entry.day === day 
            ? { ...entry, services: { ...entry.services, [serviceName]: previousValue } }
            : entry
        ));
      } else {
        window.dispatchEvent(new Event('activity-updated'));
      }
    } catch (err) {
      console.error('Error in handleEntryChange:', err);
      const previousEntry = dailyEntries.find(e => e.day === day);
      const previousValue = previousEntry?.services[serviceName] || 0;
      
      setDailyEntries(prev => prev.map(entry => 
        entry.day === day 
          ? { ...entry, services: { ...entry.services, [serviceName]: previousValue } }
          : entry
      ));
    }

    setTimeout(restoreScroll, 0);
  };

  const getServiceTotals = () => {
    const totals: { [key: string]: number } = {};
    services.forEach(service => {
      totals[service.service_name] = dailyEntries.reduce(
        (sum, entry) => sum + entry.services[service.service_name], 0
      );
    });
    return totals;
  };

  const getDayName = (day: number) => {
    const date = new Date(year, selectedMonth - 1, day);
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return dayNames[date.getDay()];
  };

  const getStatusColor = (delivered: number, target: number) => {
    if (delivered >= target) return 'text-green-600';
    if (delivered >= target * 0.5) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getCellBackgroundClass = (entry: DailyEntry) => {
    if (entry.isBankHoliday) return 'bg-red-100 dark:bg-red-900/20';
    if (entry.isOnLeave) return 'bg-gray-100 dark:bg-gray-700/50';
    if (entry.isWeekend) return 'bg-red-50 dark:bg-red-900/10';
    return 'bg-white dark:bg-gray-800';
  };

  const getHeaderBackgroundClass = (entry: DailyEntry) => {
    if (entry.isBankHoliday) return 'bg-red-200 dark:bg-red-800/50';
    if (entry.isOnLeave) return 'bg-gray-200 dark:bg-gray-600';
    if (entry.isWeekend) return 'bg-red-100 dark:bg-red-800/30';
    return 'bg-gray-50 dark:bg-gray-700';
  };

  const getTooltipText = (entry: DailyEntry) => {
    if (entry.isBankHoliday) return `Public Holiday – ${entry.bankHolidayTitle}`;
    if (entry.isOnLeave) return `Annual Leave – ${entry.day} ${new Date(year, selectedMonth - 1).toLocaleDateString('en-GB', { month: 'long' })} ${year}`;
    return '';
  };

  const serviceTotals = getServiceTotals();
  const overallTotal = Object.values(serviceTotals).reduce((sum, total) => sum + total, 0);
  const overallTarget = Object.values(targets).reduce((sum, target) => sum + target, 0);

  const daysWorked = Math.min(workingDaysUpToToday, workingDays);
  const dailyTarget = workingDays > 0 ? overallTarget / workingDays : 0;
  const workingDaysCompleted = Math.min(workingDaysUpToToday, workingDays);
  const expectedByNow = Math.round(dailyTarget * workingDaysCompleted);

  const getMonthName = (monthNum: number) => {
    const months = ['January', 'February', 'March', 'April', 'May', 'June',
                   'July', 'August', 'September', 'October', 'November', 'December'];
    return months[monthNum - 1];
  };

  const getMonthsForFinancialYear = () => {
    const months = [];
    for (let m = 4; m <= 12; m++) {
      months.push({ value: m, label: `${getMonthName(m)} ${selectedFinancialYear.start}` });
    }
    for (let m = 1; m <= 3; m++) {
      months.push({ value: m, label: `${getMonthName(m)} ${selectedFinancialYear.end}` });
    }
    return months;
  };

  const handleMonthChange = (newMonth: number) => {
    setSelectedMonth(newMonth);
    setTimeout(() => {
      window.dispatchEvent(new Event('activity-updated'));
    }, 0);
  };

  return (
    <div>
      <h2 className="text-2xl lg:text-3xl font-bold text-gray-900 dark:text-white mb-4.8">
        My Tracker - {currentStaff?.name || 'User'}
      </h2>

      {/* Status bar positioned below the page title */}
      <div className="w-full py-4 bg-[#001B47] rounded-xl flex justify-between items-center px-6 mb-3.2">
        {/* Left: Month selector dropdown */}
        <div className="flex items-center">
          <select
            value={selectedMonth}
            onChange={(e) => handleMonthChange(parseInt(e.target.value))}
            disabled={loading}
            className="bg-white text-gray-900 px-3 py-2 rounded-md shadow-sm text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {getMonthsForFinancialYear().map(({ value, label }) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>

        {/* Centre: Status text */}
        <div className="flex-1 text-center">
          <span className="text-white text-lg font-semibold tracking-wide">
            Expected by now: {expectedByNow} | Delivered: {overallTotal} | Target: {overallTarget}
          </span>
        </div>

        {/* Right: Empty space for layout consistency */}
        <div className="flex items-center space-x-3">
          {/* Removed Team/Individual and % View/Numbers View selectors */}
        </div>
      </div>

      <div className="mt-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          <div className="bg-white p-6 rounded-xl shadow">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Monthly Progress</h3>
            <div className="space-y-3">
              {services.map(service => {
                const total = serviceTotals[service.service_name];
                const target = targets[service.service_name] || 0;
                const percentage = target > 0 ? (total / target) * 100 : 0;
                const statusColor = getStatusColor(total, target);
                
                return (
                  <div key={service.service_id}>
                    <div className="flex justify-between text-sm">
                      <span className="font-medium">{service.service_name}</span>
                      <span className={statusColor}>{total} / {target}</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className={`h-2 rounded-full ${
                          total >= target ? 'bg-green-500' :
                          total >= target * 0.5 ? 'bg-yellow-500' : 'bg-red-500'
                        }`}
                        style={{ width: `${Math.min(percentage, 100)}%` }}
                      />
                    </div>
                    <div className={`text-xs mt-1 ${statusColor}`}>
                      {Math.round(percentage)}% achieved
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="bg-white p-6 rounded-xl shadow">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Run Rate Status</h3>
            <div className="space-y-4">
              <div className="text-center">
                <div className="text-3xl font-bold text-blue-600">{overallTotal}</div>
                <div className="text-sm text-gray-500">Total Delivered</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-gray-600">
                  {expectedByNow}
                </div>
                <div className="text-sm text-gray-500">Expected by Now</div>
              </div>
              <div className="text-center">
                <div className={`text-2xl font-bold ${getStatusColor(overallTotal, expectedByNow)}`}>
                  {overallTotal >= expectedByNow
                    ? '✓ On Track' : '⚠ Behind'}
                </div>
                <div className="text-sm text-gray-500">Status</div>
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-xl shadow">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Working Days</h3>
            <div className="space-y-4">
              <div className="text-center">
                <div className="text-3xl font-bold text-purple-600">{daysWorked}</div>
                <div className="text-sm text-gray-500">Days Worked</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-gray-600">{workingDays}</div>
                <div className="text-sm text-gray-500">Total Working Days</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-600">
                  {workingDays - daysWorked}
                </div>
                <div className="text-sm text-gray-500">Days Remaining</div>
              </div>
            </div>
          </div>
        </div>

        {loading || leaveHolidayLoading ? (
          <div className="text-center py-4">Loading...</div>
        ) : (
          <div className="bg-white shadow rounded-xl overflow-hidden">
            <div className="px-4 py-5 sm:p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">
                Daily Entry Grid
              </h3>
              <div className="relative">
                <div ref={scrollRef} className="overflow-x-auto">
                  <table className="w-full table-auto border-collapse">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="sticky left-0 bg-gray-50 px-4 py-3 text-left text-sm font-medium text-gray-500 uppercase tracking-wider border p-2 text-center z-20">
                          Service
                        </th>
                        {dailyEntries.map(entry => {
                          const tooltipText = getTooltipText(entry);
                          return (
                            <th 
                              key={entry.day} 
                              className={`border p-2 text-center text-sm font-medium text-gray-500 uppercase tracking-wider min-w-[60px] ${
                                getHeaderBackgroundClass(entry)
                              } ${activeCol === entry.day ? 'bg-blue-50' : ''}`}
                              title={tooltipText}
                            >
                              <div>{entry.day}</div>
                              <div className="text-xs font-normal">{getDayName(entry.day)}</div>
                              {entry.isBankHoliday && <div className="text-xs text-red-600">🔴</div>}
                              {entry.isOnLeave && <div className="text-xs text-gray-600">🟢</div>}
                            </th>
                          );
                        })}
                        <th className="border p-2 text-center text-sm font-medium text-gray-500 uppercase tracking-wider bg-gray-50">
                          Total
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white space-y-1">
                      {services.map((service, serviceIndex) => (
                        <tr key={service.service_id} className={serviceIndex % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                          <td className="sticky left-0 bg-inherit border p-2 text-center text-sm font-medium text-gray-900 z-10">
                            {service.service_name}
                          </td>
                          {dailyEntries.map(entry => {
                            const tooltipText = getTooltipText(entry);
                            return (
                              <td 
                                key={entry.day} 
                                className={`border p-2 text-center ${
                                  getCellBackgroundClass(entry)
                                } ${activeCol === entry.day ? 'bg-blue-50' : ''}`}
                                title={tooltipText}
                              >
                                <input
                                  id={`cell-${serviceIndex}-${entry.day}`}
                                  type="number"
                                  inputMode="numeric"
                                  pattern="[0-9]*"
                                  min="0"
                                  step="1"
                                  value={entry.services[service.service_name] ?? 0}
                                  onFocus={(e) => {
                                    preserveScroll();
                                    e.currentTarget.select();
                                    setActiveCol(entry.day);
                                    setTimeout(restoreScroll, 0);
                                  }}
                                  onChange={(e) => {
                                    preserveScroll();
                                    const cleaned = e.target.value.replace(/^0+(?=\d)/, "");
                                    handleEntryChange(entry.day, service.service_name, cleaned);
                                  }}
                                  onBlur={(e) => {
                                    stopSmoothScroll();
                                    if (e.target.value === "") {
                                      handleEntryChange(entry.day, service.service_name, "0");
                                    }
                                    setActiveCol(null);
                                  }}
                                  onKeyDown={(e) => {
                                    handleKeyNavigation(e, serviceIndex, entry.day);
                                  }}
                                  onKeyUp={handleKeyUp}
                                  className={`w-full p-1 text-center border rounded ${
                                    getCellBackgroundClass(entry)
                                  } ${activeCol === entry.day ? 'bg-blue-50' : ''}`}
                                  placeholder="0"
                                />
                              </td>
                            );
                          })}
                          <td className="border p-2 text-center text-sm font-bold text-gray-900 bg-blue-50">
                            <span className={getStatusColor(serviceTotals[service.service_name], targets[service.service_name] || 0)}>
                              {serviceTotals[service.service_name]}
                            </span>
                          </td>
                        </tr>
                      ))}
                      {/* Total Row */}
                      <tr className="bg-gray-100 font-bold">
                        <td className="sticky left-0 bg-gray-100 border p-2 text-center text-sm font-bold text-gray-900 z-10">
                          Total
                        </td>
                        {dailyEntries.map(entry => {
                          const dayTotal = services.reduce((sum, service) => 
                            sum + (entry.services[service.service_name] || 0), 0
                          );
                          return (
                            <td 
                              key={entry.day} 
                              className="border p-2 text-center text-sm font-bold text-gray-900 bg-gray-100"
                            >
                              {dayTotal}
                            </td>
                          );
                        })}
                        <td className="border p-2 text-center text-sm font-bold text-gray-900 bg-gray-200">
                          {overallTotal}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};