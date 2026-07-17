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
      alerts: {
        Row: {
          created_at: string
          dismissed_at: string | null
          dismissed_by: string | null
          followup_id: string | null
          id: string
          message: string
          session_id: string | null
          severity: Database["public"]["Enums"]["alert_severity"]
          target_role: Database["public"]["Enums"]["app_role"] | null
        }
        Insert: {
          created_at?: string
          dismissed_at?: string | null
          dismissed_by?: string | null
          followup_id?: string | null
          id?: string
          message: string
          session_id?: string | null
          severity?: Database["public"]["Enums"]["alert_severity"]
          target_role?: Database["public"]["Enums"]["app_role"] | null
        }
        Update: {
          created_at?: string
          dismissed_at?: string | null
          dismissed_by?: string | null
          followup_id?: string | null
          id?: string
          message?: string
          session_id?: string | null
          severity?: Database["public"]["Enums"]["alert_severity"]
          target_role?: Database["public"]["Enums"]["app_role"] | null
        }
        Relationships: [
          {
            foreignKeyName: "alerts_dismissed_by_fkey"
            columns: ["dismissed_by"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alerts_followup_id_fkey"
            columns: ["followup_id"]
            isOneToOne: false
            referencedRelation: "follow_ups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alerts_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "visit_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      checklist_items: {
        Row: {
          completed_at: string | null
          completed_by: string | null
          exception_category:
            | Database["public"]["Enums"]["exception_category"]
            | null
          exception_reason: string | null
          id: string
          rule_id: string
          session_id: string
          status: Database["public"]["Enums"]["checklist_item_status"]
        }
        Insert: {
          completed_at?: string | null
          completed_by?: string | null
          exception_category?:
            | Database["public"]["Enums"]["exception_category"]
            | null
          exception_reason?: string | null
          id?: string
          rule_id: string
          session_id: string
          status?: Database["public"]["Enums"]["checklist_item_status"]
        }
        Update: {
          completed_at?: string | null
          completed_by?: string | null
          exception_category?:
            | Database["public"]["Enums"]["exception_category"]
            | null
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
            referencedRelation: "visit_sessions"
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
      daily_session_counters: {
        Row: {
          counter_date: string
          next_number: number
        }
        Insert: {
          counter_date: string
          next_number?: number
        }
        Update: {
          counter_date?: string
          next_number?: number
        }
        Relationships: []
      }
      follow_ups: {
        Row: {
          created_at: string
          day_offset: number
          due_date: string
          followup_type: Database["public"]["Enums"]["followup_type"]
          handled_at: string | null
          handled_by: string | null
          id: string
          notes: string | null
          session_id: string
          status: Database["public"]["Enums"]["followup_status"]
        }
        Insert: {
          created_at?: string
          day_offset: number
          due_date: string
          followup_type?: Database["public"]["Enums"]["followup_type"]
          handled_at?: string | null
          handled_by?: string | null
          id?: string
          notes?: string | null
          session_id: string
          status?: Database["public"]["Enums"]["followup_status"]
        }
        Update: {
          created_at?: string
          day_offset?: number
          due_date?: string
          followup_type?: Database["public"]["Enums"]["followup_type"]
          handled_at?: string | null
          handled_by?: string | null
          id?: string
          notes?: string | null
          session_id?: string
          status?: Database["public"]["Enums"]["followup_status"]
        }
        Relationships: [
          {
            foreignKeyName: "follow_ups_handled_by_fkey"
            columns: ["handled_by"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follow_ups_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "visit_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      lab_orders: {
        Row: {
          completed_at: string | null
          completed_by: string | null
          created_at: string
          id: string
          notes: string | null
          ordered_by: string | null
          result_note: string | null
          round_number: number
          status: Database["public"]["Enums"]["lab_order_status"]
          test_name: string
          visit_session_id: string
        }
        Insert: {
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          ordered_by?: string | null
          result_note?: string | null
          round_number?: number
          status?: Database["public"]["Enums"]["lab_order_status"]
          test_name: string
          visit_session_id: string
        }
        Update: {
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          ordered_by?: string | null
          result_note?: string | null
          round_number?: number
          status?: Database["public"]["Enums"]["lab_order_status"]
          test_name?: string
          visit_session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lab_orders_completed_by_fkey"
            columns: ["completed_by"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lab_orders_ordered_by_fkey"
            columns: ["ordered_by"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lab_orders_visit_session_id_fkey"
            columns: ["visit_session_id"]
            isOneToOne: false
            referencedRelation: "visit_sessions"
            referencedColumns: ["id"]
          },
        ]
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
      visit_exam_rounds: {
        Row: {
          called_at: string | null
          clinical_exam_note: string | null
          completed_at: string | null
          created_at: string
          crm_lookup_used: boolean
          dentist_id: string | null
          id: string
          needs_lab: boolean
          round_number: number
          symptoms_note: string | null
          visit_session_id: string
        }
        Insert: {
          called_at?: string | null
          clinical_exam_note?: string | null
          completed_at?: string | null
          created_at?: string
          crm_lookup_used?: boolean
          dentist_id?: string | null
          id?: string
          needs_lab?: boolean
          round_number?: number
          symptoms_note?: string | null
          visit_session_id: string
        }
        Update: {
          called_at?: string | null
          clinical_exam_note?: string | null
          completed_at?: string | null
          created_at?: string
          crm_lookup_used?: boolean
          dentist_id?: string | null
          id?: string
          needs_lab?: boolean
          round_number?: number
          symptoms_note?: string | null
          visit_session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "visit_exam_rounds_dentist_id_fkey"
            columns: ["dentist_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visit_exam_rounds_visit_session_id_fkey"
            columns: ["visit_session_id"]
            isOneToOne: false
            referencedRelation: "visit_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      visit_sessions: {
        Row: {
          assigned_dentist_id: string | null
          bed_number: string | null
          chief_complaint: string | null
          closed_at: string | null
          compliance_score: number | null
          created_at: string
          created_by: string | null
          current_round: number
          cycle_number: number
          diagnosis: string | null
          id: string
          is_emergency: boolean
          patient_id: string
          prescription: string | null
          procedure_type: Database["public"]["Enums"]["procedure_type"] | null
          root_session_id: string | null
          session_number: number | null
          status: Database["public"]["Enums"]["visit_status"]
          treatment_plan: string | null
        }
        Insert: {
          assigned_dentist_id?: string | null
          bed_number?: string | null
          chief_complaint?: string | null
          closed_at?: string | null
          compliance_score?: number | null
          created_at?: string
          created_by?: string | null
          current_round?: number
          cycle_number?: number
          diagnosis?: string | null
          id?: string
          is_emergency?: boolean
          patient_id: string
          prescription?: string | null
          procedure_type?: Database["public"]["Enums"]["procedure_type"] | null
          root_session_id?: string | null
          session_number?: number | null
          status?: Database["public"]["Enums"]["visit_status"]
          treatment_plan?: string | null
        }
        Update: {
          assigned_dentist_id?: string | null
          bed_number?: string | null
          chief_complaint?: string | null
          closed_at?: string | null
          compliance_score?: number | null
          created_at?: string
          created_by?: string | null
          current_round?: number
          cycle_number?: number
          diagnosis?: string | null
          id?: string
          is_emergency?: boolean
          patient_id?: string
          prescription?: string | null
          procedure_type?: Database["public"]["Enums"]["procedure_type"] | null
          root_session_id?: string | null
          session_number?: number | null
          status?: Database["public"]["Enums"]["visit_status"]
          treatment_plan?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "visit_sessions_assigned_dentist_id_fkey"
            columns: ["assigned_dentist_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visit_sessions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visit_sessions_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visit_sessions_root_session_id_fkey"
            columns: ["root_session_id"]
            isOneToOne: false
            referencedRelation: "visit_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      escalate_overdue_followups: { Args: never; Returns: number }
      get_patient_checklist: {
        Args: { p_session_id: string }
        Returns: {
          bed_number: string | null
          cycle_number: number
          patient_name: string
          round_number: number | null
          session_number: number | null
          status: Database["public"]["Enums"]["lab_order_status"] | null
          test_name: string | null
        }[]
      }
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
      alert_severity: "info" | "warning" | "critical"
      allergy_severity: "mild" | "moderate" | "severe"
      app_role: "admin" | "dentist" | "assistant" | "receptionist" | "lab_technician"
      checklist_category:
        | "documentation"
        | "clinical_step"
        | "infection_control"
        | "imaging"
        | "medication"
      checklist_item_status: "pending" | "done" | "exception"
      checklist_timing: "before" | "during" | "after"
      exception_category:
        | "patient_refusal"
        | "equipment_unavailable"
        | "clinical_contraindication"
        | "other"
      followup_status: "scheduled" | "contacted" | "completed" | "missed"
      followup_type: "call" | "review"
      lab_order_status: "ordered" | "in_progress" | "completed"
      procedure_type:
        | "extraction"
        | "root_canal"
        | "scaling"
        | "implant"
        | "filling"
      visit_status:
        | "pending"
        | "called"
        | "in_exam"
        | "waiting_lab"
        | "waiting_recall"
        | "finalizing"
        | "transferred"
        | "done"
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
      alert_severity: ["info", "warning", "critical"],
      allergy_severity: ["mild", "moderate", "severe"],
      app_role: ["admin", "dentist", "assistant", "receptionist", "lab_technician"],
      checklist_category: [
        "documentation",
        "clinical_step",
        "infection_control",
        "imaging",
        "medication",
      ],
      checklist_item_status: ["pending", "done", "exception"],
      checklist_timing: ["before", "during", "after"],
      exception_category: [
        "patient_refusal",
        "equipment_unavailable",
        "clinical_contraindication",
        "other",
      ],
      followup_status: ["scheduled", "contacted", "completed", "missed"],
      followup_type: ["call", "review"],
      lab_order_status: ["ordered", "in_progress", "completed"],
      procedure_type: [
        "extraction",
        "root_canal",
        "scaling",
        "implant",
        "filling",
      ],
      visit_status: [
        "pending",
        "called",
        "in_exam",
        "waiting_lab",
        "waiting_recall",
        "finalizing",
        "transferred",
        "done",
      ],
    },
  },
} as const
