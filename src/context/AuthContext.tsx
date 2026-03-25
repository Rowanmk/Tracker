import React, { createContext, useContext, useEffect, useState, ReactNode, useCallback, useMemo } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from '../supabase/client';
import type { Database } from '../supabase/types';
import { createAuditLog } from '../utils/auditLog';

type Staff = Database['public']['Tables']['staff']['Row'];
type Team = Database['public']['Tables']['teams']['Row'];
type Permission = Database['public']['Tables']['role_permissions']['Row'];

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signOut: () => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<{ error?: string }>;
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

const RECOVERY_ADMIN_EMAILS = ['rowan@thecrew.co.uk', 'admin@thecrew.co.uk'];

const normalizeFirstName = (name?: string | null) => (name || '').split(' ')[0]?.trim().toLowerCase() || '';
const normalizeEmail = (email?: string | null) => (email || '').trim().toLowerCase();

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

const adminRecoveryMessage =
  'Your account signed in successfully, but it is not linked to a staff profile in Crew Tracker. Please ask an administrator to reconnect your user account.';

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

  const findMatchingStaffForSession = useCallback(async (userId: string, email?: string | null) => {
    const normalizedSessionEmail = normalizeEmail(email);

    const { data: linkedStaff } = await supabase
      .from('staff')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (linkedStaff) {
      return enforceKnownAdminRole(linkedStaff);
    }

    const { data: allStaffRows } = await supabase
      .from('staff')
      .select('*')
      .order('staff_id');

    const normalizedStaffRows = (allStaffRows || []).map(enforceKnownAdminRole);

    const recoverableAdminMatch =
      (normalizedSessionEmail === 'rowan@thecrew.co.uk' &&
        normalizedStaffRows.find((row) => normalizeFirstName(row.name) === 'rowan')) ||
      (normalizedSessionEmail === 'admin@thecrew.co.uk' &&
        normalizedStaffRows.find((row) => normalizeFirstName(row.name) === 'admin'));

    if (recoverableAdminMatch) {
      const { error: updateError } = await supabase
        .from('staff')
        .update({
          user_id: userId,
          role: 'admin',
          is_hidden: false,
          home_region: recoverableAdminMatch.home_region || 'england-and-wales',
        })
        .eq('staff_id', recoverableAdminMatch.staff_id);

      if (updateError) {
        return null;
      }

      return {
        ...recoverableAdminMatch,
        user_id: userId,
        role: 'admin',
        is_hidden: false,
        home_region: recoverableAdminMatch.home_region || 'england-and-wales',
      } as Staff;
    }

    return null;
  }, []);

  const applyAuthenticatedStaff = useCallback((authUser: User, staffMember: Staff) => {
    const normalized = enforceKnownAdminRole(staffMember);
    setUser(authUser);
    setCurrentStaff(normalized);
    setIsAuthenticated(true);
    const savedTeam = localStorage.getItem('crew_tracker_team_id');
    setSelectedTeamId(savedTeam || String(normalized.staff_id));
  }, []);

  const clearAuthenticatedStaff = useCallback(() => {
    setUser(null);
    setCurrentStaff(null);
    setIsAuthenticated(false);
    setSelectedTeamId(null);
    localStorage.removeItem('crew_tracker_team_id');
  }, []);

  const fetchStaff = useCallback(async () => {
    try {
      setError(null);

      const [staffRes, teamsRes, permsRes, sessionRes] = await Promise.all([
        supabase.from('staff').select('*').order('name'),
        supabase.from('teams').select('*').order('name'),
        supabase.from('role_permissions').select('*'),
        supabase.auth.getSession(),
      ]);

      if (staffRes.error) throw staffRes.error;
      if (teamsRes.error) throw teamsRes.error;
      if (sessionRes.error) throw sessionRes.error;

      const normalizedStaff = (staffRes.data || []).map(enforceKnownAdminRole);
      setAllStaff(normalizedStaff);
      setStaff(normalizedStaff.filter((s) => !s.is_hidden));
      setTeams(teamsRes.data || []);
      setPermissions(permsRes.data || []);

      const sessionUser = sessionRes.data.session?.user ?? null;

      if (sessionUser) {
        const matchedStaff = await findMatchingStaffForSession(sessionUser.id, sessionUser.email);

        if (matchedStaff) {
          applyAuthenticatedStaff(sessionUser, matchedStaff);
        } else {
          setUser(sessionUser);
          setCurrentStaff(null);
          setIsAuthenticated(false);
          setSelectedTeamId(null);
          setError(adminRecoveryMessage);
        }
      } else {
        clearAuthenticatedStaff();
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load staff data');
    } finally {
      setStaffLoaded(true);
      setLoading(false);
    }
  }, [applyAuthenticatedStaff, clearAuthenticatedStaff, findMatchingStaffForSession]);

  useEffect(() => {
    void fetchStaff();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      const sessionUser = session?.user ?? null;

      if (event === 'SIGNED_IN' && sessionUser) {
        setUser(sessionUser);
        const matchedStaff = await findMatchingStaffForSession(sessionUser.id, sessionUser.email);

        if (matchedStaff) {
          applyAuthenticatedStaff(sessionUser, matchedStaff);
          await fetchStaff();
        } else {
          setCurrentStaff(null);
          setIsAuthenticated(false);
          setSelectedTeamId(null);
          localStorage.removeItem('crew_tracker_team_id');
          setError(adminRecoveryMessage);
        }
      } else if (event === 'SIGNED_OUT') {
        clearAuthenticatedStaff();
      } else if (event === 'INITIAL_SESSION') {
        if (sessionUser) {
          setUser(sessionUser);
        }
      }
    });

    return () => subscription.unsubscribe();
  }, [applyAuthenticatedStaff, clearAuthenticatedStaff, fetchStaff, findMatchingStaffForSession]);

  const signInWithEmail = async (email: string, password: string) => {
    setError(null);

    const { data, error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    if (signInError) {
      const normalizedEmail = normalizeEmail(email);
      const normalizedMessage = signInError.message.toLowerCase();

      if (
        RECOVERY_ADMIN_EMAILS.includes(normalizedEmail) &&
        normalizedMessage.includes('invalid login credentials')
      ) {
        return { error: 'Invalid login credentials.' };
      }

      return { error: signInError.message };
    }

    if (data.user) {
      const matchedStaff = await findMatchingStaffForSession(data.user.id, data.user.email);

      if (!matchedStaff) {
        return {
          error: adminRecoveryMessage,
        };
      }

      applyAuthenticatedStaff(data.user, matchedStaff);
      await fetchStaff();

      await createAuditLog({
        pagePath: '/login',
        pageLabel: 'Login',
        actionType: 'login',
        entityType: 'session',
        entityId: String(matchedStaff.staff_id),
        description: `${matchedStaff.name} signed in`,
        actorStaffId: matchedStaff.staff_id,
        teamId: matchedStaff.team_id,
        metadata: { email_entered: email },
      });
    }

    return {};
  };

  const signUpWithEmail = async (email: string, password: string) => {
    const { error: signUpError } = await supabase.auth.signUp({ email, password });
    if (signUpError) return { error: signUpError.message };
    return {};
  };

  const signOut = async () => {
    const signedOutStaff = currentStaff;

    if (signedOutStaff) {
      await createAuditLog({
        pagePath: '/login',
        pageLabel: 'Login',
        actionType: 'logout',
        entityType: 'session',
        entityId: String(signedOutStaff.staff_id),
        description: `${signedOutStaff.name} signed out`,
        actorStaffId: signedOutStaff.staff_id,
        teamId: signedOutStaff.team_id,
        metadata: {},
      });
    }

    await supabase.auth.signOut();
  };

  const resetPassword = async (email: string) => {
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + '/settings',
    });
    if (resetError) return { error: resetError.message };
    return {};
  };

  const onTeamChange = (teamId: number | 'all' | 'team-view') => {
    if (teamId === 'all') {
      if (currentStaff) {
        setSelectedTeamId(String(currentStaff.staff_id));
        localStorage.setItem('crew_tracker_team_id', String(currentStaff.staff_id));
      } else {
        setSelectedTeamId(null);
        localStorage.removeItem('crew_tracker_team_id');
      }
      return;
    }

    setSelectedTeamId(teamId.toString());
    localStorage.setItem('crew_tracker_team_id', teamId.toString());
  };

  const hasPermission = useCallback((path: string): boolean => {
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