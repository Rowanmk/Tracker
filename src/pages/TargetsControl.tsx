import React, { useState, useEffect } from 'react';
import { useDate } from '../context/DateContext';
import { useAuth } from '../context/AuthContext';
import { useServices } from '../hooks/useServices';
import { supabase } from '../supabase/client';
import { getFinancialYearMonths } from '../utils/financialYear';
import {
  calculateAllSAMonths,
  isCurrentOrFutureMonth,
} from '../utils/saRedistribution';
import { getSAPeriodBoundedActuals } from '../utils/saActuals';
import { unparse } from 'papaparse';
import type { Database } from '../supabase/types';

type SADistributionRule =
  Database['public']['Tables']['sa_distribution_rules']['Row'];

interface TargetData {
  staff_id: number;
  name: string;
  targets: {
    [month: number]: {
      [service: string]: number;
    };
  };
}

interface CSVRow {
  staff_id: number;
  staff_name: string;
  service_id: number;
  service_name: string;
  month: number;
  year: number;
  target_value: number;
}

export const TargetsControl: React.FC = () => {
  const { selectedMonth, selectedFinancialYear } = useDate();
  const { allStaff, loading: authLoading, error: authError } = useAuth();
  const { services, loading: ser
