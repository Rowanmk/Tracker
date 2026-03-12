import React, { useState, useEffect } from 'react';
import { useStaff } from '../hooks/useStaff';
import { useDate } from '../context/DateContext';
import { useBankHolidaySync } from '../hooks/useBankHolidaySync';
import { CalendarMonthYearSelector } from '../components/CalendarMonthYearSelector';
import { supabase } from '../supabase/client';
import type { Database } from '../supabase/types';

type Staff = Database['public']['Tables']['staff']['Row'];
type BankHoliday = Database['public']['Tables']['bank_holidays']['Row'];
type StaffLeave = Database['public']['Tables']['staff_leave']['Row'];
type Permission = Database['public']['Tables']['role_permissions']['Row'];

type StaffLeaveWithStaff = StaffLeave & {
  staff?: {
    name: string;
  };
};

export const Settings: React.FC = () => {
  const [allUsers, setAllUsers] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newUserName, setNewUserName] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserRole, setNewUserRole] = useState<'admin' | 'staff'>('staff');
  const [newUserRegion, setNewUserRegion] = useState<
    'england-and-wales' | 'scotland' | 'northern-ireland'
  >('england-and-wales');
  const [isAddingUser, setIsAddingUser] = useState(false);
  const [editingUser, setEditingUser] = useState<Staff | null>(null);
  const [editForm, setEditForm] = useState({
    name: '',
    password: '',
    role: 'staff' as 'admin' | 'staff',
    home_region: 'england-and-wales' as
      | 'england-and-wales'
      | 'scotland'
      | 'northern-ireland',
  });
  const [activeTab, setActiveTab] = useState<'users' | 'calendar' | 'permissions'>('users');

  // Permissions tab state
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [isSavingPermissions, setIsSavingPermissions] = useState(false);

  const pages = [
    { path: "/", label: "Dashboard" },
    { path: "/tracker", label: "My Tracker" },
    { path: "/sa-progress", label: "Self Assessment Progress" },
    { path: "/team", label: "Team View" },
    { path: "/annual", label: "Annual Summary" },
    { path: "/targets", label: "Targets Control" },
    { path: "/settings", label: "Settings" },
  ];

  // Calendar tab state
  const [bankHolidays, setBankHolidays] = useState<BankHoliday[]>([]);
  const [staffLeave, setStaffLeave] = useState<StaffLeaveWithStaff[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [showHolidayModal, setShowHolidayModal] = useState(false);
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [holidayForm, setHolidayForm] = useState({
    title: '',
    region: 'england-and-wales' as
      | 'england-and-wales'
      | 'scotland'
      | 'northern-ireland',
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
  const [selectedRegionFilter, setSelectedRegionFilter] = useState<
    'all' | 'england-and-wales' | 'scotland' | 'northern-ireland'
  >('all');

  const [calendarMonth, setCalendarMonth] = useState<number>(new Date().getMonth() + 1);
  const [calendarYear, setCalendarYear] = useState<number>(new Date().getFullYear());

  const { isAdmin, loading: staffLoading, error: staffError } = useStaff();
  const { selectedFinancialYear, setSelectedFinancialYear } = useDate();
  const { isSyncing: autoSyncing, error: syncError } = useBankHolidaySync();

  const regionLabels = {
    'england-and-wales': 'England & Wales',
    scotland: 'Scotland',
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
        const [usersResult, permsResult] = await Promise.all([
          supabase.from('staff').select('*').order('name'),
          supabase.from('role_permissions').select('*')
        ]);

        if (usersResult.error) setError('Failed to load users data');
        else setAllUsers(usersResult.data || []);

        if (permsResult.error) console.error('Error fetching permissions:', permsResult.error);
        else setPermissions(permsResult.data || []);
      } catch (err) {
        setError('Failed to connect to database');
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
          .select('*, staff:staff_id (name)')
          .or(`and(start_date.lte.${endDate},end_date.gte.${startDate})`)
          .order('start_date'),
      ]);

      if (!holidaysResult.error) setBankHolidays(holidaysResult.data || []);
      if (!leaveResult.error) setStaffLeave((leaveResult.data as StaffLeaveWithStaff[]) || []);
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
          password: newUserPassword.trim() || null,
          role: newUserRole,
          home_region: newUserRegion,
          is_hidden: false,
        })
        .select()
        .single();

      if (insertError) setError('Failed to add user');
      else {
        setAllUsers(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
        setNewUserName('');
        setNewUserPassword('');
        setNewUserRole('staff');
      }
    } catch (err) {
      setError('Failed to connect to database');
    } finally {
      setIsAddingUser(false);
    }
  };

  const handleEditUser = (user: Staff) => {
    setEditingUser(user);
    setEditForm({
      name: user.name,
      password: user.password || '',
      role: user.role as 'admin' | 'staff',
      home_region: (user.home_region as any) || 'england-and-wales',
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
          password: editForm.password.trim() || null,
          role: editForm.role,
          home_region: editForm.home_region,
        })
        .eq('staff_id', editingUser.staff_id);

      if (updateError) setError('Failed to update user');
      else {
        setAllUsers(prev =>
          prev.map(user =>
            user.staff_id === editingUser.staff_id
              ? { ...user, ...editForm }
              : user
          )
        );
        setEditingUser(null);
      }
    } catch (err) {
      setError('Failed to connect to database');
    }
  };

  const togglePermission = (role: string, path: string) => {
    const existing = permissions.find(p => p.role === role && p.page_path === path);
    if (existing) {
      setPermissions(prev => prev.map(p => 
        (p.role === role && p.page_path === path) ? { ...p, is_visible: !p.is_visible } : p
      ));
    } else {
      setPermissions(prev => [...prev, { role, page_path: path, is_visible: false } as Permission]);
    }
  };

  const savePermissions = async () => {
    setIsSavingPermissions(true);
    try {
      const { error: upsertError } = await supabase
        .from('role_permissions')
        .upsert(permissions.map(p => ({
          role: p.role,
          page_path: p.page_path,
          is_visible: p.is_visible
        })), { onConflict: 'role,page_path' });

      if (upsertError) setError('Failed to save permissions');
      else setError('Successfully saved permissions');
    } catch (err) {
      setError('Failed to connect to database');
    } finally {
      setIsSavingPermissions(false);
      setTimeout(() => setError(null), 3000);
    }
  };

  const renderCalendarGrid = () => {
    const daysInMonth = new Date(calendarYear, calendarMonth, 0).getDate();
    const firstDay = new Date(calendarYear, calendarMonth - 1, 1).getDay();
    const days = [];
    for (let i = 0; i < firstDay; i++) days.push(<div key={`empty-${i}`} className="h-24 border border-gray-200"></div>);
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
        <div key={day} className={`h-24 border border-gray-200 p-1 cursor-pointer hover:bg-gray-50 ${isWeekend ? 'bg-red-50' : 'bg-white'}`} onClick={() => setSelectedDate(date)}>
          <div className="font-medium text-sm">{day}</div>
          <div className="text-xs space-y-1">
            {dayHolidays.map(h => <div key={h.id} className="bg-red-100 text-red-800 px-1 rounded text-xs">🔴 {h.title}</div>)}
            {dayLeave.map(l => <div key={l.id} className="bg-green-100 text-green-800 px-1 rounded text-xs">🟢 {l.staff?.name}</div>)}
          </div>
        </div>
      );
    }
    return days;
  };

  if (!isAdmin) return <div className="text-center py-12 text-gray-500">Settings access restricted to admins.</div>;

  return (
    <div className="px-4 sm:px-6 lg:px-8">
      <div className="sm:flex sm:items-center">
        <div className="sm:flex-auto">
          <h1 className="text-2xl font-semibold text-gray-900">Settings</h1>
          <p className="mt-2 text-sm text-gray-700">Manage users, permissions, and system settings</p>
        </div>
      </div>

      {error && (
        <div className={`mt-4 p-4 border rounded-md ${error.includes('Successfully') ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-800'}`}>
          <p>{error}</p>
        </div>
      )}

      <div className="mt-6">
        <div className="border-b border-gray-200">
          <nav className="-mb-px flex space-x-8">
            {['users', 'calendar', 'permissions'].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab as any)}
                className={`py-2 px-1 border-b-2 font-medium text-sm capitalize ${
                  activeTab === tab ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                {tab}
              </button>
            ))}
          </nav>
        </div>

        {activeTab === 'users' && (
          <div className="mt-6 space-y-6">
            <div className="bg-white shadow rounded-lg p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Add New User</h3>
              <form onSubmit={handleAddUser} className="grid grid-cols-1 md:grid-cols-5 gap-4">
                <input type="text" value={newUserName} onChange={e => setNewUserName(e.target.value)} className="px-3 py-2 border rounded-md" placeholder="Name" required />
                <input type="password" value={newUserPassword} onChange={e => setNewUserPassword(e.target.value)} className="px-3 py-2 border rounded-md" placeholder="Password (optional)" />
                <select value={newUserRole} onChange={e => setNewUserRole(e.target.value as any)} className="px-3 py-2 border rounded-md">
                  <option value="staff">Staff</option>
                  <option value="admin">Admin</option>
                </select>
                <select value={newUserRegion} onChange={e => setNewUserRegion(e.target.value as any)} className="px-3 py-2 border rounded-md">
                  <option value="england-and-wales">England & Wales</option>
                  <option value="scotland">Scotland</option>
                  <option value="northern-ireland">Northern Ireland</option>
                </select>
                <button type="submit" disabled={isAddingUser} className="bg-blue-600 text-white rounded-md px-4 py-2 hover:bg-blue-700 disabled:opacity-50">
                  {isAddingUser ? 'Adding...' : 'Add User'}
                </button>
              </form>
            </div>

            <div className="bg-white shadow rounded-lg p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Active Users</h3>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Role</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Region</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {allUsers.filter(u => !u.is_hidden).map(user => (
                      <tr key={user.staff_id}>
                        <td className="px-6 py-4 text-sm font-medium text-gray-900">{user.name}</td>
                        <td className="px-6 py-4 text-sm text-gray-500 capitalize">{user.role}</td>
                        <td className="px-6 py-4 text-sm text-gray-500">{regionLabels[user.home_region as keyof typeof regionLabels]}</td>
                        <td className="px-6 py-4 text-sm font-medium">
                          <button onClick={() => handleEditUser(user)} className="text-blue-600 hover:text-blue-900">Edit</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'permissions' && (
          <div className="mt-6 bg-white shadow rounded-lg p-6">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg font-medium text-gray-900">Role-Based Access Control</h3>
              <button onClick={savePermissions} disabled={isSavingPermissions} className="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 disabled:opacity-50">
                {isSavingPermissions ? 'Saving...' : 'Save Permissions'}
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Page / Tab</th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Admin Access</th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Staff Access</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {pages.map(page => (
                    <tr key={page.path}>
                      <td className="px-6 py-4 text-sm font-medium text-gray-900">{page.label}</td>
                      {['admin', 'staff'].map(role => {
                        const perm = permissions.find(p => p.role === role && p.page_path === page.path);
                        const isVisible = perm ? perm.is_visible : true;
                        return (
                          <td key={role} className="px-6 py-4 text-center">
                            <input
                              type="checkbox"
                              checked={isVisible}
                              onChange={() => togglePermission(role, page.path)}
                              className="h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                            />
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'calendar' && (
          <div className="mt-6 space-y-6">
            <div className="bg-white shadow rounded-lg p-6">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-lg font-medium text-gray-900">Calendar & Working Days</h3>
                <div className="flex gap-3">
                  <button onClick={() => setShowHolidayModal(true)} className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700">Add Bank Holiday</button>
                  <button onClick={() => setShowLeaveModal(true)} className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700">Add Staff Leave</button>
                </div>
              </div>
              <CalendarMonthYearSelector month={calendarMonth} year={calendarYear} financialYear={selectedFinancialYear} onMonthChange={setCalendarMonth} onYearChange={setCalendarYear} onFinancialYearChange={setSelectedFinancialYear} />
              <div className="grid grid-cols-7 gap-1 mt-6">{renderCalendarGrid()}</div>
            </div>
          </div>
        )}
      </div>

      {editingUser && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg shadow-xl w-96">
            <h3 className="text-lg font-medium mb-4">Edit User</h3>
            <div className="space-y-4">
              <input type="text" value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} className="w-full px-3 py-2 border rounded-md" placeholder="Name" />
              <input type="password" value={editForm.password} onChange={e => setEditForm(f => ({ ...f, password: e.target.value }))} className="w-full px-3 py-2 border rounded-md" placeholder="New Password" />
              <select value={editForm.role} onChange={e => setEditForm(f => ({ ...f, role: e.target.value as any }))} className="w-full px-3 py-2 border rounded-md">
                <option value="staff">Staff</option>
                <option value="admin">Admin</option>
              </select>
              <select value={editForm.home_region} onChange={e => setEditForm(f => ({ ...f, home_region: e.target.value as any }))} className="w-full px-3 py-2 border rounded-md">
                <option value="england-and-wales">England & Wales</option>
                <option value="scotland">Scotland</option>
                <option value="northern-ireland">Northern Ireland</option>
              </select>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setEditingUser(null)} className="px-4 py-2 bg-gray-300 rounded-md">Cancel</button>
              <button onClick={handleSaveEdit} className="px-4 py-2 bg-blue-600 text-white rounded-md">Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};