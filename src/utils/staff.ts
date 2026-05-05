import type { Database } from '../supabase/types';

type StaffRole = Database['public']['Tables']['staff']['Row']['role'];

export const isAccountantStaff = (staff: { role: StaffRole | string | null | undefined }): boolean => {
  const role = (staff.role || '').toLowerCase();
  return role === 'staff' || role === 'admin';
};