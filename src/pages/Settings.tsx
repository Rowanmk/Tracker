import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { useDate } from '../context/DateContext';
import { CalendarMonthYearSelector } from '../components/CalendarMonthYearSelector';
import { supabase } from '../supabase/client';
import type { Database } from '../supabase/types';
import { logStaffBatchChange, createAuditLog } from '../utils/auditLog';

type Staff = Database['public']['Tables']['staff']['Row'];
type Team = Database['public']['Tables']['teams']['Row'];
type BankHoliday = Database['public']['Tables']['bank_holidays']['Row'];
type StaffLeave = Database['public']['Tables']['staff_leave']['Row'];
type Permission = Database['public']['Tables']['role_permissions']['Row'];

type StaffLeaveWithStaff = StaffLeave & {
  staff?: {
    name: string;
  };
};

type AccessLevel = 'admin' | 'user';
type WorkCategory = 'accountant' | 'assistant';

type StaffWithDerivedCategories = Staff & {
  accessLevel: AccessLevel;
  workCategory: WorkCategory;
};

const deriveAccessLevel = (role: string | null | undefined): AccessLevel =>
  role === 'admin' ? 'admin' : 'user';

const deriveWorkCategory = (staffMember: Staff): WorkCategory => {
  const role = (staffMember.role || '').toLowerCase();
  const normalizedName = (staffMember.name || '').toLowerCase();
  return role === 'staff' || role === 'admin' || normalizedName.includes('accountant') ? 'accountant' : 'assistant';
};

const deriveStaffCategories = (staffMember: Staff): StaffWithDerivedCategories => ({
  ...staffMember,
  accessLevel: deriveAccessLevel(staffMember.role),
  workCategory: deriveWorkCategory(staffMember),
});

