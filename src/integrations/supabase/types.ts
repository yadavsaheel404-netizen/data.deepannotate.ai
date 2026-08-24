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
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      app_logs: {
        Row: {
          created_at: string
          error: string | null
          function_name: string
          id: string
          level: string
          metadata: Json | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          error?: string | null
          function_name: string
          id?: string
          level: string
          metadata?: Json | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          error?: string | null
          function_name?: string
          id?: string
          level?: string
          metadata?: Json | null
          user_id?: string | null
        }
        Relationships: []
      }
      audit_log: {
        Row: {
          action: string
          actor_id: string | null
          after: Json | null
          before: Json | null
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          after?: Json | null
          before?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          after?: Json | null
          before?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
        }
        Relationships: []
      }
      communications: {
        Row: {
          body: string
          created_at: string
          id: string
          recipient_count: number
          recipients: string[]
          sent_by: string | null
          status: string
          subject: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          recipient_count?: number
          recipients?: string[]
          sent_by?: string | null
          status?: string
          subject: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          recipient_count?: number
          recipients?: string[]
          sent_by?: string | null
          status?: string
          subject?: string
        }
        Relationships: []
      }
      earnings: {
        Row: {
          amount: number
          created_at: string
          id: string
          project_id: string
          status: string
          task_id: string
          user_id: string
        }
        Insert: {
          amount?: number
          created_at?: string
          id?: string
          project_id: string
          status?: string
          task_id: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          project_id?: string
          status?: string
          task_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "earnings_task_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      email_send_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          message_id: string | null
          metadata: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email?: string
          status?: string
          template_name?: string
        }
        Relationships: []
      }
      email_send_state: {
        Row: {
          auth_email_ttl_minutes: number
          batch_size: number
          id: number
          retry_after_until: string | null
          send_delay_ms: number
          transactional_email_ttl_minutes: number
          updated_at: string
        }
        Insert: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Update: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      email_unsubscribe_tokens: {
        Row: {
          created_at: string
          email: string
          id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: []
      }
      notification_jobs: {
        Row: {
          audience: string
          completed_at: string | null
          created_at: string
          created_by: string | null
          error: string | null
          id: string
          last_processed_user_id: string | null
          link: string | null
          message: string
          processed_recipients: number
          started_at: string | null
          status: string
          title: string
          total_recipients: number
          user_ids: string[] | null
        }
        Insert: {
          audience?: string
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          error?: string | null
          id?: string
          last_processed_user_id?: string | null
          link?: string | null
          message: string
          processed_recipients?: number
          started_at?: string | null
          status?: string
          title: string
          total_recipients?: number
          user_ids?: string[] | null
        }
        Update: {
          audience?: string
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          error?: string | null
          id?: string
          last_processed_user_id?: string | null
          link?: string | null
          message?: string
          processed_recipients?: number
          started_at?: string | null
          status?: string
          title?: string
          total_recipients?: number
          user_ids?: string[] | null
        }
        Relationships: []
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          link: string | null
          message: string
          read: boolean
          title: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          link?: string | null
          message: string
          read?: boolean
          title: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          link?: string | null
          message?: string
          read?: boolean
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          account_holder_name: string | null
          avatar_url: string | null
          bank_account_number: string | null
          country: string | null
          created_at: string
          current_status: string | null
          date_of_birth: string | null
          display_name: string
          email: string | null
          gender: string | null
          github_url: string | null
          govt_id_type: string | null
          govt_id_uploaded_at: string | null
          govt_id_url: string | null
          govt_id_verified: boolean
          hours_per_week: string | null
          id: string
          ifsc_code: string | null
          is_active: boolean
          kyc_rejection_reason: string | null
          kyc_reviewed_at: string | null
          kyc_reviewed_by: string | null
          kyc_status: string
          language: string[] | null
          linkedin_url: string | null
          onboarding_complete: boolean
          payout_country: string | null
          paypal_email: string | null
          phone: string | null
          profile_completed: boolean
          public_user_id: string
          resume_url: string | null
          skills: string[] | null
          total_earned: number
          total_paid: number
          total_tokens: number
          updated_at: string
          upi_id: string | null
          wallet_balance: number
          working_profession: string | null
        }
        Insert: {
          account_holder_name?: string | null
          avatar_url?: string | null
          bank_account_number?: string | null
          country?: string | null
          created_at?: string
          current_status?: string | null
          date_of_birth?: string | null
          display_name: string
          email?: string | null
          gender?: string | null
          github_url?: string | null
          govt_id_type?: string | null
          govt_id_uploaded_at?: string | null
          govt_id_url?: string | null
          govt_id_verified?: boolean
          hours_per_week?: string | null
          id: string
          ifsc_code?: string | null
          is_active?: boolean
          kyc_rejection_reason?: string | null
          kyc_reviewed_at?: string | null
          kyc_reviewed_by?: string | null
          kyc_status?: string
          language?: string[] | null
          linkedin_url?: string | null
          onboarding_complete?: boolean
          payout_country?: string | null
          paypal_email?: string | null
          phone?: string | null
          profile_completed?: boolean
          public_user_id: string
          resume_url?: string | null
          skills?: string[] | null
          total_earned?: number
          total_paid?: number
          total_tokens?: number
          updated_at?: string
          upi_id?: string | null
          wallet_balance?: number
          working_profession?: string | null
        }
        Update: {
          account_holder_name?: string | null
          avatar_url?: string | null
          bank_account_number?: string | null
          country?: string | null
          created_at?: string
          current_status?: string | null
          date_of_birth?: string | null
          display_name?: string
          email?: string | null
          gender?: string | null
          github_url?: string | null
          govt_id_type?: string | null
          govt_id_uploaded_at?: string | null
          govt_id_url?: string | null
          govt_id_verified?: boolean
          hours_per_week?: string | null
          id?: string
          ifsc_code?: string | null
          is_active?: boolean
          kyc_rejection_reason?: string | null
          kyc_reviewed_at?: string | null
          kyc_reviewed_by?: string | null
          kyc_status?: string
          language?: string[] | null
          linkedin_url?: string | null
          onboarding_complete?: boolean
          payout_country?: string | null
          paypal_email?: string | null
          phone?: string | null
          profile_completed?: boolean
          public_user_id?: string
          resume_url?: string | null
          skills?: string[] | null
          total_earned?: number
          total_paid?: number
          total_tokens?: number
          updated_at?: string
          upi_id?: string | null
          wallet_balance?: number
          working_profession?: string | null
        }
        Relationships: []
      }
      project_categories: {
        Row: {
          category_name: string
          category_overview: string | null
          created_at: string
          id: string
          project_id: string
          sort_order: number
          updated_at: string
          welcome_message: string | null
        }
        Insert: {
          category_name: string
          category_overview?: string | null
          created_at?: string
          id?: string
          project_id: string
          sort_order?: number
          updated_at?: string
          welcome_message?: string | null
        }
        Update: {
          category_name?: string
          category_overview?: string | null
          created_at?: string
          id?: string
          project_id?: string
          sort_order?: number
          updated_at?: string
          welcome_message?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_categories_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          created_at: string
          created_by: string | null
          donts: string[]
          dos: string[]
          duration_label: string | null
          duration_minutes: number | null
          end_date: string | null
          example_media: Json
          filled_tasks: number
          id: string
          instructions: string
          languages: string[]
          max_file_size_mb: number | null
          media_type: Database["public"]["Enums"]["media_type"]
          overview: string | null
          pay_per_task: number | null
          payment_terms: string | null
          project_type: string
          reward_tokens: number
          sample_media_urls: string[]
          start_date: string | null
          status: Database["public"]["Enums"]["task_status"]
          target_filters: Json
          title: string
          total_tasks: number
          updated_at: string
          visibility_type: string
          visible_till: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          donts?: string[]
          dos?: string[]
          duration_label?: string | null
          duration_minutes?: number | null
          end_date?: string | null
          example_media?: Json
          filled_tasks?: number
          id?: string
          instructions: string
          languages?: string[]
          max_file_size_mb?: number | null
          media_type?: Database["public"]["Enums"]["media_type"]
          overview?: string | null
          pay_per_task?: number | null
          payment_terms?: string | null
          project_type?: string
          reward_tokens?: number
          sample_media_urls?: string[]
          start_date?: string | null
          status?: Database["public"]["Enums"]["task_status"]
          target_filters?: Json
          title: string
          total_tasks?: number
          updated_at?: string
          visibility_type?: string
          visible_till?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          donts?: string[]
          dos?: string[]
          duration_label?: string | null
          duration_minutes?: number | null
          end_date?: string | null
          example_media?: Json
          filled_tasks?: number
          id?: string
          instructions?: string
          languages?: string[]
          max_file_size_mb?: number | null
          media_type?: Database["public"]["Enums"]["media_type"]
          overview?: string | null
          pay_per_task?: number | null
          payment_terms?: string | null
          project_type?: string
          reward_tokens?: number
          sample_media_urls?: string[]
          start_date?: string | null
          status?: Database["public"]["Enums"]["task_status"]
          target_filters?: Json
          title?: string
          total_tasks?: number
          updated_at?: string
          visibility_type?: string
          visible_till?: string | null
        }
        Relationships: []
      }
      submission_status_audit: {
        Row: {
          actor_id: string
          after_status: string
          before_status: string
          created_at: string
          id: string
          reason: string | null
          submission_id: string
        }
        Insert: {
          actor_id: string
          after_status: string
          before_status: string
          created_at?: string
          id?: string
          reason?: string | null
          submission_id: string
        }
        Update: {
          actor_id?: string
          after_status?: string
          before_status?: string
          created_at?: string
          id?: string
          reason?: string | null
          submission_id?: string
        }
        Relationships: []
      }
      support_tickets: {
        Row: {
          category: string
          created_at: string
          id: string
          message: string
          screenshot_url: string | null
          status: string
          updated_at: string
          user_email: string
          user_id: string
          user_name: string
        }
        Insert: {
          category: string
          created_at?: string
          id?: string
          message: string
          screenshot_url?: string | null
          status?: string
          updated_at?: string
          user_email: string
          user_id: string
          user_name: string
        }
        Update: {
          category?: string
          created_at?: string
          id?: string
          message?: string
          screenshot_url?: string | null
          status?: string
          updated_at?: string
          user_email?: string
          user_id?: string
          user_name?: string
        }
        Relationships: []
      }
      suppressed_emails: {
        Row: {
          created_at: string
          email: string
          id: string
          metadata: Json | null
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          metadata?: Json | null
          reason: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          metadata?: Json | null
          reason?: string
        }
        Relationships: []
      }
      system_settings: {
        Row: {
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          updated_by?: string | null
          value: Json
        }
        Update: {
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
      tasks: {
        Row: {
          claimed_at: string | null
          claimed_by: string | null
          created_at: string
          external_url: string | null
          file_hash: string | null
          file_url: string | null
          id: string
          notes: string | null
          project_id: string
          selected_category_id: string | null
          status: Database["public"]["Enums"]["submission_status"]
          submission_type: string
          text_content: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          claimed_at?: string | null
          claimed_by?: string | null
          created_at?: string
          external_url?: string | null
          file_hash?: string | null
          file_url?: string | null
          id?: string
          notes?: string | null
          project_id: string
          selected_category_id?: string | null
          status?: Database["public"]["Enums"]["submission_status"]
          submission_type?: string
          text_content?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          claimed_at?: string | null
          claimed_by?: string | null
          created_at?: string
          external_url?: string | null
          file_hash?: string | null
          file_url?: string | null
          id?: string
          notes?: string | null
          project_id?: string
          selected_category_id?: string | null
          status?: Database["public"]["Enums"]["submission_status"]
          submission_type?: string
          text_content?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "submissions_contributor_profile_fk"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "submissions_task_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_selected_category_id_fkey"
            columns: ["selected_category_id"]
            isOneToOne: false
            referencedRelation: "project_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      tokens_transactions: {
        Row: {
          amount: number
          balance_after: number
          counterparty_user_id: string | null
          created_at: string
          id: string
          metadata: Json | null
          reason: Database["public"]["Enums"]["tokens_txn_reason"]
          reference_id: string | null
          reference_type: string | null
          type: Database["public"]["Enums"]["tokens_txn_type"]
          user_id: string
        }
        Insert: {
          amount: number
          balance_after?: number
          counterparty_user_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json | null
          reason: Database["public"]["Enums"]["tokens_txn_reason"]
          reference_id?: string | null
          reference_type?: string | null
          type: Database["public"]["Enums"]["tokens_txn_type"]
          user_id: string
        }
        Update: {
          amount?: number
          balance_after?: number
          counterparty_user_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json | null
          reason?: Database["public"]["Enums"]["tokens_txn_reason"]
          reference_id?: string | null
          reference_type?: string | null
          type?: Database["public"]["Enums"]["tokens_txn_type"]
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      withdraw_requests: {
        Row: {
          account_holder_name: string | null
          account_holder_name_snapshot: string | null
          amount: number
          bank_account_number: string | null
          bank_account_snapshot: string | null
          created_at: string
          id: string
          ifsc_code: string | null
          ifsc_snapshot: string | null
          payment_method: string
          paypal_email: string | null
          paypal_email_snapshot: string | null
          processed_at: string | null
          rejection_reason: string | null
          status: string
          upi_id: string | null
          upi_id_snapshot: string | null
          user_id: string
        }
        Insert: {
          account_holder_name?: string | null
          account_holder_name_snapshot?: string | null
          amount: number
          bank_account_number?: string | null
          bank_account_snapshot?: string | null
          created_at?: string
          id?: string
          ifsc_code?: string | null
          ifsc_snapshot?: string | null
          payment_method?: string
          paypal_email?: string | null
          paypal_email_snapshot?: string | null
          processed_at?: string | null
          rejection_reason?: string | null
          status?: string
          upi_id?: string | null
          upi_id_snapshot?: string | null
          user_id: string
        }
        Update: {
          account_holder_name?: string | null
          account_holder_name_snapshot?: string | null
          amount?: number
          bank_account_number?: string | null
          bank_account_snapshot?: string | null
          created_at?: string
          id?: string
          ifsc_code?: string | null
          ifsc_snapshot?: string | null
          payment_method?: string
          paypal_email?: string | null
          paypal_email_snapshot?: string | null
          processed_at?: string | null
          rejection_reason?: string | null
          status?: string
          upi_id?: string | null
          upi_id_snapshot?: string | null
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      add_tokens: {
        Args: {
          _amount: number
          _counterparty_user_id?: string
          _metadata?: Json
          _reason: Database["public"]["Enums"]["tokens_txn_reason"]
          _reference_id?: string
          _reference_type?: string
          _user_id: string
        }
        Returns: string
      }
      admin_category_analytics: {
        Args: { _from?: string; _project_id: string; _to?: string }
        Returns: {
          approved: number
          category_id: string
          category_name: string
          completion_rate: number
          pending: number
          rejected: number
          rejection_rate: number
          total: number
        }[]
      }
      admin_list_submissions:
        | {
            Args: {
              _cursor?: string
              _limit?: number
              _project_id?: string
              _status?: string
            }
            Returns: {
              claimed_at: string
              claimed_by: string
              contributor_name: string
              created_at: string
              external_url: string
              file_url: string
              id: string
              notes: string
              project_id: string
              status: string
              submission_type: string
              task_end_date: string
              task_media_type: string
              task_pay: number
              task_start_date: string
              task_title: string
              text_content: string
              updated_at: string
              user_id: string
            }[]
          }
        | {
            Args: {
              _category_id?: string
              _cursor?: string
              _limit?: number
              _project_id?: string
              _status?: string
            }
            Returns: {
              claimed_at: string
              claimed_by: string
              contributor_name: string
              created_at: string
              external_url: string
              file_url: string
              id: string
              notes: string
              project_id: string
              selected_category_id: string
              selected_category_name: string
              status: string
              submission_type: string
              task_end_date: string
              task_media_type: string
              task_pay: number
              task_start_date: string
              task_title: string
              text_content: string
              updated_at: string
              user_id: string
            }[]
          }
      claim_submission: { Args: { _submission_id: string }; Returns: Json }
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      enqueue_notification_job: {
        Args: {
          _audience?: string
          _link: string
          _message: string
          _title: string
          _user_ids?: string[]
        }
        Returns: string
      }
      generate_public_user_id: { Args: never; Returns: string }
      get_setting_int: {
        Args: { _default: number; _key: string }
        Returns: number
      }
      get_tokens_balance: { Args: { _user_id: string }; Returns: number }
      get_user_by_public_id: {
        Args: { _public_user_id: string }
        Returns: {
          avatar_url: string
          display_name: string
          id: string
          is_active: boolean
          public_user_id: string
        }[]
      }
      get_visible_projects: {
        Args: never
        Returns: {
          created_at: string
          created_by: string | null
          donts: string[]
          dos: string[]
          duration_label: string | null
          duration_minutes: number | null
          end_date: string | null
          example_media: Json
          filled_tasks: number
          id: string
          instructions: string
          languages: string[]
          max_file_size_mb: number | null
          media_type: Database["public"]["Enums"]["media_type"]
          overview: string | null
          pay_per_task: number | null
          payment_terms: string | null
          project_type: string
          reward_tokens: number
          sample_media_urls: string[]
          start_date: string | null
          status: Database["public"]["Enums"]["task_status"]
          target_filters: Json
          title: string
          total_tasks: number
          updated_at: string
          visibility_type: string
          visible_till: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "projects"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_profile_complete: {
        Args: { _profile: Database["public"]["Tables"]["profiles"]["Row"] }
        Returns: boolean
      }
      is_user_active: { Args: { _user_id: string }; Returns: boolean }
      metrics_summary: { Args: { _since?: string }; Returns: Json }
      move_to_dlq: {
        Args: {
          dlq_name: string
          message_id: number
          payload: Json
          source_queue: string
        }
        Returns: number
      }
      process_notification_jobs_batch: {
        Args: { _batch_size?: number }
        Returns: Json
      }
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
      }
      recalculate_tokens_balances: {
        Args: { _user_id?: string }
        Returns: {
          total_tokens: number
          user_id: string
        }[]
      }
      reconcile_profile_completion_tokens: {
        Args: { _user_id?: string }
        Returns: {
          delta: number
          user_id: string
        }[]
      }
      release_submission: {
        Args: { _submission_id: string }
        Returns: undefined
      }
      remove_tokens: {
        Args: {
          _amount: number
          _counterparty_user_id?: string
          _metadata?: Json
          _reason: Database["public"]["Enums"]["tokens_txn_reason"]
          _reference_id?: string
          _reference_type?: string
          _user_id: string
        }
        Returns: string
      }
      send_tip: {
        Args: {
          _amount: number
          _idempotency_key?: string
          _note?: string
          _recipient_id: string
        }
        Returns: Json
      }
      send_tip_by_public_id: {
        Args: {
          _amount: number
          _idempotency_key?: string
          _note?: string
          _recipient_public_id: string
        }
        Returns: Json
      }
      update_submission_status_admin: {
        Args: { _new_status: string; _reason?: string; _submission_id: string }
        Returns: Json
      }
      write_audit_log: {
        Args: {
          _action: string
          _after: Json
          _before: Json
          _entity_id: string
          _entity_type: string
        }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "admin" | "contributor"
      media_type: "text" | "audio" | "image" | "video"
      submission_status: "pending" | "approved" | "rejected" | "in_review"
      task_status: "draft" | "active" | "paused" | "completed"
      tokens_txn_reason:
        | "profile_complete"
        | "profile_incomplete_revoke"
        | "task_reward"
        | "tip_sent"
        | "tip_received"
        | "voucher_redeemed"
        | "admin_adjustment"
      tokens_txn_type: "credit" | "debit"
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
      app_role: ["admin", "contributor"],
      media_type: ["text", "audio", "image", "video"],
      submission_status: ["pending", "approved", "rejected", "in_review"],
      task_status: ["draft", "active", "paused", "completed"],
      tokens_txn_reason: [
        "profile_complete",
        "profile_incomplete_revoke",
        "task_reward",
        "tip_sent",
        "tip_received",
        "voucher_redeemed",
        "admin_adjustment",
      ],
      tokens_txn_type: ["credit", "debit"],
    },
  },
} as const
