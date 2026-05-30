export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      brand_settings: {
        Row: {
          agency_name: string
          created_at: string
          id: boolean
          logo: string | null
          primary_color: string
          secondary_color: string
          updated_at: string
        }
        Insert: {
          agency_name: string
          created_at?: string
          id?: boolean
          logo?: string | null
          primary_color: string
          secondary_color: string
          updated_at?: string
        }
        Update: {
          agency_name?: string
          created_at?: string
          id?: boolean
          logo?: string | null
          primary_color?: string
          secondary_color?: string
          updated_at?: string
        }
        Relationships: []
      }
      plugin_catalog: {
        Row: {
          created_at: string
          id: string
          name: string
          name_key: string
          notes: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          name_key?: string
          notes?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          name_key?: string
          notes?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      pm_contacts: {
        Row: {
          created_at: string
          email: string
          email_key: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          email_key?: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          email_key?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      project_recurring_plugins: {
        Row: {
          created_at: string
          id: string
          plugin_id: string
          project_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          plugin_id: string
          project_id: string
        }
        Update: {
          created_at?: string
          id?: string
          plugin_id?: string
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_recurring_plugins_plugin_id_fkey"
            columns: ["plugin_id"]
            isOneToOne: false
            referencedRelation: "plugin_catalog"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_recurring_plugins_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          contact_company: string | null
          contact_email: string | null
          contact_name: string | null
          created_at: string
          id: string
          internal_notes: string | null
          name: string
          slug: string
          updated_at: string
          url: string | null
        }
        Insert: {
          contact_company?: string | null
          contact_email?: string | null
          contact_name?: string | null
          created_at?: string
          id?: string
          internal_notes?: string | null
          name: string
          slug: string
          updated_at?: string
          url?: string | null
        }
        Update: {
          contact_company?: string | null
          contact_email?: string | null
          contact_name?: string | null
          created_at?: string
          id?: string
          internal_notes?: string | null
          name?: string
          slug?: string
          updated_at?: string
          url?: string | null
        }
        Relationships: []
      }
      reports: {
        Row: {
          created_at: string
          fixes_applied: string | null
          id: string
          integrity_issues: string | null
          integrity_status: string | null
          licenses: Json
          month: string
          notes_to_client: string | null
          php_from_version: string | null
          php_to_version: string | null
          php_updated: boolean
          plugins: Json
          project_id: string
          themes: Json
          updated_at: string
          wp_core_updated: boolean
          wp_core_version: string | null
        }
        Insert: {
          created_at?: string
          fixes_applied?: string | null
          id?: string
          integrity_issues?: string | null
          integrity_status?: string | null
          licenses?: Json
          month: string
          notes_to_client?: string | null
          php_from_version?: string | null
          php_to_version?: string | null
          php_updated?: boolean
          plugins?: Json
          project_id: string
          themes?: Json
          updated_at?: string
          wp_core_updated?: boolean
          wp_core_version?: string | null
        }
        Update: {
          created_at?: string
          fixes_applied?: string | null
          id?: string
          integrity_issues?: string | null
          integrity_status?: string | null
          licenses?: Json
          month?: string
          notes_to_client?: string | null
          php_from_version?: string | null
          php_to_version?: string | null
          php_updated?: boolean
          plugins?: Json
          project_id?: string
          themes?: Json
          updated_at?: string
          wp_core_updated?: boolean
          wp_core_version?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reports_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
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
