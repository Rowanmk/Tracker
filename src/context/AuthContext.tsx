import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { supabase } from '../supabase/client';
import type { Database } from '../supabase/types';

type Staff = Database['public']['Tables']['staff']['Row'];

interface AuthContextType {
  user: null;
  loading: boolean;
  signOut: () => Promise<void>;
  signInWithOAuth: (provider: string) => Promise<{ error?: any }>;
  signInWithGoogle: () => Promise<{ error?: any }>;
  signInWithFacebook: () => Promise<{ error?: any }>;
  signInWithGitHub: () => Promise<{ error?: any }>;
  signInWithCredentials: (username: string, password: string) => Promise<{ error?: string }>;
  staff: Staff[];
  allStaff: Staff[];
  currentStaff: Staff | null;
  isAdmin: boolean;
  isAuthenticated: boolean;
  selectedStaffId: string | null;
  onStaffChange: (staffId: number | "team") => void;
  showFallbackWarning: boolean;
  error: string | null;
}

interface AuthProviderProps {
  children: ReactNode;
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [loading, setLoading] = useState<boolean>(true);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [allStaff, setAllStaff] = useState<Staff[]>([]);
  const [currentStaff, setCurrentStaff] = useState<Staff | null>(null);
  const [selectedStaffId, setSelectedStaffId] = useState<string | null>("team");
  const [showFallbackWarning, setShowFallbackWarning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);

  useEffect(() => {
    const fetchStaff = async () => {
      try {
        setError(null);
        setShowFallbackWarning(false);

        const { data, error: staffError } = await supabase
          .from('staff')
          .select('*')
          .order('name');

        if (staffError) {
          setError('Failed to load staff data');
          setShowFallbackWarning(true);
          const mockStaff: Staff[] = [
            {
              staff_id: 1,
              name: 'John Smith',
              role: 'admin',
              home_region: 'england-and-wales',
              is_hidden: false,
              user_id: null,
              created_at: new Date().toISOString(),
            },
            {
              staff_id: 2,
              name: 'Jane Doe',
              role: 'staff',
              home_region: 'england-and-wales',
              is_hidden: false,
              user_id: null,
              created_at: new Date().toISOString(),
            },
          ];
          setAllStaff(mockStaff);
          setStaff(mockStaff.filter(s => !s.is_hidden));
        } else {
          const allStaffData = data || [];
          setAllStaff(allStaffData);
          setStaff(allStaffData.filter(s => !s.is_hidden));
        }
      } catch (err) {
        setError('Failed to connect to database');
        setShowFallbackWarning(true);
        const mockStaff: Staff[] = [
          {
            staff_id: 1,
            name: 'John Smith',
            role: 'admin',
            home_region: 'england-and-wales',
            is_hidden: false,
            user_id: null,
            created_at: new Date().toISOString(),
          },
          {
            staff_id: 2,
            name: 'Jane Doe',
            role: 'staff',
            home_region: 'england-and-wales',
            is_hidden: false,
            user_id: null,
            created_at: new Date().toISOString(),
          },
        ];
        setAllStaff(mockStaff);
        setStaff(mockStaff.filter(s => !s.is_hidden));
      } finally {
        setLoading(false);
      }
    };

    fetchStaff();

    // Restore session from localStorage
    const savedStaffId = localStorage.getItem('crew_tracker_staff_id');
    if (savedStaffId) {
      setIsAuthenticated(true);
    }
  }, []);

  // Once staff is loaded, restore the logged-in staff member
  useEffect(() => {
    if (allStaff.length === 0) return;

    const savedStaffId = localStorage.getItem('crew_tracker_staff_id');
    if (savedStaffId) {
      const found = allStaff.find(s => s.staff_id === Number(savedStaffId));
      if (found) {
        setCurrentStaff(found);
        setIsAuthenticated(true);
        // Non-admin defaults to their own view; admin defaults to team
        if (found.role !== 'admin') {
          setSelectedStaffId(found.staff_id.toString());
        } else {
          setSelectedStaffId("team");
        }
      } else {
        // Staff no longer exists — clear session
        localStorage.removeItem('crew_tracker_staff_id');
        setIsAuthenticated(false);
      }
    }
  }, [allStaff]);

  const signInWithCredentials = async (
    username: string,
    password: string
  ): Promise<{ error?: string }> => {
    if (allStaff.length === 0) {
      return { error: 'Staff data not loaded yet. Please try again.' };
    }

    // Match by first name (case-insensitive)
    const firstName = username.toLowerCase().trim();
    const matched = allStaff.find(s => {
      const staffFirstName = s.name.split(' ')[0].toLowerCase();
      return staffFirstName === firstName;
    });

    if (!matched) {
      return { error: 'Invalid username or password.' };
    }

    // Password = first name (case-insensitive)
    const staffFirstName = matched.name.split(' ')[0].toLowerCase();
    if (password.toLowerCase().trim() !== staffFirstName) {
      return { error: 'Invalid username or password.' };
    }

    if (matched.is_hidden) {
      return { error: 'This account is inactive. Please contact an administrator.' };
    }

    // Successful login
    setCurrentStaff(matched);
    setIsAuthenticated(true);
    localStorage.setItem('crew_tracker_staff_id', matched.staff_id.toString());

    // Non-admin: default to their own view
    if (matched.role !== 'admin') {
      setSelectedStaffId(matched.staff_id.toString());
    } else {
      setSelectedStaffId("team");
    }

    return {};
  };

  const signOut = async (): Promise<void> => {
    setCurrentStaff(null);
    setIsAuthenticated(false);
    setSelectedStaffId("team");
    localStorage.removeItem('crew_tracker_staff_id');
  };

  const signInWithOAuth = async (_provider: string): Promise<{ error?: any }> => {
    return { error: 'OAuth not supported in this version.' };
  };

  const signInWithGoogle = async () => signInWithOAuth('google');
  const signInWithFacebook = async () => signInWithOAuth('facebook');
  const signInWithGitHub = async () => signInWithOAuth('github');

  const onStaffChange = (staffIdOrTeam: number | "team") => {
    if (staffIdOrTeam === "team") {
      setSelectedStaffId("team");
    } else {
      const selectedStaff = allStaff.find(s => s.staff_id === staffIdOrTeam);
      if (selectedStaff) {
        setCurrentStaff(selectedStaff);
        setSelectedStaffId(staffIdOrTeam.toString());
      }
    }
  };

  const isAdmin = currentStaff?.role === 'admin';

  const value: AuthContextType = {
    user: null,
    loading,
    signOut,
    signInWithOAuth,
    signInWithGoogle,
    signInWithFacebook,
    signInWithGitHub,
    signInWithCredentials,
    staff,
    allStaff,
    currentStaff,
    isAdmin,
    isAuthenticated,
    selectedStaffId,
    onStaffChange,
    showFallbackWarning,
    error,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => useContext(AuthContext);