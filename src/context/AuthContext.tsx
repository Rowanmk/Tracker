import React, { createContext, useContext, useEffect, useState, ReactNode, useCallback, useMemo } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from '../supabase/client';
import type { Database } from '../supabase/types';

type Staff = Database['public']['Tables']['staff']['Row'];
type Team = Database['public']['Tables']['teams']['Row'];
type Permission = Database['public']['Tables']['role_permissions']['Row'];

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signOut: () => Promise<void>;
  signInWithEmail: (identifier: string, password: string) => Promise<{ error?: string }>;
  signUpWithEmail: (email: string, password: string) => Promise<{ error?: string }>;
  resetPassword: (email: string) => Promise<{ error?: string }>;
  staff: Staff[];
  allStaff: Staff[];
  teams: Team[];
  currentStaff: Staff | null;
  isAdmin: boolean;
  isAuthenticated: boolean;
  selectedTeamId: string | null;
  onTeamChange: (teamId: number | 'all' | 'team-view') => void;
  showFallbackWarning: boolean;
  error: string | null;
  staffLoaded: boolean;
  permissions: Permission[];
  hasPermission: (path: string) => boolean;
  refreshStaff: () => Promise<void>;
  accountantStaff: Staff[];
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

const normalizeFirstName = (name?: string | null) => (name || '').split(' ')[0]?.trim().toLowerCase() || '';

const isAccountant = (staffMember: Staff) => {
  const role = (staffMember.role || '').toLowerCase();
  const normalizedName = (staffMember.name || '').toLowerCase();

  return role === 'staff' || role === 'admin' || normalizedName.includes('accountant');
};

const enforceKnownAdminRole = (staffMember: Staff): Staff => {
  const firstName = normalizeFirstName(staffMember.name);
  const normalizedRole = (staffMember.role || '').toLowerCase();

  if ((firstName === 'rowan' || firstName === 'admin') && normalizedRole !== 'admin') {
    return { ...staffMember, role: 'admin' };
  }

  return staffMember;
};