export const Settings: React.FC = () => {
  const { currentStaff, isAdmin, refreshStaff } = useAuth();
  const [allUsers, setAllUsers] = useState<StaffWithDerivedCategories[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<string | null>(null);

  const [newUserName, setNewUserName] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserAccessLevel, setNewUserAccessLevel] = useState<AccessLevel>('user');
  const [newUserWorkCategory, setNewUserWorkCategory] = useState<WorkCategory>('assistant');
  const [newUserRegion, setNewUserRegion] = useState<
    'england-and-wales' | 'scotland' | 'northern-ireland'
  >('england-and-wales');
  const [isAddingUser, setIsAddingUser] = useState(false);

  const [editingUser, setEditingUser] = useState<StaffWithDerivedCategories | null>(null);
  const [editForm, setEditForm] = useState({
    name: '',
    password: '',
    accessLevel: 'user' as AccessLevel,
    workCategory: 'assistant' as WorkCategory,
    home_region: 'england-and-wales' as
      | 'england-and-wales'
      | 'scotland'
      | 'northern-ireland',
    security_question: '',
    security_answer: '',
  });

  const [activeTab, setActiveTab] = useState<'users' | 'calendar' | 'permissions' | 'account'>('users');

  const [accountForm, setAccountForm] = useState({
    password: '',
    security_question: currentStaff?.security_question || '',
    security_answer: currentStaff?.security_answer || '',
  });
  const [isSavingAccount, setIsSavingAccount] = useState(false);

  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [isSavingPermissions, setIsSavingPermissions] = useState(false);

  const [bankHolidays, setBankHolidays] = useState<BankHoliday[]>([]);
  const [staffLeave, setStaffLeave] = useState<StaffLeaveWithStaff[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [calendarMonth, setCalendarMonth] = useState<number>(new Date().getMonth() + 1);
  const [calendarYear, setCalendarYear] = useState<number>(new Date().getFullYear());

  const { selectedFinancialYear, setSelectedFinancialYear } = useDate();

  const assistantUsers = useMemo(
    () =>
      allUsers.filter(
        (user) => !user.is_hidden && user.workCategory === 'assistant'
      ),
    [allUsers]
  );

  const accountantUsers = useMemo(
    () =>
      allUsers.filter(
        (user) => !user.is_hidden && user.workCategory === 'accountant'
      ),
    [allUsers]
  );

  const pages = [
    { path: "/", label: "Dashboard" },
    { path: "/tracker", label: "My Tracker" },
    { path: "/sa-progress", label: "Self Assessment Progress" },
    { path: "/team", label: "Stats and Figures" },
    { path: "/annual", label: "Annual Summary" },
    { path: "/targets", label: "Targets Control" },
    { path: "/settings", label: "Settings" },
    { path: "/audit-log", label: "Audit Log" },
  ];

  const regionLabels = {
    'england-and-wales': 'England & Wales',
    scotland: 'Scotland',
    'northern-ireland': 'Northern Ireland',
  };

  const accessLevelLabels: Record<AccessLevel, string> = {
    admin: 'Admin',
    user: 'User',
  };

  const workCategoryLabels: Record<WorkCategory, string> = {
    accountant: 'Accountant',
    assistant: 'Assistant',
  };

  const setTimedFeedback = (message: string) => {
    setFeedback(message);
    window.setTimeout(() => setFeedback(null), 5000);
  };

  const getErrorMessage = (fallbackMessage: string, error: { message?: string } | null | undefined) => {
    const message = error?.message?.trim();

    if (!message) return fallbackMessage;

    if (message.toLowerCase().includes('row-level security policy')) {
      return `${fallbackMessage}: you do not have permission to write to this table. Please check database policies.`;
    }

    return `${fallbackMessage}: ${message}`;
  };

  const fetchSettingsData = async () => {
    setLoading(true);
    setFeedback(null);

    try {
      const [usersResult, permsResult, teamsResult] = await Promise.all([
        supabase
          .from('staff')
          .select('*')
          .order('name'),
        supabase.from('role_permissions').select('*'),
        supabase.from('teams').select('*').order('name'),
      ]);

      if (usersResult.error) {
        setFeedback(getErrorMessage('Failed to load users data', usersResult.error));
      } else {
        setAllUsers(((usersResult.data || []) as Staff[]).map(deriveStaffCategories));
      }

      if (!permsResult.error) {
        setPermissions(permsResult.data || []);
      }

      if (teamsResult.error) {
        setFeedback(getErrorMessage('Failed to load accountants data', teamsResult.error));
      } else {
        setTeams(teamsResult.data || []);
      }
    } catch {
      setFeedback('Failed to connect to database');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettingsData();
  }, []);

  useEffect(() => {
    setAccountForm({
      password: '',
      security_question: currentStaff?.security_question || '',
      security_answer: currentStaff?.security_answer || '',
    });
  }, [currentStaff?.staff_id, currentStaff?.security_question, currentStaff?.security_answer]);

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
    } catch {
      setTimedFeedback('Failed to load calendar data');
    }
  };

  const getRoleValueFromAccessLevel = (accessLevel: AccessLevel, workCategory: WorkCategory) => {
    if (accessLevel === 'admin') return 'admin';
    return workCategory === 'accountant' ? 'staff' : 'user';
  };

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUserName.trim() || !currentStaff) return;

    setIsAddingUser(true);
    setFeedback(null);

    try {
      const insertPayload: Database['public']['Tables']['staff']['Insert'] = {
        name: newUserName.trim(),
        password: newUserPassword.trim() || null,
        role: getRoleValueFromAccessLevel(newUserAccessLevel, newUserWorkCategory),
        home_region: newUserRegion,
        team_id: null,
        is_hidden: false,
      };

      const { data, error: insertError } = await supabase
        .from('staff')
        .insert(insertPayload)
        .select('*')
        .single();

      if (insertError) {
        setTimedFeedback(getErrorMessage('Failed to add user', insertError));
      } else {
        const normalizedUser = deriveStaffCategories(data as Staff);
        setAllUsers(prev =>
          [...prev, normalizedUser].sort((a, b) => a.name.localeCompare(b.name))
        );
        setNewUserName('');
        setNewUserPassword('');
        setNewUserAccessLevel('user');
        setNewUserWorkCategory('assistant');
        setNewUserRegion('england-and-wales');
        await refreshStaff();
        await logStaffBatchChange({
          pagePath: '/settings',
          pageLabel: 'Settings',
          actionType: 'create',
          entityType: 'user',
          description: `${currentStaff.name} created user ${data.name}`,
          actorStaffId: currentStaff.staff_id,
          actorName: currentStaff.name,
          affectedStaff: [
            {
              staff_id: data.staff_id,
              name: data.name,
              team_id: data.team_id,
            },
          ],
          metadata: {
            access_level: newUserAccessLevel,
            work_category: newUserWorkCategory,
            role: data.role,
            home_region: data.home_region,
          },
        });
        setTimedFeedback('Successfully added user');
      }
    } catch {
      setTimedFeedback('Failed to connect to database');
    } finally {
      setIsAddingUser(false);
    }
  };

  const handleEditUser = (user: StaffWithDerivedCategories) => {
    setEditingUser(user);
    setEditForm({
      name: user.name,
      password: user.password || '',
      accessLevel: user.accessLevel,
      workCategory: user.workCategory,
      home_region: (user.home_region as
        | 'england-and-wales'
        | 'scotland'
        | 'northern-ireland') || 'england-and-wales',
      security_question: user.security_question || '',
      security_answer: user.security_answer || '',
    });
  };

  const handleSaveEdit = async () => {
    if (!editingUser || !editForm.name.trim() || !currentStaff) return;

    setFeedback(null);

    try {
      const previousValues = {
        name: editingUser.name,
        role: editingUser.role,
        home_region: editingUser.home_region,
        accessLevel: editingUser.accessLevel,
        workCategory: editingUser.workCategory,
      };

      const updatePayload: Database['public']['Tables']['staff']['Update'] = {
        name: editForm.name.trim(),
        password: editForm.password.trim() || null,
        role: getRoleValueFromAccessLevel(editForm.accessLevel, editForm.workCategory),
        home_region: editForm.home_region,
        security_question: editForm.security_question.trim() || null,
        security_answer: editForm.security_answer.trim() || null,
        team_id: null,
      };

      const { data, error: updateError } = await supabase
        .from('staff')
        .update(updatePayload)
        .eq('staff_id', editingUser.staff_id)
        .select('*')
        .single();

      if (updateError) {
        setTimedFeedback(getErrorMessage('Failed to update user', updateError));
      } else {
        const normalizedUser = deriveStaffCategories(data as Staff);
        setAllUsers(prev =>
          prev
            .map(user => (user.staff_id === editingUser.staff_id ? normalizedUser : user))
            .sort((a, b) => a.name.localeCompare(b.name))
        );
        setEditingUser(null);
        await refreshStaff();
        await logStaffBatchChange({
          pagePath: '/settings',
          pageLabel: 'Settings',
          actionType: 'update',
          entityType: 'user',
          description: `${currentStaff.name} updated user ${data.name}`,
          actorStaffId: currentStaff.staff_id,
          actorName: currentStaff.name,
          affectedStaff: [
            {
              staff_id: editingUser.staff_id,
              name: data.name,
              team_id: data.team_id,
            },
          ],
          metadata: {
            previous: previousValues,
            current: {
              name: data.name,
              role: data.role,
              home_region: data.home_region,
              access_level: editForm.accessLevel,
              work_category: editForm.workCategory,
            },
          },
        });
        setTimedFeedback('Successfully updated user');
      }
    } catch {
      setTimedFeedback('Failed to connect to database');
    }
  };

  const handleSaveAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentStaff) return;

    setIsSavingAccount(true);
    setFeedback(null);

    try {
      const updates: Database['public']['Tables']['staff']['Update'] = {
        security_question: accountForm.security_question.trim() || null,
        security_answer: accountForm.security_answer.trim() || null,
      };

      if (accountForm.password.trim()) {
        updates.password = accountForm.password.trim();
      }

      const { error: updateError } = await supabase
        .from('staff')
        .update(updates)
        .eq('staff_id', currentStaff.staff_id);

      if (updateError) {
        setTimedFeedback(getErrorMessage('Failed to update account', updateError));
      } else {
        setAccountForm(prev => ({ ...prev, password: '' }));
        await refreshStaff();
        await createAuditLog({
          pagePath: '/settings',
          pageLabel: 'Settings',
          actionType: 'update',
          entityType: 'account',
          entityId: String(currentStaff.staff_id),
          description: `${currentStaff.name} updated their account settings`,
          actorStaffId: currentStaff.staff_id,
          teamId: currentStaff.team_id,
          metadata: {
            updated_password: Boolean(updates.password),
            updated_security_question: true,
          },
        });
        setTimedFeedback('Successfully updated account settings');
      }
    } catch {
      setTimedFeedback('Failed to connect to database');
    } finally {
      setIsSavingAccount(false);
    }
  };

  const togglePermission = (role: string, path: string) => {
    const existing = permissions.find(p => p.role === role && p.page_path === path);
    if (existing) {
      setPermissions(prev =>
        prev.map(p =>
          p.role === role && p.page_path === path
            ? { ...p, is_visible: !p.is_visible }
            : p
        )
      );
    } else {
      setPermissions(prev => [
        ...prev,
        { role, page_path: path, is_visible: false } as Permission,
      ]);
    }
  };

  const savePermissions = async () => {
    if (!currentStaff) return;

    setIsSavingPermissions(true);
    try {
      const beforePermissions = permissions.map((permission) => ({
        role: permission.role,
        page_path: permission.page_path,
        is_visible: permission.is_visible,
      }));

      const { error: upsertError } = await supabase
        .from('role_permissions')
        .upsert(
          permissions.map(p => ({
            role: p.role,
            page_path: p.page_path,
            is_visible: p.is_visible,
          })),
          { onConflict: 'role,page_path' }
        );

      if (upsertError) {
        setTimedFeedback(getErrorMessage('Failed to save permissions', upsertError));
      } else {
        await refreshStaff();
        await createAuditLog({
          pagePath: '/settings',
          pageLabel: 'Settings',
          actionType: 'update',
          entityType: 'permissions',
          entityId: 'role_permissions',
          description: `${currentStaff.name} updated role permissions`,
          actorStaffId: currentStaff.staff_id,
          teamId: currentStaff.team_id,
          metadata: {
            permission_count: permissions.length,
            permissions: beforePermissions,
          },
        });
        setTimedFeedback('Successfully saved permissions');
      }
    } catch {
      setTimedFeedback('Failed to connect to database');
    } finally {
      setIsSavingPermissions(false);
    }
  };

  const renderCalendarGrid = () => {
    const daysInMonth = new Date(calendarYear, calendarMonth, 0).getDate();
    const firstDay = new Date(calendarYear, calendarMonth - 1, 1).getDay();
    const days = [];

    for (let i = 0; i < firstDay; i++) {
      days.push(<div key={`empty-${i}`} className="h-24 border border-gray-200" />);
    }

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
          className={`h-24 border border-gray-200 p-1 cursor-pointer hover:bg-gray-50 ${isWeekend ? 'bg-red-50' : 'bg-white'}`}
          onClick={() => setSelectedDate(date)}
        >
          <div className="font-medium text-sm">{day}</div>
          <div className="text-xs space-y-1">
            {dayHolidays.map(h => (
              <div key={h.id} className="bg-red-100 text-red-800 px-1 rounded text-xs">
                🔴 {h.title}
              </div>
            ))}
            {dayLeave.map(l => (
              <div key={l.id} className="bg-green-100 text-green-800 px-1 rounded text-xs">
                🟢 {l.staff?.name}
              </div>
            ))}
          </div>
        </div>
      );
    }

    return days;
  };

  return (
    <div className="px-4 sm:px-6 lg:px-8">
      <div className="page-header">
        <h1 className="page-title">Settings</h1>
        <p className="page-subtitle">Manage your account and system settings</p>
      </div>

      {feedback && (
        <div
          className={`mt-4 p-4 border rounded-md ${
            feedback.includes('Successfully')
              ? 'bg-green-50 border-green-200 text-green-800'
              : 'bg-red-50 border-red-200 text-red-800'
          }`}
        >
          <p>{feedback}</p>
        </div>
      )}

      <div className="mt-6">
        <div className="border-b border-gray-200">
          <nav className="-mb-px flex space-x-8">
            <button
              onClick={() => setActiveTab('account')}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'account'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              My Account
            </button>

            {isAdmin &&
              ['users', 'calendar', 'permissions'].map(tab => (
                <button
                  key={tab}
                  onClick={() =>
                    setActiveTab(tab as 'users' | 'calendar' | 'permissions')
                  }
                  className={`py-2 px-1 border-b-2 font-medium text-sm capitalize ${
                    activeTab === tab
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  {tab}
                </button>
              ))}
          </nav>
        </div>

        {activeTab === 'account' && (
          <div className="mt-6 bg-white shadow rounded-lg p-6 max-w-2xl">
            <h3 className="text-lg font-medium text-gray-900 mb-6">Security Settings</h3>
            <form onSubmit={handleSaveAccount} className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700">Change Password</label>
                <input
                  type="password"
                  value={accountForm.password}
                  onChange={e => setAccountForm(f => ({ ...f, password: e.target.value }))}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                  placeholder="Leave blank to keep current password"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Security Question</label>
                <input
                  type="text"
                  value={accountForm.security_question}
                  onChange={e => setAccountForm(f => ({ ...f, security_question: e.target.value }))}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                  placeholder="e.g., What was your first pet's name?"
                  required
                />
                <p className="mt-1 text-xs text-gray-500">This will be used to reset your password if you forget it.</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Security Answer</label>
                <input
                  type="text"
                  value={accountForm.security_answer}
                  onChange={e => setAccountForm(f => ({ ...f, security_answer: e.target.value }))}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                  placeholder="Enter your answer"
                  required
                />
              </div>
              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={isSavingAccount}
                  className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 disabled:opacity-50 font-medium"
                >
                  {isSavingAccount ? 'Saving...' : 'Update Security Settings'}
                </button>
              </div>
            </form>
          </div>
        )}

        {isAdmin && activeTab === 'users' && (
          <div className="mt-6 space-y-6">
            <div className="bg-white shadow rounded-lg p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Add New User</h3>
              <form onSubmit={handleAddUser} className="grid grid-cols-1 md:grid-cols-6 gap-4">
                <input
                  type="text"
                  value={newUserName}
                  onChange={e => setNewUserName(e.target.value)}
                  className="px-3 py-2 border rounded-md"
                  placeholder="Name"
                  required
                />
                <input
                  type="password"
                  value={newUserPassword}
                  onChange={e => setNewUserPassword(e.target.value)}
                  className="px-3 py-2 border rounded-md"
                  placeholder="Password (optional)"
                />
                <select
                  value={newUserAccessLevel}
                  onChange={e => setNewUserAccessLevel(e.target.value as AccessLevel)}
                  className="px-3 py-2 border rounded-md"
                >
                  <option value="user">User</option>
                  <option value="admin">Admin</option>
                </select>
                <select
                  value={newUserWorkCategory}
                  onChange={e => setNewUserWorkCategory(e.target.value as WorkCategory)}
                  className="px-3 py-2 border rounded-md"
                >
                  <option value="accountant">Accountant</option>
                  <option value="assistant">Assistant</option>
                </select>
                <select
                  value={newUserRegion}
                  onChange={e => setNewUserRegion(e.target.value as 'england-and-wales' | 'scotland' | 'northern-ireland')}
                  className="px-3 py-2 border rounded-md"
                >
                  <option value="england-and-wales">England & Wales</option>
                  <option value="scotland">Scotland</option>
                  <option value="northern-ireland">Northern Ireland</option>
                </select>
                <button
                  type="submit"
                  disabled={isAddingUser}
                  className="bg-blue-600 text-white rounded-md px-4 py-2 hover:bg-blue-700 disabled:opacity-50"
                >
                  {isAddingUser ? 'Adding...' : 'Add User'}
                </button>
              </form>
            </div>

            <div className="bg-white shadow rounded-lg p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Active Users</h3>

              {loading ? (
                <div className="py-6 text-center text-gray-500">Loading users...</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Access</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Work Category</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Region</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {allUsers
                        .filter(user => !user.is_hidden)
                        .map(user => (
                          <tr key={user.staff_id}>
                            <td className="px-6 py-4 text-sm font-medium text-gray-900">{user.name}</td>
                            <td className="px-6 py-4 text-sm text-gray-500">
                              {accessLevelLabels[user.accessLevel]}
                            </td>
                            <td className="px-6 py-4 text-sm text-gray-500">
                              {workCategoryLabels[user.workCategory]}
                            </td>
                            <td className="px-6 py-4 text-sm text-gray-500">
                              {regionLabels[user.home_region as keyof typeof regionLabels]}
                            </td>
                            <td className="px-6 py-4 text-sm font-medium">
                              <button
                                onClick={() => handleEditUser(user)}
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

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              <div className="bg-white shadow rounded-lg p-6">
                <h3 className="text-lg font-medium text-gray-900 mb-4">User Categorisation Summary</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="border border-gray-200 rounded-lg p-4">
                    <div className="text-sm font-medium text-gray-500">Admins</div>
                    <div className="mt-2 text-3xl font-bold text-gray-900">
                      {allUsers.filter(user => !user.is_hidden && user.accessLevel === 'admin').length}
                    </div>
                  </div>
                  <div className="border border-gray-200 rounded-lg p-4">
                    <div className="text-sm font-medium text-gray-500">Users</div>
                    <div className="mt-2 text-3xl font-bold text-gray-900">
                      {allUsers.filter(user => !user.is_hidden && user.accessLevel === 'user').length}
                    </div>
                  </div>
                  <div className="border border-gray-200 rounded-lg p-4">
                    <div className="text-sm font-medium text-gray-500">Accountants</div>
                    <div className="mt-2 text-3xl font-bold text-gray-900">
                      {accountantUsers.length}
                    </div>
                  </div>
                  <div className="border border-gray-200 rounded-lg p-4">
                    <div className="text-sm font-medium text-gray-500">Assistants</div>
                    <div className="mt-2 text-3xl font-bold text-gray-900">
                      {assistantUsers.length}
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-white shadow rounded-lg p-6">
                <h3 className="text-lg font-medium text-gray-900 mb-4">Role Structure</h3>
                <div className="space-y-4 text-sm text-gray-600">
                  <div className="border border-gray-200 rounded-lg p-4">
                    <div className="font-semibold text-gray-900 mb-1">Access Level</div>
                    <p>Users can be categorised independently as User or Admin.</p>
                  </div>
                  <div className="border border-gray-200 rounded-lg p-4">
                    <div className="font-semibold text-gray-900 mb-1">Work Category</div>
                    <p>Users can also be categorised independently as Accountant or Assistant.</p>
                  </div>
                  <div className="border border-gray-200 rounded-lg p-4">
                    <div className="font-semibold text-gray-900 mb-1">Reporting Basis</div>
                    <p>All reporting, targets, trackers and figures now run directly by accountant user records.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {isAdmin && activeTab === 'permissions' && (
          <div className="mt-6 bg-white shadow rounded-lg p-6">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg font-medium text-gray-900">Role-Based Access Control</h3>
              <button
                onClick={savePermissions}
                disabled={isSavingPermissions}
                className="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 disabled:opacity-50"
              >
                {isSavingPermissions ? 'Saving...' : 'Save Permissions'}
              </button>
            </div>
            <div className="mb-4 rounded-md border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
              Access permissions are controlled by the User/Admin categorisation. Accountant/Assistant is an operational categorisation used for reporting structure.
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Page / Tab</th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">User Access</th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Admin Access</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {pages.map(page => (
                    <tr key={page.path}>
                      <td className="px-6 py-4 text-sm font-medium text-gray-900">{page.label}</td>
                      {[
                        { key: 'staff', label: 'User' },
                        { key: 'admin', label: 'Admin' },
                      ].map(role => {
                        const perm = permissions.find(p => p.role === role.key && p.page_path === page.path);
                        const isVisible = perm ? perm.is_visible !== false : true;
                        return (
                          <td key={role.key} className="px-6 py-4 text-center">
                            <input
                              type="checkbox"
                              checked={isVisible}
                              onChange={() => togglePermission(role.key, page.path)}
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

        {isAdmin && activeTab === 'calendar' && (
          <div className="mt-6 space-y-6">
            <div className="bg-white shadow rounded-lg p-6">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-lg font-medium text-gray-900">Calendar & Working Days</h3>
              </div>
              <CalendarMonthYearSelector
                month={calendarMonth}
                year={calendarYear}
                financialYear={selectedFinancialYear}
                onMonthChange={setCalendarMonth}
                onYearChange={setCalendarYear}
                onFinancialYearChange={setSelectedFinancialYear}
              />
              <div className="grid grid-cols-7 gap-1 mt-6">{renderCalendarGrid()}</div>
              {selectedDate && (
                <div className="mt-4 text-sm text-gray-600">
                  Selected date: <span className="font-medium text-gray-900">{selectedDate}</span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {editingUser && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-md">
            <h3 className="text-lg font-medium mb-4">Edit User: {editingUser.name}</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Name</label>
                <input
                  type="text"
                  value={editForm.name}
                  onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                  className="w-full px-3 py-2 border rounded-md"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">New Password</label>
                <input
                  type="password"
                  value={editForm.password}
                  onChange={e => setEditForm(f => ({ ...f, password: e.target.value }))}
                  className="w-full px-3 py-2 border rounded-md"
                  placeholder="Leave blank to keep current"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Access</label>
                  <select
                    value={editForm.accessLevel}
                    onChange={e =>
                      setEditForm(f => ({
                        ...f,
                        accessLevel: e.target.value as AccessLevel,
                      }))
                    }
                    className="w-full px-3 py-2 border rounded-md"
                  >
                    <option value="user">User</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Work Category</label>
                  <select
                    value={editForm.workCategory}
                    onChange={e =>
                      setEditForm(f => ({
                        ...f,
                        workCategory: e.target.value as WorkCategory,
                      }))
                    }
                    className="w-full px-3 py-2 border rounded-md"
                  >
                    <option value="accountant">Accountant</option>
                    <option value="assistant">Assistant</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Region</label>
                <select
                  value={editForm.home_region}
                  onChange={e =>
                    setEditForm(f => ({
                      ...f,
                      home_region: e.target.value as 'england-and-wales' | 'scotland' | 'northern-ireland',
                    }))
                  }
                  className="w-full px-3 py-2 border rounded-md"
                >
                  <option value="england-and-wales">England & Wales</option>
                  <option value="scotland">Scotland</option>
                  <option value="northern-ireland">Northern Ireland</option>
                </select>
              </div>
              <div className="border-t pt-4 mt-4">
                <h4 className="text-sm font-bold text-gray-700 mb-3">Security Question (Admin Reset)</h4>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Question</label>
                    <input
                      type="text"
                      value={editForm.security_question}
                      onChange={e => setEditForm(f => ({ ...f, security_question: e.target.value }))}
                      className="w-full px-3 py-2 border rounded-md"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Answer</label>
                    <input
                      type="text"
                      value={editForm.security_answer}
                      onChange={e => setEditForm(f => ({ ...f, security_answer: e.target.value }))}
                      className="w-full px-3 py-2 border rounded-md"
                    />
                  </div>
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setEditingUser(null)}
                className="px-4 py-2 bg-gray-300 rounded-md font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveEdit}
                className="px-4 py-2 bg-blue-600 text-white rounded-md font-medium"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};