import React, { useState, useEffect } from 'react';
import { useDate } from '../context/DateContext';
import { useAuth } from '../context/AuthContext';
import { useServices } from '../hooks/useServices';
import { supabase } from '../supabase/client';
import { getFinancialYearDateRange, getFinancialYearMonths } from '../utils/financialYear';

interface AnnualStaffData {
  staff_id: number;
  name: string;
  team_name: string;
  months: {
    [key: number]: {
      total: number;
      services: { [key: string]: number };
    };
  };
  totalDeliveries: number;
}

export const AnnualSummary: React.FC = () => {
  const { selectedFinancialYear } = useDate();
  const { allStaff, teams, selectedTeamId } = useAuth();
  const { services } = useServices();
  const [annualData, setAnnualData] = useState<AnnualStaffData[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAnnualData = async () => {
    setLoading(true);
    const { startDate, endDate } = getFinancialYearDateRange(selectedFinancialYear);
    const monthData = getFinancialYearMonths();

    const filteredStaff = selectedTeamId === "all" || !selectedTeamId
      ? allStaff.filter(s => !s.is_hidden)
      : allStaff.filter(s => !s.is_hidden && String(s.team_id) === selectedTeamId);

    if (filteredStaff.length === 0) {
      setAnnualData([]);
      setLoading(false);
      return;
    }

    const results = await Promise.all(
      filteredStaff.map(async (staff) => {
        const { data: activities } = await supabase
          .from('dailyactivity')
          .select('month, service_id, delivered_count')
          .eq('staff_id', staff.staff_id)
          .gte('date', startDate.toISOString().slice(0, 10))
          .lte('date', endDate.toISOString().slice(0, 10));

        const months: AnnualStaffData['months'] = {};
        monthData.forEach(m => {
          months[m.number] = { total: 0, services: {} };
          services.forEach(s => months[m.number].services[s.service_name] = 0);
        });

        activities?.forEach(a => {
          if (months[a.month]) {
            months[a.month].total += a.delivered_count;
            const svc = services.find(s => s.service_id === a.service_id);
            if (svc) months[a.month].services[svc.service_name] += a.delivered_count;
          }
        });

        const team = teams.find(t => t.id === staff.team_id);

        return {
          staff_id: staff.staff_id,
          name: staff.name,
          team_name: team?.name || 'Unassigned',
          months,
          totalDeliveries: Object.values(months).reduce((s, m) => s + m.total, 0)
        };
      })
    );

    setAnnualData(results.sort((a, b) => b.totalDeliveries - a.totalDeliveries));
    setLoading(false);
  };

  useEffect(() => {
    fetchAnnualData();
  }, [selectedFinancialYear, allStaff.length, services.length, selectedTeamId]);

  if (loading) return <div className="py-6 text-center text-gray-500">Loading annual summary…</div>;

  const monthData = getFinancialYearMonths();

  return (
    <div>
      <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-6">Annual Staff Summary</h2>
      <div className="overflow-x-auto bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead className="bg-gray-100 dark:bg-gray-700">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-bold uppercase">Staff</th>
              <th className="px-4 py-3 text-left text-xs font-bold uppercase">Team</th>
              {monthData.map(m => <th key={m.number} className="px-4 py-3 text-center text-xs font-bold uppercase">{m.name}</th>)}
              <th className="px-4 py-3 text-center text-xs font-bold uppercase">FY Total</th>
            </tr>
          </thead>
          <tbody>
            {annualData.map((staff, idx) => (
              <tr key={staff.staff_id} className={idx % 2 === 0 ? 'bg-white dark:bg-gray-800' : 'bg-gray-50 dark:bg-gray-700'}>
                <td className="px-4 py-3 font-medium">{staff.name}</td>
                <td className="px-4 py-3 text-sm text-gray-500">{staff.team_name}</td>
                {monthData.map(m => <td key={m.number} className="px-4 py-3 text-center">{staff.months[m.number]?.total || 0}</td>)}
                <td className="px-4 py-3 font-bold text-center">{staff.totalDeliveries}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};