import React, { useState, useEffect, useRef } from 'react';
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
  const [activeCell, setActiveCell] = useState<{ service: number; day: number } | null>(null);

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

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const inputRefs = useRef<Map<string, HTMLInputElement>>(new Map());

  const getInputKey = (serviceIdx: number, day: number): string => {
    return `${serviceIdx}-${day}`;
  };

  const focusCell = (serviceIdx: number, day: number) => {
    const key = getInputKey(serviceIdx, day);
    const input = inputRefs.current.get(key);
    if (input) {
      input.focus();
      input.select();
      setActiveCell({ service: serviceIdx, day });
      
      // Scroll into view
      input.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
    }
  };

  const handleKeyNavigation = (e: React.KeyboardEvent, serviceIdx: number, day: number) => {
    if (e.key !== 'Tab') return;

    e.preventDefault();

    let nextServiceIdx = serviceIdx;
    let nextDay = day;

    if (e.shiftKey) {
      // Shift+Tab: move backwards
      nextDay--;
      if (nextDay < 1) {
        nextServiceIdx--;
        if (nextServiceIdx < 0) {
          nextServiceIdx = services.length - 1;
        }
        nextDay = dailyEntries.length;
      }
    } else {
      // Tab: move forwards
      nextDay++;
      if (nextDay > dailyEntries.length) {
        nextServiceIdx++;
        if (nextServiceIdx >= services.length) {
          nextServiceIdx = 0;
        }
        nextDay = 1;
      }
    }

    // Focus the next cell
    focusCell(nextServiceIdx, nextDay);
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
    if (delivered >= target) return 'text-green-600 dark:text-green-400';
    if (delivered >= target * 0.5) return 'text-yellow-600 dark:text-yellow-400';
    return 'text-red-600 dark:text-red-400';
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
      <h2 className="text-2xl lg:text-3xl font-bold text-gray-900 dark:text-white mb-6">
        My Tracker
      </h2>

      {/* Status bar positioned below the page title */}
      <div className="w-full py-4 bg-[#001B47] rounded-xl flex justify-between items-center px-6 mb-6">
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
        {loading || leaveHolidayLoading ? (
          <div className="text-center py-4">Loading...</div>
        ) : (
          <div className="space-y-6">
            {/* Card-based layout matching Targets Control */}
            <div className="bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-lg shadow-sm hover:shadow-md transition-shadow duration-200 overflow-hidden">
              {/* Staff Member Header */}
              <div className="bg-gradient-to-r from-blue-600 to-blue-700 dark:from-blue-700 dark:to-blue-800 px-6 py-4">
                <h4 className="text-lg font-bold text-white">
                  {currentStaff?.name || 'User'}
                </h4>
              </div>

              {/* Day Headers Row */}
              <div className="px-6 py-2 bg-gray-100 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600 overflow-x-auto">
                <div className="flex items-center gap-4 min-w-min">
                  {/* Service Name Column Header */}
                  <div className="w-32 flex-shrink-0">
                    <span className="text-xs font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wider">
                      Service
                    </span>
                  </div>

                  {/* Day Headers - Scrollable */}
                  <div ref={scrollContainerRef} className="flex gap-0 overflow-x-auto pb-2">
                    {dailyEntries.map((entry) => {
                      const tooltipText = entry.isBankHoliday 
                        ? `Public Holiday – ${entry.bankHolidayTitle}`
                        : entry.isOnLeave 
                        ? `Annual Leave`
                        : '';
                      
                      return (
                        <div key={entry.day} className="flex-shrink-0 w-16 text-center px-1">
                          <div className={`px-2 py-2 rounded-t-md text-xs font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wider ${
                            entry.isBankHoliday ? 'bg-red-200 dark:bg-red-800/50' :
                            entry.isOnLeave ? 'bg-gray-200 dark:bg-gray-600' :
                            entry.isWeekend ? 'bg-red-100 dark:bg-red-800/30' :
                            'bg-gray-50 dark:bg-gray-700'
                          }`} title={tooltipText}>
                            <div>{entry.day}</div>
                            <div className="text-xs font-normal">{getDayName(entry.day)}</div>
                            {entry.isBankHoliday && <div className="text-xs">🔴</div>}
                            {entry.isOnLeave && <div className="text-xs">🟢</div>}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Annual Header */}
                  <div className="w-24 flex-shrink-0 text-center">
                    <span className="text-xs font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wider">
                      Total
                    </span>
                  </div>
                </div>
              </div>

              {/* Service Rows */}
              <div className="divide-y divide-gray-200 dark:divide-gray-700">
                {services.map((service, serviceIdx) => {
                  const serviceTotal = serviceTotals[service.service_name];
                  const serviceTarget = targets[service.service_name] || 0;
                  
                  return (
                    <div
                      key={`${currentStaff?.staff_id}-${service.service_id}`}
                      className={`px-6 py-2 flex items-center gap-4 ${
                        serviceIdx % 2 === 0
                          ? 'bg-white dark:bg-gray-800'
                          : 'bg-gray-50 dark:bg-gray-750'
                      } hover:bg-blue-50 dark:hover:bg-gray-700/50 transition-colors duration-150`}
                    >
                      {/* Service Name - Fixed Width */}
                      <div className="w-32 flex-shrink-0">
                        <span className="text-sm font-semibold text-gray-900 dark:text-white">
                          {service.service_name}
                        </span>
                      </div>

                      {/* Daily Inputs - Synchronized Scroll */}
                      <div className="flex-1 flex gap-0 overflow-x-auto pb-2" onScroll={(e) => {
                        if (scrollContainerRef.current) {
                          scrollContainerRef.current.scrollLeft = e.currentTarget.scrollLeft;
                        }
                      }}>
                        {dailyEntries.map((entry) => {
                          const tooltipText = entry.isBankHoliday 
                            ? `Public Holiday – ${entry.bankHolidayTitle}`
                            : entry.isOnLeave 
                            ? `Annual Leave`
                            : '';
                          
                          const inputKey = getInputKey(serviceIdx, entry.day);
                          const isActive = activeCell?.service === serviceIdx && activeCell?.day === entry.day;
                          
                          return (
                            <div key={entry.day} className="flex-shrink-0 w-16 px-1">
                              <input
                                ref={(el) => {
                                  if (el) {
                                    inputRefs.current.set(inputKey, el);
                                  } else {
                                    inputRefs.current.delete(inputKey);
                                  }
                                }}
                                type="number"
                                inputMode="numeric"
                                pattern="[0-9]*"
                                min="0"
                                step="1"
                                value={entry.services[service.service_name] ?? 0}
                                onFocus={(e) => {
                                  e.currentTarget.select();
                                  setActiveCell({ service: serviceIdx, day: entry.day });
                                }}
                                onChange={(e) => {
                                  const cleaned = e.target.value.replace(/^0+(?=\d)/, "");
                                  handleEntryChange(entry.day, service.service_name, cleaned);
                                }}
                                onBlur={(e) => {
                                  if (e.target.value === "") {
                                    handleEntryChange(entry.day, service.service_name, "0");
                                  }
                                  setActiveCell(null);
                                }}
                                onKeyDown={(e) => {
                                  handleKeyNavigation(e, serviceIdx, entry.day);
                                }}
                                disabled={entry.isWeekend || entry.isOnLeave || entry.isBankHoliday}
                                title={tooltipText}
                                className={`w-full px-2 py-2 text-center border rounded-md text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors ${
                                  entry.isBankHoliday ? 'bg-red-100 dark:bg-red-900/20 border-red-300 dark:border-red-700 text-gray-400 cursor-not-allowed' :
                                  entry.isOnLeave ? 'bg-gray-100 dark:bg-gray-700/50 border-gray-300 dark:border-gray-600 text-gray-400 cursor-not-allowed' :
                                  entry.isWeekend ? 'bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-800 text-gray-400 cursor-not-allowed' :
                                  isActive ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-500 dark:border-blue-600' :
                                  'bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white'
                                }`}
                                placeholder="0"
                              />
                            </div>
                          );
                        })}
                      </div>

                      {/* Service Total - Fixed Width, Read-Only */}
                      <div className="w-24 flex-shrink-0">
                        <div className={`px-2 py-2 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md text-center text-sm font-bold ${getStatusColor(serviceTotal, serviceTarget)}`}>
                          {serviceTotal}
                        </div>
                      </div>
                    </div>
                  );
                })}

                {/* Monthly Totals Row */}
                <div className="px-6 py-2 bg-gray-200 dark:bg-gray-600 border-t-2 border-gray-300 dark:border-gray-500 flex items-center gap-4">
                  {/* Row Label */}
                  <div className="w-32 flex-shrink-0">
                    <span className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wider">
                      Daily Total
                    </span>
                  </div>

                  {/* Daily Totals - Synchronized Scroll */}
                  <div className="flex-1 flex gap-0 overflow-x-auto pb-2" onScroll={(e) => {
                    if (scrollContainerRef.current) {
                      scrollContainerRef.current.scrollLeft = e.currentTarget.scrollLeft;
                    }
                  }}>
                    {dailyEntries.map((entry) => {
                      const dayTotal = services.reduce((sum, service) => 
                        sum + (entry.services[service.service_name] || 0), 0
                      );
                      return (
                        <div key={entry.day} className="flex-shrink-0 w-16 px-1">
                          <div className="px-2 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md text-center text-sm font-bold text-gray-900 dark:text-white">
                            {dayTotal}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Overall Total - Fixed Width */}
                  <div className="w-24 flex-shrink-0">
                    <div className="px-2 py-2 bg-blue-600 dark:bg-blue-700 border border-blue-700 dark:border-blue-800 rounded-md text-center text-sm font-bold text-white">
                      {overallTotal}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-md border border-gray-200 dark:border-gray-700">
                <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Monthly Progress</h3>
                <div className="space-y-3">
                  {services.map(service => {
                    const total = serviceTotals[service.service_name];
                    const target = targets[service.service_name] || 0;
                    const percentage = target > 0 ? (total / target) * 100 : 0;
                    const statusColor = getStatusColor(total, target);
                    
                    return (
                      <div key={service.service_id}>
                        <div className="flex justify-between text-sm">
                          <span className="font-medium text-gray-900 dark:text-white">{service.service_name}</span>
                          <span className={statusColor}>{total} / {target}</span>
                        </div>
                        <div className="w-full bg-gray-200 dark:bg-gray-600 rounded-full h-2">
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

              <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-md border border-gray-200 dark:border-gray-700">
                <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Run Rate Status</h3>
                <div className="space-y-4">
                  <div className="text-center">
                    <div className="text-3xl font-bold text-blue-600 dark:text-blue-400">{overallTotal}</div>
                    <div className="text-sm text-gray-500 dark:text-gray-400">Total Delivered</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-gray-600 dark:text-gray-300">
                      {expectedByNow}
                    </div>
                    <div className="text-sm text-gray-500 dark:text-gray-400">Expected by Now</div>
                  </div>
                  <div className="text-center">
                    <div className={`text-2xl font-bold ${getStatusColor(overallTotal, expectedByNow)}`}>
                      {overallTotal >= expectedByNow
                        ? '✓ On Track' : '⚠ Behind'}
                    </div>
                    <div className="text-sm text-gray-500 dark:text-gray-400">Status</div>
                  </div>
                </div>
              </div>

              <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-md border border-gray-200 dark:border-gray-700">
                <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Working Days</h3>
                <div className="space-y-4">
                  <div className="text-center">
                    <div className="text-3xl font-bold text-purple-600 dark:text-purple-400">{daysWorked}</div>
                    <div className="text-sm text-gray-500 dark:text-gray-400">Days Worked</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-gray-600 dark:text-gray-300">{workingDays}</div>
                    <div className="text-sm text-gray-500 dark:text-gray-400">Total Working Days</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                      {workingDays - daysWorked}
                    </div>
                    <div className="text-sm text-gray-500 dark:text-gray-400">Days Remaining</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};