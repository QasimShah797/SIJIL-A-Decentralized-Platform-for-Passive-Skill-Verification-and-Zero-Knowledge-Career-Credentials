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
      github_activities: {
        Row: {
          activity_title: string
          activity_type: string
          activity_url: string | null
          commit_hash: string | null
          external_id: string | null
          github_username: string
          id: string
          linked_skill_id: string | null
          occurred_at: string | null
          repo_name: string | null
          synced_at: string
          user_id: string
        }
        Insert: {
          activity_title: string
          activity_type: string
          activity_url?: string | null
          commit_hash?: string | null
          external_id?: string | null
          github_username: string
          id?: string
          linked_skill_id?: string | null
          occurred_at?: string | null
          repo_name?: string | null
          synced_at?: string
          user_id: string
        }
        Update: {
          activity_title?: string
          activity_type?: string
          activity_url?: string | null
          commit_hash?: string | null
          external_id?: string | null
          github_username?: string
          id?: string
          linked_skill_id?: string | null
          occurred_at?: string | null
          repo_name?: string | null
          synced_at?: string
          user_id?: string
        }
        Relationships: []
      }
      github_connections: {
        Row: {
          access_token: string
          connected_at: string
          github_avatar_url: string | null
          github_user_id: number
          github_username: string
          last_synced_at: string | null
          scopes: string | null
          token_type: string | null
          user_id: string
        }
        Insert: {
          access_token: string
          connected_at?: string
          github_avatar_url?: string | null
          github_user_id: number
          github_username: string
          last_synced_at?: string | null
          scopes?: string | null
          token_type?: string | null
          user_id: string
        }
        Update: {
          access_token?: string
          connected_at?: string
          github_avatar_url?: string | null
          github_user_id?: number
          github_username?: string
          last_synced_at?: string | null
          scopes?: string | null
          token_type?: string | null
          user_id?: string
        }
        Relationships: []
      }
      github_repo_contributors: {
        Row: {
          contributions: number | null
          contributor_avatar_url: string | null
          contributor_html_url: string | null
          contributor_login: string
          full_name: string
          github_url: string
          id: string
          repo_id: number
          synced_at: string
          user_id: string
        }
        Insert: {
          contributions?: number | null
          contributor_avatar_url?: string | null
          contributor_html_url?: string | null
          contributor_login: string
          full_name: string
          github_url: string
          id?: string
          repo_id: number
          synced_at?: string
          user_id: string
        }
        Update: {
          contributions?: number | null
          contributor_avatar_url?: string | null
          contributor_html_url?: string | null
          contributor_login?: string
          full_name?: string
          github_url?: string
          id?: string
          repo_id?: number
          synced_at?: string
          user_id?: string
        }
        Relationships: []
      }
      github_repos: {
        Row: {
          commit_count: number | null
          created_at: string
          description: string | null
          full_name: string
          github_url: string
          github_username: string
          id: string
          last_updated: string | null
          linked_at: string | null
          linked_skill_id: string | null
          linked_skill_name: string | null
          primary_language: string | null
          repo_id: number
          repo_name: string
          synced_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          commit_count?: number | null
          created_at?: string
          description?: string | null
          full_name: string
          github_url: string
          github_username: string
          id?: string
          last_updated?: string | null
          linked_at?: string | null
          linked_skill_id?: string | null
          linked_skill_name?: string | null
          primary_language?: string | null
          repo_id: number
          repo_name: string
          synced_at?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          commit_count?: number | null
          created_at?: string
          description?: string | null
          full_name?: string
          github_url?: string
          github_username?: string
          id?: string
          last_updated?: string | null
          linked_at?: string | null
          linked_skill_id?: string | null
          linked_skill_name?: string | null
          primary_language?: string | null
          repo_id?: number
          repo_name?: string
          synced_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      institution_access_requests: {
        Row: {
          contact_number: string | null
          contact_person_name: string
          contact_person_role: string
          created_at: string
          department: string
          id: string
          institution_name: string
          notes: string | null
          official_email: string
          reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["institution_request_status"]
          updated_at: string
          website: string
        }
        Insert: {
          contact_number?: string | null
          contact_person_name: string
          contact_person_role: string
          created_at?: string
          department: string
          id?: string
          institution_name: string
          notes?: string | null
          official_email: string
          reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["institution_request_status"]
          updated_at?: string
          website: string
        }
        Update: {
          contact_number?: string | null
          contact_person_name?: string
          contact_person_role?: string
          created_at?: string
          department?: string
          id?: string
          institution_name?: string
          notes?: string | null
          official_email?: string
          reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["institution_request_status"]
          updated_at?: string
          website?: string
        }
        Relationships: []
      }
      institution_profiles: {
        Row: {
          contact_email: string | null
          contact_person_name: string | null
          contact_person_role: string | null
          created_at: string
          created_by: string | null
          department: string | null
          domain: string | null
          institution_name: string
          official_email: string | null
          status: Database["public"]["Enums"]["institution_status"]
          updated_at: string
          user_id: string
          website: string | null
        }
        Insert: {
          contact_email?: string | null
          contact_person_name?: string | null
          contact_person_role?: string | null
          created_at?: string
          created_by?: string | null
          department?: string | null
          domain?: string | null
          institution_name: string
          official_email?: string | null
          status?: Database["public"]["Enums"]["institution_status"]
          updated_at?: string
          user_id: string
          website?: string | null
        }
        Update: {
          contact_email?: string | null
          contact_person_name?: string | null
          contact_person_role?: string | null
          created_at?: string
          created_by?: string | null
          department?: string | null
          domain?: string | null
          institution_name?: string
          official_email?: string | null
          status?: Database["public"]["Enums"]["institution_status"]
          updated_at?: string
          user_id?: string
          website?: string | null
        }
        Relationships: []
      }
      learner_profiles: {
        Row: {
          account_activated_at: string | null
          avatar_url: string | null
          bio: string | null
          batch: string | null
          career_goal: string | null
          city_country: string | null
          contact_number: string | null
          created_at: string
          department: string | null
          first_name: string | null
          github_url: string | null
          holder_did: string | null
          institution_id: string | null
          institution_name: string | null
          last_name: string | null
          linkedin_url: string | null
          portfolio_url: string | null
          profile_completed: boolean
          program: string | null
          skills_summary: string | null
          status: Database["public"]["Enums"]["learner_status"]
          student_id: string | null
          university_email: string | null
          updated_at: string
          user_id: string
          username: string | null
        }
        Insert: {
          account_activated_at?: string | null
          avatar_url?: string | null
          bio?: string | null
          batch?: string | null
          career_goal?: string | null
          city_country?: string | null
          contact_number?: string | null
          created_at?: string
          department?: string | null
          first_name?: string | null
          github_url?: string | null
          holder_did?: string | null
          institution_id?: string | null
          institution_name?: string | null
          last_name?: string | null
          linkedin_url?: string | null
          portfolio_url?: string | null
          profile_completed?: boolean
          program?: string | null
          skills_summary?: string | null
          status?: Database["public"]["Enums"]["learner_status"]
          student_id?: string | null
          university_email?: string | null
          updated_at?: string
          user_id: string
          username?: string | null
        }
        Update: {
          account_activated_at?: string | null
          avatar_url?: string | null
          bio?: string | null
          batch?: string | null
          career_goal?: string | null
          city_country?: string | null
          contact_number?: string | null
          created_at?: string
          department?: string | null
          first_name?: string | null
          github_url?: string | null
          holder_did?: string | null
          institution_id?: string | null
          institution_name?: string | null
          last_name?: string | null
          linkedin_url?: string | null
          portfolio_url?: string | null
          profile_completed?: boolean
          program?: string | null
          skills_summary?: string | null
          status?: Database["public"]["Enums"]["learner_status"]
          student_id?: string | null
          university_email?: string | null
          updated_at?: string
          user_id?: string
          username?: string | null
        }
        Relationships: []
      }
      lms_connections: {
        Row: {
          created_at: string
          has_api_key: boolean
          id: string
          last_synced_at: string | null
          odoo_db: string | null
          odoo_login: string | null
          odoo_url: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          has_api_key?: boolean
          id?: string
          last_synced_at?: string | null
          odoo_db?: string | null
          odoo_login?: string | null
          odoo_url?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          has_api_key?: boolean
          id?: string
          last_synced_at?: string | null
          odoo_db?: string | null
          odoo_login?: string | null
          odoo_url?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      lms_evidence: {
        Row: {
          certificate_url: string | null
          completion_status: string | null
          course_code: string | null
          course_name: string
          created_at: string
          evidence_hash: string
          fetched_at: string
          grade: string | null
          id: string
          linked_skill_id: string | null
          raw: Json | null
          source: string
          text_preview: string | null
          user_id: string
        }
        Insert: {
          certificate_url?: string | null
          completion_status?: string | null
          course_code?: string | null
          course_name: string
          created_at?: string
          evidence_hash: string
          fetched_at?: string
          grade?: string | null
          id?: string
          linked_skill_id?: string | null
          raw?: Json | null
          source?: string
          text_preview?: string | null
          user_id: string
        }
        Update: {
          certificate_url?: string | null
          completion_status?: string | null
          course_code?: string | null
          course_name?: string
          created_at?: string
          evidence_hash?: string
          fetched_at?: string
          grade?: string | null
          id?: string
          linked_skill_id?: string | null
          raw?: Json | null
          source?: string
          text_preview?: string | null
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      recruiter_profiles: {
        Row: {
          company_name: string
          company_website: string | null
          contact_number: string | null
          created_at: string
          full_name: string
          job_title: string
          linkedin_url: string | null
          reason: string | null
          updated_at: string
          user_id: string
          verification_status: Database["public"]["Enums"]["recruiter_status"]
          verified_at: string | null
          verified_by: string | null
          work_email: string
        }
        Insert: {
          company_name: string
          company_website?: string | null
          contact_number?: string | null
          created_at?: string
          full_name: string
          job_title: string
          linkedin_url?: string | null
          reason?: string | null
          updated_at?: string
          user_id: string
          verification_status?: Database["public"]["Enums"]["recruiter_status"]
          verified_at?: string | null
          verified_by?: string | null
          work_email: string
        }
        Update: {
          company_name?: string
          company_website?: string | null
          contact_number?: string | null
          created_at?: string
          full_name?: string
          job_title?: string
          linkedin_url?: string | null
          reason?: string | null
          updated_at?: string
          user_id?: string
          verification_status?: Database["public"]["Enums"]["recruiter_status"]
          verified_at?: string | null
          verified_by?: string | null
          work_email?: string
        }
        Relationships: []
      }
      trusted_institution_domains: {
        Row: {
          created_at: string
          domain: string
          institution_name: string
        }
        Insert: {
          created_at?: string
          domain: string
          institution_name: string
        }
        Update: {
          created_at?: string
          domain?: string
          institution_name?: string
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
    }
    Views: {
      github_connections_public: {
        Row: {
          connected_at: string | null
          github_avatar_url: string | null
          github_user_id: number | null
          github_username: string | null
          last_synced_at: string | null
          scopes: string | null
          user_id: string | null
        }
        Insert: {
          connected_at?: string | null
          github_avatar_url?: string | null
          github_user_id?: number | null
          github_username?: string | null
          last_synced_at?: string | null
          scopes?: string | null
          user_id?: string | null
        }
        Update: {
          connected_at?: string | null
          github_avatar_url?: string | null
          github_user_id?: number | null
          github_username?: string | null
          last_synced_at?: string | null
          scopes?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_personal_email: { Args: { _email: string }; Returns: boolean }
      is_trusted_institution_email: {
        Args: { _email: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "learner" | "recruiter" | "institution" | "admin"
      institution_request_status:
        | "pending"
        | "approved"
        | "rejected"
        | "credentials_sent"
      institution_status:
        | "pending_setup"
        | "verified"
        | "suspended"
        | "email_pending"
        | "email_verified"
        | "domain_not_recognized"
        | "needs_review"
        | "active"
      learner_status: "email_pending" | "verified"
      recruiter_status:
        | "pending"
        | "verified"
        | "rejected"
        | "work_email_verified"
        | "limited"
        | "company_domain_verified"
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
      app_role: ["learner", "recruiter", "institution", "admin"],
      institution_request_status: [
        "pending",
        "approved",
        "rejected",
        "credentials_sent",
      ],
      institution_status: [
        "pending_setup",
        "verified",
        "suspended",
        "email_pending",
        "email_verified",
        "domain_not_recognized",
        "needs_review",
        "active",
      ],
      learner_status: ["email_pending", "verified"],
      recruiter_status: [
        "pending",
        "verified",
        "rejected",
        "work_email_verified",
        "limited",
        "company_domain_verified",
      ],
    },
  },
} as const