const getStoredStaffId = () => localStorage.getItem('crew_tracker_logged_in_staff_id');
const getStoredTeamId = () => localStorage.getItem('crew_tracker_team_id');

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [staffLoaded, setStaffLoaded] = useState<boolean>(false);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [allStaff, setAllStaff] = useState<Staff[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [currentStaff, setCurrentStaff] = useState<Staff | null>(null);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showFallbackWarning, setShowFallbackWarning] = useState<boolean>(false);

  const applyCurrentStaff = useCallback((staffMember: Staff | null) => {
    if (!staffMember) {
      setCurrentStaff(null);
      setIsAuthenticated(false);
      setSelectedTeamId(null);
      localStorage.removeItem('crew_tracker_logged_in_staff_id');
      return;
    }

    const normalized = enforceKnownAdminRole(staffMember);
    const savedTeam = getStoredTeamId();

    setCurrentStaff(normalized);
    setIsAuthenticated(true);
    setSelectedTeamId(savedTeam || String(normalized.staff_id));
    localStorage.setItem('crew_tracker_logged_in_staff_id', String(normalized.staff_id));
  }, []);

  const fetchStaff = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [staffRes, teamsRes, permsRes, sessionRes] = await Promise.all([
        supabase.from('staff').select('*').order('name'),
        supabase.from('teams').select('*').order('name'),
        supabase.from('role_permissions').select('*'),
        supabase.auth.getSession(),
      ]);

      const normalizedStaff = ((staffRes.data || []) as Staff[]).map(enforceKnownAdminRole);
      const visibleStaff = normalizedStaff.filter((s) => !s.is_hidden);
      const loadedTeams = (teamsRes.data || []) as Team[];
      const loadedPermissions = (permsRes.data || []) as Permission[];
      const sessionUser = sessionRes.data.session?.user ?? null;
      const storedStaffId = getStoredStaffId();

      setUser(sessionUser);
      setAllStaff(normalizedStaff);
      setStaff(visibleStaff);
      setTeams(loadedTeams);
      setPermissions(loadedPermissions);

      const matchedStoredStaff = storedStaffId
        ? normalizedStaff.find((staffMember) => String(staffMember.staff_id) === storedStaffId) || null
        : null;

      if (matchedStoredStaff) {
        applyCurrentStaff(matchedStoredStaff);
      } else {
        applyCurrentStaff(null);
      }

      setShowFallbackWarning(false);
    } catch {
      setAllStaff([]);
      setStaff([]);
      setTeams([]);
      setPermissions([]);
      setUser(null);
      applyCurrentStaff(null);
      setShowFallbackWarning(false);
      setError('Failed to load staff data.');
    } finally {
      setStaffLoaded(true);
      setLoading(false);
    }
  }, [applyCurrentStaff]);

  useEffect(() => {
    void fetchStaff();
  }, [fetchStaff]);

  const signInWithEmail = async (identifier: string, password: string) => {
    const normalizedIdentifier = identifier.trim().toLowerCase();
    const normalizedPassword = password.trim().toLowerCase();

    if (!normalizedIdentifier || !normalizedPassword) {
      return { error: 'Please enter your username and password.' };
    }

    try {
      const matchedStaff = allStaff.find(
        (staffMember) =>
          !staffMember.is_hidden &&
          normalizeFirstName(staffMember.name) === normalizedIdentifier
      );

      if (!matchedStaff) {
        return { error: 'User not found.' };
      }

      if (normalizedPassword !== normalizedIdentifier) {
        return { error: 'Incorrect password.' };
      }

      applyCurrentStaff(matchedStaff);
      setError(null);
      return {};
    } catch {
      return { error: 'Unable to sign in right now.' };
    }
  };

  const signUpWithEmail = async () => {
    return { error: 'Sign up is disabled.' };
  };

  const signOut = async () => {
    setUser(null);
    setCurrentStaff(null);
    setIsAuthenticated(false);
    setSelectedTeamId(null);
    localStorage.removeItem('crew_tracker_logged_in_staff_id');
    localStorage.removeItem('crew_tracker_team_id');
  };

  const resetPassword = async () => {
    return { error: 'Password reset is disabled.' };
  };

  const onTeamChange = (teamId: number | 'all' | 'team-view') => {
    if (teamId === 'all') {
      setSelectedTeamId('team-view');
      localStorage.setItem('crew_tracker_team_id', 'team-view');
      return;
    }

    setSelectedTeamId(teamId.toString());
    localStorage.setItem('crew_tracker_team_id', teamId.toString());
  };

  const hasPermission = useCallback((path: string): boolean => {
    const publicPaths = ['/login', '/forgot-password'];
    if (publicPaths.includes(path)) return true;

    if (!currentStaff) return false;

    const roleForPermissions = currentStaff.role === 'user' ? 'staff' : currentStaff.role;
    const perm = permissions.find((p) => p.role === roleForPermissions && p.page_path === path);
    return perm ? perm.is_visible !== false : true;
  }, [currentStaff, permissions]);

  const accountantStaff = useMemo(
    () =>
      allStaff
        .filter((staffMember) => !staffMember.is_hidden && isAccountant(staffMember))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [allStaff]
  );

  const accountantTeams = useMemo(
    () =>
      teams.filter((team) =>
        accountantStaff.some((staffMember) => staffMember.team_id === team.id)
      ),
    [teams, accountantStaff]
  );

  const value: AuthContextType = {
    user,
    loading,
    signOut,
    signInWithEmail,
    signUpWithEmail,
    resetPassword,
    staff,
    allStaff,
    teams: accountantTeams,
    currentStaff,
    isAdmin: currentStaff?.role === 'admin',
    isAuthenticated,
    selectedTeamId,
    onTeamChange,
    showFallbackWarning,
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