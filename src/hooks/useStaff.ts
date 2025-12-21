import { useAuth } from '../context/AuthContext';

    export const useStaff = () => {
      const { staff, allStaff, currentStaff, isAdmin, loading, error, showFallbackWarning } = useAuth();
      
      return { 
        staff, 
        allStaff, 
        currentStaff,
        isAdmin, 
        loading, 
        error, 
        showFallbackWarning 
      };
    };