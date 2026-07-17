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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      appointments: {
        Row: {
          created_at: string
          created_by: string | null
          dentist_id: string
          duration_mins: number
          id: string
          notes: string | null
          patient_id: string
          procedure_type: Database["public"]["Enums"]["procedure_type"]
          scheduled_at: string
          status: Database["public"]["Enums"]["appointment_status"]
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          dentist_id: string
          duration_mins?: number
          id?: string
          notes?: string | null
          patient_id: string
          procedure_type: Database["public"]["Enums"]["procedure_type"]
          scheduled_at: string
          status?: Database["public"]["Enums"]["appointment_status"]
        }
        Update: {
          created_at?: string
          created_by?: string | null
          dentist_id?: string
          duration_mins?: number
          id?: string
          notes?: string | null
          patient_id?: string
          procedure_type?: Database["public"]["Enums"]["procedure_type"]
          scheduled_at?: string
          status?: Database["public"]["Enums"]["appointment_status"]
        }
        Relationships: [
          {
            foreignKeyName: "appointments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_dentist_id_fkey"
            columns: ["dentist_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      checklist_items: {
        Row: {
          completed_at: string | null
          completed_by: string | null
          exception_reason: string | null
          id: string
          rule_id: string
          session_id: string
          status: Database["public"]["Enums"]["checklist_item_status"]
        }
        Insert: {
          completed_at?: string | null
          completed_by?: string | null
          exception_reason?: string | null
          id?: string
          rule_id: string
          session_id: string
          status?: Database["public"]["Enums"]["checklist_item_status"]
        }
        Update: {
          completed_at?: string | null
          completed_by?: string | null
          exception_reason?: string | null
          id?: string
          rule_id?: string
          session_id?: string
          status?: Database["public"]["Enums"]["checklist_item_status"]
        }
        Relationships: [
          {
            foreignKeyName: "checklist_items_completed_by_fkey"
            columns: ["completed_by"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklist_items_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "checklist_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklist_items_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "treatment_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      checklist_rules: {
        Row: {
          active: boolean
          assigned_role: Database["public"]["Enums"]["app_role"]
          category: Database["public"]["Enums"]["checklist_category"]
          id: string
          label: string
          label_vi: string | null
          procedure_type: Database["public"]["Enums"]["procedure_type"]
          required: boolean
          sort_order: number
          trigger_timing: Database["public"]["Enums"]["checklist_timing"]
        }
        Insert: {
          active?: boolean
          assigned_role: Database["public"]["Enums"]["app_role"]
          category: Database["public"]["Enums"]["checklist_category"]
          id?: string
          label: string
          label_vi?: string | null
          procedure_type: Database["public"]["Enums"]["procedure_type"]
          required?: boolean
          sort_order?: number
          trigger_timing: Database["public"]["Enums"]["checklist_timing"]
        }
        Update: {
          active?: boolean
          assigned_role?: Database["public"]["Enums"]["app_role"]
          category?: Database["public"]["Enums"]["checklist_category"]
          id?: string
          label?: string
          label_vi?: string | null
          procedure_type?: Database["public"]["Enums"]["procedure_type"]
          required?: boolean
          sort_order?: number
          trigger_timing?: Database["public"]["Enums"]["checklist_timing"]
        }
        Relationships: []
      }
      patient_allergies: {
        Row: {
          allergen: string
          created_at: string
          id: string
          note: string | null
          patient_id: string
          severity: Database["public"]["Enums"]["allergy_severity"]
        }
        Insert: {
          allergen: string
          created_at?: string
          id?: string
          note?: string | null
          patient_id: string
          severity?: Database["public"]["Enums"]["allergy_severity"]
        }
        Update: {
          allergen?: string
          created_at?: string
          id?: string
          note?: string | null
          patient_id?: string
          severity?: Database["public"]["Enums"]["allergy_severity"]
        }
        Relationships: [
          {
            foreignKeyName: "patient_allergies_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      patients: {
        Row: {
          contact_prefs: string | null
          created_at: string
          dob: string | null
          email: string | null
          full_name: string
          gender: string | null
          id: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          contact_prefs?: string | null
          created_at?: string
          dob?: string | null
          email?: string | null
          full_name: string
          gender?: string | null
          id?: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          contact_prefs?: string | null
          created_at?: string
          dob?: string | null
          email?: string | null
          full_name?: string
          gender?: string | null
          id?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      staff: {
        Row: {
          active: boolean
          created_at: string
          full_name: string
          id: string
          license_number: string | null
          specialization: string | null
          user_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          full_name: string
          id?: string
          license_number?: string | null
          specialization?: string | null
          user_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          full_name?: string
          id?: string
          license_number?: string | null
          specialization?: string | null
          user_id?: string
        }
        Relationships: []
      }
      treatment_sessions: {
        Row: {
          appointment_id: string
          closed_at: string | null
          compliance_score: number | null
          created_at: string
          id: string
          pipeline_status: Database["public"]["Enums"]["session_status"]
          primary_dentist_id: string | null
        }
        Insert: {
          appointment_id: string
          closed_at?: string | null
          compliance_score?: number | null
          created_at?: string
          id?: string
          pipeline_status?: Database["public"]["Enums"]["session_status"]
          primary_dentist_id?: string | null
        }
        Update: {
          appointment_id?: string
          closed_at?: string | null
          compliance_score?: number | null
          created_at?: string
          id?: string
          pipeline_status?: Database["public"]["Enums"]["session_status"]
          primary_dentist_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "treatment_sessions_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: true
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "treatment_sessions_primary_dentist_id_fkey"
            columns: ["primary_dentist_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_staff: { Args: { _user_id: string }; Returns: boolean }
    }
    Enums: {
      allergy_severity: "mild" | "moderate" | "severe"
      app_role: "admin" | "dentist" | "assistant" | "receptionist"
      appointment_status:
        | "scheduled"
        | "in_progress"
        | "completed"
        | "cancelled"
      checklist_category:
        | "documentation"
        | "clinical_step"
        | "infection_control"
        | "imaging"
        | "medication"
      checklist_item_status: "pending" | "done" | "exception"
      checklist_timing: "before" | "during" | "after"
      procedure_type:
        | "extraction"
        | "root_canal"
        | "scaling"
        | "implant"
        | "filling"
      session_status:
        | "scheduled"
        | "intake"
        | "pre_check"
        | "in_treatment"
        | "post_treatment"
        | "closed"
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
    Enums: {
      allergy_severity: ["mild", "moderate", "severe"],
      app_role: ["admin", "dentist", "assistant", "receptionist"],
      appointment_status: [
        "scheduled",
        "in_progress",
        "completed",
        "cancelled",
      ],
      checklist_category: [
        "documentation",
        "clinical_step",
        "infection_control",
        "imaging",
        "medication",
      ],
      checklist_item_status: ["pending", "done", "exception"],
      checklist_timing: ["before", "during", "after"],
      procedure_type: [
        "extraction",
        "root_canal",
        "scaling",
        "implant",
        "filling",
      ],
      session_status: [
        "scheduled",
        "intake",
        "pre_check",
        "in_treatment",
        "post_treatment",
        "closed",
      ],
    },
  },
} as const
