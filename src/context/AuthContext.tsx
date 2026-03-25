import React, { createContext, useContext, useEffect, useState, ReactNode, useCallback, useMemo } from 'react';
import { supabase } from '../supabase/client';
import type { Database } from '../supabase/types';
import { createAuditLog } from '../utils/auditLog';

type Staff = Database['public']['Tables']['staff']['Row'];
type Team = Database['public']['Tables']['teams']['Row'];
type Permission = Database['public']['Tables']['role_permissions']['Row'];

interface AuthContextType {
  user: null;
  loading: boolean;
  signOut: () => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<{ error?: string }>;
  resetPassword: (email: string) => Promise<{ error?: string }>;
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
  const role = (staffMember.role || '').toLowerCase();
  const normalizedName = (staffMember.name || '').toLowerCase();

  return role === 'staff' || role === 'admin' || normalizedName.includes('accountant');
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
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
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

      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        const found = normalizedStaff.find(s => s.user_id === session.user.id);
        if (found) {
          setCurrentStaff(found);
          setIsAuthenticated(true);
          const savedTeam = localStorage.getItem('crew_tracker_team_id');
          setSelectedTeamId(savedTeam || String(found.staff_id));
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

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session?.user) {
        const { data: staffData } = await supabase.from('staff').select('*').eq('user_id', session.user.id).single();
        if (staffData) {
          const normalized = enforcePermanentAdmin(staffData);
          setCurrentStaff(normalized);
          setIsAuthenticated(true);
          const savedTeam = localStorage.getItem('crew_tracker_team_id');
          setSelectedTeamId(savedTeam || String(normalized.staff_id));
        }
      } else if (event === 'SIGNED_OUT') {
        setCurrentStaff(null);
        setIsAuthenticated(false);
        setSelectedTeamId(null);
        localStorage.removeItem('crew_tracker_team_id');
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const signInWithEmail = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error: error.message };

    if (data.user) {
      const { data: staffData } = await supabase.from('staff').select('*').eq('user_id', data.user.id).single();
      if (staffData) {
        await createAuditLog({
          pagePath: '/login',
          pageLabel: 'Login',
          actionType: 'login',
          entityType: 'session',
          entityId: String(staffData.staff_id),
          description: `${staffData.name} signed in`,
          actorStaffId: staffData.staff_id,
          teamId: staffData.team_id,
          metadata: { email_entered: email },
        });
      }
    }

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
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + '/settings',
    });
    if (error) return { error: error.message };
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
    signInWithEmail,
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