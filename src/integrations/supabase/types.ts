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
      credentials: {
        Row: {
          attestation_status: string
          created_at: string
          credential_types: string[]
          credential_uri: string
          holder_did: string
          id: string
          issuer_did: string
          issuer_name: string
          name: string
          proof: Json | null
          skill_name: string | null
          supporting_records: number
          updated_at: string
          user_id: string
          valid_from: string
          verification_status: string
        }
        Insert: {
          attestation_status?: string
          created_at?: string
          credential_types?: string[]
          credential_uri: string
          holder_did: string
          id?: string
          issuer_did: string
          issuer_name: string
          name: string
          proof?: Json | null
          skill_name?: string | null
          supporting_records?: number
          updated_at?: string
          user_id: string
          valid_from?: string
          verification_status?: string
        }
        Update: {
          attestation_status?: string
          created_at?: string
          credential_types?: string[]
          credential_uri?: string
          holder_did?: string
          id?: string
          issuer_did?: string
          issuer_name?: string
          name?: string
          proof?: Json | null
          skill_name?: string | null
          supporting_records?: number
          updated_at?: string
          user_id?: string
          valid_from?: string
          verification_status?: string
        }
        Relationships: []
      }
      declared_skills: {
        Row: {
          created_at: string | null
          description: string | null
          domain: string
          id: string
          last_credential_sync_at: string | null
          last_related_activity_at: string | null
          name: string
          pipeline_stage: string
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          domain?: string
          id?: string
          last_credential_sync_at?: string | null
          last_related_activity_at?: string | null
          name: string
          pipeline_stage?: string
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          description?: string | null
          domain?: string
          id?: string
          last_credential_sync_at?: string | null
          last_related_activity_at?: string | null
          name?: string
          pipeline_stage?: string
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      evidence_records: {
        Row: {
          commit_count: number | null
          created_at: string
          description: string | null
          external_id: string
          forks: number
          github_repo_id: number | null
          id: string
          language: string | null
          last_updated: string | null
          mapped_skill_id: string | null
          metadata: Json
          pr_summary: Json | null
          repository_name: string
          repository_url: string
          source: string
          stars: number
          status: string
          suggested_skill_id: string | null
          suggested_skill_name: string | null
          sync_date: string
          updated_at: string
          user_id: string
        }
        Insert: {
          commit_count?: number | null
          created_at?: string
          description?: string | null
          external_id: string
          forks?: number
          github_repo_id?: number | null
          id?: string
          language?: string | null
          last_updated?: string | null
          mapped_skill_id?: string | null
          metadata?: Json
          pr_summary?: Json | null
          repository_name: string
          repository_url: string
          source?: string
          stars?: number
          status?: string
          suggested_skill_id?: string | null
          suggested_skill_name?: string | null
          sync_date?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          commit_count?: number | null
          created_at?: string
          description?: string | null
          external_id?: string
          forks?: number
          github_repo_id?: number | null
          id?: string
          language?: string | null
          last_updated?: string | null
          mapped_skill_id?: string | null
          metadata?: Json
          pr_summary?: Json | null
          repository_name?: string
          repository_url?: string
          source?: string
          stars?: number
          status?: string
          suggested_skill_id?: string | null
          suggested_skill_name?: string | null
          sync_date?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "evidence_records_mapped_skill_id_fkey"
            columns: ["mapped_skill_id"]
            isOneToOne: false
            referencedRelation: "declared_skills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evidence_records_suggested_skill_id_fkey"
            columns: ["suggested_skill_id"]
            isOneToOne: false
            referencedRelation: "declared_skills"
            referencedColumns: ["id"]
          },
        ]
      }
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
      github_discussion_reviews: {
        Row: {
          comment_author: string | null
          comment_body: string | null
          comment_created_at: string | null
          comment_id: string
          comment_url: string | null
          competency_domain: string | null
          competency_name: string | null
          created_at: string
          discussion_category: string | null
          discussion_id: string | null
          discussion_number: number | null
          discussion_title: string | null
          discussion_url: string | null
          id: string
          is_peer_review: boolean | null
          learner_user_id: string | null
          raw_data: Json | null
          repo_name: string | null
          repo_owner: string | null
          review_type: string | null
          skill_id: string | null
          status: string | null
        }
        Insert: {
          comment_author?: string | null
          comment_body?: string | null
          comment_created_at?: string | null
          comment_id: string
          comment_url?: string | null
          competency_domain?: string | null
          competency_name?: string | null
          created_at?: string
          discussion_category?: string | null
          discussion_id?: string | null
          discussion_number?: number | null
          discussion_title?: string | null
          discussion_url?: string | null
          id?: string
          is_peer_review?: boolean | null
          learner_user_id?: string | null
          raw_data?: Json | null
          repo_name?: string | null
          repo_owner?: string | null
          review_type?: string | null
          skill_id?: string | null
          status?: string | null
        }
        Update: {
          comment_author?: string | null
          comment_body?: string | null
          comment_created_at?: string | null
          comment_id?: string
          comment_url?: string | null
          competency_domain?: string | null
          competency_name?: string | null
          created_at?: string
          discussion_category?: string | null
          discussion_id?: string | null
          discussion_number?: number | null
          discussion_title?: string | null
          discussion_url?: string | null
          id?: string
          is_peer_review?: boolean | null
          learner_user_id?: string | null
          raw_data?: Json | null
          repo_name?: string | null
          repo_owner?: string | null
          review_type?: string | null
          skill_id?: string | null
          status?: string | null
        }
        Relationships: []
      }
      github_repo_contributors: {
        Row: {
          contributions: number | null
          contributor_avatar_url: string | null
          contributor_email: string | null
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
          contributor_email?: string | null
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
          contributor_email?: string | null
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
      github_sync_logs: {
        Row: {
          completed_at: string | null
          created_at: string
          error_message: string | null
          evidence_created: number
          id: string
          repos_fetched: number
          started_at: string
          status: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          evidence_created?: number
          id?: string
          repos_fetched?: number
          started_at?: string
          status?: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          evidence_created?: number
          id?: string
          repos_fetched?: number
          started_at?: string
          status?: string
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
      institution_attestation_requests: {
        Row: {
          certificate_evidence: Json | null
          competency_domain: string | null
          competency_name: string
          created_at: string
          current_stage: string
          evidence_package: Json
          github_evidence: Json | null
          id: string
          institution_feedback: string | null
          institution_id: string | null
          institution_name: string
          learner_email: string | null
          learner_name: string | null
          learner_user_id: string
          moodle_evidence: Json | null
          peer_review_evidence: Json | null
          practical_task_result: Json | null
          reviewed_at: string | null
          reviewed_by: string | null
          skill_id: string | null
          status: string
          submitted_to_institution_at: string
          updated_at: string
        }
        Insert: {
          certificate_evidence?: Json | null
          competency_domain?: string | null
          competency_name: string
          created_at?: string
          current_stage?: string
          evidence_package?: Json
          github_evidence?: Json | null
          id?: string
          institution_feedback?: string | null
          institution_id?: string | null
          institution_name: string
          learner_email?: string | null
          learner_name?: string | null
          learner_user_id: string
          moodle_evidence?: Json | null
          peer_review_evidence?: Json | null
          practical_task_result?: Json | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          skill_id?: string | null
          status?: string
          submitted_to_institution_at?: string
          updated_at?: string
        }
        Update: {
          certificate_evidence?: Json | null
          competency_domain?: string | null
          competency_name?: string
          created_at?: string
          current_stage?: string
          evidence_package?: Json
          github_evidence?: Json | null
          id?: string
          institution_feedback?: string | null
          institution_id?: string | null
          institution_name?: string
          learner_email?: string | null
          learner_name?: string | null
          learner_user_id?: string
          moodle_evidence?: Json | null
          peer_review_evidence?: Json | null
          practical_task_result?: Json | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          skill_id?: string | null
          status?: string
          submitted_to_institution_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "institution_attestation_requests_skill_id_fkey"
            columns: ["skill_id"]
            isOneToOne: false
            referencedRelation: "declared_skills"
            referencedColumns: ["id"]
          },
        ]
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
          batch: string | null
          bio: string | null
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
          gender: string | null
          graduation_year: number | null
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
          batch?: string | null
          bio?: string | null
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
          gender?: string | null
          graduation_year?: number | null
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
          batch?: string | null
          bio?: string | null
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
          gender?: string | null
          graduation_year?: number | null
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
        Relationships: [
          {
            foreignKeyName: "learner_profiles_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institution_profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      linkedin_connections: {
        Row: {
          avatar_url: string | null
          connected_at: string
          display_name: string | null
          email: string | null
          id: string
          linkedin_member_id: string
          profile_url: string | null
          updated_at: string
          user_id: string
          verified_at: string | null
        }
        Insert: {
          avatar_url?: string | null
          connected_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          linkedin_member_id: string
          profile_url?: string | null
          updated_at?: string
          user_id: string
          verified_at?: string | null
        }
        Update: {
          avatar_url?: string | null
          connected_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          linkedin_member_id?: string
          profile_url?: string | null
          updated_at?: string
          user_id?: string
          verified_at?: string | null
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
      mcq_task_attempts: {
        Row: {
          answer_key: Json
          classification: Json | null
          competency_domain: string | null
          competency_name: string | null
          created_at: string | null
          duration_minutes: number | null
          evidence_package: Json | null
          feedback: string | null
          id: string
          learner_answers: Json | null
          learner_user_id: string | null
          passed: boolean | null
          questions: Json
          skill_id: string | null
          status: string | null
          submitted_at: string | null
          title: string | null
          type: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          answer_key?: Json
          classification?: Json | null
          competency_domain?: string | null
          competency_name?: string | null
          created_at?: string | null
          duration_minutes?: number | null
          evidence_package?: Json | null
          feedback?: string | null
          id?: string
          learner_answers?: Json | null
          learner_user_id?: string | null
          passed?: boolean | null
          questions?: Json
          skill_id?: string | null
          status?: string | null
          submitted_at?: string | null
          title?: string | null
          type?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          answer_key?: Json
          classification?: Json | null
          competency_domain?: string | null
          competency_name?: string | null
          created_at?: string | null
          duration_minutes?: number | null
          evidence_package?: Json | null
          feedback?: string | null
          id?: string
          learner_answers?: Json | null
          learner_user_id?: string | null
          passed?: boolean | null
          questions?: Json
          skill_id?: string | null
          status?: string | null
          submitted_at?: string | null
          title?: string | null
          type?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      peer_review_invites: {
        Row: {
          completed_review_id: string | null
          contributor_email: string
          contributor_id: string
          contributor_name: string
          contributor_role: string
          created_at: string
          evidence_record_id: string | null
          expires_at: string
          id: string
          learner_user_id: string
          project_id: string
          project_name: string
          relationship: string
          reviewer_context_id: string | null
          skill: string
          skill_id: string | null
          source: string
          status: string
          token: string
          updated_at: string
        }
        Insert: {
          completed_review_id?: string | null
          contributor_email: string
          contributor_id: string
          contributor_name: string
          contributor_role: string
          created_at?: string
          evidence_record_id?: string | null
          expires_at: string
          id?: string
          learner_user_id: string
          project_id: string
          project_name: string
          relationship?: string
          reviewer_context_id?: string | null
          skill: string
          skill_id?: string | null
          source: string
          status?: string
          token: string
          updated_at?: string
        }
        Update: {
          completed_review_id?: string | null
          contributor_email?: string
          contributor_id?: string
          contributor_name?: string
          contributor_role?: string
          created_at?: string
          evidence_record_id?: string | null
          expires_at?: string
          id?: string
          learner_user_id?: string
          project_id?: string
          project_name?: string
          relationship?: string
          reviewer_context_id?: string | null
          skill?: string
          skill_id?: string | null
          source?: string
          status?: string
          token?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "peer_review_invites_completed_review_id_fkey"
            columns: ["completed_review_id"]
            isOneToOne: false
            referencedRelation: "peer_reviews"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "peer_review_invites_evidence_record_id_fkey"
            columns: ["evidence_record_id"]
            isOneToOne: false
            referencedRelation: "evidence_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "peer_review_invites_reviewer_context_id_fkey"
            columns: ["reviewer_context_id"]
            isOneToOne: false
            referencedRelation: "reviewer_contexts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "peer_review_invites_skill_id_fkey"
            columns: ["skill_id"]
            isOneToOne: false
            referencedRelation: "declared_skills"
            referencedColumns: ["id"]
          },
        ]
      }
      peer_reviews: {
        Row: {
          comment: string | null
          competency_domain: string | null
          competency_name: string | null
          context_status: string | null
          context_verified: boolean
          contributor_verification: Json | null
          created_at: string | null
          decision: string | null
          evidence_label: string | null
          evidence_package: Json | null
          evidence_record_id: string | null
          evidence_url: string | null
          external_reference: string | null
          github_evidence: Json | null
          id: string
          imported: boolean
          invitation_id: string | null
          learner_user_id: string | null
          moodle_evidence: Json | null
          origin: string | null
          practical_task_result: Json | null
          project_id: string | null
          project_name: string | null
          rating: string | null
          recommendation: string | null
          relationship: string | null
          requested_at: string | null
          review_date: string | null
          review_request_id: string | null
          review_source: string | null
          review_text: string | null
          review_type: string | null
          reviewed_at: string | null
          reviewer_confidence: string | null
          reviewer_email: string | null
          reviewer_github_username: string | null
          reviewer_name: string | null
          reviewer_role: string | null
          reviewer_user_id: string | null
          skill: string | null
          skill_id: string | null
          source: string | null
          status: string | null
          trust_weight: string | null
          trust_weight_score: number | null
          updated_at: string | null
          user_id: string
          verification_status: string | null
        }
        Insert: {
          comment?: string | null
          competency_domain?: string | null
          competency_name?: string | null
          context_status?: string | null
          context_verified?: boolean
          contributor_verification?: Json | null
          created_at?: string | null
          decision?: string | null
          evidence_label?: string | null
          evidence_package?: Json | null
          evidence_record_id?: string | null
          evidence_url?: string | null
          external_reference?: string | null
          github_evidence?: Json | null
          id?: string
          imported?: boolean
          invitation_id?: string | null
          learner_user_id?: string | null
          moodle_evidence?: Json | null
          origin?: string | null
          practical_task_result?: Json | null
          project_id?: string | null
          project_name?: string | null
          rating?: string | null
          recommendation?: string | null
          relationship?: string | null
          requested_at?: string | null
          review_date?: string | null
          review_request_id?: string | null
          review_source?: string | null
          review_text?: string | null
          review_type?: string | null
          reviewed_at?: string | null
          reviewer_confidence?: string | null
          reviewer_email?: string | null
          reviewer_github_username?: string | null
          reviewer_name?: string | null
          reviewer_role?: string | null
          reviewer_user_id?: string | null
          skill?: string | null
          skill_id?: string | null
          source?: string | null
          status?: string | null
          trust_weight?: string | null
          trust_weight_score?: number | null
          updated_at?: string | null
          user_id: string
          verification_status?: string | null
        }
        Update: {
          comment?: string | null
          competency_domain?: string | null
          competency_name?: string | null
          context_status?: string | null
          context_verified?: boolean
          contributor_verification?: Json | null
          created_at?: string | null
          decision?: string | null
          evidence_label?: string | null
          evidence_package?: Json | null
          evidence_record_id?: string | null
          evidence_url?: string | null
          external_reference?: string | null
          github_evidence?: Json | null
          id?: string
          imported?: boolean
          invitation_id?: string | null
          learner_user_id?: string | null
          moodle_evidence?: Json | null
          origin?: string | null
          practical_task_result?: Json | null
          project_id?: string | null
          project_name?: string | null
          rating?: string | null
          recommendation?: string | null
          relationship?: string | null
          requested_at?: string | null
          review_date?: string | null
          review_request_id?: string | null
          review_source?: string | null
          review_text?: string | null
          review_type?: string | null
          reviewed_at?: string | null
          reviewer_confidence?: string | null
          reviewer_email?: string | null
          reviewer_github_username?: string | null
          reviewer_name?: string | null
          reviewer_role?: string | null
          reviewer_user_id?: string | null
          skill?: string | null
          skill_id?: string | null
          source?: string | null
          status?: string | null
          trust_weight?: string | null
          trust_weight_score?: number | null
          updated_at?: string | null
          user_id?: string
          verification_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "peer_reviews_evidence_record_id_fkey"
            columns: ["evidence_record_id"]
            isOneToOne: false
            referencedRelation: "evidence_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "peer_reviews_review_request_fk"
            columns: ["review_request_id"]
            isOneToOne: false
            referencedRelation: "review_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      practical_attempts: {
        Row: {
          attempt_id: string
          created_at: string | null
          credential_sync_snapshot: string | null
          duration_minutes: number
          ends_at: string
          feedback: string | null
          id: string
          passed: boolean | null
          score: number | null
          skill_id: string
          started_at: string
          status: string
          submission: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          attempt_id: string
          created_at?: string | null
          credential_sync_snapshot?: string | null
          duration_minutes: number
          ends_at: string
          feedback?: string | null
          id?: string
          passed?: boolean | null
          score?: number | null
          skill_id: string
          started_at: string
          status?: string
          submission?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          attempt_id?: string
          created_at?: string | null
          credential_sync_snapshot?: string | null
          duration_minutes?: number
          ends_at?: string
          feedback?: string | null
          id?: string
          passed?: boolean | null
          score?: number | null
          skill_id?: string
          started_at?: string
          status?: string
          submission?: string | null
          updated_at?: string | null
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
      review_invitations: {
        Row: {
          competency_domain: string | null
          competency_name: string | null
          completed_review_id: string | null
          contributor_email: string | null
          contributor_id: string
          contributor_name: string
          contributor_role: string
          created_at: string
          email_status: string | null
          error_message: string | null
          expires_at: string | null
          id: string
          learner_name: string
          learner_user_id: string
          project_id: string
          project_name: string
          review_link: string | null
          sent_at: string
          skill: string
          skill_id: string | null
          source: string
          status: string
          token: string | null
          used_at: string | null
        }
        Insert: {
          competency_domain?: string | null
          competency_name?: string | null
          completed_review_id?: string | null
          contributor_email?: string | null
          contributor_id: string
          contributor_name: string
          contributor_role?: string
          created_at?: string
          email_status?: string | null
          error_message?: string | null
          expires_at?: string | null
          id?: string
          learner_name: string
          learner_user_id: string
          project_id: string
          project_name: string
          review_link?: string | null
          sent_at?: string
          skill: string
          skill_id?: string | null
          source?: string
          status?: string
          token?: string | null
          used_at?: string | null
        }
        Update: {
          competency_domain?: string | null
          competency_name?: string | null
          completed_review_id?: string | null
          contributor_email?: string | null
          contributor_id?: string
          contributor_name?: string
          contributor_role?: string
          created_at?: string
          email_status?: string | null
          error_message?: string | null
          expires_at?: string | null
          id?: string
          learner_name?: string
          learner_user_id?: string
          project_id?: string
          project_name?: string
          review_link?: string | null
          sent_at?: string
          skill?: string
          skill_id?: string | null
          source?: string
          status?: string
          token?: string | null
          used_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "review_invitations_completed_review_id_fkey"
            columns: ["completed_review_id"]
            isOneToOne: false
            referencedRelation: "peer_reviews"
            referencedColumns: ["id"]
          },
        ]
      }
      review_requests: {
        Row: {
          completed_review_id: string | null
          context_source: string
          created_at: string
          evidence_record_id: string
          expires_at: string
          id: string
          learner_user_id: string
          reviewer_context_id: string | null
          reviewer_context_role: string
          reviewer_email: string
          reviewer_name: string
          skill_id: string | null
          status: string
          token: string
          updated_at: string
        }
        Insert: {
          completed_review_id?: string | null
          context_source: string
          created_at?: string
          evidence_record_id: string
          expires_at: string
          id?: string
          learner_user_id: string
          reviewer_context_id?: string | null
          reviewer_context_role: string
          reviewer_email: string
          reviewer_name: string
          skill_id?: string | null
          status?: string
          token: string
          updated_at?: string
        }
        Update: {
          completed_review_id?: string | null
          context_source?: string
          created_at?: string
          evidence_record_id?: string
          expires_at?: string
          id?: string
          learner_user_id?: string
          reviewer_context_id?: string | null
          reviewer_context_role?: string
          reviewer_email?: string
          reviewer_name?: string
          skill_id?: string | null
          status?: string
          token?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "review_requests_completed_review_id_fkey"
            columns: ["completed_review_id"]
            isOneToOne: false
            referencedRelation: "peer_reviews"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_requests_evidence_record_id_fkey"
            columns: ["evidence_record_id"]
            isOneToOne: false
            referencedRelation: "evidence_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_requests_reviewer_context_id_fkey"
            columns: ["reviewer_context_id"]
            isOneToOne: false
            referencedRelation: "reviewer_contexts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_requests_skill_id_fkey"
            columns: ["skill_id"]
            isOneToOne: false
            referencedRelation: "declared_skills"
            referencedColumns: ["id"]
          },
        ]
      }
      reviewer_contexts: {
        Row: {
          context_role: string
          evidence_record_id: string
          external_ref: string | null
          id: string
          reviewer_email: string | null
          reviewer_login: string | null
          reviewer_name: string
          source: string
          synced_at: string
          user_id: string
        }
        Insert: {
          context_role?: string
          evidence_record_id: string
          external_ref?: string | null
          id?: string
          reviewer_email?: string | null
          reviewer_login?: string | null
          reviewer_name: string
          source?: string
          synced_at?: string
          user_id: string
        }
        Update: {
          context_role?: string
          evidence_record_id?: string
          external_ref?: string | null
          id?: string
          reviewer_email?: string | null
          reviewer_login?: string | null
          reviewer_name?: string
          source?: string
          synced_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reviewer_contexts_evidence_record_id_fkey"
            columns: ["evidence_record_id"]
            isOneToOne: false
            referencedRelation: "evidence_records"
            referencedColumns: ["id"]
          },
        ]
      }
      skill_evidence_links: {
        Row: {
          evidence_record_id: string
          id: string
          linked_at: string
          skill_id: string
          user_id: string
        }
        Insert: {
          evidence_record_id: string
          id?: string
          linked_at?: string
          skill_id: string
          user_id: string
        }
        Update: {
          evidence_record_id?: string
          id?: string
          linked_at?: string
          skill_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "skill_evidence_links_evidence_record_id_fkey"
            columns: ["evidence_record_id"]
            isOneToOne: false
            referencedRelation: "evidence_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "skill_evidence_links_skill_id_fkey"
            columns: ["skill_id"]
            isOneToOne: false
            referencedRelation: "declared_skills"
            referencedColumns: ["id"]
          },
        ]
      }
      student_activation_tokens: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          institution_id: string
          token_hash: string
          used_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at: string
          id?: string
          institution_id: string
          token_hash: string
          used_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          institution_id?: string
          token_hash?: string
          used_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_activation_tokens_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institution_profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      supporting_records: {
        Row: {
          created_at: string | null
          id: string
          occurred_at: string | null
          skill_id: string
          source: string
          title: string
          url: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          occurred_at?: string | null
          skill_id: string
          source: string
          title: string
          url?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          occurred_at?: string | null
          skill_id?: string
          source?: string
          title?: string
          url?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "supporting_records_skill_id_fkey"
            columns: ["skill_id"]
            isOneToOne: false
            referencedRelation: "declared_skills"
            referencedColumns: ["id"]
          },
        ]
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
      complete_peer_review_from_invitation: {
        Args: {
          p_confidence: string
          p_decision: string
          p_invitation_id: string
          p_review_text: string
        }
        Returns: string
      }
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
