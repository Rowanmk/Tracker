import React, { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import { supabase } from '../supabase/client';
import type { Database } from '../supabase/types';

type Staff = Database['public']['Tables']['staff']['Row'];
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
  currentStaff: Staff | null;
  isAdmin: boolean;
  isAuthenticated: boolean;
  selectedStaffId: string | null;
  onStaffChange: (staffId: number | "team") => void;
  showFallbackWarning: boolean;
  error: string | null;
  staffLoaded: boolean;
  permissions: Permission[];
  hasPermission: (path: string) => boolean;
  refreshStaff: () => Promise<void>;
}

interface AuthProviderProps {
  children: ReactNode;
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [loading, setLoading] = useState<boolean>(true);
  const [staffLoaded, setStaffLoaded] = useState<boolean>(false);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [allStaff, setAllStaff] = useState<Staff[]>([]);
  const [currentStaff, setCurrentStaff] = useState<Staff | null>(null);
  const [selectedStaffId, setSelectedStaffId] = useState<string | null>(null);
  const [showFallbackWarning, setShowFallbackWarning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [permissions, setPermissions] = useState<Permission[]>([]);

  const allStaffRef = React.useRef<Staff[]>([]);

  const fetchPermissions = async () => {
    const { data, error: permError } = await supabase
      .from('role_permissions')
      .select('*');
    if (!permError && data) {
      setPermissions(data);
    }
  };

  const fetchStaff = async () => {
    try {
      setError(null);
      const { data, error: staffError } = await supabase
        .from('staff')
        .select('*')
        .order('name');

      if (staffError) {
        setError(`Failed to load staff data: ${staffError.message}`);
        return;
      }

      const allStaffData = data || [];
      allStaffRef.current = allStaffData;
      setAllStaff(allStaffData);
      setStaff(allStaffData.filter((s) => !s.is_hidden));
      
      // Update current staff if already logged in
      const savedStaffId = localStorage.getItem('crew_tracker_staff_id');
      if (savedStaffId) {
        const found = allStaffData.find(s => s.staff_id === Number(savedStaffId));
        if (found) setCurrentStaff(found);
      }

      await fetchPermissions();
    } catch (err) {
      setError('Failed to connect to the database.');
    } finally {
      setStaffLoaded(true);
    }
  };

  useEffect(() => {
    fetchStaff();
  }, []);

  useEffect(() => {
    if (!staffLoaded) return;

    const savedStaffId = localStorage.getItem('crew_tracker_staff_id');

    if (savedStaffId && allStaffRef.current.length > 0) {
      const found = allStaffRef.current.find(
        (s) => s.staff_id === Number(savedStaffId) && !s.is_hidden
      );

      if (found) {
        setCurrentStaff(found);
        setIsAuthenticated(true);
        setSelectedStaffId(found.staff_id.toString());
      } else {
        localStorage.removeItem('crew_tracker_staff_id');
        setIsAuthenticated(false);
      }
    }

    setLoading(false);
  }, [staffLoaded]);

  const signInWithCredentials = async (
    username: string,
    password: string
  ): Promise<{ error?: string }> => {
    const currentAllStaff = allStaffRef.current;
    if (!staffLoaded) return { error: 'Still loading staff data.' };

    const enteredUsername = username.toLowerCase().trim();
    const enteredPassword = password.trim();

    const matched = currentAllStaff.find((s) => {
      const staffFirstName = s.name.split(' ')[0].toLowerCase().trim();
      return staffFirstName === enteredUsername && !s.is_hidden;
    });

    if (!matched) return { error: 'Invalid username or password.' };

    const dbPassword = matched.password || matched.name.split(' ')[0].toLowerCase().trim();
    
    if (enteredPassword !== dbPassword) {
      return { error: 'Invalid username or password.' };
    }

    setCurrentStaff(matched);
    setIsAuthenticated(true);
    localStorage.setItem('crew_tracker_staff_id', matched.staff_id.toString());
    setSelectedStaffId(matched.staff_id.toString());

    return {};
  };

  const getSecurityQuestion = async (username: string): Promise<{ question?: string; error?: string }> => {
    const enteredUsername = username.toLowerCase().trim();
    const matched = allStaffRef.current.find((s) => {
      const staffFirstName = s.name.split(' ')[0].toLowerCase().trim();
      return staffFirstName === enteredUsername && !s.is_hidden;
    });

    if (!matched) return { error: 'User not found.' };
    if (!matched.security_question) return { error: 'No security question set for this user. Please contact an admin.' };

    return { question: matched.security_question };
  };

  const resetPasswordWithSecurityAnswer = async (
    username: string,
    answer: string,
    newPassword: string
  ): Promise<{ error?: string }> => {
    const enteredUsername = username.toLowerCase().trim();
    const matched = allStaffRef.current.find((s) => {
      const staffFirstName = s.name.split(' ')[0].toLowerCase().trim();
      return staffFirstName === enteredUsername && !s.is_hidden;
    });

    if (!matched) return { error: 'User not found.' };
    
    if (!matched.security_answer || matched.security_answer.toLowerCase().trim() !== answer.toLowerCase().trim()) {
      return { error: 'Incorrect security answer.' };
    }

    const { error: updateError } = await supabase
      .from('staff')
      .update({ password: newPassword.trim() })
      .eq('staff_id', matched.staff_id);

    if (updateError) return { error: 'Failed to update password.' };

    await fetchStaff();
    return {};
  };

  const signOut = async (): Promise<void> => {
    setCurrentStaff(null);
    setIsAuthenticated(false);
    setSelectedStaffId(null);
    localStorage.removeItem('crew_tracker_staff_id');
  };

  const onStaffChange = (staffIdOrTeam: number | "team") => {
    if (staffIdOrTeam === 'team') {
      setSelectedStaffId('team');
      return;
    }
    const selectedStaff = allStaffRef.current.find(
      (s) => s.staff_id === staffIdOrTeam && !s.is_hidden
    );
    if (selectedStaff) {
      setSelectedStaffId(staffIdOrTeam.toString());
    }
  };

  const hasPermission = useCallback((path: string): boolean => {
    if (!currentStaff) return false;
    const perm = permissions.find(p => p.role === currentStaff.role && p.page_path === path);
    return perm ? perm.is_visible : true;
  }, [currentStaff, permissions]);

  const isAdmin = currentStaff?.role === 'admin';

  const value: AuthContextType = {
    user: null,
    loading,
    signOut,
    signInWithCredentials,
    getSecurityQuestion,
    resetPasswordWithSecurityAnswer,
    staff,
    allStaff,
    currentStaff,
    isAdmin,
    isAuthenticated,
    selectedStaffId,
    onStaffChange,
    showFallbackWarning,
    error,
    staffLoaded,
    permissions,
    hasPermission,
    refreshStaff: fetchStaff
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextType => useContext(AuthContext);