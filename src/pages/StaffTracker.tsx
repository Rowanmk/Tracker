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

  const { currentStaff, allStaff, selectedStaffId } = useAuth();
  const { services } = useServices();
  
  const year = selectedMonth >= 4 ? selectedFinancialYear.start : selectedFinancialYear.end;
  const { teamWorkingDays, workingDaysUpToToday } = useWorkingDays({
    financialYear: selectedFinancialYear,
    month: selectedMonth,
  });

  // Determine if Team is selected
  const isTeamSelected = selectedStaffId === "team" || !selectedStaffId;

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

  // Single shared scroll container ref
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
      
      input.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
    }
  };

  const handleKeyNavigation = (e: React.KeyboardEvent, serviceIdx: number, day: number) => {
    if (e.key !== 'Tab') return;

    e.preventDefault();

    let nextServiceIdx = serviceIdx;
    let nextDay = day;
    const daysInMonth = dailyEntries.length;

    if (e.shiftKey) {
      nextDay--;
      if (nextDay < 1) {
        nextServiceIdx--;
        if (nextServiceIdx < 0) {
          nextServiceIdx = services.length - 1;
        }
        nextDay = daysInMonth;
      }
    } else {
      nextDay++;
      if (nextDay > daysInMonth) {
        nextServiceIdx++;
        if (nextServiceIdx >= services.length) {
          nextServiceIdx = 0;
        }
        nextDay = 1;
      }
    }

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

    if (isTeamSelected) {
      // Team mode: aggregate all staff activities
      const { data: allActivities } = await supabase
        .from('dailyactivity')
        .select('day, service_id, delivered_count')
        .eq('month', selectedMonth)
        .eq('year', year);

      const deliveredMap: Record<number, Record<number, number>> = {};
      allActivities?.forEach(activity => {
        if (activity.service_id) {
          if (!deliveredMap[activity.service_id]) {
            deliveredMap[activity.service_id] = {};
          }
          deliveredMap[activity.service_id][activity.day] = 
            (deliveredMap[activity.service_id][activity.day] || 0) + activity.delivered_count;
        }
      });

      services.forEach(service => {
        const serviceActivities = deliveredMap[service.service_id] || {};
        entries.forEach(entry => {
          entry.services[service.service_name] = serviceActivities[entry.day] || 0;
        });
      });
    } else {
      // Individual mode: fetch only current staff activities
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
    }

    setDailyEntries(entries);

    // Load targets
    if (isTeamSelected) {
      // Team mode: aggregate all staff targets
      let teamTargets: { [key: string]: number } = {};
      services.forEach(service => {
        teamTargets[service.service_name] = 0;
      });

      for (const staff of allStaff) {
        const { perService } = await loadTargets(selectedMonth, selectedFinancialYear, staff.staff_id);
        services.forEach(service => {
          teamTargets[service.service_name] = (teamTargets[service.service_name] || 0) + (perService[service.service_id] || 0);
        });
      }

      setTargets(teamTargets);
    } else {
      // Individual mode: load targets for current staff
      const { perService } = await loadTargets(selectedMonth, selectedFinancialYear, currentStaff.staff_id);

      const targetsMapByName: { [key: string]: number } = {};
      services.forEach(service => {
        targetsMapByName[service.service_name] = perService[service.service_id] || 0;
      });

      setTargets(targetsMapByName);
    }

    setLoading(false);
  };

  useEffect(() => {
    if (!leaveHolidayLoading) {
      fetchData();
    }
  }, [currentStaff?.staff_id, services.length, selectedMonth, selectedFinancialYear, leaveHolidayLoading, isTeamSelected]);

  useEffect(() => {
    const handler = () => fetchData();
    window.addEventListener('activity-updated', handler);
    return () => window.removeEventListener('activity-updated', handler);
  }, [currentStaff?.staff_id, services.length, selectedMonth, selectedFinancialYear, isTeamSelected]);

  const handleEntryChange = async (day: number, serviceName: string, value: string) => {
    if (!currentStaff || isTeamSelected) return; // Don't allow edits in team mode

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

  const getCellBackgroundClass = (entry: DailyEntry): string => {
    if (entry.isBankHoliday) return 'bg-red-200 dark:bg-red-800/50';
    if (entry.isOnLeave) return 'bg-gray-200 dark:bg-gray-600';
    if (entry.isWeekend) return 'bg-red-100 dark:bg-red-800/30';
    return 'bg-white dark:bg-gray-700';
  };

  const serviceTotals = getServiceTotals();
  const overallTotal = Object.values(serviceTotals).reduce((sum, total) => sum + total, 0);
  const overallTarget = Object.values(targets).reduce((sum, target) => sum + target, 0);

  const daysWorked = Math.min(workingDaysUpToToday, teamWorkingDays);
  const dailyTarget = teamWorkingDays > 0 ? overallTarget / teamWorkingDays : 0;
  const workingDaysCompleted = Math.min(workingDaysUpToToday, teamWorkingDays);
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

  const displayTitle = isTeamSelected ? 'Team Tracker' : `${currentStaff?.name || 'User'} Tracker`;

  return (
    <div>
      <h2 className="text-2xl lg:text-3xl font-bold text-gray-900 dark:text-white mb-6">
        My Tracker
      </h2>

      {/* Status bar positioned below the page title - MATCHES DASHBOARD EXACTLY */}
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

        {/* Centre: Status text - EXACT SAME FORMAT AS DASHBOARD */}
        <div className="flex-1 text-center">
          <span className="text-white text-lg font-semibold tracking-wide">
            Ahead by {Math.max(0, overallTotal - expectedByNow)} | Delivered: {overallTotal} | Expected: {expectedByNow}
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
            {/* SECTION: Monthly Progress Charts - Repositioned Above Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {services.map((service) => {
                const serviceTotal = serviceTotals[service.service_name];
                const serviceTarget = targets[service.service_name] || 0;
                const percentage = serviceTarget > 0 ? (serviceTotal / serviceTarget) * 100 : 0;
                const statusColor = getStatusColor(serviceTotal, serviceTarget);
                
                return (
                  <div key={service.service_id} className="bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-lg shadow-md hover:shadow-lg transition-shadow duration-200 overflow-hidden">
                    <div className="bg-gradient-to-r from-blue-600 to-blue-700 dark:from-blue-700 dark:to-blue-800 px-6 py-4">
                      <h4 className="text-lg font-bold text-white">
                        {service.service_name}
                      </h4>
                    </div>

                    <div className="px-6 py-6 space-y-4">
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Progress</span>
                        <span className={`text-2xl font-bold ${statusColor}`}>{Math.round(percentage)}%</span>
                      </div>

                      <div className="w-full bg-gray-200 dark:bg-gray-600 rounded-full h-3 overflow-hidden">
                        <div
                          className={`h-3 rounded-full transition-all duration-500 ease-in-out ${
                            serviceTotal >= serviceTarget ? 'bg-green-500' :
                            serviceTotal >= serviceTarget * 0.5 ? 'bg-yellow-500' : 'bg-red-500'
                          }`}
                          style={{ width: `${Math.min(percentage, 100)}%` }}
                        />
                      </div>

                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600 dark:text-gray-400">Delivered</span>
                        <span className="font-bold text-gray-900 dark:text-white">{serviceTotal}</span>
                      </div>

                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600 dark:text-gray-400">Target</span>
                        <span className="font-bold text-gray-900 dark:text-white">{serviceTarget}</span>
                      </div>

                      <div className="pt-2 border-t border-gray-200 dark:border-gray-600">
                        <div className={`text-sm font-medium ${statusColor}`}>
                          {serviceTotal >= serviceTarget ? '✓ On Track' : '⚠ Behind Target'}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Card-based layout matching Targets Control */}
            <div className="bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-lg shadow-sm hover:shadow-md transition-shadow duration-200 overflow-hidden">
              {/* Staff Member Header */}
              <div className="bg-gradient-to-r from-blue-600 to-blue-700 dark:from-blue-700 dark:to-blue-800 px-6 py-4">
                <h4 className="text-lg font-bold text-white">
                  {displayTitle}
                  {isTeamSelected && <span className="text-sm font-normal ml-2 opacity-90">(Aggregated - Read Only)</span>}
                </h4>
              </div>

              {/* SINGLE SHARED SCROLL CONTAINER - ALL CONTENT INSIDE */}
              <div 
                ref={scrollContainerRef}
                className="overflow-x-auto scrollbar-thin scrollbar-thumb-gray-400 dark:scrollbar-thumb-gray-600 scrollbar-track-gray-100 dark:scrollbar-track-gray-800"
                style={{ scrollBehavior: 'smooth' }}
              >
                {/* Header Row */}
                <div className="flex bg-gray-100 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600 min-w-min">
                  {/* Left Zone: Service Names (Sticky) */}
                  <div className="w-48 flex-shrink-0 sticky left-0 z-20 bg-gray-100 dark:bg-gray-700 border-r border-gray-200 dark:border-gray-600 px-4 py-3">
                    <span className="text-xs font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wider">
                      Service
                    </span>
                  </div>

                  {/* Middle Zone: Scrollable Date Headers */}
                  <div className="flex">
                    {dailyEntries.map((entry) => (
                      <div key={entry.day} className={`flex-shrink-0 w-16 text-center px-1 py-3 border-r border-gray-200 dark:border-gray-600 ${getCellBackgroundClass(entry)}`}>
                        <div className="text-xs font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wider">
                          <div>{entry.day}</div>
                          <div className="text-xs font-normal">{getDayName(entry.day)}</div>
                          {entry.isBankHoliday && <div className="text-xs">🔴</div>}
                          {entry.isOnLeave && <div className="text-xs">🟢</div>}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Right Zone: Total Column (Sticky) */}
                  <div className="w-24 flex-shrink-0 sticky right-0 z-20 bg-gray-100 dark:bg-gray-700 border-l border-gray-200 dark:border-gray-600 px-3 py-3">
                    <span className="text-xs font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wider">
                      Total
                    </span>
                  </div>
                </div>

                {/* Service Rows - All children of single scroll container */}
                <div className="divide-y divide-gray-200 dark:divide-gray-700 min-w-min">
                  {services.map((service, serviceIdx) => {
                    const serviceTotal = serviceTotals[service.service_name];
                    const serviceTarget = targets[service.service_name] || 0;
                    const rowBgClass = serviceIdx % 2 === 0 ? 'bg-white dark:bg-gray-800' : 'bg-gray-50 dark:bg-gray-750';
                    
                    return (
                      <div
                        key={`${currentStaff?.staff_id}-${service.service_id}`}
                        className="flex"
                      >
                        {/* Left Zone: Service Name (Sticky) - SOLID BACKGROUND */}
                        <div className={`w-48 flex-shrink-0 sticky left-0 z-10 border-r border-gray-200 dark:border-gray-600 px-4 py-3 flex items-center ${rowBgClass}`}>
                          <span className="text-sm font-semibold text-gray-900 dark:text-white whitespace-nowrap">
                            {service.service_name}
                          </span>
                        </div>

                        {/* Middle Zone: Scrollable Daily Inputs */}
                        <div className="flex">
                          {dailyEntries.map((entry) => {
                            const inputKey = getInputKey(serviceIdx, entry.day);
                            const isActive = activeCell?.service === serviceIdx && activeCell?.day === entry.day;
                            const cellBgClass = getCellBackgroundClass(entry);
                            
                            return (
                              <div key={entry.day} className={`flex-shrink-0 w-16 px-1 py-2 border-r border-gray-200 dark:border-gray-600 ${cellBgClass}`}>
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
                                    if (!isTeamSelected) {
                                      e.currentTarget.select();
                                      setActiveCell({ service: serviceIdx, day: entry.day });
                                    }
                                  }}
                                  onChange={(e) => {
                                    if (!isTeamSelected) {
                                      const cleaned = e.target.value.replace(/^0+(?=\d)/, "");
                                      handleEntryChange(entry.day, service.service_name, cleaned);
                                    }
                                  }}
                                  onBlur={(e) => {
                                    if (!isTeamSelected && e.target.value === "") {
                                      handleEntryChange(entry.day, service.service_name, "0");
                                    }
                                    setActiveCell(null);
                                  }}
                                  onKeyDown={(e) => {
                                    if (!isTeamSelected) {
                                      handleKeyNavigation(e, serviceIdx, entry.day);
                                    }
                                  }}
                                  disabled={isTeamSelected}
                                  className={`w-full px-2 py-2 text-center border rounded-md text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors ${
                                    isTeamSelected 
                                      ? 'bg-gray-100 dark:bg-gray-600 border-gray-300 dark:border-gray-500 text-gray-700 dark:text-gray-300 cursor-not-allowed opacity-75'
                                      : isActive ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-500 dark:border-blue-600' :
                                      cellBgClass === 'bg-red-200 dark:bg-red-800/50' ? 'bg-red-200 dark:bg-red-800/50 border-red-300 dark:border-red-700 text-gray-900 dark:text-white' :
                                      cellBgClass === 'bg-gray-200 dark:bg-gray-600' ? 'bg-gray-200 dark:bg-gray-600 border-gray-300 dark:border-gray-500 text-gray-900 dark:text-white' :
                                      cellBgClass === 'bg-red-100 dark:bg-red-800/30' ? 'bg-red-100 dark:bg-red-800/30 border-red-200 dark:border-red-700 text-gray-900 dark:text-white' :
                                      'bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white'
                                  }`}
                                  placeholder="0"
                                />
                              </div>
                            );
                          })}
                        </div>

                        {/* Right Zone: Service Total (Sticky) - SOLID BACKGROUND */}
                        <div className={`w-24 flex-shrink-0 sticky right-0 z-10 border-l border-gray-200 dark:border-gray-600 px-3 py-3 flex items-center ${rowBgClass}`}>
                          <div className={`w-full px-2 py-2 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md text-center text-sm font-bold ${getStatusColor(serviceTotal, serviceTarget)}`}>
                            {serviceTotal}
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  {/* Monthly Totals Row */}
                  <div className="flex bg-gray-200 dark:bg-gray-600 border-t-2 border-gray-300 dark:border-gray-500">
                    {/* Left Zone: Row Label (Sticky) - SOLID BACKGROUND */}
                    <div className="w-48 flex-shrink-0 sticky left-0 z-10 bg-gray-200 dark:bg-gray-600 border-r border-gray-300 dark:border-gray-500 px-4 py-3 flex items-center">
                      <span className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wider whitespace-nowrap">
                        Daily Total
                      </span>
                    </div>

                    {/* Middle Zone: Scrollable Daily Totals */}
                    <div className="flex">
                      {dailyEntries.map((entry) => {
                        const dayTotal = services.reduce((sum, service) => 
                          sum + (entry.services[service.service_name] || 0), 0
                        );
                        const cellBgClass = getCellBackgroundClass(entry);
                        
                        return (
                          <div key={entry.day} className={`flex-shrink-0 w-16 px-1 py-2 border-r border-gray-300 dark:border-gray-500 ${cellBgClass}`}>
                            <div className="px-2 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md text-center text-sm font-bold text-gray-900 dark:text-white">
                              {dayTotal}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Right Zone: Overall Total (Sticky) - SOLID BACKGROUND */}
                    <div className="w-24 flex-shrink-0 sticky right-0 z-10 bg-gray-200 dark:bg-gray-600 border-l border-gray-300 dark:border-gray-500 px-3 py-3 flex items-center">
                      <div className="w-full px-2 py-2 bg-blue-600 dark:bg-blue-700 border border-blue-700 dark:border-blue-800 rounded-md text-center text-sm font-bold text-white">
                        {overallTotal}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Summary Cards - Run Rate and Working Days Hidden from View */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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
                <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Overall Status</h3>
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
            </div>
          </div>
        )}
      </div>
    </div>
  );
};