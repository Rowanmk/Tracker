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
  staffLoaded: boolean;
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

  const allStaffRef = React.useRef<Staff[]>([]);

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
          setError(`Failed to load staff data: ${staffError.message}`);
          allStaffRef.current = [];
          setAllStaff([]);
          setStaff([]);
          return;
        }

        const allStaffData = data || [];
        allStaffRef.current = allStaffData;
        setAllStaff(allStaffData);
        setStaff(allStaffData.filter((s) => !s.is_hidden));

        if (allStaffData.length === 0) {
          setError(
            'No staff records were returned from Supabase. Check the table data, RLS policies, and environment variables.'
          );
        }
      } catch (err) {
        setError('Failed to connect to the database.');
        allStaffRef.current = [];
        setAllStaff([]);
        setStaff([]);
      } finally {
        setStaffLoaded(true);
      }
    };

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
        // Default selected staff to the signed-in user (not "team")
        setSelectedStaffId(found.staff_id.toString());
      } else {
        localStorage.removeItem('crew_tracker_staff_id');
        setIsAuthenticated(false);
        setCurrentStaff(null);
        setSelectedStaffId(null);
      }
    }

    setLoading(false);
  }, [staffLoaded]);

  const signInWithCredentials = async (
    username: string,
    password: string
  ): Promise<{ error?: string }> => {
    const currentAllStaff = allStaffRef.current;

    if (!staffLoaded) {
      return { error: 'Still loading staff data. Please wait a moment and try again.' };
    }

    if (currentAllStaff.length === 0) {
      return {
        error:
          'No staff records found. Please check the staff table, RLS policies, or Supabase connection.',
      };
    }

    const enteredUsername = username.toLowerCase().trim();
    const enteredPassword = password.toLowerCase().trim();

    const activeStaff = currentAllStaff.filter((s) => !s.is_hidden && !!s.name?.trim());

    const matched = activeStaff.find((s) => {
      const staffFirstName = s.name.split(' ')[0].toLowerCase().trim();
      return staffFirstName === enteredUsername;
    });

    if (!matched) {
      return { error: 'Invalid username or password.' };
    }

    const staffFirstName = matched.name.split(' ')[0].toLowerCase().trim();

    if (enteredPassword !== staffFirstName) {
      return { error: 'Invalid username or password.' };
    }

    setCurrentStaff(matched);
    setIsAuthenticated(true);
    localStorage.setItem('crew_tracker_staff_id', matched.staff_id.toString());
    // Default to the signed-in user's own view
    setSelectedStaffId(matched.staff_id.toString());

    return {};
  };

  const signOut = async (): Promise<void> => {
    setCurrentStaff(null);
    setIsAuthenticated(false);
    setSelectedStaffId(null);
    localStorage.removeItem('crew_tracker_staff_id');
  };

  const signInWithOAuth = async (_provider: string): Promise<{ error?: any }> => {
    return { error: 'OAuth not supported in this version.' };
  };

  const signInWithGoogle = async () => signInWithOAuth('google');
  const signInWithFacebook = async () => signInWithOAuth('facebook');
  const signInWithGitHub = async () => signInWithOAuth('github');

  const onStaffChange = (staffIdOrTeam: number | "team") => {
    if (staffIdOrTeam === 'team') {
      setSelectedStaffId('team');
      return;
    }

    const selectedStaff = allStaffRef.current.find(
      (s) => s.staff_id === staffIdOrTeam && !s.is_hidden
    );

    if (selectedStaff) {
      setCurrentStaff(selectedStaff);
      setSelectedStaffId(staffIdOrTeam.toString());
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
    staffLoaded,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextType => useContext(AuthContext);