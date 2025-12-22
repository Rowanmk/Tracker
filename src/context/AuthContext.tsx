import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User, AuthError } from '@supabase/supabase-js';
import { supabase } from '../supabase/client';
import type { Database } from '../supabase/types';

type Staff = Database['public']['Tables']['staff']['Row'];

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signOut: () => Promise<void>;
  signInWithOAuth: (provider: string) => Promise<{ error?: AuthError }>;
  signInWithGoogle: () => Promise<{ error?: AuthError }>;
  signInWithFacebook: () => Promise<{ error?: AuthError }>;
  signInWithGitHub: () => Promise<{ error?: AuthError }>;
  staff: Staff[];
  allStaff: Staff[];
  currentStaff: Staff | null;
  isAdmin: boolean;
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
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [allStaff, setAllStaff] = useState<Staff[]>([]);
  const [currentStaff, setCurrentStaff] = useState<Staff | null>(null);
  const [selectedStaffId, setSelectedStaffId] = useState<string | null>("team");
  const [showFallbackWarning, setShowFallbackWarning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Get initial session
    const getSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setUser(session?.user ?? null);
      setLoading(false);
    };

    getSession();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        setUser(session?.user ?? null);
        setLoading(false);
      }
    );

    return () => subscription.unsubscribe();
  }, []);

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
          console.error('Error fetching staff:', staffError);
          setError('Failed to load staff data');
          setShowFallbackWarning(true);
          
          // Create mock staff for demo
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
        console.error('Error in fetchStaff:', err);
        setError('Failed to connect to database');
        setShowFallbackWarning(true);
        
        // Fallback to mock data
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
      }
    };

    fetchStaff();
  }, []);

  useEffect(() => {
    if (user && staff.length > 0) {
      // Try to find staff member linked to this user
      const linkedStaff = staff.find(s => s.user_id === user.id);
      if (linkedStaff) {
        setCurrentStaff(linkedStaff);
      } else {
        // Default to first staff member if no link found
        setCurrentStaff(staff[0]);
      }
    } else if (staff.length > 0) {
      // No user logged in, default to first staff member
      setCurrentStaff(staff[0]);
    }
  }, [user, staff]);

  const signOut = async (): Promise<void> => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error('Error signing out:', error.message);
    }
  };

  const signInWithOAuth = async (provider: string): Promise<{ error?: AuthError }> => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: provider as any,
      options: {
        redirectTo: `${window.location.origin}/`
      }
    });
    if (error) {
      console.error(`Error signing in with ${provider}:`, error.message);
      return { error };
    }
    return {};
  };

  const signInWithGoogle = async () => signInWithOAuth('google');
  const signInWithFacebook = async () => signInWithOAuth('facebook');
  const signInWithGitHub = async () => signInWithOAuth('github');

  const onStaffChange = (staffIdOrTeam: number | "team") => {
    if (staffIdOrTeam === "team") {
      setSelectedStaffId("team");
      // Keep currentStaff as is for reference, but mode is team
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
    user,
    loading,
    signOut,
    signInWithOAuth,
    signInWithGoogle,
    signInWithFacebook,
    signInWithGitHub,
    staff,
    allStaff,
    currentStaff,
    isAdmin,
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