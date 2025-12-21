export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      bank_holidays: {
        Row: {
          bunting: boolean | null
          created_at: string | null
          date: string
          id: number
          notes: string | null
          region: string
          source: string | null
          title: string
        }
        Insert: {
          bunting?: boolean | null
          created_at?: string | null
          date: string
          id?: number
          notes?: string | null
          region: string
          source?: string | null
          title: string
        }
        Update: {
          bunting?: boolean | null
          created_at?: string | null
          date?: string
          id?: number
          notes?: string | null
          region?: string
          source?: string | null
          title?: string
        }
        Relationships: []
      }
      dailyactivity: {
        Row: {
          activity_id: number
          date: string
          day: number
          delivered_count: number
          month: number
          service_id: number | null
          staff_id: number | null
          year: number
        }
        Insert: {
          activity_id?: number
          date: string
          day: number
          delivered_count?: number
          month: number
          service_id?: number | null
          staff_id?: number | null
          year: number
        }
        Update: {
          activity_id?: number
          date?: string
          day?: number
          delivered_count?: number
          month?: number
          service_id?: number | null
          staff_id?: number | null
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "dailyactivity_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["service_id"]
          },
          {
            foreignKeyName: "dailyactivity_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["staff_id"]
          },
        ]
      }
      monthlytargets: {
        Row: {
          month: number
          service_id: number | null
          staff_id: number | null
          target_id: number
          target_value: number
          year: number
        }
        Insert: {
          month: number
          service_id?: number | null
          staff_id?: number | null
          target_id?: number
          target_value: number
          year: number
        }
        Update: {
          month?: number
          service_id?: number | null
          staff_id?: number | null
          target_id?: number
          target_value?: number
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "monthlytargets_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["service_id"]
          },
          {
            foreignKeyName: "monthlytargets_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["staff_id"]
          },
        ]
      }
      public_holidays: {
        Row: {
          country: string | null
          created_at: string | null
          date: string
          id: number
          is_team_wide: boolean
          name: string
          source: string | null
        }
        Insert: {
          country?: string | null
          created_at?: string | null
          date: string
          id?: number
          is_team_wide?: boolean
          name: string
          source?: string | null
        }
        Update: {
          country?: string | null
          created_at?: string | null
          date?: string
          id?: number
          is_team_wide?: boolean
          name?: string
          source?: string | null
        }
        Relationships: []
      }
      sa_annual_targets: {
        Row: {
          annual_target: number
          created_at: string | null
          id: number
          staff_id: number
          updated_at: string | null
          year: number
        }
        Insert: {
          annual_target?: number
          created_at?: string | null
          id?: number
          staff_id: number
          updated_at?: string | null
          year: number
        }
        Update: {
          annual_target?: number
          created_at?: string | null
          id?: number
          staff_id?: number
          updated_at?: string | null
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "sa_annual_targets_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["staff_id"]
          },
        ]
      }
      sa_distribution_rules: {
        Row: {
          created_at: string | null
          id: number
          months: number[]
          percentage: number
          period_name: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: number
          months: number[]
          percentage: number
          period_name: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: number
          months?: number[]
          percentage?: number
          period_name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      services: {
        Row: {
          service_id: number
          service_name: string
        }
        Insert: {
          service_id?: number
          service_name: string
        }
        Update: {
          service_id?: number
          service_name?: string
        }
        Relationships: []
      }
      staff: {
        Row: {
          created_at: string | null
          home_region: string | null
          is_hidden: boolean | null
          name: string
          role: string
          staff_id: number
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          home_region?: string | null
          is_hidden?: boolean | null
          name: string
          role?: string
          staff_id?: number
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          home_region?: string | null
          is_hidden?: boolean | null
          name?: string
          role?: string
          staff_id?: number
          user_id?: string | null
        }
        Relationships: []
      }
      staff_leave: {
        Row: {
          created_at: string | null
          date: string | null
          end_date: string
          id: number
          notes: string | null
          staff_id: number
          start_date: string
          type: string
        }
        Insert: {
          created_at?: string | null
          date?: string | null
          end_date: string
          id?: number
          notes?: string | null
          staff_id: number
          start_date: string
          type?: string
        }
        Update: {
          created_at?: string | null
          date?: string | null
          end_date?: string
          id?: number
          notes?: string | null
          staff_id?: number
          start_date?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_leave_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["staff_id"]
          },
        ]
      }
      working_days: {
        Row: {
          date: string
          day: number
          is_working_day: boolean
          month: number
          year: number
        }
        Insert: {
          date: string
          day: number
          is_working_day: boolean
          month: number
          year: number
        }
        Update: {
          date?: string
          day?: number
          is_working_day?: boolean
          month?: number
          year?: number
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const