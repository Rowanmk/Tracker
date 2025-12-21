import React, { useState, useEffect } from 'react';
import { useDate } from '../context/DateContext';
import { useAuth } from '../context/AuthContext';
import { useServices } from '../hooks/useServices';
import { supabase } from '../supabase/client';
import { getFinancialYearMonths } from '../utils/financialYear';
import { calculateAllSAMonths, getSADistributionRules, getSAPeriodBoundedActuals, isCurrentOrFutureMonth } from '../utils/saRedistribution';
import { unparse } from 'papaparse';
import type { Database } from '../supabase/types';

type SADistributionRule = Database['public']['Tables']['sa_distribution_rules']['Row'];

interface TargetData {
  staff_id: number;
  name: string;
  targets: {
    [key: number]: {
      [key: string]: number;
    };
  };
}

interface CSVRow {
  staff_id: number;
  staff_name: string;
  service_id: number;
  service_name: string;
  month: number;
  year: number;
  target_value: number;
}

export const TargetsControl: React.FC = () => {
  const { selectedMonth, selectedFinancialYear } = useDate();
  const [targetData, setTargetData] = useState<TargetData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const [distributionRules, setDistributionRules] = useState<SADistributionRule[]>([]);
  
  // Draft state for annual SA targets
  const [annualSATargetDrafts, setAnnualSATargetDrafts] = useState<Record<number, string>>({});
  const [committedAnnualSATargets, setCommittedAnnualSATargets] = useState<Record<number, number>>({});

  // SA monthly target overrides for current/future months
  const [saMonthlyOverrides, setSaMonthlyOverrides] = useState<Record<string, number>>({});
  const [saMonthlyDrafts, setSaMonthlyDrafts] = useState<Record<string, string>>({});

  const { allStaff, loading: authLoading, error: authError } = useAuth();
  const { services, loading: servicesLoading, error: servicesError } = useServices();

  const defaultRules: Omit<SADistributionRule, 'id' | 'created_at' | 'updated_at'>[] = [
    { period_name: 'Period 1', months: [4, 5, 6, 7], percentage: 50 },
    { period_name: 'Period 2', months: [8, 9, 10, 11], percentage: 40 },
    { period_name: 'Period 3a', months: [12], percentage: 3.5 },
    { period_name: 'Period 3b', months: [1], percentage: 6.5 },
    { period_name: 'Period 4', months: [2, 3], percentage: 0 },
  ];

  const getSAService = () => {
    return services.find(s => s.service_name.toLowerCase().includes('self assessment') || 
                               s.service_name.toLowerCase().includes('sa'));
  };

  const fetchDistributionRules = async () => {
    try {
      const { data, error } = await supabase
        .from('sa_distribution_rules')
        .select('*')
        .order('id');

      if (error) {
        console.error('Error fetching SA distribution rules:', error);
        return defaultRules.map((rule, index) => ({
          ...rule,
          id: index + 1,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }));
      }

      if (!data || data.length === 0) {
        return defaultRules.map((rule, index) => ({
          ...rule,
          id: index + 1,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }));
      }

      return data;
    } catch (err) {
      console.error('Error in fetchDistributionRules:', err);
      return defaultRules.map((rule, index) => ({
        ...rule,
        id: index + 1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }));
    }
  };

  // SINGLE OWNER: TargetsControl recalculates all SA months - NO LOCK BOUNDARY
  const recalculateAllSATargets = async (staffId: number, annualTarget: number, rules: SADistributionRule[]) => {
    const saService = getSAService();
    if (!saService) return;

    try {
      // Get period-bounded actuals for this staff member
      const actualsByPeriod = await getSAPeriodBoundedActuals(staffId, selectedFinancialYear);

      // Get current overrides for this staff
      const staffOverrides: Record<number, number> = {};
      Object.entries(saMonthlyOverrides).forEach(([key, value]) => {
        const [overrideStaffId, month] = key.split('-').map(Number);
        if (overrideStaffId === staffId && isCurrentOrFutureMonth(month, selectedFinancialYear)) {
          staffOverrides[month] = value;
        }
      });

      // Calculate all monthly targets using pure function - NO LOCK BOUNDARY
      const allSAMonths = calculateAllSAMonths({
        annualTarget,
        actualsByPeriod,
        overrides: staffOverrides,
        distributionRules: rules
      });

      // Update target data state with calculated months
      setTargetData(prev => prev.map(staff => 
        staff.staff_id === staffId
          ? {
              ...staff,
              targets: {
                ...staff.targets,
                ...Object.fromEntries(
                  Object.entries(allSAMonths).map(([month, target]) => [
                    parseInt(month),
                    {
                      ...staff.targets[parseInt(month)],
                      [saService.service_name]: target,
                    }
                  ])
                )
              },
            }
          : staff
      ));
    } catch (error) {
      console.error('Error recalculating SA targets:', error);
    }
  };

  const fetchTargets = async () => {
    if (allStaff.length === 0 || services.length === 0) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const rules = await fetchDistributionRules();
      setDistributionRules(rules);

      const targetDataPromises = allStaff.map(async (staff) => {
        const { data: targetsData, error: targetsError } = await supabase
          .from('monthlytargets')
          .select(`
            month,
            year,
            service_id,
            target_value,
            services (service_name)
          `)
          .eq('staff_id', staff.staff_id)
          .in('year', [selectedFinancialYear.start, selectedFinancialYear.end]);

        if (targetsError) {
          console.error('Error fetching targets for staff:', staff.name, targetsError);
        }

        const staffTargets: TargetData['targets'] = {};
        const monthData = getFinancialYearMonths();

        monthData.forEach(monthInfo => {
          staffTargets[monthInfo.number] = {};
          services.forEach(service => {
            staffTargets[monthInfo.number][service.service_name] = 0;
          });
        });

        // Only load non-SA targets from database
        const saService = getSAService();
        targetsData?.forEach(target => {
          if (target.services?.service_name && 
              (!saService || target.service_id !== saService.service_id)) {
            staffTargets[target.month][target.services.service_name] = target.target_value;
          }
        });

        return {
          staff_id: staff.staff_id,
          name: staff.name,
          targets: staffTargets,
        };
      });

      const processedData = await Promise.all(targetDataPromises);
      setTargetData(processedData);

      // Fetch committed annual SA targets
      const saService = getSAService();
      if (saService) {
        const { data: annualTargetsData } = await supabase
          .from('sa_annual_targets')
          .select('staff_id, annual_target')
          .in('staff_id', allStaff.map(s => s.staff_id))
          .eq('year', selectedFinancialYear.start);

        const committed: Record<number, number> = {};
        const drafts: Record<number, string> = {};

        for (const staff of allStaff) {
          const existingTarget = annualTargetsData?.find(t => t.staff_id === staff.staff_id);
          const annualTarget = existingTarget?.annual_target || 0;
          committed[staff.staff_id] = annualTarget;
          drafts[staff.staff_id] = annualTarget.toString();
        }

        setCommittedAnnualSATargets(committed);
        setAnnualSATargetDrafts(drafts);
      }
    } catch (err) {
      console.error('Error in fetchTargets:', err);
      setError('Failed to connect to database');
      setTargetData([]);
    } finally {
      setLoading(false);
    }
  };

  // Auto-recalculate SA targets on page load - NO LOCK BOUNDARY
  useEffect(() => {
    const autoRecalculateOnLoad = async () => {
      if (!loading && allStaff.length > 0 && services.length > 0 && distributionRules.length > 0) {
        const saService = getSAService();
        if (saService) {
          // Trigger recalculation for all staff with annual targets
          for (const staff of allStaff) {
            const annualTarget = committedAnnualSATargets[staff.staff_id] || 0;
            if (annualTarget > 0) {
              await recalculateAllSATargets(staff.staff_id, annualTarget, distributionRules);
            }
          }
        }
      }
    };

    autoRecalculateOnLoad();
  }, [loading, allStaff.length, services.length, distributionRules.length, committedAnnualSATargets]);

  useEffect(() => {
    fetchTargets();
  }, [selectedFinancialYear, allStaff.length, services.length]);

  useEffect(() => {
    const handler = () => fetchTargets();
    window.addEventListener('sa-distribution-updated', handler);
    return () => window.removeEventListener('sa-distribution-updated', handler);
  }, [selectedFinancialYear, allStaff.length, services.length]);

  const handleTargetChange = async (staffId: number, month: number, serviceName: string, value: number) => {
    const service = services.find(s => s.service_name === serviceName);
    if (!service) return;

    const saService = getSAService();
    if (saService && service.service_id === saService.service_id) {
      return; // SA targets are read-only for past months, handled separately for current/future
    }

    const targetYear = month >= 4 ? selectedFinancialYear.start : selectedFinancialYear.end;

    setTargetData(prev => prev.map(staff => 
      staff.staff_id === staffId
        ? {
            ...staff,
            targets: {
              ...staff.targets,
              [month]: {
                ...staff.targets[month],
                [serviceName]: value,
              },
            },
          }
        : staff
    ));

    try {
      const { error } = await supabase
        .from('monthlytargets')
        .upsert({
          staff_id: staffId,
          month,
          year: targetYear,
          service_id: service.service_id,
          target_value: value,
        }, {
          onConflict: "staff_id, service_id, month, year"
        });

      if (error) {
        console.error('Error updating target:', error);
        setError('Failed to save target');
      }
    } catch (err) {
      console.error('Error in handleTargetChange:', err);
      setError('Failed to connect to database');
    }
  };

  const handleSADraftChange = (staffId: number, value: string) => {
    setAnnualSATargetDrafts(prev => ({
      ...prev,
      [staffId]: value
    }));
  };

  // On annual target commit → recalculate all SA months - NO LOCK BOUNDARY
  const handleSACommit = async (staffId: number) => {
    const draftValue = annualSATargetDrafts[staffId] || '0';
    const numericValue = parseInt(draftValue) || 0;

    if (numericValue === committedAnnualSATargets[staffId]) {
      return; // No change
    }

    try {
      // Save annual target to sa_annual_targets table
      const { error: annualError } = await supabase
        .from('sa_annual_targets')
        .upsert({
          staff_id: staffId,
          year: selectedFinancialYear.start,
          annual_target: numericValue,
        }, {
          onConflict: "staff_id, year"
        });

      if (annualError) {
        console.error('Error updating annual SA target:', annualError);
        setError('Failed to save annual SA target');
        return;
      }

      // Update committed state
      setCommittedAnnualSATargets(prev => ({
        ...prev,
        [staffId]: numericValue
      }));

      // Immediately recalculate and update SA monthly targets - NO LOCK BOUNDARY
      await recalculateAllSATargets(staffId, numericValue, distributionRules);

      setImportMessage(`SA annual target updated successfully for staff ID ${staffId}.`);
      setTimeout(() => setImportMessage(null), 3000);

    } catch (err) {
      console.error('Error in handleSACommit:', err);
      setError('Failed to update SA annual target');
    }
  };

  const handleSAMonthlyDraftChange = (staffId: number, month: number, value: string) => {
    const key = `${staffId}-${month}`;
    setSaMonthlyDrafts(prev => ({
      ...prev,
      [key]: value
    }));
  };

  // On monthly override commit → recalculate all SA months - NO LOCK BOUNDARY
  const handleSAMonthlyCommit = async (staffId: number, month: number) => {
    const key = `${staffId}-${month}`;
    const draftValue = saMonthlyDrafts[key] || '0';
    let numericValue = parseInt(draftValue) || 0;

    // Enforce Feb/Mar always zero
    if (month === 2 || month === 3) {
      numericValue = 0;
    }

    // Update override
    setSaMonthlyOverrides(prev => ({
      ...prev,
      [key]: numericValue
    }));

    const annualTarget = committedAnnualSATargets[staffId] || 0;
    if (annualTarget > 0) {
      // Recalculate all SA months with new override - NO LOCK BOUNDARY
      await recalculateAllSATargets(staffId, annualTarget, distributionRules);
    }
  };

  const exportTargetsToCSV = async () => {
    try {
      const { data: targetsData, error } = await supabase
        .from('monthlytargets')
        .select(`
          staff_id,
          service_id,
          month,
          year,
          target_value,
          staff (name),
          services (service_name)
        `)
        .in('year', [selectedFinancialYear.start, selectedFinancialYear.end]);

      if (error) {
        console.error('Error fetching targets for export:', error);
        setError('Failed to export targets');
        return;
      }

      const csvData: CSVRow[] = (targetsData || []).map(target => ({
        staff_id: target.staff_id || 0,
        staff_name: target.staff?.name || '',
        service_id: target.service_id || 0,
        service_name: target.services?.service_name || '',
        month: target.month,
        year: target.year,
        target_value: target.target_value,
      }));

      const csv = unparse(csvData, {
        columns: ['staff_id', 'staff_name', 'service_id', 'service_name', 'month', 'year', 'target_value']
      });

      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', `crewtracker_targets_FY_${selectedFinancialYear.start}_${selectedFinancialYear.end}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error('Error in exportTargetsToCSV:', err);
      setError('Failed to export targets');
    }
  };

  const downloadTemplateCSV = () => {
    const monthData = getFinancialYearMonths();
    const templateData: CSVRow[] = [];

    allStaff.forEach(staff => {
      services.forEach(service => {
        monthData.forEach(monthInfo => {
          const year = monthInfo.number >= 4 ? selectedFinancialYear.start : selectedFinancialYear.end;
          templateData.push({
            staff_id: staff.staff_id,
            staff_name: staff.name,
            service_id: service.service_id,
            service_name: service.service_name,
            month: monthInfo.number,
            year: year,
            target_value: 0,
          });
        });
      });
    });

    const csv = unparse(templateData, {
      columns: ['staff_id', 'staff_name', 'service_id', 'service_name', 'month', 'year', 'target_value']
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `crewtracker_targets_template_FY_${selectedFinancialYear.start}_${selectedFinancialYear.end}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const importTargetsFromCSV = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const csv = e.target?.result as string;
        const lines = csv.split('\n');
        const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
        
        const requiredColumns = ['staff_id', 'service_id', 'month', 'year', 'target_value'];
        const missingColumns = requiredColumns.filter(col => !headers.includes(col));
        
        if (missingColumns.length > 0) {
          setError(`Missing required columns: ${missingColumns.join(', ')}`);
          return;
        }

        const parsedRows: any[] = [];
        for (let i = 1; i < lines.length; i++) {
          const line = lines[i].trim();
          if (!line) continue;
          
          const values = line.split(',').map(v => v.trim().replace(/"/g, ''));
          const row: any = {};
          
          headers.forEach((header, index) => {
            row[header] = values[index];
          });

          const staffId = parseInt(row.staff_id);
          const serviceId = parseInt(row.service_id);
          const month = parseInt(row.month);
          const year = parseInt(row.year);
          const targetValue = parseInt(row.target_value);

          if (isNaN(staffId) || isNaN(serviceId) || isNaN(month) || isNaN(year) || isNaN(targetValue)) {
            setError(`Invalid data in row ${i + 1}: non-numeric values found`);
            return;
          }

          if (!allStaff.find(s => s.staff_id === staffId)) {
            setError(`Invalid staff_id ${staffId} in row ${i + 1}`);
            return;
          }

          if (!services.find(s => s.service_id === serviceId)) {
            setError(`Invalid service_id ${serviceId} in row ${i + 1}`);
            return;
          }

          parsedRows.push({
            staff_id: staffId,
            service_id: serviceId,
            month: month,
            year: year,
            target_value: targetValue,
          });
        }

        const { error: upsertError } = await supabase
          .from('monthlytargets')
          .upsert(parsedRows, {
            onConflict: 'staff_id, service_id, month, year'
          });

        if (upsertError) {
          console.error('Error importing targets:', upsertError);
          setError('Failed to import targets');
        } else {
          setImportMessage(`Targets imported successfully for FY ${selectedFinancialYear.start}/${selectedFinancialYear.end}.`);
          fetchTargets();
          setTimeout(() => setImportMessage(null), 5000);
        }
      } catch (err) {
        console.error('Error parsing CSV:', err);
        setError('Failed to parse CSV file');
      }
    };

    reader.readAsText(file);
    event.target.value = '';
  };

  const monthData = getFinancialYearMonths();
  const saService = getSAService();

  const getStaffTotalForService = (staff: TargetData, serviceName: string) => {
    const saService = getSAService();
    const isSAService = saService && serviceName === saService.service_name;
    
    if (isSAService) {
      return committedAnnualSATargets[staff.staff_id] || 0;
    }
    
    return Object.values(staff.targets).reduce(
      (sum, monthTargets) => sum + monthTargets[serviceName], 0
    );
  };

  const getServiceYearlyTotal = (serviceName: string) => {
    return targetData.reduce((sum, staff) => 
      sum + getStaffTotalForService(staff, serviceName), 0
    );
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl lg:text-3xl font-bold text-gray-900 dark:text-white">
          Targets Control
        </h2>
        
        <div className="flex gap-3">
          <button
            onClick={exportTargetsToCSV}
            className="btn-primary"
          >
            Export CSV
          </button>
          
          <label className="btn-primary cursor-pointer">
            Import CSV
            <input
              type="file"
              accept=".csv"
              onChange={importTargetsFromCSV}
              className="hidden"
            />
          </label>
          
          <button
            onClick={downloadTemplateCSV}
            className="btn-primary"
          >
            Download Template
          </button>
        </div>
      </div>

      {(authError || servicesError || error) && (
        <div className="mb-4 p-4 bg-yellow-50 border border-yellow-200 rounded-md">
          <p className="text-yellow-800">
            ⚠️ Some data may be unavailable due to connection issues. {error && `Error: ${error}`}
          </p>
        </div>
      )}

      {importMessage && (
        <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-md">
          <p className="text-green-800">✅ {importMessage}</p>
        </div>
      )}

      <div className="mt-6">
        {loading || authLoading || servicesLoading ? (
          <div className="text-center py-4">Loading...</div>
        ) : targetData.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-gray-500">No target data available for {selectedFinancialYear.label}.</p>
            <p className="text-sm text-gray-400 mt-2">Staff and services need to be set up first.</p>
          </div>
        ) : (
          <div className="space-y-8">
            {targetData.map(staff => {
              return (
                <div key={staff.staff_id} className="bg-white shadow rounded-lg overflow-hidden">
                  <div className="px-4 py-5 sm:p-6">
                    <div className="flex justify-between items-center mb-4">
                      <h3 className="text-lg font-medium text-gray-900">
                        {staff.name} - Targets ({selectedFinancialYear.label})
                      </h3>
                    </div>
                    
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="text-center font-medium px-2 py-1 text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Service
                            </th>
                            {monthData.map((monthInfo) => (
                              <th key={monthInfo.number} className="text-center px-2 py-1 text-xs font-medium text-gray-500 uppercase tracking-wider">
                                {monthInfo.name}
                              </th>
                            ))}
                            <th className="text-center px-2 py-1 text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Staff Total
                            </th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {services.map((service) => {
                            const isSAService = saService && service.service_id === saService.service_id;
                            const staffTotal = getStaffTotalForService(staff, service.service_name);
                            
                            return (
                              <tr key={service.service_id} className="text-sm">
                                <td className="text-center font-medium px-2 py-1 whitespace-nowrap text-sm font-medium text-gray-900">
                                  {service.service_name}
                                  {isSAService && (
                                    <div className="text-xs text-blue-600 font-normal">
                                      (Auto-calculated)
                                    </div>
                                  )}
                                </td>
                                {monthData.map((monthInfo) => {
                                  const currentTarget = staff.targets[monthInfo.number][service.service_name];
                                  const isEditable = isSAService && isCurrentOrFutureMonth(monthInfo.number, selectedFinancialYear);
                                  const draftKey = `${staff.staff_id}-${monthInfo.number}`;
                                  const isFebMar = monthInfo.number === 2 || monthInfo.number === 3;
                                  
                                  return (
                                    <td key={monthInfo.number} className="text-center px-2 py-1 whitespace-nowrap">
                                      {isSAService ? (
                                        isEditable && !isFebMar ? (
                                          <input
                                            type="number"
                                            min="0"
                                            value={saMonthlyDrafts[draftKey] || currentTarget.toString()}
                                            onChange={(e) => handleSAMonthlyDraftChange(staff.staff_id, monthInfo.number, e.target.value)}
                                            onBlur={() => handleSAMonthlyCommit(staff.staff_id, monthInfo.number)}
                                            onKeyDown={(e) => {
                                              if (e.key === 'Enter') {
                                                handleSAMonthlyCommit(staff.staff_id, monthInfo.number);
                                              }
                                            }}
                                            className="text-center w-16 px-2 py-1 text-sm border border-green-300 rounded bg-green-50 focus:outline-none focus:ring-1 focus:ring-green-500 focus:border-green-500 font-medium text-green-800"
                                            title="Editable SA monthly target - future months will auto-adjust"
                                          />
                                        ) : (
                                          <div className={`text-center px-2 py-1 text-sm rounded font-medium ${
                                            isFebMar 
                                              ? 'bg-red-50 text-red-800' 
                                              : 'bg-blue-50 text-blue-800'
                                          }`}>
                                            {currentTarget}
                                            {isFebMar && (
                                              <div className="text-xs text-red-600">Always 0</div>
                                            )}
                                          </div>
                                        )
                                      ) : (
                                        <input
                                          type="number"
                                          min="0"
                                          value={currentTarget}
                                          onChange={(e) => handleTargetChange(staff.staff_id, monthInfo.number, service.service_name, parseInt(e.target.value) || 0)}
                                          className="text-center w-16 px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                                        />
                                      )}
                                    </td>
                                  );
                                })}
                                <td className="text-center px-2 py-1 whitespace-nowrap text-sm font-bold text-blue-600">
                                  {isSAService ? (
                                    <div className="flex items-center justify-center space-x-2">
                                      <input
                                        type="number"
                                        min="0"
                                        value={annualSATargetDrafts[staff.staff_id] || '0'}
                                        onChange={(e) => handleSADraftChange(staff.staff_id, e.target.value)}
                                        onBlur={() => handleSACommit(staff.staff_id)}
                                        onKeyDown={(e) => {
                                          if (e.key === 'Enter') {
                                            handleSACommit(staff.staff_id);
                                          }
                                        }}
                                        className="text-center w-20 px-2 py-1 text-sm border border-blue-300 rounded bg-blue-50 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 font-bold text-blue-600"
                                        title="Annual SA target - monthly values are automatically calculated based on % splits and actual deliveries"
                                      />
                                    </div>
                                  ) : (
                                    staffTotal
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                          <tr className="bg-blue-50 font-bold">
                            <td className="text-center px-2 py-1 whitespace-nowrap text-sm font-bold text-gray-900">
                              Total for {staff.name}
                            </td>
                            {monthData.map((monthInfo) => {
                              const monthTotal = services.reduce((sum, service) => 
                                sum + staff.targets[monthInfo.number][service.service_name], 0
                              );
                              return (
                                <td key={monthInfo.number} className="text-center px-2 py-1 text-sm font-bold text-blue-600">
                                  {monthTotal}
                                </td>
                              );
                            })}
                            <td className="text-center px-2 py-1 whitespace-nowrap text-sm font-bold text-blue-600">
                              {services.reduce((sum, service) => {
                                return sum + getStaffTotalForService(staff, service.service_name);
                              }, 0)}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              );
            })}

            <div className="bg-white shadow rounded-lg overflow-hidden">
              <div className="px-4 py-5 sm:p-6">
                <h3 className="text-lg font-medium text-gray-900 mb-4">Per-Service Yearly Totals ({selectedFinancialYear.label})</h3>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {services.map(service => (
                    <div key={service.service_id} className="text-center p-4 bg-gray-50 rounded-lg">
                      <div className="text-2xl font-bold text-blue-600">{getServiceYearlyTotal(service.service_name)}</div>
                      <div className="text-sm text-gray-600">{service.service_name}</div>
                    </div>
                  ))}
                  <div className="text-center p-4 bg-blue-100 rounded-lg">
                    <div className="text-2xl font-bold text-blue-800">
                      {services.reduce((sum, service) => sum + getServiceYearlyTotal(service.service_name), 0)}
                    </div>
                    <div className="text-sm text-blue-700">Full Year Total</div>
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