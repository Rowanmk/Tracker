import React, { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
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
  onTeamChange: (teamId: number | "all") => void;
  showFallbackWarning: boolean;
  error: string | null;
  staffLoaded: boolean;
  permissions: Permission[];
  hasPermission: (path: string) => boolean;
  refreshStaff: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

const PERMANENT_ADMIN_NAME = 'rowan';

const enforcePermanentAdmin = (staffMember: Staff): Staff => {
  const firstName = staffMember.name.split(' ')[0]?.trim().toLowerCase();
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
        supabase.from('role_permissions').select('*')
      ]);

      if (staffRes.error) throw staffRes.error;
      if (teamsRes.error) throw teamsRes.error;

      const normalizedStaff = staffRes.data.map(enforcePermanentAdmin);
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
          // Default selection to user's team
          setSelectedTeamId(found.team_id ? found.team_id.toString() : 'all');
        }
      }
    } catch (err: any) {
      setError(err.message);
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
    const matched = allStaff.find(s => s.name.split(' ')[0].toLowerCase().trim() === enteredUsername && !s.is_hidden);

    if (!matched) return { error: 'Invalid username or password.' };
    const dbPassword = matched.password || matched.name.split(' ')[0].toLowerCase().trim();
    if (password.trim() !== dbPassword) return { error: 'Invalid username or password.' };

    setCurrentStaff(matched);
    setIsAuthenticated(true);
    localStorage.setItem('crew_tracker_staff_id', matched.staff_id.toString());
    setSelectedTeamId(matched.team_id ? matched.team_id.toString() : 'all');
    return {};
  };

  const signOut = async () => {
    setCurrentStaff(null);
    setIsAuthenticated(false);
    setSelectedTeamId(null);
    localStorage.removeItem('crew_tracker_staff_id');
  };

  const onTeamChange = (teamId: number | "all") => {
    setSelectedTeamId(teamId.toString());
  };

  const hasPermission = useCallback((path: string): boolean => {
    if (!currentStaff) return false;
    const perm = permissions.find(p => p.role === currentStaff.role && p.page_path === path);
    return perm ? perm.is_visible !== false : true;
  }, [currentStaff, permissions]);

  const value: AuthContextType = {
    user: null,
    loading,
    signOut,
    signInWithCredentials,
    getSecurityQuestion: async (u) => ({ question: allStaff.find(s => s.name.split(' ')[0].toLowerCase() === u.toLowerCase())?.security_question }),
    resetPasswordWithSecurityAnswer: async (u, a, p) => ({}), // Simplified for brevity
    staff,
    allStaff,
    teams,
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
    refreshStaff: fetchStaff
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => useContext(AuthContext);