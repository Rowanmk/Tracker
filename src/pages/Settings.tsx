import React, { useState, useEffect } from 'react';
import { useStaff } from '../hooks/useStaff';
import { useDate } from '../context/DateContext';
import { useBankHolidaySync } from '../hooks/useBankHolidaySync';
import { CalendarMonthYearSelector } from '../components/CalendarMonthYearSelector';
import { supabase } from '../supabase/client';
import type { Database } from '../supabase/types';

type Staff = Database['public']['Tables']['staff']['Row'];
type SADistributionRule = Database['public']['Tables']['sa_distribution_rules']['Row'];
type BankHoliday = Database['public']['Tables']['bank_holidays']['Row'];
type StaffLeave = Database['public']['Tables']['staff_leave']['Row'];

export const Settings: React.FC = () => {
  const [allUsers, setAllUsers] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newUserName, setNewUserName] = useState('');
  const [newUserRole, setNewUserRole] = useState<'admin' | 'staff'>('staff');
  const [newUserRegion, setNewUserRegion] = useState<'england-and-wales' | 'scotland' | 'northern-ireland'>('england-and-wales');
  const [isAddingUser, setIsAddingUser] = useState(false);
  const [editingUser, setEditingUser] = useState<Staff | null>(null);
  const [editForm, setEditForm] = useState({
    name: '',
    role: 'staff' as 'admin' | 'staff',
    home_region: 'england-and-wales' as 'england-and-wales' | 'scotland' | 'northern-ireland',
  });
  const [activeTab, setActiveTab] = useState<'users' | 'sa-distribution' | 'calendar'>('users');
  const [distributionRules, setDistributionRules] = useState<SADistributionRule[]>([]);
  const [editingRules, setEditingRules] = useState<SADistributionRule[]>([]);
  const [isEditingDistribution, setIsEditingDistribution] = useState(false);

  // Calendar tab state
  const [bankHolidays, setBankHolidays] = useState<BankHoliday[]>([]);
  const [staffLeave, setStaffLeave] = useState<StaffLeave[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [showHolidayModal, setShowHolidayModal] = useState(false);
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [holidayForm, setHolidayForm] = useState({
    title: '',
    region: 'england-and-wales' as 'england-and-wales' | 'scotland' | 'northern-ireland',
    notes: '',
    bunting: false,
  });
  const [leaveForm, setLeaveForm] = useState({
    staff_id: 0,
    type: 'Annual Leave',
    start_date: '',
    end_date: '',
    notes: '',
  });
  const [selectedRegionFilter, setSelectedRegionFilter] = useState<'all' | 'england-and-wales' | 'scotland' | 'northern-ireland'>('all');

  // Calendar navigation state
  const [calendarMonth, setCalendarMonth] = useState<number>(new Date().getMonth() + 1);
  const [calendarYear, setCalendarYear] = useState<number>(new Date().getFullYear());

  const { isAdmin, loading: staffLoading, error: staffError } = useStaff();
  const { selectedFinancialYear, setSelectedFinancialYear } = useDate();
  const { isSyncing: autoSyncing, error: syncError } = useBankHolidaySync();

  const defaultRules: Omit<SADistributionRule, 'id' | 'created_at' | 'updated_at'>[] = [
    { period_name: 'Period 1', months: [4, 5, 6, 7], percentage: 50 },
    { period_name: 'Period 2', months: [8, 9, 10, 11], percentage: 40 },
    { period_name: 'Period 3a', months: [12], percentage: 3.5 },
    { period_name: 'Period 3b', months: [1], percentage: 6.5 },
    { period_name: 'Period 4', months: [2, 3], percentage: 0 },
  ];

  const regionLabels = {
    'england-and-wales': 'England & Wales',
    'scotland': 'Scotland',
    'northern-ireland': 'Northern Ireland',
  };

  useEffect(() => {
    if (!isAdmin) {
      setLoading(false);
      return;
    }

    const fetchData = async () => {
      setLoading(true);
      setError(null);

      try {
        const [usersResult, rulesResult] = await Promise.all([
          supabase.from('staff').select('*').order('name'),
          supabase.from('sa_distribution_rules').select('*').order('id')
        ]);

        if (usersResult.error) {
          console.error('Error fetching users:', usersResult.error);
          setError('Failed to load users data');
          setAllUsers([]);
        } else {
          setAllUsers(usersResult.data || []);
        }

        if (rulesResult.error) {
          console.error('Error fetching SA distribution rules:', rulesResult.error);
          setDistributionRules(defaultRules.map((rule, index) => ({
            ...rule,
            id: index + 1,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })));
        } else if (rulesResult.data && rulesResult.data.length > 0) {
          setDistributionRules(rulesResult.data);
        } else {
          setDistributionRules(defaultRules.map((rule, index) => ({
            ...rule,
            id: index + 1,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })));
        }
      } catch (err) {
        console.error('Error in fetchData:', err);
        setError('Failed to connect to database');
        setAllUsers([]);
        setDistributionRules(defaultRules.map((rule, index) => ({
          ...rule,
          id: index + 1,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })));
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [isAdmin]);

  useEffect(() => {
    if (activeTab === 'calendar') {
      fetchCalendarData();
    }
  }, [activeTab, calendarMonth, calendarYear]);

  const fetchCalendarData = async () => {
    try {
      const startDate = `${calendarYear}-${calendarMonth.toString().padStart(2, '0')}-01`;
      const endDate = new Date(calendarYear, calendarMonth, 0).toISOString().split('T')[0];

      const [holidaysResult, leaveResult] = await Promise.all([
        supabase
          .from('bank_holidays')
          .select('*')
          .gte('date', startDate)
          .lte('date', endDate)
          .order('date'),
        supabase
          .from('staff_leave')
          .select(`
            *,
            staff (name)
          `)
          .or(`and(start_date.lte.${endDate},end_date.gte.${startDate})`)
          .order('start_date')
      ]);

      if (holidaysResult.error) {
        console.error('Error fetching holidays:', holidaysResult.error);
      } else {
        setBankHolidays(holidaysResult.data || []);
      }

      if (leaveResult.error) {
        console.error('Error fetching leave:', leaveResult.error);
      } else {
        setStaffLeave(leaveResult.data || []);
      }
    } catch (err) {
      console.error('Error fetching calendar data:', err);
    }
  };

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!newUserName.trim()) return;

    setIsAddingUser(true);
    setError(null);

    try {
      const { data, error: insertError } = await supabase
        .from('staff')
        .insert({
          name: newUserName.trim(),
          role: newUserRole,
          home_region: newUserRegion,
          is_hidden: false,
        })
        .select()
        .single();

      if (insertError) {
        console.error('Error adding user:', insertError);
        setError('Failed to add user');
      } else {
        setAllUsers(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
        setNewUserName('');
        setNewUserRole('staff');
        setNewUserRegion('england-and-wales');
      }
    } catch (err) {
      console.error('Error in handleAddUser:', err);
      setError('Failed to connect to database');
    } finally {
      setIsAddingUser(false);
    }
  };

  const handleToggleUserVisibility = async (userId: number, currentHiddenStatus: boolean) => {
    setError(null);

    try {
      const { error: updateError } = await supabase
        .from('staff')
        .update({ is_hidden: !currentHiddenStatus })
        .eq('staff_id', userId);

      if (updateError) {
        console.error('Error updating user visibility:', updateError);
        setError('Failed to update user visibility');
      } else {
        setAllUsers(prev => prev.map(user => 
          user.staff_id === userId 
            ? { ...user, is_hidden: !currentHiddenStatus }
            : user
        ));
      }
    } catch (err) {
      console.error('Error in handleToggleUserVisibility:', err);
      setError('Failed to connect to database');
    }
  };

  const handleEditUser = (user: Staff) => {
    setEditingUser(user);
    setEditForm({
      name: user.name,
      role: user.role as 'admin' | 'staff',
      home_region: (user.home_region as 'england-and-wales' | 'scotland' | 'northern-ireland') || 'england-and-wales',
    });
  };

  const handleSaveEdit = async () => {
    if (!editingUser || !editForm.name.trim()) return;

    setError(null);

    try {
      const { error: updateError } = await supabase
        .from('staff')
        .update({
          name: editForm.name.trim(),
          role: editForm.role,
          home_region: editForm.home_region,
        })
        .eq('staff_id', editingUser.staff_id);

      if (updateError) {
        console.error('Error updating user:', updateError);
        setError('Failed to update user');
      } else {
        setAllUsers(prev => prev.map(user => 
          user.staff_id === editingUser.staff_id 
            ? { ...user, name: editForm.name.trim(), role: editForm.role, home_region: editForm.home_region }
            : user
        ));
        setEditingUser(null);
        setEditForm({ name: '', role: 'staff', home_region: 'england-and-wales' });
      }
    } catch (err) {
      console.error('Error in handleSaveEdit:', err);
      setError('Failed to connect to database');
    }
  };

  const handleCancelEdit = () => {
    setEditingUser(null);
    setEditForm({ name: '', role: 'staff', home_region: 'england-and-wales' });
  };

  const handleEditDistribution = () => {
    setEditingRules([...distributionRules]);
    setIsEditingDistribution(true);
  };

  const handleSaveDistribution = async () => {
    const totalPercentage = editingRules.reduce((sum, rule) => sum + rule.percentage, 0);
    if (Math.abs(totalPercentage - 100) > 0.01) {
      setError('Total percentage must equal 100%');
      return;
    }

    const allMonths = editingRules.flatMap(rule => rule.months);
    const uniqueMonths = new Set(allMonths);
    if (uniqueMonths.size !== 12 || allMonths.length !== 12) {
      setError('All 12 months must appear exactly once');
      return;
    }

    for (let month = 1; month <= 12; month++) {
      if (!uniqueMonths.has(month)) {
        setError(`Month ${month} is missing from the configuration`);
        return;
      }
    }

    setError(null);

    try {
      await supabase.from('sa_distribution_rules').delete().neq('id', 0);

      const { error: insertError } = await supabase
        .from('sa_distribution_rules')
        .insert(editingRules.map(rule => ({
          period_name: rule.period_name,
          months: rule.months,
          percentage: rule.percentage,
        })));

      if (insertError) {
        console.error('Error saving distribution rules:', insertError);
        setError('Failed to save distribution rules');
      } else {
        setDistributionRules(editingRules);
        setIsEditingDistribution(false);
        window.dispatchEvent(new Event('sa-distribution-updated'));
      }
    } catch (err) {
      console.error('Error in handleSaveDistribution:', err);
      setError('Failed to connect to database');
    }
  };

  const handleCancelDistributionEdit = () => {
    setEditingRules([]);
    setIsEditingDistribution(false);
    setError(null);
  };

  const updateRulePercentage = (index: number, percentage: number) => {
    setEditingRules(prev => prev.map((rule, i) => 
      i === index ? { ...rule, percentage } : rule
    ));
  };

  const updateRuleMonths = (index: number, months: number[]) => {
    setEditingRules(prev => prev.map((rule, i) => 
      i === index ? { ...rule, months } : rule
    ));
  };

  const addNewRule = () => {
    const newRule: SADistributionRule = {
      id: Math.max(...editingRules.map(r => r.id)) + 1,
      period_name: `Period ${editingRules.length + 1}`,
      months: [],
      percentage: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    setEditingRules(prev => [...prev, newRule]);
  };

  const removeRule = (index: number) => {
    setEditingRules(prev => prev.filter((_, i) => i !== index));
  };

  const getMonthName = (month: number) => {
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return monthNames[month - 1];
  };

  const handleAddHoliday = async () => {
    if (!selectedDate || !holidayForm.title.trim()) return;

    try {
      const { error } = await supabase
        .from('bank_holidays')
        .insert({
          date: selectedDate,
          title: holidayForm.title.trim(),
          region: holidayForm.region,
          notes: holidayForm.notes.trim() || null,
          bunting: holidayForm.bunting,
          source: 'manual',
        });

      if (error) {
        console.error('Error adding holiday:', error);
        setError('Failed to add holiday');
      } else {
        setShowHolidayModal(false);
        setHolidayForm({ title: '', region: 'england-and-wales', notes: '', bunting: false });
        setSelectedDate(null);
        fetchCalendarData();
      }
    } catch (err) {
      console.error('Error in handleAddHoliday:', err);
      setError('Failed to connect to database');
    }
  };

  const handleAddLeave = async () => {
    if (!leaveForm.staff_id || !leaveForm.start_date || !leaveForm.end_date) return;

    if (new Date(leaveForm.end_date) < new Date(leaveForm.start_date)) {
      setError('End date must be on or after start date');
      return;
    }

    try {
      const { error } = await supabase
        .from('staff_leave')
        .insert({
          staff_id: leaveForm.staff_id,
          start_date: leaveForm.start_date,
          end_date: leaveForm.end_date,
          type: leaveForm.type,
          notes: leaveForm.notes.trim() || null,
        });

      if (error) {
        console.error('Error adding leave:', error);
        setError('Failed to add leave');
      } else {
        setShowLeaveModal(false);
        setLeaveForm({ staff_id: 0, type: 'Annual Leave', start_date: '', end_date: '', notes: '' });
        setSelectedDate(null);
        fetchCalendarData();
      }
    } catch (err) {
      console.error('Error in handleAddLeave:', err);
      setError('Failed to connect to database');
    }
  };

  const handleDeleteHoliday = async (id: number) => {
    try {
      const { error } = await supabase
        .from('bank_holidays')
        .delete()
        .eq('id', id);

      if (error) {
        console.error('Error deleting holiday:', error);
        setError('Failed to delete holiday');
      } else {
        fetchCalendarData();
      }
    } catch (err) {
      console.error('Error in handleDeleteHoliday:', err);
      setError('Failed to connect to database');
    }
  };

  const handleDeleteLeave = async (id: number) => {
    try {
      const { error } = await supabase
        .from('staff_leave')
        .delete()
        .eq('id', id);

      if (error) {
        console.error('Error deleting leave:', error);
        setError('Failed to delete leave');
      } else {
        fetchCalendarData();
      }
    } catch (err) {
      console.error('Error in handleDeleteLeave:', err);
      setError('Failed to connect to database');
    }
  };

  const renderCalendarGrid = () => {
    const daysInMonth = new Date(calendarYear, calendarMonth, 0).getDate();
    const firstDay = new Date(calendarYear, calendarMonth - 1, 1).getDay();
    
    const days = [];
    
    // Empty cells for days before the first day of the month
    for (let i = 0; i < firstDay; i++) {
      days.push(<div key={`empty-${i}`} className="h-24 border border-gray-200"></div>);
    }
    
    // Days of the month
    for (let day = 1; day <= daysInMonth; day++) {
      const date = `${calendarYear}-${calendarMonth.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
      const dayOfWeek = new Date(calendarYear, calendarMonth - 1, day).getDay();
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
      
      const dayHolidays = bankHolidays.filter(h => h.date === date);
      const dayLeave = staffLeave.filter(l => {
        const leaveStart = new Date(l.start_date);
        const leaveEnd = new Date(l.end_date);
        const currentDate = new Date(date);
        return currentDate >= leaveStart && currentDate <= leaveEnd;
      });
      
      days.push(
        <div
          key={day}
          className={`h-24 border border-gray-200 p-1 cursor-pointer hover:bg-gray-50 ${
            isWeekend ? 'bg-red-50' : 'bg-white'
          }`}
          onClick={() => setSelectedDate(date)}
        >
          <div className="font-medium text-sm">{day}</div>
          <div className="text-xs space-y-1">
            {dayHolidays.map(holiday => (
              <div key={holiday.id} className="bg-red-100 text-red-800 px-1 rounded text-xs">
                🔴 {holiday.title} ({regionLabels[holiday.region as keyof typeof regionLabels]})
              </div>
            ))}
            {dayLeave.map(leave => (
              <div key={leave.id} className="bg-green-100 text-green-800 px-1 rounded text-xs">
                🟢 {leave.staff?.name || 'Staff'}
              </div>
            ))}
          </div>
        </div>
      );
    }
    
    return days;
  };

  const filteredHolidays = selectedRegionFilter === 'all' 
    ? bankHolidays 
    : bankHolidays.filter(h => h.region === selectedRegionFilter);

  if (!isAdmin) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Settings access is restricted to administrators.</p>
      </div>
    );
  }

  const visibleUsers = allUsers.filter(user => !user.is_hidden);
  const hiddenUsers = allUsers.filter(user => user.is_hidden);

  return (
    <div className="px-4 sm:px-6 lg:px-8">
      <div className="sm:flex sm:items-center">
        <div className="sm:flex-auto">
          <h1 className="text-2xl font-semibold text-gray-900">Settings</h1>
          <p className="mt-2 text-sm text-gray-700">Manage users and system settings</p>
        </div>
      </div>

      {(staffError || error || syncError) && (
        <div className={`mb-4 p-4 border rounded-md ${
          error?.includes('Successfully') 
            ? 'bg-green-50 border-green-200 text-green-800' 
            : 'bg-red-50 border-red-200 text-red-800'
        }`}>
          <p>
            {error?.includes('Successfully') ? '✅' : '⚠️'} {error || staffError || syncError}
          </p>
        </div>
      )}

      {autoSyncing && (
        <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-md">
          <p className="text-blue-800">🔄 Automatically syncing bank holidays...</p>
        </div>
      )}

      <div className="mt-6">
        <div className="border-b border-gray-200">
          <nav className="-mb-px flex space-x-8">
            <button
              onClick={() => setActiveTab('users')}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'users'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Users / Staff
            </button>
            <button
              onClick={() => setActiveTab('sa-distribution')}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'sa-distribution'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Self Assessment Distribution
            </button>
            <button
              onClick={() => setActiveTab('calendar')}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'calendar'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Calendar & Working Days
            </button>
          </nav>
        </div>

        {activeTab === 'users' && (
          <>
            <div className="bg-white shadow rounded-lg mb-8 mt-6">
              <div className="px-4 py-5 sm:p-6">
                <h3 className="text-lg font-medium text-gray-900 mb-4">Add New User</h3>
                <form onSubmit={handleAddUser} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Name
                      </label>
                      <input
                        type="text"
                        value={newUserName}
                        onChange={(e) => setNewUserName(e.target.value)}
                        className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                        placeholder="Enter user name"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Role
                      </label>
                      <select
                        value={newUserRole}
                        onChange={(e) => setNewUserRole(e.target.value as 'admin' | 'staff')}
                        className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                      >
                        <option value="staff">Staff</option>
                        <option value="admin">Admin</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Home Region
                      </label>
                      <select
                        value={newUserRegion}
                        onChange={(e) => setNewUserRegion(e.target.value as 'england-and-wales' | 'scotland' | 'northern-ireland')}
                        className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                      >
                        <option value="england-and-wales">England & Wales</option>
                        <option value="scotland">Scotland</option>
                        <option value="northern-ireland">Northern Ireland</option>
                      </select>
                    </div>
                    <div className="flex items-end">
                      <button
                        type="submit"
                        disabled={isAddingUser || !newUserName.trim()}
                        className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isAddingUser ? 'Adding...' : 'Add User'}
                      </button>
                    </div>
                  </div>
                </form>
              </div>
            </div>

            <div className="bg-white shadow rounded-lg mb-8">
              <div className="px-4 py-5 sm:p-6">
                <h3 className="text-lg font-medium text-gray-900 mb-4">Active Users</h3>
                {loading || staffLoading ? (
                  <div className="text-center py-4">Loading...</div>
                ) : visibleUsers.length === 0 ? (
                  <div className="text-center py-8">
                    <p className="text-gray-500">No active users found.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Name
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Role
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Home Region
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Created
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Actions
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {visibleUsers.map((user) => (
                          <tr key={user.staff_id} className="hover:bg-gray-50 cursor-pointer" onClick={() => handleEditUser(user)}>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                              {user.name}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                              <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                                user.role === 'admin' ? 'bg-purple-100 text-purple-800' : 'bg-blue-100 text-blue-800'
                              }`}>
                                {user.role}
                              </span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                              {regionLabels[user.home_region as keyof typeof regionLabels] || 'England & Wales'}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              {user.created_at ? new Date(user.created_at).toLocaleDateString() : 'N/A'}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleToggleUserVisibility(user.staff_id, user.is_hidden || false);
                                }}
                                className="text-red-600 hover:text-red-900 mr-3"
                              >
                                Hide User
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleEditUser(user);
                                }}
                                className="text-blue-600 hover:text-blue-900"
                              >
                                Edit
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>

            {hiddenUsers.length > 0 && (
              <div className="bg-white shadow rounded-lg">
                <div className="px-4 py-5 sm:p-6">
                  <h3 className="text-lg font-medium text-gray-900 mb-4">Hidden Users</h3>
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Name
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Role
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Home Region
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Created
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Actions
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {hiddenUsers.map((user) => (
                          <tr key={user.staff_id} className="opacity-60">
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                              {user.name}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                              <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                                user.role === 'admin' ? 'bg-purple-100 text-purple-800' : 'bg-blue-100 text-blue-800'
                              }`}>
                                {user.role}
                              </span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                              {regionLabels[user.home_region as keyof typeof regionLabels] || 'England & Wales'}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              {user.created_at ? new Date(user.created_at).toLocaleDateString() : 'N/A'}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                              <button
                                onClick={() => handleToggleUserVisibility(user.staff_id, user.is_hidden || false)}
                                className="text-green-600 hover:text-green-900"
                              >
                                Show User
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {activeTab === 'sa-distribution' && (
          <div className="bg-white shadow rounded-lg mt-6">
            <div className="px-4 py-5 sm:p-6">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-lg font-medium text-gray-900">Self Assessment Distribution Settings</h3>
                {!isEditingDistribution && (
                  <button
                    onClick={handleEditDistribution}
                    className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    Edit Distribution
                  </button>
                )}
              </div>

              <div className="mb-4 p-4 bg-blue-50 rounded-lg">
                <p className="text-sm text-blue-800">
                  These rules determine how annual Self Assessment targets are automatically distributed across months.
                  Each month must appear exactly once, and percentages must total 100%.
                </p>
              </div>

              {loading ? (
                <div className="text-center py-4">Loading...</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Period Name
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Months Included
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          % of Annual Target
                        </th>
                        {isEditingDistribution && (
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Actions
                          </th>
                        )}
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {(isEditingDistribution ? editingRules : distributionRules).map((rule, index) => (
                        <tr key={rule.id}>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {isEditingDistribution ? (
                              <input
                                type="text"
                                value={rule.period_name}
                                onChange={(e) => setEditingRules(prev => prev.map((r, i) => 
                                  i === index ? { ...r, period_name: e.target.value } : r
                                ))}
                                className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                              />
                            ) : (
                              rule.period_name
                            )}
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-900">
                            {isEditingDistribution ? (
                              <div className="flex flex-wrap gap-1">
                                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(month => (
                                  <label key={month} className="inline-flex items-center">
                                    <input
                                      type="checkbox"
                                      checked={rule.months.includes(month)}
                                      onChange={(e) => {
                                        const newMonths = e.target.checked
                                          ? [...rule.months, month].sort((a, b) => a - b)
                                          : rule.months.filter(m => m !== month);
                                        updateRuleMonths(index, newMonths);
                                      }}
                                      className="form-checkbox h-4 w-4 text-blue-600"
                                    />
                                    <span className="ml-1 text-xs">{getMonthName(month)}</span>
                                  </label>
                                ))}
                              </div>
                            ) : (
                              rule.months.map(month => getMonthName(month)).join(', ')
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {isEditingDistribution ? (
                              <input
                                type="number"
                                step="0.1"
                                min="0"
                                max="100"
                                value={rule.percentage}
                                onChange={(e) => updateRulePercentage(index, parseFloat(e.target.value) || 0)}
                                className="block w-20 px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                              />
                            ) : (
                              `${rule.percentage}%`
                            )}
                          </td>
                          {isEditingDistribution && (
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                              <button
                                onClick={() => removeRule(index)}
                                className="text-red-600 hover:text-red-900"
                              >
                                Remove
                              </button>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {isEditingDistribution && (
                    <div className="mt-4 space-y-4">
                      <button
                        onClick={addNewRule}
                        className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500"
                      >
                        Add New Period
                      </button>

                      <div className="flex justify-between items-center pt-4 border-t">
                        <div className="text-sm text-gray-600">
                          Total: {editingRules.reduce((sum, rule) => sum + rule.percentage, 0).toFixed(1)}%
                        </div>
                        <div className="space-x-3">
                          <button
                            onClick={handleCancelDistributionEdit}
                            className="px-4 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-500"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={handleSaveDistribution}
                            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          >
                            Save Changes
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'calendar' && (
          <div className="mt-6 space-y-6">
            <div className="bg-white shadow rounded-lg">
              <div className="px-4 py-5 sm:p-6">
                <div className="flex justify-between items-center mb-6">
                  <h3 className="text-lg font-medium text-gray-900">
                    Calendar & Working Days
                  </h3>
                  <div className="flex gap-3">
                    <button
                      onClick={() => setShowHolidayModal(true)}
                      className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500"
                    >
                      Add Bank Holiday
                    </button>
                    <button
                      onClick={() => setShowLeaveModal(true)}
                      className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500"
                    >
                      Add Staff Leave
                    </button>
                  </div>
                </div>

                <CalendarMonthYearSelector
                  month={calendarMonth}
                  year={calendarYear}
                  financialYear={selectedFinancialYear}
                  onMonthChange={setCalendarMonth}
                  onYearChange={setCalendarYear}
                  onFinancialYearChange={setSelectedFinancialYear}
                />

                <div className="mb-4 p-4 bg-blue-50 rounded-lg">
                  <h4 className="font-medium text-blue-900 mb-2">Legend:</h4>
                  <div className="flex flex-wrap gap-4 text-sm">
                    <div className="flex items-center">
                      <div className="w-4 h-4 bg-white border border-gray-300 rounded mr-2"></div>
                      <span>🔵 Working day</span>
                    </div>
                    <div className="flex items-center">
                      <div className="w-4 h-4 bg-red-50 border border-red-200 rounded mr-2"></div>
                      <span>⚪ Weekend</span>
                    </div>
                    <div className="flex items-center">
                      <div className="w-4 h-4 bg-red-100 border border-red-300 rounded mr-2"></div>
                      <span>🔴 Bank holiday</span>
                    </div>
                    <div className="flex items-center">
                      <div className="w-4 h-4 bg-green-100 border border-green-300 rounded mr-2"></div>
                      <span>🟢 Staff leave</span>
                    </div>
                  </div>
                  <div className="mt-2 text-xs text-blue-800">
                    ℹ️ Bank holidays are automatically synced monthly from gov.uk
                  </div>
                </div>

                <div className="grid grid-cols-7 gap-1 mb-4">
                  {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                    <div key={day} className="p-2 text-center font-medium text-gray-700 bg-gray-100">
                      {day}
                    </div>
                  ))}
                  {renderCalendarGrid()}
                </div>
              </div>
            </div>

            <div className="bg-white shadow rounded-lg">
              <div className="px-4 py-5 sm:p-6">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg font-medium text-gray-900">UK Bank Holidays (By Region)</h3>
                  <select
                    value={selectedRegionFilter}
                    onChange={(e) => setSelectedRegionFilter(e.target.value as any)}
                    className="px-3 py-2 border border-gray-300 rounded-md shadow-sm bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="all">All Regions</option>
                    <option value="england-and-wales">England & Wales</option>
                    <option value="scotland">Scotland</option>
                    <option value="northern-ireland">Northern Ireland</option>
                  </select>
                </div>

                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Date
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Title
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Region
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Notes
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {filteredHolidays.map((holiday) => (
                        <tr key={holiday.id}>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {new Date(holiday.date).toLocaleDateString('en-GB', { 
                              day: '2-digit', 
                              month: 'short', 
                              year: '2-digit' 
                            })}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                            {holiday.title}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {regionLabels[holiday.region as keyof typeof regionLabels]}
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-900">
                            {holiday.notes && <span>{holiday.notes}</span>}
                            {holiday.bunting && <span className="ml-2">✔ bunting</span>}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            <button
                              onClick={() => handleDeleteHoliday(holiday.id)}
                              className="text-red-600 hover:text-red-900"
                            >
                              Delete
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {selectedDate && (
              <div className="bg-white shadow rounded-lg">
                <div className="px-4 py-5 sm:p-6">
                  <h3 className="text-lg font-medium text-gray-900 mb-4">
                    Events for {new Date(selectedDate).toLocaleDateString()}
                  </h3>
                  
                  <div className="space-y-4">
                    <div>
                      <h4 className="font-medium text-gray-900 mb-2">Bank Holidays</h4>
                      {bankHolidays.filter(h => h.date === selectedDate).length === 0 ? (
                        <p className="text-gray-500 text-sm">No bank holidays</p>
                      ) : (
                        <div className="space-y-2">
                          {bankHolidays.filter(h => h.date === selectedDate).map(holiday => (
                            <div key={holiday.id} className="flex justify-between items-center p-2 bg-red-50 rounded">
                              <div>
                                <span className="font-medium">{holiday.title}</span>
                                <span className="text-gray-500 ml-2">({regionLabels[holiday.region as keyof typeof regionLabels]})</span>
                                {holiday.source && (
                                  <span className="text-xs text-gray-500 ml-2">
                                    Source: {holiday.source}
                                  </span>
                                )}
                                {holiday.bunting && <span className="ml-2">✔ bunting</span>}
                                {holiday.notes && <span className="text-gray-500 ml-2">- {holiday.notes}</span>}
                              </div>
                              <button
                                onClick={() => handleDeleteHoliday(holiday.id)}
                                className="text-red-600 hover:text-red-900 text-sm"
                              >
                                Delete
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div>
                      <h4 className="font-medium text-gray-900 mb-2">Staff Leave</h4>
                      {staffLeave.filter(l => {
                        const leaveStart = new Date(l.start_date);
                        const leaveEnd = new Date(l.end_date);
                        const currentDate = new Date(selectedDate);
                        return currentDate >= leaveStart && currentDate <= leaveEnd;
                      }).length === 0 ? (
                        <p className="text-gray-500 text-sm">No staff leave</p>
                      ) : (
                        <div className="space-y-2">
                          {staffLeave.filter(l => {
                            const leaveStart = new Date(l.start_date);
                            const leaveEnd = new Date(l.end_date);
                            const currentDate = new Date(selectedDate);
                            return currentDate >= leaveStart && currentDate <= leaveEnd;
                          }).map(leave => (
                            <div key={leave.id} className="flex justify-between items-center p-2 bg-green-50 rounded">
                              <div>
                                <span className="font-medium">{leave.staff?.name}</span>
                                <span className="text-gray-500 ml-2">({leave.type})</span>
                                <span className="text-gray-500 ml-2">
                                  {leave.start_date} to {leave.end_date}
                                </span>
                                {leave.notes && <span className="text-gray-500 ml-2">- {leave.notes}</span>}
                              </div>
                              <button
                                onClick={() => handleDeleteLeave(leave.id)}
                                className="text-red-600 hover:text-red-900 text-sm"
                              >
                                Delete
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {editingUser && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
            <div className="mt-3">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Edit User</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Name
                  </label>
                  <input
                    type="text"
                    value={editForm.name}
                    onChange={(e) => setEditForm(prev => ({ ...prev, name: e.target.value }))}
                    className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Role
                  </label>
                  <select
                    value={editForm.role}
                    onChange={(e) => setEditForm(prev => ({ ...prev, role: e.target.value as 'admin' | 'staff' }))}
                    className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="staff">Staff</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Home Region
                  </label>
                  <select
                    value={editForm.home_region}
                    onChange={(e) => setEditForm(prev => ({ ...prev, home_region: e.target.value as 'england-and-wales' | 'scotland' | 'northern-ireland' }))}
                    className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="england-and-wales">England & Wales</option>
                    <option value="scotland">Scotland</option>
                    <option value="northern-ireland">Northern Ireland</option>
                  </select>
                </div>
              </div>
              <div className="flex justify-end space-x-3 mt-6">
                <button
                  onClick={handleCancelEdit}
                  className="px-4 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-500"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveEdit}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showHolidayModal && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
            <div className="mt-3">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Add Bank Holiday</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Date
                  </label>
                  <input
                    type="date"
                    value={selectedDate || ''}
                    onChange={(e) => setSelectedDate(e.target.value)}
                    className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Holiday Title
                  </label>
                  <input
                    type="text"
                    value={holidayForm.title}
                    onChange={(e) => setHolidayForm(prev => ({ ...prev, title: e.target.value }))}
                    className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    placeholder="e.g., Christmas Day"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Region
                  </label>
                  <select
                    value={holidayForm.region}
                    onChange={(e) => setHolidayForm(prev => ({ ...prev, region: e.target.value as any }))}
                    className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="england-and-wales">England & Wales</option>
                    <option value="scotland">Scotland</option>
                    <option value="northern-ireland">Northern Ireland</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Notes (optional)
                  </label>
                  <input
                    type="text"
                    value={holidayForm.notes}
                    onChange={(e) => setHolidayForm(prev => ({ ...prev, notes: e.target.value }))}
                    className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Additional notes"
                  />
                </div>
                <div>
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={holidayForm.bunting}
                      onChange={(e) => setHolidayForm(prev => ({ ...prev, bunting: e.target.checked }))}
                      className="form-checkbox h-4 w-4 text-blue-600"
                    />
                    <span className="ml-2 text-sm text-gray-700">Bunting day</span>
                  </label>
                </div>
              </div>
              <div className="flex justify-end space-x-3 mt-6">
                <button
                  onClick={() => {
                    setShowHolidayModal(false);
                    setHolidayForm({ title: '', region: 'england-and-wales', notes: '', bunting: false });
                    setSelectedDate(null);
                  }}
                  className="px-4 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-500"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddHoliday}
                  className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500"
                >
                  Add Holiday
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showLeaveModal && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
            <div className="mt-3">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Add Staff Leave</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Staff Member
                  </label>
                  <select
                    value={leaveForm.staff_id}
                    onChange={(e) => setLeaveForm(prev => ({ ...prev, staff_id: parseInt(e.target.value) }))}
                    className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value={0}>Select staff member</option>
                    {allUsers.filter(u => !u.is_hidden).map(user => (
                      <option key={user.staff_id} value={user.staff_id}>
                        {user.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Leave Type
                  </label>
                  <select
                    value={leaveForm.type}
                    onChange={(e) => setLeaveForm(prev => ({ ...prev, type: e.target.value }))}
                    className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="Annual Leave">Annual Leave</option>
                    <option value="Sick">Sick</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Start Date
                  </label>
                  <input
                    type="date"
                    value={leaveForm.start_date}
                    onChange={(e) => setLeaveForm(prev => ({ ...prev, start_date: e.target.value }))}
                    className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    End Date
                  </label>
                  <input
                    type="date"
                    value={leaveForm.end_date}
                    onChange={(e) => setLeaveForm(prev => ({ ...prev, end_date: e.target.value }))}
                    className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Notes (optional)
                  </label>
                  <textarea
                    value={leaveForm.notes}
                    onChange={(e) => setLeaveForm(prev => ({ ...prev, notes: e.target.value }))}
                    className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    rows={3}
                    placeholder="Additional notes..."
                  />
                </div>
              </div>
              <div className="flex justify-end space-x-3 mt-6">
                <button
                  onClick={() => {
                    setShowLeaveModal(false);
                    setLeaveForm({ staff_id: 0, type: 'Annual Leave', start_date: '', end_date: '', notes: '' });
                    setSelectedDate(null);
                  }}
                  className="px-4 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-500"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddLeave}
                  className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500"
                >
                  Add Leave
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};