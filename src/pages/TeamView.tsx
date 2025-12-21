import React, { useState, useEffect } from 'react';
    import { useDate } from '../context/DateContext';
    import { useAuth } from '../context/AuthContext';
    import { useServices } from '../hooks/useServices';
    import { useWorkingDays } from '../hooks/useWorkingDays';
    import { supabase } from '../supabase/client';

    interface TeamData {
      staff_id: number;
      name: string;
      services: {
        [key: string]: {
          monthly_total: number;
          target: number;
          achieved_percent: number;
          status: 'ahead' | 'on-track' | 'behind' | 'no-data';
        };
      };
      overall_total: number;
      overall_target: number;
      overall_status: 'ahead' | 'on-track' | 'behind' | 'no-data';
      leave_days: number;
      has_leave: boolean;
    }

    interface StaffPerformance {
      staff_id: number;
      name: string;
      services: { [key: string]: number };
      total: number;
      target: number;
      achieved_percent: number;
      historicalAverage: number;
      previousMonthRatio?: number;
    }

    export const TeamView: React.FC = () => {
      const { selectedMonth, selectedFinancialYear } = useDate();
      const [teamData, setTeamData] = useState<TeamData[]>([]);
      const [staffPerformance, setStaffPerformance] = useState<StaffPerformance[]>([]);
      const [loading, setLoading] = useState(true);
      const [error, setError] = useState<string | null>(null);
      const [sortMode, setSortMode] = useState<"desc" | "asc" | "name">("desc");

      const { allStaff, currentStaff, loading: authLoading, showFallbackWarning: authWarning } = useAuth();
      const { services, loading: servicesLoading, showFallbackWarning: servicesWarning } = useServices();
      
      const { teamWorkingDays, loading: workingDaysLoading } = useWorkingDays({
        financialYear: selectedFinancialYear,
        month: selectedMonth,
      });

      const fetchTeamData = async () => {
        if (allStaff.length === 0 || services.length === 0) {
          setLoading(false);
          return;
        }

        setLoading(true);
        setError(null);

        try {
          const year = selectedMonth >= 4 ? selectedFinancialYear.start : selectedFinancialYear.end;
          const monthStartDate = `${year}-${selectedMonth.toString().padStart(2, '0')}-01`;
          const monthEndDate = new Date(year, selectedMonth, 0).toISOString().split('T')[0];

          const teamDataPromises = allStaff.map(async (staff) => {
            // Fetch activities for the specific month and year
            const { data: activities, error: activitiesError } = await supabase
              .from('dailyactivity')
              .select('service_id, delivered_count, date')
              .eq('staff_id', staff.staff_id)
              .eq('month', selectedMonth)
              .eq('year', year);

            if (activitiesError) {
              console.error('Error fetching activities for staff:', staff.name, activitiesError);
            }

            // Fetch targets for the specific month and year
            const { data: targets, error: targetsError } = await supabase
              .from('monthlytargets')
              .select('service_id, target_value')
              .eq('staff_id', staff.staff_id)
              .eq('month', selectedMonth)
              .eq('year', year);

            if (targetsError) {
              console.error('Error fetching targets for staff:', staff.name, targetsError);
            }

            // Fetch staff leave for the month using date ranges
            const { data: staffLeave, error: leaveError } = await supabase
              .from('staff_leave')
              .select('start_date, end_date')
              .eq('staff_id', staff.staff_id)
              .or(`and(start_date.lte.${monthEndDate},end_date.gte.${monthStartDate})`);

            if (leaveError) {
              console.error('Error fetching leave for staff:', staff.name, leaveError);
            }

            const deliveredMap: Record<number, number> = {};
            activities?.forEach(d => {
              if (d.service_id) {
                deliveredMap[d.service_id] = (deliveredMap[d.service_id] || 0) + d.delivered_count;
              }
            });

            const targetsMap: Record<number, number> = {};
            targets?.forEach(t => {
              if (t.service_id) {
                targetsMap[t.service_id] = t.target_value;
              }
            });

            const staffServices: TeamData['services'] = {};
            let overallTotal = 0;
            let overallTarget = 0;

            services.forEach(service => {
              const delivered = deliveredMap[service.service_id] ?? 0;
              const target = targetsMap[service.service_id] ?? 0;
              const achievedPercent = target > 0 ? (delivered / target) * 100 : 0;

              let status: TeamData['services'][string]['status'] = 'no-data';
              if (delivered > 0 || target > 0) {
                if (achievedPercent >= 100) status = 'ahead';
                else if (achievedPercent >= 50) status = 'on-track';
                else status = 'behind';
              }

              staffServices[service.service_name] = {
                monthly_total: delivered,
                target,
                achieved_percent: achievedPercent,
                status,
              };

              overallTotal += delivered;
              overallTarget += target;
            });

            const overallPercent = overallTarget > 0 ? (overallTotal / overallTarget) * 100 : 0;
            let overallStatus: TeamData['overall_status'] = 'no-data';
            if (overallTotal > 0 || overallTarget > 0) {
              if (overallPercent >= 100) overallStatus = 'ahead';
              else if (overallPercent >= 50) overallStatus = 'on-track';
              else overallStatus = 'behind';
            }

            // Calculate leave days (only weekdays) from date ranges
            let leaveDays = 0;
            if (staffLeave) {
              staffLeave.forEach(leave => {
                const leaveStart = new Date(Math.max(new Date(leave.start_date).getTime(), new Date(monthStartDate).getTime()));
                const leaveEnd = new Date(Math.min(new Date(leave.end_date).getTime(), new Date(monthEndDate).getTime()));
                
                for (let d = new Date(leaveStart); d <= leaveEnd; d.setDate(d.getDate() + 1)) {
                  const dayOfWeek = d.getDay();
                  if (dayOfWeek !== 0 && dayOfWeek !== 6) { // Not weekend
                    leaveDays++;
                  }
                }
              });
            }

            return {
              staff_id: staff.staff_id,
              name: staff.name,
              services: staffServices,
              overall_total: overallTotal,
              overall_target: overallTarget,
              overall_status: overallStatus,
              leave_days: leaveDays,
              has_leave: leaveDays > 0,
            };
          });

          const processedData = await Promise.all(teamDataPromises);
          setTeamData(processedData);

          // Also fetch staff performance data for the detailed table
          const { startDate, endDate } = {
            startDate: new Date(selectedFinancialYear.start, 3, 1),
            endDate: new Date(selectedFinancialYear.end, 2, 31),
          };

          const { data: allActivities } = await supabase
            .from("dailyactivity")
            .select("staff_id, service_id, delivered_count, month, year, day, date")
            .eq("month", selectedMonth)
            .gte("date", startDate.toISOString().split("T")[0])
            .lte("date", endDate.toISOString().split("T")[0]);

          const performance: StaffPerformance[] = await Promise.all(
            allStaff.map(async (staff) => {
              const staffActivities = allActivities?.filter((a) => a.staff_id === staff.staff_id) || [];

              const staffActivityMap: Record<number, number> = {};
              staffActivities.forEach((activity) => {
                if (activity.service_id) {
                  staffActivityMap[activity.service_id] =
                    (staffActivityMap[activity.service_id] || 0) + activity.delivered_count;
                }
              });

              const serviceData: { [key: string]: number } = {};
              services.forEach((service) => {
                serviceData[service.service_name] = staffActivityMap[service.service_id] || 0;
              });

              const total = Object.values(serviceData).reduce((sum, val) => sum + val, 0);

              const { data: targetsData } = await supabase
                .from("monthlytargets")
                .select("target_value")
                .eq("staff_id", staff.staff_id)
                .eq("month", selectedMonth)
                .eq("year", year);

              const totalTarget = (targetsData || []).reduce(
                (sum, row) => sum + (row.target_value || 0),
                0
              );

              const achieved_percent = totalTarget > 0 ? (total / totalTarget) * 100 : 0;

              return {
                staff_id: staff.staff_id,
                name: staff.name,
                services: serviceData,
                total,
                target: totalTarget,
                achieved_percent,
                historicalAverage: 0,
                previousMonthRatio: 0,
              };
            })
          );

          const sortedPerformance = [...performance].sort((a, b) => {
            const perfA = a.target > 0 ? a.total / a.target : 0;
            const perfB = b.target > 0 ? b.total / b.target : 0;

            if (sortMode === "desc") return perfB - perfA;
            if (sortMode === "asc") return perfA - perfB;
            if (sortMode === "name") return a.name.localeCompare(b.name);
            return 0;
          });

          setStaffPerformance(sortedPerformance);
        } catch (err) {
          console.error('Error in fetchTeamData:', err);
          setError('Failed to connect to database');
          setTeamData([]);
          setStaffPerformance([]);
        } finally {
          setLoading(false);
        }
      };

      useEffect(() => {
        fetchTeamData();
      }, [selectedMonth, selectedFinancialYear, allStaff.length, services.length, sortMode]);

      useEffect(() => {
        const handler = () => fetchTeamData();
        window.addEventListener('activity-updated', handler);
        return () => window.removeEventListener('activity-updated', handler);
      }, [selectedMonth, selectedFinancialYear, allStaff.length, services.length, sortMode]);

      const getBgClass = (delivered: number, target: number) => {
        const ratio = target > 0 ? delivered / target : 0;
        if (ratio >= 1) return 'bg-green-100 text-green-800';
        if (ratio >= 0.75) return 'bg-orange-100 text-orange-800';
        return 'bg-red-100 text-red-800';
      };

      const getLeaveOverlayClass = (hasLeave: boolean) => {
        return hasLeave ? 'bg-gray-100 opacity-75' : '';
      };

      const getStatusColor = (achieved_percent: number) => {
        if (achieved_percent >= 100) return "text-green-600 dark:text-green-400";
        if (achieved_percent >= 75) return "text-brand-orange dark:text-orange-400";
        return "text-red-600 dark:text-red-400";
      };

      const getTrendArrow = (currentRatio: number, previousRatio?: number) => {
        if (!previousRatio) return <span className="text-gray-400">●</span>;
        if (currentRatio > previousRatio) return <span className="text-green-600">▲</span>;
        if (currentRatio < previousRatio) return <span className="text-red-600">▼</span>;
        return <span className="text-gray-400">●</span>;
      };

      const showWarning = authWarning || servicesWarning || !!error;

      return (
        <div>
          <h2 className="text-2xl lg:text-3xl font-bold text-gray-900 dark:text-white mb-6">
            Team View - {selectedFinancialYear.label}
          </h2>

          {showWarning && (
            <div className="mb-4 p-4 bg-yellow-50 border border-yellow-200 rounded-md">
              <p className="text-yellow-800">
                ⚠️ Some data may be unavailable due to connection issues. Showing available data with fallbacks.
              </p>
            </div>
          )}

          <div className="mt-6">
            {loading || authLoading || servicesLoading || workingDaysLoading ? (
              <div className="text-center py-4">Loading...</div>
            ) : teamData.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-gray-500">No team data available for the selected month in {selectedFinancialYear.label}.</p>
                <p className="text-sm text-gray-400 mt-2">Staff members need to enter daily activities and targets need to be set.</p>
              </div>
            ) : (
              <div className="bg-white shadow rounded-lg overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="min-w-full table-fixed divide-y divide-gray-200">
                    <thead className="table-header">
                      <tr className="text-sm">
                        <th className="px-2 py-1 text-left text-xs font-medium text-white uppercase tracking-wider w-[200px]">
                          Staff Member
                        </th>
                        {services.map(service => (
                          <th key={service.service_id} className="px-2 py-1 text-center whitespace-nowrap w-[150px] text-xs font-medium text-white uppercase tracking-wider">
                            {service.service_name}
                          </th>
                        ))}
                        <th className="w-[180px] text-center font-bold px-2 py-1 text-xs font-medium text-white uppercase tracking-wider">
                          Overall Total
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {teamData.map((staff) => (
                        <tr key={staff.staff_id} className={`text-sm table-row ${getLeaveOverlayClass(staff.has_leave)}`}>
                          <td className="px-2 py-1 whitespace-nowrap text-sm font-medium text-gray-900 relative">
                            <div className="flex items-center">
                              <span>{staff.name}</span>
                              {staff.has_leave && (
                                <div 
                                  className="ml-2 px-2 py-1 bg-gray-200 text-gray-700 text-xs rounded-full"
                                  title={`On leave ${staff.leave_days} day${staff.leave_days !== 1 ? 's' : ''} this month`}
                                >
                                  Leave: {staff.leave_days}d
                                </div>
                              )}
                            </div>
                          </td>
                          {services.map(service => {
                            const serviceData = staff.services[service.service_name];
                            const bgClass = getBgClass(serviceData.monthly_total, serviceData.target);
                            return (
                              <td key={service.service_id} className="px-2 py-1 text-center whitespace-nowrap w-[150px] text-sm text-gray-900">
                                <span
                                  className={`inline-flex justify-center items-center rounded px-2 py-0.5 text-sm ${bgClass}`}
                                  style={{ width: "70px" }}
                                >
                                  {serviceData.monthly_total}/{serviceData.target}
                                </span>
                              </td>
                            );
                          })}
                          <td className="w-[180px] text-center font-bold px-2 py-1 whitespace-nowrap text-sm text-gray-900">
                            <span
                              className={`inline-flex justify-center items-center rounded px-2 py-0.5 text-sm ${getBgClass(staff.overall_total, staff.overall_target)}`}
                              style={{ width: "70px" }}
                            >
                              {staff.overall_total}/{staff.overall_target}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          {/* Staff Performance Table - Moved from Dashboard */}
          {staffPerformance.length > 0 && (
            <div className="mt-8 animate-slide-up">
              <div className="bg-white dark:bg-gray-800 shadow-md rounded-xl border border-gray-200 dark:border-gray-700">
                <div className="px-6 py-6">
                  <div className="flex justify-between items-center mb-6">
                    <h3 className="text-lg font-bold text-brand-blue dark:text-white">
                      Staff Performance - {selectedFinancialYear.label}
                    </h3>
                    <div className="flex items-center gap-4">
                      <select
                        value={sortMode}
                        onChange={(e) => setSortMode(e.target.value as "desc" | "asc" | "name")}
                        className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                      >
                        <option value="desc">Performance High → Low</option>
                        <option value="asc">Performance Low → High</option>
                        <option value="name">Name A → Z</option>
                      </select>
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                      <thead className="table-header">
                        <tr className="text-sm">
                          <th className="w-1/6 px-2 py-1 text-left text-xs font-bold text-white uppercase tracking-wider">
                            Staff Member
                          </th>
                          {services.map((service) => (
                            <th
                              key={service.service_id}
                              className="w-1/6 px-2 py-1 text-center text-xs font-bold text-white uppercase tracking-wider"
                            >
                              {service.service_name}
                            </th>
                          ))}
                          <th className="w-1/6 px-2 py-1 text-center text-xs font-bold text-white uppercase tracking-wider">
                            Total
                          </th>
                          <th className="w-1/6 px-2 py-1 text-center text-xs font-bold text-white uppercase tracking-wider">
                            Target
                          </th>
                          <th className="w-1/6 px-2 py-1 text-center text-xs font-bold text-white uppercase tracking-wider">
                            Achievement
                          </th>
                          <th className="w-1/6 px-2 py-1 text-center text-xs font-bold text-white uppercase tracking-wider">
                            Trend
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                        {staffPerformance.map((staff, index) => {
                          const currentRatio = staff.target > 0 ? staff.total / staff.target : 0;
                          const statusColor = getStatusColor(staff.achieved_percent);

                          return (
                            <tr
                              key={staff.staff_id}
                              className={`text-sm transition-smooth table-row ${
                                index % 2 === 0
                                  ? "bg-white dark:bg-gray-800"
                                  : "bg-gray-50 dark:bg-gray-750"
                              }`}
                            >
                              <td className="px-2 py-1 whitespace-nowrap">
                                <div className="flex items-center">
                                  <div className="w-10 h-10 bg-brand-gradient rounded-full flex items-center justify-center mr-4">
                                    <span className="text-sm font-bold text-white">
                                      {staff.name
                                        .split(" ")
                                        .map((n) => n[0])
                                        .join("")
                                        .toUpperCase()}
                                    </span>
                                  </div>
                                  <div>
                                    <span className="text-sm font-bold text-gray-900 dark:text-white">
                                      {staff.name}
                                    </span>
                                  </div>
                                </div>
                              </td>
                              {services.map((service) => (
                                <td
                                  key={service.service_id}
                                  className="px-2 py-1 whitespace-nowrap text-sm text-center font-medium text-gray-900 dark:text-white"
                                >
                                  {staff.services[service.service_name] || 0}
                                </td>
                              ))}
                              <td className="px-2 py-1 whitespace-nowrap text-sm font-bold text-center text-brand-blue dark:text-blue-400">
                                {staff.total}
                              </td>
                              <td className="px-2 py-1 whitespace-nowrap text-sm text-center font-medium text-gray-900 dark:text-white">
                                {Math.round(staff.target)}
                              </td>
                              <td className="px-2 py-1 whitespace-nowrap text-sm text-center">
                                <span className={`font-bold ${statusColor}`}>
                                  {Math.round(staff.achieved_percent)}%
                                </span>
                              </td>
                              <td className="px-2 py-1 whitespace-nowrap text-sm text-center">
                                {getTrendArrow(currentRatio, staff.previousMonthRatio)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      );
    };