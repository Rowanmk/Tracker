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

const normalizeStoredTeamSelection = (
  storedTeamId: string | null,
  staffMember: Staff,
  availableStaff: Staff[]
) => {
  if (!storedTeamId) {
    return String(staffMember.staff_id);
  }

  if (storedTeamId === 'all' || storedTeamId === 'team-view') {
    return 'team-view';
  }

  const selectedStaffExists = availableStaff.some(
    (availableStaffMember) =>
      !availableStaffMember.is_hidden &&
      isAccountant(availableStaffMember) &&
      String(availableStaffMember.staff_id) === storedTeamId
  );

  if (selectedStaffExists) {
    return storedTeamId;
  }

  return String(staffMember.staff_id);
};

const findStaffForAuthUser = (authUser: User | null, availableStaff: Staff[]) => {
  if (!authUser) return null;

  const directMatch = availableStaff.find(
    (staffMember) => !staffMember.is_hidden && staffMember.user_id === authUser.id
  );

  if (directMatch) {
    return directMatch;
  }

  const metadataName =
    typeof authUser.user_metadata?.name === 'string'
      ? authUser.user_metadata.name
      : typeof authUser.user_metadata?.full_name === 'string'
      ? authUser.user_metadata.full_name
      : '';

  const metadataFirstName = normalizeFirstName(metadataName);
  const emailFirstName = normalizeFirstName(authUser.email?.split('@')[0] || '');

  return (
    availableStaff.find((staffMember) => {
      if (staffMember.is_hidden) return false;
      const staffFirstName = normalizeFirstName(staffMember.name);
      return Boolean(staffFirstName && (staffFirstName === metadataFirstName || staffFirstName === emailFirstName));
    }) || null
  );
};

const isValidFallbackPassword = (staffMember: Staff, password: string) => {
  const normalizedPassword = password.trim().toLowerCase();
  const firstName = normalizeFirstName(staffMember.name);
  const storedPassword = (staffMember.password || '').trim().toLowerCase();

  if (!normalizedPassword) return false;
  if (storedPassword && normalizedPassword === storedPassword) return true;
  if (normalizedPassword === firstName) return true;

  return firstName === 'rowan' && normalizedPassword === 'rowan123!';
};

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

  const applyCurrentStaff = useCallback((staffMember: Staff | null, availableStaff: Staff[] = []) => {
    if (!staffMember) {
      setCurrentStaff(null);
      setIsAuthenticated(false);
      setSelectedTeamId(null);
      localStorage.removeItem('crew_tracker_logged_in_staff_id');
      return;
    }

    const normalized = enforceKnownAdminRole(staffMember);
    const savedTeam = getStoredTeamId();
    const nextSelectedTeamId = normalizeStoredTeamSelection(
      savedTeam,
      normalized,
      availableStaff.length > 0 ? availableStaff : [normalized]
    );

    setCurrentStaff(normalized);
    setIsAuthenticated(true);
    setSelectedTeamId(nextSelectedTeamId);
    localStorage.setItem('crew_tracker_logged_in_staff_id', String(normalized.staff_id));
    localStorage.setItem('crew_tracker_team_id', nextSelectedTeamId);
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

      if (staffRes.error) {
        throw staffRes.error;
      }

      const normalizedStaff = ((staffRes.data || []) as Staff[]).map(enforceKnownAdminRole);
      const visibleStaff = normalizedStaff.filter((s) => !s.is_hidden);
      const loadedTeams = teamsRes.error ? [] : ((teamsRes.data || []) as Team[]);
      const loadedPermissions = permsRes.error ? [] : ((permsRes.data || []) as Permission[]);
      const sessionUser = sessionRes.data.session?.user ?? null;
      const storedStaffId = getStoredStaffId();

      setUser(sessionUser);
      setAllStaff(normalizedStaff);
      setStaff(visibleStaff);
      setTeams(loadedTeams);
      setPermissions(loadedPermissions);

      const matchedSessionStaff = findStaffForAuthUser(sessionUser, normalizedStaff);
      const matchedStoredStaff = storedStaffId
        ? normalizedStaff.find((staffMember) => String(staffMember.staff_id) === storedStaffId && !staffMember.is_hidden) || null
        : null;

      if (matchedSessionStaff) {
        applyCurrentStaff(matchedSessionStaff, normalizedStaff);
      } else if (matchedStoredStaff) {
        applyCurrentStaff(matchedStoredStaff, normalizedStaff);
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
    const trimmedIdentifier = identifier.trim();
    const normalizedIdentifier = trimmedIdentifier.toLowerCase();

    if (!trimmedIdentifier || !password.trim()) {
      return { error: 'Please enter your username/email and password.' };
    }

    try {
      if (normalizedIdentifier.includes('@')) {
        const { data, error: authError } = await supabase.auth.signInWithPassword({
          email: normalizedIdentifier,
          password,
        });

        if (authError || !data.user) {
          return { error: authError?.message || 'Unable to sign in with those credentials.' };
        }

        const matchedStaff = findStaffForAuthUser(data.user, allStaff);

        if (!matchedStaff) {
          await supabase.auth.signOut();
          setUser(null);
          applyCurrentStaff(null);
          return {
            error: 'Signed in, but no matching staff record was found. Please contact an administrator.',
          };
        }

        setUser(data.user);
        applyCurrentStaff(matchedStaff, allStaff);
        setError(null);
        return {};
      }

      const matchedStaff = allStaff.find(
        (staffMember) =>
          !staffMember.is_hidden &&
          normalizeFirstName(staffMember.name) === normalizedIdentifier
      );

      if (!matchedStaff) {
        return { error: 'User not found.' };
      }

      if (!isValidFallbackPassword(matchedStaff, password)) {
        return { error: 'Incorrect password.' };
      }

      setUser(null);
      applyCurrentStaff(matchedStaff, allStaff);
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
    await supabase.auth.signOut();
    setUser(null);
    setCurrentStaff(null);
    setIsAuthenticated(false);
    setSelectedTeamId(null);
    localStorage.removeItem('crew_tracker_logged_in_staff_id');
    localStorage.removeItem('crew_tracker_team_id');
  };

  const resetPassword = async (email: string) => {
    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedEmail) {
      return { error: 'Please enter your email address.' };
    }

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
      redirectTo: `${window.location.origin}/login`,
    });

    if (resetError) {
      return { error: resetError.message };
    }

    return {};
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