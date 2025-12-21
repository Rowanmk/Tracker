import React, { useState, useEffect } from 'react';
    import { useDate } from '../context/DateContext';
    import { useAuth } from '../context/AuthContext';
    import { useServices } from '../hooks/useServices';
    import { useWorkingDays } from '../hooks/useWorkingDays';
    import { PerformancePrediction } from '../components/PerformancePrediction';
    import { supabase } from '../supabase/client';
    import { getFinancialYearDateRange, getFinancialYearMonths } from '../utils/financialYear';

    interface AnnualData {
      staff_id: number;
      name: string;
      months: {
        [key: number]: {
          total: number;
          services: {
            [key: string]: number;
          };
        };
      };
      totalDeliveries: number;
      busiestDay: { day: number; count: number } | null;
      averageMonthlyDeliveries: number;
    }

    interface NoBagelStreak {
      staff_id: number;
      name: string;
      start_date: string;
      end_date: string;
      streak_days: number;
    }

    interface AvgBagelDays {
      staff_id: number;
      name: string;
      avg_bagel_days: number;
    }

    export const AnnualSummary: React.FC = () => {
      const { selectedMonth, selectedFinancialYear } = useDate();
      const [annualData, setAnnualData] = useState<AnnualData[]>([]);
      const [noBagelStreaks, setNoBagelStreaks] = useState<NoBagelStreak[]>([]);
      const [avgBagelDays, setAvgBagelDays] = useState<AvgBagelDays[]>([]);
      const [showServiceBreakdown, setShowServiceBreakdown] = useState(false);
      const [loading, setLoading] = useState(true);
      const [error, setError] = useState<string | null>(null);

      const { allStaff, currentStaff, isAdmin, selectedStaffId, loading: authLoading, error: authError } = useAuth();
      const { services, loading: servicesLoading, error: servicesError } = useServices();
      const currentMonth = new Date().getMonth() + 1;
      const { workingDays, workingDaysUpToToday } = useWorkingDays(currentMonth, new Date().getFullYear());

      const isWorkingDay = (date: Date): boolean => {
        const dayOfWeek = date.getDay();
        return dayOfWeek >= 1 && dayOfWeek <= 5; // Monday to Friday
      };

      const calculateNoBagelStreaks = async () => {
        try {
          const { startDate, endDate } = getFinancialYearDateRange(selectedFinancialYear);
          const today = new Date();
          
          // If today is a weekend, find the most recent weekday
          let lastValidDay = new Date(today);
          while (lastValidDay.getDay() === 0 || lastValidDay.getDay() === 6) {
            lastValidDay.setDate(lastValidDay.getDate() - 1);
          }
          
          // Use the earlier of endDate or lastValidDay
          const effectiveEndDate = lastValidDay < endDate ? lastValidDay : endDate;
          
          const streakResults: NoBagelStreak[] = [];

          for (const staff of allStaff) {
            const { data: activities } = await supabase
              .from('dailyactivity')
              .select('date, delivered_count')
              .eq('staff_id', staff.staff_id)
              .gte('date', startDate.toISOString().split('T')[0])
              .lte('date', effectiveEndDate.toISOString().split('T')[0])
              .order('date');

            if (!activities) continue;

            // Create a map of all working days in the financial year up to today
            const workingDaysMap: Record<string, number> = {};
            const currentDate = new Date(startDate);
            
            while (currentDate <= effectiveEndDate) {
              if (isWorkingDay(currentDate)) {
                const dateStr = currentDate.toISOString().split('T')[0];
                workingDaysMap[dateStr] = 0; // Default to 0 deliveries
              }
              currentDate.setDate(currentDate.getDate() + 1);
            }

            // Fill in actual delivery counts
            activities.forEach(activity => {
              if (workingDaysMap.hasOwnProperty(activity.date)) {
                workingDaysMap[activity.date] = activity.delivered_count;
              }
            });

            // Find streaks of consecutive working days with delivered_count > 0
            const workingDays = Object.keys(workingDaysMap).sort();
            let currentStreak = 0;
            let currentStreakStart = '';
            let longestStreak = 0;
            let longestStreakStart = '';
            let longestStreakEnd = '';

            for (const dateStr of workingDays) {
              const deliveredCount = workingDaysMap[dateStr];
              
              if (deliveredCount > 0) {
                if (currentStreak === 0) {
                  currentStreakStart = dateStr;
                }
                currentStreak++;
                
                if (currentStreak > longestStreak) {
                  longestStreak = currentStreak;
                  longestStreakStart = currentStreakStart;
                  longestStreakEnd = dateStr;
                }
              } else {
                currentStreak = 0;
              }
            }

            if (longestStreak > 0) {
              streakResults.push({
                staff_id: staff.staff_id,
                name: staff.name,
                start_date: longestStreakStart,
                end_date: longestStreakEnd,
                streak_days: longestStreak,
              });
            }
          }

          // Sort by longest streak first, then by earliest start date, then alphabetically
          streakResults.sort((a, b) => {
            if (a.streak_days !== b.streak_days) {
              return b.streak_days - a.streak_days; // Longest first
            }
            if (a.start_date !== b.start_date) {
              return a.start_date.localeCompare(b.start_date); // Earliest first
            }
            return a.name.localeCompare(b.name); // Alphabetical
          });

          setNoBagelStreaks(streakResults);
        } catch (error) {
          console.error('Error calculating no bagel streaks:', error);
        }
      };

      const calculateAvgBagelDays = async () => {
        try {
          const { startDate, endDate } = getFinancialYearDateRange(selectedFinancialYear);
          const today = new Date();
          
          const avgResults: AvgBagelDays[] = [];

          for (const staff of allStaff) {
            const { data: activities } = await supabase
              .from('dailyactivity')
              .select('date, delivered_count')
              .eq('staff_id', staff.staff_id)
              .gte('date', startDate.toISOString().split('T')[0])
              .lte('date', endDate.toISOString().split('T')[0]);

            if (!activities) continue;

            // Count bagel days (working days with delivered_count === 0) up to today only
            let bagelDays = 0;
            let totalMonthsUpToToday = 0;
            const currentDate = new Date(startDate);
            const monthsProcessed = new Set<string>();
            
            while (currentDate <= endDate && currentDate <= today) {
              if (isWorkingDay(currentDate)) {
                const dateStr = currentDate.toISOString().split('T')[0];
                const monthKey = `${currentDate.getFullYear()}-${currentDate.getMonth() + 1}`;
                
                // Track months that have workdays up to today
                if (!monthsProcessed.has(monthKey)) {
                  monthsProcessed.add(monthKey);
                  totalMonthsUpToToday++;
                }
                
                const activity = activities.find(a => a.date === dateStr);
                const deliveredCount = activity ? activity.delivered_count : 0;
                
                if (deliveredCount === 0) {
                  bagelDays++;
                }
              }
              currentDate.setDate(currentDate.getDate() + 1);
            }

            // Calculate average per month using only months up to today
            const avgBagelDaysPerMonth = totalMonthsUpToToday > 0 ? bagelDays / totalMonthsUpToToday : 0;

            avgResults.push({
              staff_id: staff.staff_id,
              name: staff.name,
              avg_bagel_days: avgBagelDaysPerMonth,
            });
          }

          // Sort by lowest average first (best performer), then alphabetically
          avgResults.sort((a, b) => {
            if (Math.abs(a.avg_bagel_days - b.avg_bagel_days) < 0.01) {
              return a.name.localeCompare(b.name); // Alphabetical if tied
            }
            return a.avg_bagel_days - b.avg_bagel_days; // Lowest first
          });

          setAvgBagelDays(avgResults);
        } catch (error) {
          console.error('Error calculating average bagel days:', error);
        }
      };

      const fetchAnnualData = async () => {
        if (allStaff.length === 0 || services.length === 0) {
          setLoading(false);
          return;
        }

        setLoading(true);
        setError(null);

        try {
          const { startDate, endDate } = getFinancialYearDateRange(selectedFinancialYear);

          const annualDataPromises = allStaff.map(async (staff) => {
            const { data: activities, error: activitiesError } = await supabase
              .from('dailyactivity')
              .select('month, day, service_id, delivered_count, date, year')
              .eq('staff_id', staff.staff_id)
              .gte('date', startDate.toISOString().split('T')[0])
              .lte('date', endDate.toISOString().split('T')[0]);

            if (activitiesError) {
              console.error('Error fetching activities for staff:', staff.name, activitiesError);
            }

            const months: AnnualData['months'] = {};

            for (let month = 1; month <= 12; month++) {
              months[month] = {
                total: 0,
                services: {},
              };
              services.forEach(service => {
                months[month].services[service.service_name] = 0;
              });
            }

            const deliveredMap: Record<number, Record<number, number>> = {};
            const dailyTotals: Record<number, number> = {};

            activities?.forEach(activity => {
              if (activity.service_id) {
                if (!deliveredMap[activity.service_id]) {
                  deliveredMap[activity.service_id] = {};
                }
                deliveredMap[activity.service_id][activity.month] = 
                  (deliveredMap[activity.service_id][activity.month] || 0) + activity.delivered_count;

                dailyTotals[activity.day] = (dailyTotals[activity.day] || 0) + activity.delivered_count;
              }
            });

            services.forEach(service => {
              const serviceActivities = deliveredMap[service.service_id] || {};
              for (let month = 1; month <= 12; month++) {
                const delivered = serviceActivities[month] || 0;
                months[month].services[service.service_name] = delivered;
                months[month].total += delivered;
              }
            });

            const totalDeliveries = Object.values(months).reduce((sum, month) => sum + month.total, 0);
            
            let busiestDay: { day: number; count: number } | null = null;
            if (Object.keys(dailyTotals).length > 0) {
              const maxDay = Object.entries(dailyTotals).reduce((max, [day, count]) => 
                count > max.count ? { day: parseInt(day), count } : max, 
                { day: 0, count: 0 }
              );
              busiestDay = maxDay.count > 0 ? maxDay : null;
            }

            const monthsWithData = Object.values(months).filter(month => month.total > 0).length;
            const averageMonthlyDeliveries = monthsWithData > 0 ? totalDeliveries / monthsWithData : 0;

            return {
              staff_id: staff.staff_id,
              name: staff.name,
              months,
              totalDeliveries,
              busiestDay,
              averageMonthlyDeliveries,
            };
          });

          const processedData = await Promise.all(annualDataPromises);
          setAnnualData(processedData);

          // Calculate the new tables
          await calculateNoBagelStreaks();
          await calculateAvgBagelDays();
        } catch (err) {
          console.error('Error in fetchAnnualData:', err);
          setError('Failed to connect to database');
          setAnnualData([]);
        } finally {
          setLoading(false);
        }
      };

      useEffect(() => {
        fetchAnnualData();
      }, [selectedFinancialYear, allStaff.length, services.length, currentStaff?.staff_id]);

      useEffect(() => {
        const handler = () => fetchAnnualData();
        window.addEventListener('activity-updated', handler);
        return () => window.removeEventListener('activity-updated', handler);
      }, [selectedFinancialYear, allStaff.length, services.length]);

      const monthData = getFinancialYearMonths();

      const getStatusColor = (total: number, target: number = 100) => {
        if (total >= target) return 'text-green-600 dark:text-green-400';
        if (total >= target * 0.5) return 'text-yellow-600 dark:text-yellow-400';
        return 'text-red-600 dark:text-red-400';
      };

      const displayStaff = isAdmin && selectedStaffId
        ? allStaff.find(s => s.staff_id.toString() === selectedStaffId) || currentStaff
        : currentStaff;

      const getCurrentMonthData = () => {
        if (!displayStaff) return { currentDelivered: 0, target: 0, historicalAverage: 0 };
        
        const staffData = annualData.find(s => s.staff_id === displayStaff.staff_id);
        if (!staffData) return { currentDelivered: 0, target: 0, historicalAverage: 0 };

        const currentDelivered = staffData.months[currentMonth]?.total || 0;
        const historicalAverage = staffData.averageMonthlyDeliveries;
        
        return { currentDelivered, target: 0, historicalAverage };
      };

      const { currentDelivered, target, historicalAverage } = getCurrentMonthData();

      const chartData = annualData.map(staff => ({
        name: staff.name,
        totalDeliveries: staff.totalDeliveries,
        averageMonthly: staff.averageMonthlyDeliveries,
        busiestDay: staff.busiestDay?.count || 0
      }));

      const maxDeliveries = Math.max(...chartData.map(d => d.totalDeliveries), 1);

      const formatDate = (dateStr: string): string => {
        const date = new Date(dateStr);
        return date.toLocaleDateString('en-GB', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric'
        });
      };

      return (
        <div>
          <h2 className="text-2xl lg:text-3xl font-bold text-gray-900 dark:text-white mb-6">
            Annual Summary
          </h2>

          <div className="mt-6">
            <div className="flex items-end mb-6">
              <button
                onClick={() => setShowServiceBreakdown(!showServiceBreakdown)}
                className="btn-primary"
              >
                {showServiceBreakdown ? 'Show Totals' : 'Show Service Breakdown'}
              </button>
            </div>

            {(authError || servicesError || error) && (
              <div className="mb-4 p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-md">
                <p className="text-yellow-800 dark:text-yellow-200">
                  ⚠️ Some data may be unavailable due to connection issues. Showing available data with fallbacks.
                </p>
              </div>
            )}

            {displayStaff && (
              <div className="mb-8">
                <PerformancePrediction
                  currentDelivered={currentDelivered}
                  target={target}
                  workingDays={workingDays}
                  workingDaysUpToToday={workingDaysUpToToday}
                  historicalAverage={historicalAverage}
                  staffName={displayStaff.name}
                />
              </div>
            )}

            {annualData.length > 0 && (
              <div className="mb-8 bg-white dark:bg-gray-800 p-6 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
                <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-6">Yearly Performance Overview</h3>
                
                <div className="relative h-80">
                  <svg viewBox="0 0 800 300" className="w-full h-full">
                    <defs>
                      <linearGradient id="blueGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                        <stop offset="0%" stopColor="#3B82F6" />
                        <stop offset="100%" stopColor="#1E40AF" />
                      </linearGradient>
                      <linearGradient id="greenGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                        <stop offset="0%" stopColor="#10B981" />
                        <stop offset="100%" stopColor="#047857" />
                      </linearGradient>
                      <linearGradient id="orangeGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                        <stop offset="0%" stopColor="#F97316" />
                        <stop offset="100%" stopColor="#C2410C" />
                      </linearGradient>
                      <linearGradient id="purpleGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                        <stop offset="0%" stopColor="#8B5CF6" />
                        <stop offset="100%" stopColor="#5B21B6" />
                      </linearGradient>
                    </defs>
                    
                    {/* Grid lines */}
                    {[0, 0.25, 0.5, 0.75, 1].map(ratio => {
                      const y = 250 - (ratio * 200);
                      return (
                        <line key={ratio} x1="60" y1={y} x2="740" y2={y} stroke="#E5E7EB" strokeWidth="1" opacity="0.3" />
                      );
                    })}
                    
                    {/* Y-axis labels */}
                    {[0, 0.25, 0.5, 0.75, 1].map(ratio => {
                      const y = 250 - (ratio * 200);
                      const value = Math.round(maxDeliveries * ratio);
                      return (
                        <text key={ratio} x="50" y={y + 4} textAnchor="end" className="text-sm fill-gray-600 dark:fill-gray-400">
                          {value}
                        </text>
                      );
                    })}
                    
                    {/* Bars */}
                    {chartData.map((staff, index) => {
                      const barWidth = 80;
                      const x = 80 + (index * 120);
                      const barHeight = (staff.totalDeliveries / maxDeliveries) * 200;
                      const colors = ['url(#blueGradient)', 'url(#greenGradient)', 'url(#orangeGradient)', 'url(#purpleGradient)'];
                      const color = colors[index % colors.length];
                      
                      return (
                        <g key={staff.name}>
                          <rect
                            x={x}
                            y={250 - barHeight}
                            width={barWidth}
                            height={barHeight}
                            fill={color}
                            rx="4"
                            ry="4"
                            className="transition-opacity hover:opacity-80"
                          />
                          <text
                            x={x + barWidth / 2}
                            y={270}
                            textAnchor="middle"
                            className="text-sm font-medium fill-gray-700 dark:fill-gray-300"
                          >
                            {staff.name}
                          </text>
                          <text
                            x={x + barWidth / 2}
                            y={240 - barHeight}
                            textAnchor="middle"
                            className="text-sm font-bold fill-gray-900 dark:fill-white"
                          >
                            {staff.totalDeliveries}
                          </text>
                        </g>
                      );
                    })}
                  </svg>
                </div>
              </div>
            )}

            {loading || authLoading || servicesLoading ? (
              <div className="text-center py-4 text-gray-500 dark:text-gray-400">Loading...</div>
            ) : annualData.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-gray-500 dark:text-gray-400">No annual data available for {selectedFinancialYear.label}.</p>
                <p className="text-sm text-gray-400 dark:text-gray-500 mt-2">Staff members need to enter daily activities throughout the financial year.</p>
              </div>
            ) : (
              <div className="bg-white dark:bg-gray-800 shadow-sm rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                    <thead className="bg-gray-50 dark:bg-gray-700 sticky top-0">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                          Staff Member
                        </th>
                        {monthData.map((monthInfo) => (
                          <th key={monthInfo.number} className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                            {monthInfo.name}
                          </th>
                        ))}
                        <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                          FY Total
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                      {annualData.map((staff, staffIndex) => (
                        <tr key={staff.staff_id} className={staffIndex % 2 === 0 ? 'bg-white dark:bg-gray-800' : 'bg-gray-50 dark:bg-gray-700'}>
                          <td className="px-4 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">
                            {staff.name}
                          </td>
                          {monthData.map((monthInfo) => {
                            const monthData = staff.months[monthInfo.number];
                            const statusColor = getStatusColor(monthData.total);
                            
                            return (
                              <td key={monthInfo.number} className="px-4 py-4 whitespace-nowrap text-sm text-center text-gray-900 dark:text-white">
                                {showServiceBreakdown ? (
                                  <div className="space-y-1">
                                    {services.map(service => (
                                      <div key={service.service_id} className="text-xs">
                                        <span className="font-medium">{service.service_name.charAt(0)}:</span> 
                                        <span className={statusColor}> {monthData.services[service.service_name]}</span>
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <div className={`font-medium ${statusColor}`}>{monthData.total}</div>
                                )}
                              </td>
                            );
                          })}
                          <td className="px-4 py-4 whitespace-nowrap text-sm font-bold text-center">
                            <span className={getStatusColor(staff.totalDeliveries, 1000)}>
                              {staff.totalDeliveries}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* New Tables Section */}
            {!loading && annualData.length > 0 && (
              <div className="mt-8 space-y-8">
                {/* Table 1: No Bagels Days - Longest Workday Streak Without a Zero */}
                <div className="bg-white dark:bg-gray-800 shadow-sm rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
                  <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                    <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                      No Bagels Days — Longest Workday Streak Without a Zero
                    </h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                      <thead className="bg-gray-50 dark:bg-gray-700">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                            Staff Name
                          </th>
                          <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                            Streak Start
                          </th>
                          <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                            Streak End
                          </th>
                          <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                            Number of Work Days
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                        {noBagelStreaks.map((streak, index) => (
                          <tr key={streak.staff_id} className={index % 2 === 0 ? 'bg-white dark:bg-gray-800' : 'bg-gray-50 dark:bg-gray-700'}>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">
                              {streak.name}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-center text-gray-900 dark:text-white">
                              {formatDate(streak.start_date)}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-center text-gray-900 dark:text-white">
                              {formatDate(streak.end_date)}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-center font-bold text-green-600 dark:text-green-400">
                              {streak.streak_days}
                            </td>
                          </tr>
                        ))}
                        {noBagelStreaks.length === 0 && (
                          <tr>
                            <td colSpan={4} className="px-6 py-4 text-center text-sm text-gray-500 dark:text-gray-400">
                              No streaks found for the selected financial year.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Table 2: Average Bagel Days per Month */}
                <div className="bg-white dark:bg-gray-800 shadow-sm rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
                  <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                    <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                      Average Bagel Days per Month
                    </h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                      <thead className="bg-gray-50 dark:bg-gray-700">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                            Staff Name
                          </th>
                          <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                            Avg Bagel Days / Month
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                        {avgBagelDays.map((staff, index) => (
                          <tr key={staff.staff_id} className={index % 2 === 0 ? 'bg-white dark:bg-gray-800' : 'bg-gray-50 dark:bg-gray-700'}>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">
                              {staff.name}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-center font-bold text-blue-600 dark:text-blue-400">
                              {staff.avg_bagel_days.toFixed(2)}
                            </td>
                          </tr>
                        ))}
                        {avgBagelDays.length === 0 && (
                          <tr>
                            <td colSpan={2} className="px-6 py-4 text-center text-sm text-gray-500 dark:text-gray-400">
                              No data available for the selected financial year.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            <div className="mt-8 grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
                <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Financial Year-to-Date Progress</h3>
                <div className="space-y-4">
                  {services.map(service => {
                    const serviceTotal = annualData.reduce((sum, staff) => 
                      sum + Object.values(staff.months).reduce((monthSum, month) => 
                        monthSum + month.services[service.service_name], 0), 0);
                    const statusColor = getStatusColor(serviceTotal, 500);
                    
                    return (
                      <div key={service.service_id} className="flex justify-between items-center">
                        <span className="text-sm font-medium text-gray-900 dark:text-white">{service.service_name}</span>
                        <span className={`text-lg font-bold ${statusColor}`}>{serviceTotal}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
                <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Top Performers ({selectedFinancialYear.label})</h3>
                <div className="space-y-2">
                  {annualData
                    .sort((a, b) => b.totalDeliveries - a.totalDeliveries)
                    .slice(0, 5)
                    .map((staff, index) => {
                      const statusColor = getStatusColor(staff.totalDeliveries, 1000);
                      return (
                        <div key={staff.staff_id} className="flex justify-between items-center">
                          <span className="text-sm text-gray-900 dark:text-white">
                            <span className="font-medium">#{index + 1}</span> {staff.name}
                          </span>
                          <span className={`font-bold ${statusColor}`}>{staff.totalDeliveries}</span>
                        </div>
                      );
                    })}
                </div>
              </div>
            </div>
          </div>
        </div>
      );
    };