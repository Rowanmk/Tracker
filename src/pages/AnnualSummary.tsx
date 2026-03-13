import React, { useState, useEffect } from 'react';
import { useDate } from '../context/DateContext';
import { useAuth } from '../context/AuthContext';
import { useServices } from '../hooks/useServices';
import { useWorkingDays } from '../hooks/useWorkingDays';
import { supabase } from '../supabase/client';
import { getFinancialYearDateRange, getFinancialYearMonths } from '../utils/financialYear';

interface AnnualTeamData {
  team_id: number | 'unassigned';
  name: string;
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
  const { allStaff, teams } = useAuth();
  const { services } = useServices();
  const [annualData, setAnnualData] = useState<AnnualTeamData[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAnnualData = async () => {
    setLoading(true);
    const { startDate, endDate } = getFinancialYearDateRange(selectedFinancialYear);
    const monthData = getFinancialYearMonths();

    const results = await Promise.all(
      [...teams, { id: 'unassigned', name: 'Unassigned' }].map(async (team) => {
        const teamStaff = allStaff.filter(s => team.id === 'unassigned' ? !s.team_id : s.team_id === team.id);
        if (teamStaff.length === 0) return null;

        const { data: activities } = await supabase
          .from('dailyactivity')
          .select('month, service_id, delivered_count')
          .in('staff_id', teamStaff.map(s => s.staff_id))
          .gte('date', startDate.toISOString().slice(0, 10))
          .lte('date', endDate.toISOString().slice(0, 10));

        const months: AnnualTeamData['months'] = {};
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

        return {
          team_id: team.id as number | 'unassigned',
          name: team.name,
          months,
          totalDeliveries: Object.values(months).reduce((s, m) => s + m.total, 0)
        };
      })
    );

    setAnnualData(results.filter((r): r is AnnualTeamData => r !== null));
    setLoading(false);
  };

  useEffect(() => {
    fetchAnnualData();
  }, [selectedFinancialYear, allStaff.length, services.length]);

  if (loading) return <div className="py-6 text-center text-gray-500">Loading annual summary…</div>;

  const monthData = getFinancialYearMonths();

  return (
    <div>
      <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-6">Annual Team Summary</h2>
      <div className="overflow-x-auto bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead className="bg-gray-100 dark:bg-gray-700">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-bold uppercase">Team</th>
              {monthData.map(m => <th key={m.number} className="px-4 py-3 text-center text-xs font-bold uppercase">{m.name}</th>)}
              <th className="px-4 py-3 text-center text-xs font-bold uppercase">FY Total</th>
            </tr>
          </thead>
          <tbody>
            {annualData.map((team, idx) => (
              <tr key={team.team_id} className={idx % 2 === 0 ? 'bg-white dark:bg-gray-800' : 'bg-gray-50 dark:bg-gray-700'}>
                <td className="px-4 py-3 font-medium">{team.name}</td>
                {monthData.map(m => <td key={m.number} className="px-4 py-3 text-center">{team.months[m.number]?.total || 0}</td>)}
                <td className="px-4 py-3 font-bold text-center">{team.totalDeliveries}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};