import React, { createContext, useContext, useEffect, useState, ReactNode, useCallback, useMemo } from 'react';
import { supabase } from '../supabase/client';
import type { Database } from '../supabase/types';

type Staff = Database['public']['Tables']['staff']['Row'];
type Team = Database['public']['Tables']['teams']['Row'];
type Permission = Database['public']['Tables']['role_permissions']['Row'];

interface AuthContextType {
  user: null;
  loading: boolean;
  signOut: () => Promise<void>;
  signInWithCredentials: (username: string, password: string) => Promise<{ error?: string }>;
  getSecurityQuestion: (username: string) => Promise<{ question?: string; error?: string }>;
  resetPasswordWithSecurityAnswer: (username: string, answer: string, newPassword: string) => Promise<{ error?: string }>;
  staff: Staff[];
  allStaff: Staff[];
  teams: Team[];
  currentStaff: Staff | null;
  isAdmin: boolean;
  isAuthenticated: boolean;
  selectedTeamId: string | null;
  onTeamChange: (teamId: number | "all" | "team-view") => void;
  showFallbackWarning: boolean;
  error: string | null;
  staffLoaded: boolean;
  permissions: Permission[];
  hasPermission: (path: string) => boolean;
  refreshStaff: () => Promise<void>;
  accountantStaff: Staff[];
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

const PERMANENT_ADMIN_NAME = 'rowan';

const normalizeFirstName = (name?: string | null) => (name || '').split(' ')[0]?.trim().toLowerCase() || '';

const isAccountant = (staffMember: Staff) => {
  const role = staffMember.role || '';
  const normalizedName = (staffMember.name || '').toLowerCase();
  return role === 'staff' || normalizedName.includes('accountant');
};

const enforcePermanentAdmin = (staffMember: Staff): Staff => {
  const firstName = normalizeFirstName(staffMember.name);
  if (firstName === PERMANENT_ADMIN_NAME && staffMember.role !== 'admin') {
    return { ...staffMember, role: 'admin' };
  }
  return staffMember;
};

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [loading, setLoading] = useState<boolean>(true);
  const [staffLoaded, setStaffLoaded] = useState<boolean>(false);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [allStaff, setAllStaff] = useState<Staff[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [currentStaff, setCurrentStaff] = useState<Staff | null>(null);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>('all');
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [error, setError] = useState<string | null>(null);

  const fetchStaff = async () => {
    try {
      const [staffRes, teamsRes, permsRes] = await Promise.all([
        supabase.from('staff').select('*').order('name'),
        supabase.from('teams').select('*').order('name'),
        supabase.from('role_permissions').select('*'),
      ]);

      if (staffRes.error) throw staffRes.error;
      if (teamsRes.error) throw teamsRes.error;

      const normalizedStaff = (staffRes.data || []).map(enforcePermanentAdmin);
      setAllStaff(normalizedStaff);
      setStaff(normalizedStaff.filter(s => !s.is_hidden));
      setTeams(teamsRes.data || []);
      setPermissions(permsRes.data || []);

      const savedStaffId = localStorage.getItem('crew_tracker_staff_id');
      if (savedStaffId) {
        const found = normalizedStaff.find(s => s.staff_id === Number(savedStaffId));
        if (found) {
          setCurrentStaff(found);
          setIsAuthenticated(true);
          setSelectedTeamId(String(found.staff_id));
        }
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load staff data');
    } finally {
      setStaffLoaded(true);
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStaff();
  }, []);

  const signInWithCredentials = async (username: string, password: string) => {
    const enteredUsername = username.toLowerCase().trim();
    const matched = allStaff.find(
      s => normalizeFirstName(s.name) === enteredUsername && !s.is_hidden
    );

    if (!matched) return { error: 'Invalid username or password.' };

    const dbPassword = matched.password || normalizeFirstName(matched.name);
    if (password.trim() !== dbPassword) return { error: 'Invalid username or password.' };

    setCurrentStaff(matched);
    setIsAuthenticated(true);
    localStorage.setItem('crew_tracker_staff_id', matched.staff_id.toString());
    setSelectedTeamId(String(matched.staff_id));
    return {};
  };

  const signOut = async () => {
    setCurrentStaff(null);
    setIsAuthenticated(false);
    setSelectedTeamId('all');
    localStorage.removeItem('crew_tracker_staff_id');
  };

  const onTeamChange = (teamId: number | 'all' | 'team-view') => {
    setSelectedTeamId(teamId.toString());
  };

  const getSecurityQuestion = async (username: string) => {
    const enteredUsername = username.toLowerCase().trim();
    const matched = allStaff.find(
      s => normalizeFirstName(s.name) === enteredUsername && !s.is_hidden
    );

    if (!matched) {
      return { error: 'No user found with that username.' };
    }

    if (!matched.security_question?.trim()) {
      return { error: 'No security question is set for this user.' };
    }

    return { question: matched.security_question };
  };

  const resetPasswordWithSecurityAnswer = async (
    username: string,
    answer: string,
    newPassword: string
  ) => {
    const enteredUsername = username.toLowerCase().trim();
    const matched = allStaff.find(
      s => normalizeFirstName(s.name) === enteredUsername && !s.is_hidden
    );

    if (!matched) {
      return { error: 'No user found with that username.' };
    }

    const storedAnswer = matched.security_answer?.trim().toLowerCase();
    const providedAnswer = answer.trim().toLowerCase();

    if (!storedAnswer) {
      return { error: 'No security answer is set for this user.' };
    }

    if (storedAnswer !== providedAnswer) {
      return { error: 'Incorrect security answer.' };
    }

    const { error: updateError } = await supabase
      .from('staff')
      .update({ password: newPassword.trim() })
      .eq('staff_id', matched.staff_id);

    if (updateError) {
      return { error: 'Failed to reset password.' };
    }

    await fetchStaff();
    return {};
  };

  const hasPermission = useCallback((path: string): boolean => {
    if (!currentStaff) return false;
    const roleForPermissions = currentStaff.role === 'user' ? 'staff' : currentStaff.role;
    const perm = permissions.find(p => p.role === roleForPermissions && p.page_path === path);
    return perm ? perm.is_visible !== false : true;
  }, [currentStaff, permissions]);

  const accountantStaff = useMemo(
    () =>
      allStaff
        .filter(staffMember => !staffMember.is_hidden && isAccountant(staffMember))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [allStaff]
  );

  const accountantTeams = useMemo(
    () =>
      teams.filter(team =>
        accountantStaff.some(staffMember => staffMember.team_id === team.id)
      ),
    [teams, accountantStaff]
  );

  const value: AuthContextType = {
    user: null,
    loading,
    signOut,
    signInWithCredentials,
    getSecurityQuestion,
    resetPasswordWithSecurityAnswer,
    staff,
    allStaff,
    teams: accountantTeams,
    currentStaff,
    isAdmin: currentStaff?.role === 'admin',
    isAuthenticated,
    selectedTeamId,
    onTeamChange,
    showFallbackWarning: false,
    error,
    staffLoaded,
    permissions,
    hasPermission,
    refreshStaff: fetchStaff,
    accountantStaff,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => useContext(AuthContext);