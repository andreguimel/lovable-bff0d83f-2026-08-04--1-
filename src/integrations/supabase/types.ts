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
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      agent_knowledge_docs: {
        Row: {
          agent_id: string
          chunks: number
          company_id: string
          created_at: string
          id: string
          size_bytes: number | null
          source_url: string | null
          status: string
          storage_path: string | null
          title: string
          type: string
          updated_at: string
        }
        Insert: {
          agent_id: string
          chunks?: number
          company_id: string
          created_at?: string
          id?: string
          size_bytes?: number | null
          source_url?: string | null
          status?: string
          storage_path?: string | null
          title: string
          type?: string
          updated_at?: string
        }
        Update: {
          agent_id?: string
          chunks?: number
          company_id?: string
          created_at?: string
          id?: string
          size_bytes?: number | null
          source_url?: string | null
          status?: string
          storage_path?: string | null
          title?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_knowledge_docs_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "ai_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_knowledge_docs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_knowledge_docs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company_usage_current_month"
            referencedColumns: ["company_id"]
          },
        ]
      }
      agent_logs: {
        Row: {
          agent_id: string
          company_id: string
          conversation_id: string | null
          created_at: string
          error: string | null
          id: string
          latency_ms: number | null
          model: string | null
          prompt: string | null
          response: string | null
          source: string
          tokens_in: number | null
          tokens_out: number | null
          tools: Json
        }
        Insert: {
          agent_id: string
          company_id: string
          conversation_id?: string | null
          created_at?: string
          error?: string | null
          id?: string
          latency_ms?: number | null
          model?: string | null
          prompt?: string | null
          response?: string | null
          source?: string
          tokens_in?: number | null
          tokens_out?: number | null
          tools?: Json
        }
        Update: {
          agent_id?: string
          company_id?: string
          conversation_id?: string | null
          created_at?: string
          error?: string | null
          id?: string
          latency_ms?: number | null
          model?: string | null
          prompt?: string | null
          response?: string | null
          source?: string
          tokens_in?: number | null
          tokens_out?: number | null
          tools?: Json
        }
        Relationships: [
          {
            foreignKeyName: "agent_logs_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "ai_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_logs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_logs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company_usage_current_month"
            referencedColumns: ["company_id"]
          },
        ]
      }
      agent_prompt_versions: {
        Row: {
          agent_id: string
          company_id: string
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          prompt: string
          version: number
        }
        Insert: {
          agent_id: string
          company_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          prompt: string
          version: number
        }
        Update: {
          agent_id?: string
          company_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          prompt?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "agent_prompt_versions_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "ai_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_prompt_versions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_prompt_versions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company_usage_current_month"
            referencedColumns: ["company_id"]
          },
        ]
      }
      agent_test_sessions: {
        Row: {
          agent_id: string
          company_id: string
          created_at: string
          id: string
          messages: Json
          params: Json
          updated_at: string
          user_id: string | null
        }
        Insert: {
          agent_id: string
          company_id: string
          created_at?: string
          id?: string
          messages?: Json
          params?: Json
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          agent_id?: string
          company_id?: string
          created_at?: string
          id?: string
          messages?: Json
          params?: Json
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_test_sessions_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "ai_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_test_sessions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_test_sessions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company_usage_current_month"
            referencedColumns: ["company_id"]
          },
        ]
      }
      ai_agent_runs: {
        Row: {
          agent_id: string
          company_id: string
          created_at: string
          error: string | null
          id: string
          input: string
          model: string | null
          output: string | null
          tokens_input: number | null
          tokens_output: number | null
          user_id: string | null
        }
        Insert: {
          agent_id: string
          company_id: string
          created_at?: string
          error?: string | null
          id?: string
          input: string
          model?: string | null
          output?: string | null
          tokens_input?: number | null
          tokens_output?: number | null
          user_id?: string | null
        }
        Update: {
          agent_id?: string
          company_id?: string
          created_at?: string
          error?: string | null
          id?: string
          input?: string
          model?: string | null
          output?: string | null
          tokens_input?: number | null
          tokens_output?: number | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_agent_runs_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "ai_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_agent_runs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_agent_runs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company_usage_current_month"
            referencedColumns: ["company_id"]
          },
        ]
      }
      ai_agents: {
        Row: {
          avatar_url: string | null
          channel_ids: string[]
          company_id: string
          created_at: string
          department: string | null
          enabled_tools: string[]
          frequency_penalty: number | null
          greeting: string | null
          id: string
          is_active: boolean
          knowledge_files: Json | null
          language: string
          last_activity_at: string | null
          max_tokens: number | null
          max_turns: number
          metrics: Json
          model: string
          name: string
          personality: string | null
          presence_penalty: number | null
          prompt: string
          role: string | null
          specialty: string | null
          status: string
          temperature: number
          top_p: number | null
          transfer_rules: Json | null
          updated_at: string
          version: number
        }
        Insert: {
          avatar_url?: string | null
          channel_ids?: string[]
          company_id: string
          created_at?: string
          department?: string | null
          enabled_tools?: string[]
          frequency_penalty?: number | null
          greeting?: string | null
          id?: string
          is_active?: boolean
          knowledge_files?: Json | null
          language?: string
          last_activity_at?: string | null
          max_tokens?: number | null
          max_turns?: number
          metrics?: Json
          model?: string
          name: string
          personality?: string | null
          presence_penalty?: number | null
          prompt?: string
          role?: string | null
          specialty?: string | null
          status?: string
          temperature?: number
          top_p?: number | null
          transfer_rules?: Json | null
          updated_at?: string
          version?: number
        }
        Update: {
          avatar_url?: string | null
          channel_ids?: string[]
          company_id?: string
          created_at?: string
          department?: string | null
          enabled_tools?: string[]
          frequency_penalty?: number | null
          greeting?: string | null
          id?: string
          is_active?: boolean
          knowledge_files?: Json | null
          language?: string
          last_activity_at?: string | null
          max_tokens?: number | null
          max_turns?: number
          metrics?: Json
          model?: string
          name?: string
          personality?: string | null
          presence_penalty?: number | null
          prompt?: string
          role?: string | null
          specialty?: string | null
          status?: string
          temperature?: number
          top_p?: number | null
          transfer_rules?: Json | null
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "ai_agents_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_agents_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company_usage_current_month"
            referencedColumns: ["company_id"]
          },
        ]
      }
      broadcast_recipients: {
        Row: {
          broadcast_id: string
          company_id: string
          contact_id: string
          delivered_at: string | null
          error: string | null
          id: string
          personalized_body: string | null
          read_at: string | null
          replied_at: string | null
          sent_at: string | null
          status: string
        }
        Insert: {
          broadcast_id: string
          company_id: string
          contact_id: string
          delivered_at?: string | null
          error?: string | null
          id?: string
          personalized_body?: string | null
          read_at?: string | null
          replied_at?: string | null
          sent_at?: string | null
          status?: string
        }
        Update: {
          broadcast_id?: string
          company_id?: string
          contact_id?: string
          delivered_at?: string | null
          error?: string | null
          id?: string
          personalized_body?: string | null
          read_at?: string | null
          replied_at?: string | null
          sent_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "broadcast_recipients_broadcast_id_fkey"
            columns: ["broadcast_id"]
            isOneToOne: false
            referencedRelation: "broadcasts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "broadcast_recipients_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "broadcast_recipients_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company_usage_current_month"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "broadcast_recipients_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      broadcasts: {
        Row: {
          audience_filter: Json
          channel_id: string | null
          company_id: string
          completed_at: string | null
          created_at: string
          delivered_count: number
          failed_count: number
          flow_id: string | null
          id: string
          media_type: string | null
          media_url: string | null
          message_body: string | null
          name: string
          rate_per_minute: number
          read_count: number
          scheduled_at: string | null
          segment: Json | null
          sent_count: number
          started_at: string | null
          stats: Json | null
          status: Database["public"]["Enums"]["broadcast_status"]
          total_recipients: number
          updated_at: string
          variables: Json
        }
        Insert: {
          audience_filter?: Json
          channel_id?: string | null
          company_id: string
          completed_at?: string | null
          created_at?: string
          delivered_count?: number
          failed_count?: number
          flow_id?: string | null
          id?: string
          media_type?: string | null
          media_url?: string | null
          message_body?: string | null
          name: string
          rate_per_minute?: number
          read_count?: number
          scheduled_at?: string | null
          segment?: Json | null
          sent_count?: number
          started_at?: string | null
          stats?: Json | null
          status?: Database["public"]["Enums"]["broadcast_status"]
          total_recipients?: number
          updated_at?: string
          variables?: Json
        }
        Update: {
          audience_filter?: Json
          channel_id?: string | null
          company_id?: string
          completed_at?: string | null
          created_at?: string
          delivered_count?: number
          failed_count?: number
          flow_id?: string | null
          id?: string
          media_type?: string | null
          media_url?: string | null
          message_body?: string | null
          name?: string
          rate_per_minute?: number
          read_count?: number
          scheduled_at?: string | null
          segment?: Json | null
          sent_count?: number
          started_at?: string | null
          stats?: Json | null
          status?: Database["public"]["Enums"]["broadcast_status"]
          total_recipients?: number
          updated_at?: string
          variables?: Json
        }
        Relationships: [
          {
            foreignKeyName: "broadcasts_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "broadcasts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "broadcasts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company_usage_current_month"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "broadcasts_flow_id_fkey"
            columns: ["flow_id"]
            isOneToOne: false
            referencedRelation: "flows"
            referencedColumns: ["id"]
          },
        ]
      }
      cascade_attempts: {
        Row: {
          channel_id: string | null
          channel_type: string
          company_id: string
          created_at: string
          error: string | null
          id: string
          provider_message_id: string | null
          run_id: string
          sent_at: string | null
          status: string
          step_index: number
        }
        Insert: {
          channel_id?: string | null
          channel_type: string
          company_id: string
          created_at?: string
          error?: string | null
          id?: string
          provider_message_id?: string | null
          run_id: string
          sent_at?: string | null
          status?: string
          step_index: number
        }
        Update: {
          channel_id?: string | null
          channel_type?: string
          company_id?: string
          created_at?: string
          error?: string | null
          id?: string
          provider_message_id?: string | null
          run_id?: string
          sent_at?: string | null
          status?: string
          step_index?: number
        }
        Relationships: [
          {
            foreignKeyName: "cascade_attempts_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cascade_attempts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cascade_attempts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company_usage_current_month"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "cascade_attempts_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "cascade_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      cascade_policies: {
        Row: {
          active: boolean
          company_id: string
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          name: string
          steps: Json
          updated_at: string
        }
        Insert: {
          active?: boolean
          company_id: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name: string
          steps?: Json
          updated_at?: string
        }
        Update: {
          active?: boolean
          company_id?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name?: string
          steps?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cascade_policies_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cascade_policies_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company_usage_current_month"
            referencedColumns: ["company_id"]
          },
        ]
      }
      cascade_runs: {
        Row: {
          channel_id: string | null
          company_id: string
          completed_at: string | null
          contact_id: string
          conversation_id: string | null
          created_at: string
          created_by: string | null
          current_step: number
          id: string
          idempotency_key: string | null
          last_error: string | null
          lock_expires_at: string | null
          lock_token: string | null
          policy_id: string
          reply_channel_id: string | null
          reply_message_id: string | null
          run_at: string
          started_at: string
          status: string
          stopped_by_reply_at: string | null
          updated_at: string
        }
        Insert: {
          channel_id?: string | null
          company_id: string
          completed_at?: string | null
          contact_id: string
          conversation_id?: string | null
          created_at?: string
          created_by?: string | null
          current_step?: number
          id?: string
          idempotency_key?: string | null
          last_error?: string | null
          lock_expires_at?: string | null
          lock_token?: string | null
          policy_id: string
          reply_channel_id?: string | null
          reply_message_id?: string | null
          run_at?: string
          started_at?: string
          status?: string
          stopped_by_reply_at?: string | null
          updated_at?: string
        }
        Update: {
          channel_id?: string | null
          company_id?: string
          completed_at?: string | null
          contact_id?: string
          conversation_id?: string | null
          created_at?: string
          created_by?: string | null
          current_step?: number
          id?: string
          idempotency_key?: string | null
          last_error?: string | null
          lock_expires_at?: string | null
          lock_token?: string | null
          policy_id?: string
          reply_channel_id?: string | null
          reply_message_id?: string | null
          run_at?: string
          started_at?: string
          status?: string
          stopped_by_reply_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cascade_runs_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cascade_runs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cascade_runs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company_usage_current_month"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "cascade_runs_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cascade_runs_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cascade_runs_policy_id_fkey"
            columns: ["policy_id"]
            isOneToOne: false
            referencedRelation: "cascade_policies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cascade_runs_reply_channel_id_fkey"
            columns: ["reply_channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cascade_runs_reply_message_id_fkey"
            columns: ["reply_message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      channel_events: {
        Row: {
          channel_id: string | null
          company_id: string
          contact_id: string | null
          conversation_id: string | null
          created_at: string
          event_type: Database["public"]["Enums"]["channel_event_type"]
          id: string
          payload: Json | null
        }
        Insert: {
          channel_id?: string | null
          company_id: string
          contact_id?: string | null
          conversation_id?: string | null
          created_at?: string
          event_type: Database["public"]["Enums"]["channel_event_type"]
          id?: string
          payload?: Json | null
        }
        Update: {
          channel_id?: string | null
          company_id?: string
          contact_id?: string | null
          conversation_id?: string | null
          created_at?: string
          event_type?: Database["public"]["Enums"]["channel_event_type"]
          id?: string
          payload?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "channel_events_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_events_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_events_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company_usage_current_month"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "channel_events_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_events_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      channel_metrics_daily: {
        Row: {
          channel_id: string
          company_id: string
          conversations_opened: number
          date: string
          id: string
          messages_received: number
          messages_sent: number
        }
        Insert: {
          channel_id: string
          company_id: string
          conversations_opened?: number
          date: string
          id?: string
          messages_received?: number
          messages_sent?: number
        }
        Update: {
          channel_id?: string
          company_id?: string
          conversations_opened?: number
          date?: string
          id?: string
          messages_received?: number
          messages_sent?: number
        }
        Relationships: [
          {
            foreignKeyName: "channel_metrics_daily_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_metrics_daily_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_metrics_daily_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company_usage_current_month"
            referencedColumns: ["company_id"]
          },
        ]
      }
      channels: {
        Row: {
          ai_agent_id: string | null
          archived_at: string | null
          auto_reply_enabled: boolean
          avatar_url: string | null
          business_hours: Json | null
          color: string | null
          company_id: string
          created_at: string
          credentials: Json
          daily_message_limit: number
          default_welcome_flow_id: string | null
          department_id: string | null
          id: string
          last_connected_at: string | null
          name: string
          off_hours_message: string | null
          paused_at: string | null
          phone_number: string | null
          provider: string | null
          provider_type: Database["public"]["Enums"]["channel_provider"] | null
          qr_code: string | null
          qr_expires_at: string | null
          routing_strategy: Database["public"]["Enums"]["routing_strategy"]
          session_data: Json | null
          status: Database["public"]["Enums"]["channel_status"]
          updated_at: string
          webhook_verify_token: string | null
        }
        Insert: {
          ai_agent_id?: string | null
          archived_at?: string | null
          auto_reply_enabled?: boolean
          avatar_url?: string | null
          business_hours?: Json | null
          color?: string | null
          company_id: string
          created_at?: string
          credentials?: Json
          daily_message_limit?: number
          default_welcome_flow_id?: string | null
          department_id?: string | null
          id?: string
          last_connected_at?: string | null
          name: string
          off_hours_message?: string | null
          paused_at?: string | null
          phone_number?: string | null
          provider?: string | null
          provider_type?: Database["public"]["Enums"]["channel_provider"] | null
          qr_code?: string | null
          qr_expires_at?: string | null
          routing_strategy?: Database["public"]["Enums"]["routing_strategy"]
          session_data?: Json | null
          status?: Database["public"]["Enums"]["channel_status"]
          updated_at?: string
          webhook_verify_token?: string | null
        }
        Update: {
          ai_agent_id?: string | null
          archived_at?: string | null
          auto_reply_enabled?: boolean
          avatar_url?: string | null
          business_hours?: Json | null
          color?: string | null
          company_id?: string
          created_at?: string
          credentials?: Json
          daily_message_limit?: number
          default_welcome_flow_id?: string | null
          department_id?: string | null
          id?: string
          last_connected_at?: string | null
          name?: string
          off_hours_message?: string | null
          paused_at?: string | null
          phone_number?: string | null
          provider?: string | null
          provider_type?: Database["public"]["Enums"]["channel_provider"] | null
          qr_code?: string | null
          qr_expires_at?: string | null
          routing_strategy?: Database["public"]["Enums"]["routing_strategy"]
          session_data?: Json | null
          status?: Database["public"]["Enums"]["channel_status"]
          updated_at?: string
          webhook_verify_token?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "channels_ai_agent_id_fkey"
            columns: ["ai_agent_id"]
            isOneToOne: false
            referencedRelation: "ai_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channels_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channels_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company_usage_current_month"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "channels_default_welcome_flow_id_fkey"
            columns: ["default_welcome_flow_id"]
            isOneToOne: false
            referencedRelation: "flows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channels_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          created_at: string
          id: string
          locale: string
          logo_url: string | null
          name: string
          slug: string | null
          timezone: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          locale?: string
          logo_url?: string | null
          name: string
          slug?: string | null
          timezone?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          locale?: string
          logo_url?: string | null
          name?: string
          slug?: string | null
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      contact_enrichment_history: {
        Row: {
          action: Database["public"]["Enums"]["enrichment_action"]
          actor_id: string | null
          company_id: string
          confidence: number | null
          contact_id: string
          created_at: string
          field_key: string
          id: string
          message_id: string | null
          model: string | null
          new_value: Json | null
          previous_value: Json | null
          run_id: string | null
          source_type:
            | Database["public"]["Enums"]["enrichment_source_type"]
            | null
          suggestion_id: string | null
        }
        Insert: {
          action: Database["public"]["Enums"]["enrichment_action"]
          actor_id?: string | null
          company_id: string
          confidence?: number | null
          contact_id: string
          created_at?: string
          field_key: string
          id?: string
          message_id?: string | null
          model?: string | null
          new_value?: Json | null
          previous_value?: Json | null
          run_id?: string | null
          source_type?:
            | Database["public"]["Enums"]["enrichment_source_type"]
            | null
          suggestion_id?: string | null
        }
        Update: {
          action?: Database["public"]["Enums"]["enrichment_action"]
          actor_id?: string | null
          company_id?: string
          confidence?: number | null
          contact_id?: string
          created_at?: string
          field_key?: string
          id?: string
          message_id?: string | null
          model?: string | null
          new_value?: Json | null
          previous_value?: Json | null
          run_id?: string | null
          source_type?:
            | Database["public"]["Enums"]["enrichment_source_type"]
            | null
          suggestion_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contact_enrichment_history_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_enrichment_history_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company_usage_current_month"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "contact_enrichment_history_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_enrichment_history_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_enrichment_history_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "contact_enrichment_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_enrichment_history_suggestion_id_fkey"
            columns: ["suggestion_id"]
            isOneToOne: false
            referencedRelation: "contact_enrichment_suggestions"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_enrichment_runs: {
        Row: {
          company_id: string
          contact_id: string
          created_at: string
          error: string | null
          extracted_payload: Json
          finished_at: string | null
          id: string
          latency_ms: number | null
          message_id: string | null
          model: string | null
          source_type: Database["public"]["Enums"]["enrichment_source_type"]
          started_at: string | null
          status: Database["public"]["Enums"]["enrichment_run_status"]
          token_usage: Json
          updated_at: string
        }
        Insert: {
          company_id: string
          contact_id: string
          created_at?: string
          error?: string | null
          extracted_payload?: Json
          finished_at?: string | null
          id?: string
          latency_ms?: number | null
          message_id?: string | null
          model?: string | null
          source_type: Database["public"]["Enums"]["enrichment_source_type"]
          started_at?: string | null
          status?: Database["public"]["Enums"]["enrichment_run_status"]
          token_usage?: Json
          updated_at?: string
        }
        Update: {
          company_id?: string
          contact_id?: string
          created_at?: string
          error?: string | null
          extracted_payload?: Json
          finished_at?: string | null
          id?: string
          latency_ms?: number | null
          message_id?: string | null
          model?: string | null
          source_type?: Database["public"]["Enums"]["enrichment_source_type"]
          started_at?: string | null
          status?: Database["public"]["Enums"]["enrichment_run_status"]
          token_usage?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contact_enrichment_runs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_enrichment_runs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company_usage_current_month"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "contact_enrichment_runs_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_enrichment_runs_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: true
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_enrichment_suggestions: {
        Row: {
          company_id: string
          confidence: number
          contact_id: string
          created_at: string
          current_value: Json | null
          expires_at: string | null
          field_key: string
          id: string
          message_id: string | null
          model: string | null
          review_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          run_id: string | null
          source_type: Database["public"]["Enums"]["enrichment_source_type"]
          status: Database["public"]["Enums"]["enrichment_suggestion_status"]
          suggested_value: Json
          updated_at: string
        }
        Insert: {
          company_id: string
          confidence: number
          contact_id: string
          created_at?: string
          current_value?: Json | null
          expires_at?: string | null
          field_key: string
          id?: string
          message_id?: string | null
          model?: string | null
          review_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          run_id?: string | null
          source_type: Database["public"]["Enums"]["enrichment_source_type"]
          status?: Database["public"]["Enums"]["enrichment_suggestion_status"]
          suggested_value: Json
          updated_at?: string
        }
        Update: {
          company_id?: string
          confidence?: number
          contact_id?: string
          created_at?: string
          current_value?: Json | null
          expires_at?: string | null
          field_key?: string
          id?: string
          message_id?: string | null
          model?: string | null
          review_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          run_id?: string | null
          source_type?: Database["public"]["Enums"]["enrichment_source_type"]
          status?: Database["public"]["Enums"]["enrichment_suggestion_status"]
          suggested_value?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contact_enrichment_suggestions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_enrichment_suggestions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company_usage_current_month"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "contact_enrichment_suggestions_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_enrichment_suggestions_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_enrichment_suggestions_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "contact_enrichment_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_field_values: {
        Row: {
          company_id: string
          contact_id: string
          created_at: string
          field_id: string
          id: string
          updated_at: string
          value: string | null
        }
        Insert: {
          company_id: string
          contact_id: string
          created_at?: string
          field_id: string
          id?: string
          updated_at?: string
          value?: string | null
        }
        Update: {
          company_id?: string
          contact_id?: string
          created_at?: string
          field_id?: string
          id?: string
          updated_at?: string
          value?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contact_field_values_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_field_values_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company_usage_current_month"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "contact_field_values_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_field_values_field_id_fkey"
            columns: ["field_id"]
            isOneToOne: false
            referencedRelation: "custom_fields"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_notes: {
        Row: {
          body: string
          company_id: string
          contact_id: string
          created_at: string
          created_by: string | null
          id: string
          pinned: boolean
          updated_at: string
        }
        Insert: {
          body?: string
          company_id: string
          contact_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          pinned?: boolean
          updated_at?: string
        }
        Update: {
          body?: string
          company_id?: string
          contact_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          pinned?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contact_notes_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_notes_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company_usage_current_month"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "contact_notes_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_tags: {
        Row: {
          company_id: string
          contact_id: string
          created_at: string
          tag_id: string
        }
        Insert: {
          company_id: string
          contact_id: string
          created_at?: string
          tag_id: string
        }
        Update: {
          company_id?: string
          contact_id?: string
          created_at?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contact_tags_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_tags_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company_usage_current_month"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "contact_tags_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_tasks: {
        Row: {
          assignee_id: string | null
          company_id: string
          completed_at: string | null
          contact_id: string
          created_at: string
          created_by: string | null
          description: string | null
          due_at: string | null
          id: string
          parent_id: string | null
          priority: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          assignee_id?: string | null
          company_id: string
          completed_at?: string | null
          contact_id: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_at?: string | null
          id?: string
          parent_id?: string | null
          priority?: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          assignee_id?: string | null
          company_id?: string
          completed_at?: string | null
          contact_id?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_at?: string | null
          id?: string
          parent_id?: string | null
          priority?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contact_tasks_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_tasks_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company_usage_current_month"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "contact_tasks_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_tasks_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "contact_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      contacts: {
        Row: {
          ai_insights: Json | null
          avatar_url: string | null
          company_id: string
          company_name: string | null
          created_at: string
          deal_value_cents: number
          deleted_at: string | null
          email: string | null
          funnel_stage: string
          id: string
          job_title: string | null
          last_inbound_channel_id: string | null
          last_interaction_at: string | null
          lead_score: number | null
          merged_into_id: string | null
          name: string
          next_action: string | null
          notes: string | null
          origin: string | null
          owner_id: string | null
          phone: string | null
          phone_canonical: string | null
          updated_at: string
        }
        Insert: {
          ai_insights?: Json | null
          avatar_url?: string | null
          company_id: string
          company_name?: string | null
          created_at?: string
          deal_value_cents?: number
          deleted_at?: string | null
          email?: string | null
          funnel_stage?: string
          id?: string
          job_title?: string | null
          last_inbound_channel_id?: string | null
          last_interaction_at?: string | null
          lead_score?: number | null
          merged_into_id?: string | null
          name: string
          next_action?: string | null
          notes?: string | null
          origin?: string | null
          owner_id?: string | null
          phone?: string | null
          phone_canonical?: string | null
          updated_at?: string
        }
        Update: {
          ai_insights?: Json | null
          avatar_url?: string | null
          company_id?: string
          company_name?: string | null
          created_at?: string
          deal_value_cents?: number
          deleted_at?: string | null
          email?: string | null
          funnel_stage?: string
          id?: string
          job_title?: string | null
          last_inbound_channel_id?: string | null
          last_interaction_at?: string | null
          lead_score?: number | null
          merged_into_id?: string | null
          name?: string
          next_action?: string | null
          notes?: string | null
          origin?: string | null
          owner_id?: string | null
          phone?: string | null
          phone_canonical?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contacts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company_usage_current_month"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "contacts_last_inbound_channel_id_fkey"
            columns: ["last_inbound_channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_merged_into_id_fkey"
            columns: ["merged_into_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_notes: {
        Row: {
          author_id: string
          body: string
          company_id: string
          conversation_id: string
          created_at: string
          id: string
          updated_at: string
        }
        Insert: {
          author_id: string
          body: string
          company_id: string
          conversation_id: string
          created_at?: string
          id?: string
          updated_at?: string
        }
        Update: {
          author_id?: string
          body?: string
          company_id?: string
          conversation_id?: string
          created_at?: string
          id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_notes_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_notes_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company_usage_current_month"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "conversation_notes_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_transfers: {
        Row: {
          company_id: string
          conversation_id: string
          created_at: string
          flow_id: string | null
          from_channel_id: string | null
          id: string
          note: string | null
          to_channel_id: string
          transferred_by: string | null
        }
        Insert: {
          company_id: string
          conversation_id: string
          created_at?: string
          flow_id?: string | null
          from_channel_id?: string | null
          id?: string
          note?: string | null
          to_channel_id: string
          transferred_by?: string | null
        }
        Update: {
          company_id?: string
          conversation_id?: string
          created_at?: string
          flow_id?: string | null
          from_channel_id?: string | null
          id?: string
          note?: string | null
          to_channel_id?: string
          transferred_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conversation_transfers_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_transfers_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company_usage_current_month"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "conversation_transfers_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_transfers_flow_id_fkey"
            columns: ["flow_id"]
            isOneToOne: false
            referencedRelation: "flows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_transfers_from_channel_id_fkey"
            columns: ["from_channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_transfers_to_channel_id_fkey"
            columns: ["to_channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          assigned_agent_id: string | null
          assigned_type: Database["public"]["Enums"]["assigned_type"]
          assigned_user_id: string | null
          bot_paused_until: string | null
          channel_id: string | null
          company_id: string
          contact_id: string
          created_at: string
          deleted_at: string | null
          deleted_by: string | null
          deleted_reason: string | null
          id: string
          last_message_at: string | null
          last_message_preview: string | null
          merged_into_id: string | null
          pinned: boolean
          pinned_at: string | null
          status: Database["public"]["Enums"]["conversation_status"]
          transferred_at: string | null
          transferred_from_channel_id: string | null
          unread_count: number
          updated_at: string
        }
        Insert: {
          assigned_agent_id?: string | null
          assigned_type?: Database["public"]["Enums"]["assigned_type"]
          assigned_user_id?: string | null
          bot_paused_until?: string | null
          channel_id?: string | null
          company_id: string
          contact_id: string
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          deleted_reason?: string | null
          id?: string
          last_message_at?: string | null
          last_message_preview?: string | null
          merged_into_id?: string | null
          pinned?: boolean
          pinned_at?: string | null
          status?: Database["public"]["Enums"]["conversation_status"]
          transferred_at?: string | null
          transferred_from_channel_id?: string | null
          unread_count?: number
          updated_at?: string
        }
        Update: {
          assigned_agent_id?: string | null
          assigned_type?: Database["public"]["Enums"]["assigned_type"]
          assigned_user_id?: string | null
          bot_paused_until?: string | null
          channel_id?: string | null
          company_id?: string
          contact_id?: string
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          deleted_reason?: string | null
          id?: string
          last_message_at?: string | null
          last_message_preview?: string | null
          merged_into_id?: string | null
          pinned?: boolean
          pinned_at?: string | null
          status?: Database["public"]["Enums"]["conversation_status"]
          transferred_at?: string | null
          transferred_from_channel_id?: string | null
          unread_count?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_assigned_agent_id_fkey"
            columns: ["assigned_agent_id"]
            isOneToOne: false
            referencedRelation: "ai_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company_usage_current_month"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "conversations_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_merged_into_id_fkey"
            columns: ["merged_into_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_transferred_from_channel_id_fkey"
            columns: ["transferred_from_channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
        ]
      }
      custom_fields: {
        Row: {
          company_id: string
          created_at: string
          field_type: Database["public"]["Enums"]["custom_field_type"]
          id: string
          key: string
          label: string
          options: Json | null
        }
        Insert: {
          company_id: string
          created_at?: string
          field_type?: Database["public"]["Enums"]["custom_field_type"]
          id?: string
          key: string
          label: string
          options?: Json | null
        }
        Update: {
          company_id?: string
          created_at?: string
          field_type?: Database["public"]["Enums"]["custom_field_type"]
          id?: string
          key?: string
          label?: string
          options?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "custom_fields_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "custom_fields_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company_usage_current_month"
            referencedColumns: ["company_id"]
          },
        ]
      }
      departments: {
        Row: {
          archived_at: string | null
          color: string | null
          company_id: string
          created_at: string
          description: string | null
          id: string
          lead_user_id: string | null
          name: string
          parent_id: string | null
          tags: string[] | null
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          color?: string | null
          company_id: string
          created_at?: string
          description?: string | null
          id?: string
          lead_user_id?: string | null
          name: string
          parent_id?: string | null
          tags?: string[] | null
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          color?: string | null
          company_id?: string
          created_at?: string
          description?: string | null
          id?: string
          lead_user_id?: string | null
          name?: string
          parent_id?: string | null
          tags?: string[] | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "departments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "departments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company_usage_current_month"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "departments_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      domain_events: {
        Row: {
          actor_id: string | null
          aggregate_id: string | null
          aggregate_type: string
          company_id: string
          correlation_id: string | null
          event_type: string
          event_version: number
          id: string
          occurred_at: string
          payload: Json
        }
        Insert: {
          actor_id?: string | null
          aggregate_id?: string | null
          aggregate_type: string
          company_id: string
          correlation_id?: string | null
          event_type: string
          event_version?: number
          id?: string
          occurred_at?: string
          payload?: Json
        }
        Update: {
          actor_id?: string | null
          aggregate_id?: string | null
          aggregate_type?: string
          company_id?: string
          correlation_id?: string | null
          event_type?: string
          event_version?: number
          id?: string
          occurred_at?: string
          payload?: Json
        }
        Relationships: [
          {
            foreignKeyName: "domain_events_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "domain_events_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company_usage_current_month"
            referencedColumns: ["company_id"]
          },
        ]
      }
      feature_flags: {
        Row: {
          company_id: string | null
          created_at: string
          depends_on: string[] | null
          description: string | null
          enabled: boolean
          environment: string
          expires_at: string | null
          id: string
          key: string
          module: string | null
          rollout_percentage: number | null
          strategy: string
          target_roles: string[] | null
          target_users: string[] | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          depends_on?: string[] | null
          description?: string | null
          enabled?: boolean
          environment?: string
          expires_at?: string | null
          id?: string
          key: string
          module?: string | null
          rollout_percentage?: number | null
          strategy?: string
          target_roles?: string[] | null
          target_users?: string[] | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          company_id?: string | null
          created_at?: string
          depends_on?: string[] | null
          description?: string | null
          enabled?: boolean
          environment?: string
          expires_at?: string | null
          id?: string
          key?: string
          module?: string | null
          rollout_percentage?: number | null
          strategy?: string
          target_roles?: string[] | null
          target_users?: string[] | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "feature_flags_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feature_flags_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company_usage_current_month"
            referencedColumns: ["company_id"]
          },
        ]
      }
      flow_dead_letter: {
        Row: {
          company_id: string
          created_at: string
          error: Json
          flow_id: string
          id: string
          node_id: string | null
          node_type: string
          payload: Json
          resolved_at: string | null
          resolved_by: string | null
          retry_count: number
          run_id: string
          status: string
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          error: Json
          flow_id: string
          id?: string
          node_id?: string | null
          node_type: string
          payload?: Json
          resolved_at?: string | null
          resolved_by?: string | null
          retry_count?: number
          run_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          error?: Json
          flow_id?: string
          id?: string
          node_id?: string | null
          node_type?: string
          payload?: Json
          resolved_at?: string | null
          resolved_by?: string | null
          retry_count?: number
          run_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "flow_dead_letter_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flow_dead_letter_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company_usage_current_month"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "flow_dead_letter_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "flow_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      flow_edges: {
        Row: {
          company_id: string
          created_at: string
          flow_id: string
          id: string
          label: string | null
          source_handle: string | null
          source_node_id: string
          target_node_id: string
          transition_delay_ms: number
        }
        Insert: {
          company_id: string
          created_at?: string
          flow_id: string
          id?: string
          label?: string | null
          source_handle?: string | null
          source_node_id: string
          target_node_id: string
          transition_delay_ms?: number
        }
        Update: {
          company_id?: string
          created_at?: string
          flow_id?: string
          id?: string
          label?: string | null
          source_handle?: string | null
          source_node_id?: string
          target_node_id?: string
          transition_delay_ms?: number
        }
        Relationships: [
          {
            foreignKeyName: "flow_edges_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flow_edges_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company_usage_current_month"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "flow_edges_flow_id_fkey"
            columns: ["flow_id"]
            isOneToOne: false
            referencedRelation: "flows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flow_edges_source_node_id_fkey"
            columns: ["source_node_id"]
            isOneToOne: false
            referencedRelation: "flow_nodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flow_edges_target_node_id_fkey"
            columns: ["target_node_id"]
            isOneToOne: false
            referencedRelation: "flow_nodes"
            referencedColumns: ["id"]
          },
        ]
      }
      flow_events: {
        Row: {
          company_id: string
          created_at: string
          event_type: string
          flow_id: string | null
          id: string
          node_id: string | null
          payload: Json
          run_id: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          event_type: string
          flow_id?: string | null
          id?: string
          node_id?: string | null
          payload?: Json
          run_id?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          event_type?: string
          flow_id?: string | null
          id?: string
          node_id?: string | null
          payload?: Json
          run_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "flow_events_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flow_events_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company_usage_current_month"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "flow_events_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "flow_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      flow_nodes: {
        Row: {
          company_id: string
          created_at: string
          data: Json
          flow_id: string
          id: string
          node_type: string
          position: Json
        }
        Insert: {
          company_id: string
          created_at?: string
          data?: Json
          flow_id: string
          id?: string
          node_type: string
          position?: Json
        }
        Update: {
          company_id?: string
          created_at?: string
          data?: Json
          flow_id?: string
          id?: string
          node_type?: string
          position?: Json
        }
        Relationships: [
          {
            foreignKeyName: "flow_nodes_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flow_nodes_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company_usage_current_month"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "flow_nodes_flow_id_fkey"
            columns: ["flow_id"]
            isOneToOne: false
            referencedRelation: "flows"
            referencedColumns: ["id"]
          },
        ]
      }
      flow_run_steps: {
        Row: {
          company_id: string
          created_at: string
          duration_ms: number | null
          error: Json | null
          finished_at: string | null
          flow_id: string
          http_status: number | null
          id: string
          idempotency_key: string | null
          input: Json
          metrics: Json
          node_id: string | null
          node_type: string
          output: Json
          provider: string | null
          provider_message_id: string | null
          provider_request: Json | null
          provider_response: Json | null
          retry_count: number
          run_id: string
          seq: number
          started_at: string
          state: string
        }
        Insert: {
          company_id: string
          created_at?: string
          duration_ms?: number | null
          error?: Json | null
          finished_at?: string | null
          flow_id: string
          http_status?: number | null
          id?: string
          idempotency_key?: string | null
          input?: Json
          metrics?: Json
          node_id?: string | null
          node_type: string
          output?: Json
          provider?: string | null
          provider_message_id?: string | null
          provider_request?: Json | null
          provider_response?: Json | null
          retry_count?: number
          run_id: string
          seq: number
          started_at?: string
          state: string
        }
        Update: {
          company_id?: string
          created_at?: string
          duration_ms?: number | null
          error?: Json | null
          finished_at?: string | null
          flow_id?: string
          http_status?: number | null
          id?: string
          idempotency_key?: string | null
          input?: Json
          metrics?: Json
          node_id?: string | null
          node_type?: string
          output?: Json
          provider?: string | null
          provider_message_id?: string | null
          provider_request?: Json | null
          provider_response?: Json | null
          retry_count?: number
          run_id?: string
          seq?: number
          started_at?: string
          state?: string
        }
        Relationships: [
          {
            foreignKeyName: "flow_run_steps_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flow_run_steps_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company_usage_current_month"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "flow_run_steps_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "flow_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      flow_runs: {
        Row: {
          channel_id: string | null
          company_id: string
          completed_at: string | null
          context_data: Json
          conversation_id: string | null
          created_at: string
          current_node_id: string | null
          cursor_node_id: string | null
          dry_run: boolean
          error: string | null
          execution_stack: Json
          flow_id: string
          graph_hash: string | null
          id: string
          idempotency_key: string | null
          is_test: boolean
          last_error: Json | null
          lock_expires_at: string | null
          lock_token: string | null
          messages_sent: number
          metrics: Json
          previous_node_id: string | null
          published_version_id: string | null
          published_version_number: number | null
          resume_at: string | null
          retry_count: number
          started_at: string | null
          state: string
          status: string
          steps: Json
          trigger_payload: Json
          trigger_type: string | null
          updated_at: string
          variables: Json
        }
        Insert: {
          channel_id?: string | null
          company_id: string
          completed_at?: string | null
          context_data?: Json
          conversation_id?: string | null
          created_at?: string
          current_node_id?: string | null
          cursor_node_id?: string | null
          dry_run?: boolean
          error?: string | null
          execution_stack?: Json
          flow_id: string
          graph_hash?: string | null
          id?: string
          idempotency_key?: string | null
          is_test?: boolean
          last_error?: Json | null
          lock_expires_at?: string | null
          lock_token?: string | null
          messages_sent?: number
          metrics?: Json
          previous_node_id?: string | null
          published_version_id?: string | null
          published_version_number?: number | null
          resume_at?: string | null
          retry_count?: number
          started_at?: string | null
          state?: string
          status?: string
          steps?: Json
          trigger_payload?: Json
          trigger_type?: string | null
          updated_at?: string
          variables?: Json
        }
        Update: {
          channel_id?: string | null
          company_id?: string
          completed_at?: string | null
          context_data?: Json
          conversation_id?: string | null
          created_at?: string
          current_node_id?: string | null
          cursor_node_id?: string | null
          dry_run?: boolean
          error?: string | null
          execution_stack?: Json
          flow_id?: string
          graph_hash?: string | null
          id?: string
          idempotency_key?: string | null
          is_test?: boolean
          last_error?: Json | null
          lock_expires_at?: string | null
          lock_token?: string | null
          messages_sent?: number
          metrics?: Json
          previous_node_id?: string | null
          published_version_id?: string | null
          published_version_number?: number | null
          resume_at?: string | null
          retry_count?: number
          started_at?: string | null
          state?: string
          status?: string
          steps?: Json
          trigger_payload?: Json
          trigger_type?: string | null
          updated_at?: string
          variables?: Json
        }
        Relationships: [
          {
            foreignKeyName: "flow_runs_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flow_runs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flow_runs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company_usage_current_month"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "flow_runs_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flow_runs_current_node_id_fkey"
            columns: ["current_node_id"]
            isOneToOne: false
            referencedRelation: "flow_nodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flow_runs_flow_id_fkey"
            columns: ["flow_id"]
            isOneToOne: false
            referencedRelation: "flows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flow_runs_published_version_id_fkey"
            columns: ["published_version_id"]
            isOneToOne: false
            referencedRelation: "flow_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      flow_versions: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          description: string | null
          flow_id: string
          id: string
          integrity_hash: string
          published_at: string | null
          published_by: string | null
          restored_at: string | null
          restored_by: string | null
          snapshot: Json
          status: string
          updated_at: string
          version_number: number
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          flow_id: string
          id?: string
          integrity_hash: string
          published_at?: string | null
          published_by?: string | null
          restored_at?: string | null
          restored_by?: string | null
          snapshot: Json
          status?: string
          updated_at?: string
          version_number: number
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          flow_id?: string
          id?: string
          integrity_hash?: string
          published_at?: string | null
          published_by?: string | null
          restored_at?: string | null
          restored_by?: string | null
          snapshot?: Json
          status?: string
          updated_at?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "flow_versions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flow_versions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company_usage_current_month"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "flow_versions_flow_id_fkey"
            columns: ["flow_id"]
            isOneToOne: false
            referencedRelation: "flows"
            referencedColumns: ["id"]
          },
        ]
      }
      flows: {
        Row: {
          company_id: string
          created_at: string
          description: string | null
          id: string
          name: string
          runs_count: number
          status: Database["public"]["Enums"]["flow_status"]
          trigger_config: Json | null
          trigger_type: Database["public"]["Enums"]["flow_trigger_type"]
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          description?: string | null
          id?: string
          name: string
          runs_count?: number
          status?: Database["public"]["Enums"]["flow_status"]
          trigger_config?: Json | null
          trigger_type?: Database["public"]["Enums"]["flow_trigger_type"]
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          runs_count?: number
          status?: Database["public"]["Enums"]["flow_status"]
          trigger_config?: Json | null
          trigger_type?: Database["public"]["Enums"]["flow_trigger_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "flows_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flows_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company_usage_current_month"
            referencedColumns: ["company_id"]
          },
        ]
      }
      funnel_card_events: {
        Row: {
          actor_id: string | null
          card_id: string
          company_id: string
          created_at: string
          event_type: string
          from_stage_id: string | null
          id: string
          meta: Json
          to_stage_id: string | null
        }
        Insert: {
          actor_id?: string | null
          card_id: string
          company_id: string
          created_at?: string
          event_type: string
          from_stage_id?: string | null
          id?: string
          meta?: Json
          to_stage_id?: string | null
        }
        Update: {
          actor_id?: string | null
          card_id?: string
          company_id?: string
          created_at?: string
          event_type?: string
          from_stage_id?: string | null
          id?: string
          meta?: Json
          to_stage_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "funnel_card_events_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "funnel_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "funnel_card_events_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "funnel_card_events_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company_usage_current_month"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "funnel_card_events_from_stage_id_fkey"
            columns: ["from_stage_id"]
            isOneToOne: false
            referencedRelation: "funnel_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "funnel_card_events_to_stage_id_fkey"
            columns: ["to_stage_id"]
            isOneToOne: false
            referencedRelation: "funnel_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      funnel_cards: {
        Row: {
          archived_at: string | null
          assigned_user_id: string | null
          company_id: string
          contact_id: string
          created_at: string
          created_by: string | null
          currency: string
          funnel_id: string
          id: string
          lost_at: string | null
          lost_reason: string | null
          position: number
          stage_id: string
          status: string
          title: string | null
          updated_at: string
          value_cents: number
          won_at: string | null
        }
        Insert: {
          archived_at?: string | null
          assigned_user_id?: string | null
          company_id: string
          contact_id: string
          created_at?: string
          created_by?: string | null
          currency?: string
          funnel_id: string
          id?: string
          lost_at?: string | null
          lost_reason?: string | null
          position?: number
          stage_id: string
          status?: string
          title?: string | null
          updated_at?: string
          value_cents?: number
          won_at?: string | null
        }
        Update: {
          archived_at?: string | null
          assigned_user_id?: string | null
          company_id?: string
          contact_id?: string
          created_at?: string
          created_by?: string | null
          currency?: string
          funnel_id?: string
          id?: string
          lost_at?: string | null
          lost_reason?: string | null
          position?: number
          stage_id?: string
          status?: string
          title?: string | null
          updated_at?: string
          value_cents?: number
          won_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "funnel_cards_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "funnel_cards_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company_usage_current_month"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "funnel_cards_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "funnel_cards_funnel_id_fkey"
            columns: ["funnel_id"]
            isOneToOne: false
            referencedRelation: "funnels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "funnel_cards_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "funnel_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      funnel_stages: {
        Row: {
          archived_at: string | null
          color: string
          company_id: string
          created_at: string
          funnel_id: string
          id: string
          kind: string
          name: string
          position: number
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          color?: string
          company_id: string
          created_at?: string
          funnel_id: string
          id?: string
          kind?: string
          name: string
          position?: number
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          color?: string
          company_id?: string
          created_at?: string
          funnel_id?: string
          id?: string
          kind?: string
          name?: string
          position?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "funnel_stages_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "funnel_stages_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company_usage_current_month"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "funnel_stages_funnel_id_fkey"
            columns: ["funnel_id"]
            isOneToOne: false
            referencedRelation: "funnels"
            referencedColumns: ["id"]
          },
        ]
      }
      funnels: {
        Row: {
          archived_at: string | null
          color: string
          company_id: string
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_default: boolean
          name: string
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          color?: string
          company_id: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_default?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          color?: string
          company_id?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_default?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "funnels_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "funnels_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company_usage_current_month"
            referencedColumns: ["company_id"]
          },
        ]
      }
      guardian_health_snapshots: {
        Row: {
          company_id: string
          created_at: string
          critical_count: number
          health: Json
          id: string
          incident_count: number
          score: number
          source: string
          status: string
        }
        Insert: {
          company_id: string
          created_at?: string
          critical_count?: number
          health?: Json
          id?: string
          incident_count?: number
          score: number
          source?: string
          status: string
        }
        Update: {
          company_id?: string
          created_at?: string
          critical_count?: number
          health?: Json
          id?: string
          incident_count?: number
          score?: number
          source?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "guardian_health_snapshots_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guardian_health_snapshots_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company_usage_current_month"
            referencedColumns: ["company_id"]
          },
        ]
      }
      guardian_incidents: {
        Row: {
          company_id: string
          context: Json
          created_at: string
          diagnosis: Json | null
          fingerprint: string | null
          fix_summary: string | null
          id: string
          kind: string
          last_seen_at: string
          message: string
          occurrences: number
          requires_code_change: boolean
          resolved_at: string | null
          route: string | null
          severity: string
          stack: string | null
          status: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          company_id: string
          context?: Json
          created_at?: string
          diagnosis?: Json | null
          fingerprint?: string | null
          fix_summary?: string | null
          id?: string
          kind?: string
          last_seen_at?: string
          message: string
          occurrences?: number
          requires_code_change?: boolean
          resolved_at?: string | null
          route?: string | null
          severity?: string
          stack?: string | null
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          company_id?: string
          context?: Json
          created_at?: string
          diagnosis?: Json | null
          fingerprint?: string | null
          fix_summary?: string | null
          id?: string
          kind?: string
          last_seen_at?: string
          message?: string
          occurrences?: number
          requires_code_change?: boolean
          resolved_at?: string | null
          route?: string | null
          severity?: string
          stack?: string | null
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "guardian_incidents_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guardian_incidents_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company_usage_current_month"
            referencedColumns: ["company_id"]
          },
        ]
      }
      guardian_runs: {
        Row: {
          action: string
          company_id: string
          created_at: string
          error: string | null
          id: string
          incident_id: string | null
          payload: Json | null
          result: Json | null
          status: string
          user_id: string | null
        }
        Insert: {
          action: string
          company_id: string
          created_at?: string
          error?: string | null
          id?: string
          incident_id?: string | null
          payload?: Json | null
          result?: Json | null
          status?: string
          user_id?: string | null
        }
        Update: {
          action?: string
          company_id?: string
          created_at?: string
          error?: string | null
          id?: string
          incident_id?: string | null
          payload?: Json | null
          result?: Json | null
          status?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "guardian_runs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guardian_runs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company_usage_current_month"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "guardian_runs_incident_id_fkey"
            columns: ["incident_id"]
            isOneToOne: false
            referencedRelation: "guardian_incidents"
            referencedColumns: ["id"]
          },
        ]
      }
      integrations: {
        Row: {
          company_id: string
          config: Json
          created_at: string
          credentials: Json
          enabled: boolean
          id: string
          label: string
          last_tested_at: string | null
          provider: string
          test_error: string | null
          test_status: string | null
          updated_at: string
          webhook_secret: string | null
          webhook_url: string | null
        }
        Insert: {
          company_id: string
          config?: Json
          created_at?: string
          credentials?: Json
          enabled?: boolean
          id?: string
          label?: string
          last_tested_at?: string | null
          provider: string
          test_error?: string | null
          test_status?: string | null
          updated_at?: string
          webhook_secret?: string | null
          webhook_url?: string | null
        }
        Update: {
          company_id?: string
          config?: Json
          created_at?: string
          credentials?: Json
          enabled?: boolean
          id?: string
          label?: string
          last_tested_at?: string | null
          provider?: string
          test_error?: string | null
          test_status?: string | null
          updated_at?: string
          webhook_secret?: string | null
          webhook_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "integrations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integrations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company_usage_current_month"
            referencedColumns: ["company_id"]
          },
        ]
      }
      job_titles: {
        Row: {
          company_id: string
          created_at: string
          department_id: string | null
          id: string
          name: string
        }
        Insert: {
          company_id: string
          created_at?: string
          department_id?: string | null
          id?: string
          name: string
        }
        Update: {
          company_id?: string
          created_at?: string
          department_id?: string | null
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_titles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_titles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company_usage_current_month"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "job_titles_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      member_agents: {
        Row: {
          agent_id: string
          company_id: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          agent_id: string
          company_id: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          agent_id?: string
          company_id?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "member_agents_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "ai_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_agents_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_agents_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company_usage_current_month"
            referencedColumns: ["company_id"]
          },
        ]
      }
      member_channels: {
        Row: {
          channel_id: string
          company_id: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          channel_id: string
          company_id: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          channel_id?: string
          company_id?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "member_channels_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_channels_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_channels_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company_usage_current_month"
            referencedColumns: ["company_id"]
          },
        ]
      }
      member_permission_overrides: {
        Row: {
          company_id: string
          created_at: string
          granted: boolean
          id: string
          permission_key: string
          reason: string | null
          scope: Json | null
          updated_at: string
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          granted: boolean
          id?: string
          permission_key: string
          reason?: string | null
          scope?: Json | null
          updated_at?: string
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          granted?: boolean
          id?: string
          permission_key?: string
          reason?: string | null
          scope?: Json | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "member_permission_overrides_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_permission_overrides_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company_usage_current_month"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "member_permission_overrides_permission_key_fkey"
            columns: ["permission_key"]
            isOneToOne: false
            referencedRelation: "permissions"
            referencedColumns: ["key"]
          },
        ]
      }
      member_tags: {
        Row: {
          company_id: string
          created_at: string
          id: string
          tag: string
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          tag: string
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          tag?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "member_tags_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_tags_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company_usage_current_month"
            referencedColumns: ["company_id"]
          },
        ]
      }
      message_deletions: {
        Row: {
          actor_id: string | null
          company_id: string
          conversation_id: string
          created_at: string
          id: string
          message_id: string
          provider_ack: boolean | null
          provider_error: string | null
          provider_response: Json | null
          reason: string | null
          scope: Database["public"]["Enums"]["message_deletion_scope"]
        }
        Insert: {
          actor_id?: string | null
          company_id: string
          conversation_id: string
          created_at?: string
          id?: string
          message_id: string
          provider_ack?: boolean | null
          provider_error?: string | null
          provider_response?: Json | null
          reason?: string | null
          scope: Database["public"]["Enums"]["message_deletion_scope"]
        }
        Update: {
          actor_id?: string | null
          company_id?: string
          conversation_id?: string
          created_at?: string
          id?: string
          message_id?: string
          provider_ack?: boolean | null
          provider_error?: string | null
          provider_response?: Json | null
          reason?: string | null
          scope?: Database["public"]["Enums"]["message_deletion_scope"]
        }
        Relationships: [
          {
            foreignKeyName: "message_deletions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_deletions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company_usage_current_month"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "message_deletions_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_deletions_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          body: string | null
          broadcast_id: string | null
          cascade_run_id: string | null
          channel_id: string | null
          company_id: string
          conversation_id: string
          created_at: string
          deleted_at: string | null
          deleted_by: string | null
          deleted_reason: string | null
          deleted_scope:
            | Database["public"]["Enums"]["message_deletion_scope"]
            | null
          direction: Database["public"]["Enums"]["message_direction"]
          error: string | null
          failed_at: string | null
          flow_run_id: string | null
          id: string
          media_metadata: Json | null
          media_url: string | null
          provider_delete_ack: boolean | null
          provider_delete_error: string | null
          provider_message_id: string | null
          reply_to_id: string | null
          retry_count: number
          sender_agent_id: string | null
          sender_user_id: string | null
          status: string | null
          type: Database["public"]["Enums"]["message_type"]
        }
        Insert: {
          body?: string | null
          broadcast_id?: string | null
          cascade_run_id?: string | null
          channel_id?: string | null
          company_id: string
          conversation_id: string
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          deleted_reason?: string | null
          deleted_scope?:
            | Database["public"]["Enums"]["message_deletion_scope"]
            | null
          direction: Database["public"]["Enums"]["message_direction"]
          error?: string | null
          failed_at?: string | null
          flow_run_id?: string | null
          id?: string
          media_metadata?: Json | null
          media_url?: string | null
          provider_delete_ack?: boolean | null
          provider_delete_error?: string | null
          provider_message_id?: string | null
          reply_to_id?: string | null
          retry_count?: number
          sender_agent_id?: string | null
          sender_user_id?: string | null
          status?: string | null
          type?: Database["public"]["Enums"]["message_type"]
        }
        Update: {
          body?: string | null
          broadcast_id?: string | null
          cascade_run_id?: string | null
          channel_id?: string | null
          company_id?: string
          conversation_id?: string
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          deleted_reason?: string | null
          deleted_scope?:
            | Database["public"]["Enums"]["message_deletion_scope"]
            | null
          direction?: Database["public"]["Enums"]["message_direction"]
          error?: string | null
          failed_at?: string | null
          flow_run_id?: string | null
          id?: string
          media_metadata?: Json | null
          media_url?: string | null
          provider_delete_ack?: boolean | null
          provider_delete_error?: string | null
          provider_message_id?: string | null
          reply_to_id?: string | null
          retry_count?: number
          sender_agent_id?: string | null
          sender_user_id?: string | null
          status?: string | null
          type?: Database["public"]["Enums"]["message_type"]
        }
        Relationships: [
          {
            foreignKeyName: "messages_broadcast_id_fkey"
            columns: ["broadcast_id"]
            isOneToOne: false
            referencedRelation: "broadcasts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_cascade_run_id_fkey"
            columns: ["cascade_run_id"]
            isOneToOne: false
            referencedRelation: "cascade_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company_usage_current_month"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_flow_run_id_fkey"
            columns: ["flow_run_id"]
            isOneToOne: false
            referencedRelation: "flow_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_reply_to_id_fkey"
            columns: ["reply_to_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_agent_id_fkey"
            columns: ["sender_agent_id"]
            isOneToOne: false
            referencedRelation: "ai_agents"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_preferences: {
        Row: {
          created_at: string
          desktop_enabled: boolean
          email_broadcast_completed: boolean
          email_new_conversation: boolean
          email_transfer_received: boolean
          sound_enabled: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          desktop_enabled?: boolean
          email_broadcast_completed?: boolean
          email_new_conversation?: boolean
          email_transfer_received?: boolean
          sound_enabled?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          desktop_enabled?: boolean
          email_broadcast_completed?: boolean
          email_new_conversation?: boolean
          email_transfer_received?: boolean
          sound_enabled?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      onboarding_progress: {
        Row: {
          company_id: string
          completed_at: string | null
          created_at: string
          dismissed_at: string | null
          step_agent_created: boolean
          step_channel_created: boolean
          step_first_message_sent: boolean
          step_whatsapp_connected: boolean
          updated_at: string
        }
        Insert: {
          company_id: string
          completed_at?: string | null
          created_at?: string
          dismissed_at?: string | null
          step_agent_created?: boolean
          step_channel_created?: boolean
          step_first_message_sent?: boolean
          step_whatsapp_connected?: boolean
          updated_at?: string
        }
        Update: {
          company_id?: string
          completed_at?: string | null
          created_at?: string
          dismissed_at?: string | null
          step_agent_created?: boolean
          step_channel_created?: boolean
          step_first_message_sent?: boolean
          step_whatsapp_connected?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "onboarding_progress_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onboarding_progress_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "company_usage_current_month"
            referencedColumns: ["company_id"]
          },
        ]
      }
      pending_invites: {
        Row: {
          company_id: string
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string | null
          last_sent_at: string
          role: Database["public"]["Enums"]["app_role"]
          sent_count: number
          status: string
          token: string | null
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          last_sent_at?: string
          role?: Database["public"]["Enums"]["app_role"]
          sent_count?: number
          status?: string
          token?: string | null
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          last_sent_at?: string
          role?: Database["public"]["Enums"]["app_role"]
          sent_count?: number
          status?: string
          token?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pending_invites_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pending_invites_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company_usage_current_month"
            referencedColumns: ["company_id"]
          },
        ]
      }
      permissions: {
        Row: {
          action: string
          created_at: string
          description: string | null
          key: string
          label: string
          module: string
        }
        Insert: {
          action: string
          created_at?: string
          description?: string | null
          key: string
          label: string
          module: string
        }
        Update: {
          action?: string
          created_at?: string
          description?: string | null
          key?: string
          label?: string
          module?: string
        }
        Relationships: []
      }
      plan_limits: {
        Row: {
          created_at: string
          display_name: string
          max_agents: number
          max_channels: number
          max_contacts: number
          max_messages_per_month: number
          monthly_price_cents: number
          plan_key: string
          sort_order: number
          stripe_price_id: string | null
        }
        Insert: {
          created_at?: string
          display_name: string
          max_agents: number
          max_channels: number
          max_contacts: number
          max_messages_per_month: number
          monthly_price_cents?: number
          plan_key: string
          sort_order?: number
          stripe_price_id?: string | null
        }
        Update: {
          created_at?: string
          display_name?: string
          max_agents?: number
          max_channels?: number
          max_contacts?: number
          max_messages_per_month?: number
          monthly_price_cents?: number
          plan_key?: string
          sort_order?: number
          stripe_price_id?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          company_id: string
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          last_seen_at: string | null
          notification_prefs: Json
          phone: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          company_id: string
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          last_seen_at?: string | null
          notification_prefs?: Json
          phone?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          company_id?: string
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          last_seen_at?: string | null
          notification_prefs?: Json
          phone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company_usage_current_month"
            referencedColumns: ["company_id"]
          },
        ]
      }
      quick_replies: {
        Row: {
          attachments: Json | null
          body: string | null
          company_id: string
          created_at: string
          folder_id: string | null
          id: string
          shortcut: string
          title: string
          updated_at: string
        }
        Insert: {
          attachments?: Json | null
          body?: string | null
          company_id: string
          created_at?: string
          folder_id?: string | null
          id?: string
          shortcut: string
          title: string
          updated_at?: string
        }
        Update: {
          attachments?: Json | null
          body?: string | null
          company_id?: string
          created_at?: string
          folder_id?: string | null
          id?: string
          shortcut?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "quick_replies_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quick_replies_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company_usage_current_month"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "quick_replies_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "quick_reply_folders"
            referencedColumns: ["id"]
          },
        ]
      }
      quick_reply_folders: {
        Row: {
          company_id: string
          created_at: string
          id: string
          name: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "quick_reply_folders_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quick_reply_folders_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company_usage_current_month"
            referencedColumns: ["company_id"]
          },
        ]
      }
      role_permissions_v2: {
        Row: {
          company_id: string
          created_at: string
          granted: boolean
          id: string
          permission_key: string
          role: Database["public"]["Enums"]["app_role"]
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          granted?: boolean
          id?: string
          permission_key: string
          role: Database["public"]["Enums"]["app_role"]
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          granted?: boolean
          id?: string
          permission_key?: string
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_v2_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "role_permissions_v2_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company_usage_current_month"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "role_permissions_v2_permission_key_fkey"
            columns: ["permission_key"]
            isOneToOne: false
            referencedRelation: "permissions"
            referencedColumns: ["key"]
          },
        ]
      }
      scheduler_heartbeats: {
        Row: {
          created_at: string
          duration_ms: number
          failed: number
          id: string
          next_expected_at: string | null
          notes: Json | null
          processed: number
          resumed: number
          source: string
        }
        Insert: {
          created_at?: string
          duration_ms?: number
          failed?: number
          id?: string
          next_expected_at?: string | null
          notes?: Json | null
          processed?: number
          resumed?: number
          source?: string
        }
        Update: {
          created_at?: string
          duration_ms?: number
          failed?: number
          id?: string
          next_expected_at?: string | null
          notes?: Json | null
          processed?: number
          resumed?: number
          source?: string
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          cancel_at_period_end: boolean
          company_id: string
          created_at: string
          current_period_end: string | null
          id: string
          plan_key: string
          status: string
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          updated_at: string
        }
        Insert: {
          cancel_at_period_end?: boolean
          company_id: string
          created_at?: string
          current_period_end?: string | null
          id?: string
          plan_key?: string
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
        }
        Update: {
          cancel_at_period_end?: boolean
          company_id?: string
          created_at?: string
          current_period_end?: string | null
          id?: string
          plan_key?: string
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "company_usage_current_month"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "subscriptions_plan_key_fkey"
            columns: ["plan_key"]
            isOneToOne: false
            referencedRelation: "plan_limits"
            referencedColumns: ["plan_key"]
          },
        ]
      }
      tags: {
        Row: {
          color: string
          company_id: string
          created_at: string
          id: string
          name: string
        }
        Insert: {
          color?: string
          company_id: string
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          color?: string
          company_id?: string
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "tags_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tags_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company_usage_current_month"
            referencedColumns: ["company_id"]
          },
        ]
      }
      team_audit_log: {
        Row: {
          action: string
          actor_id: string | null
          company_id: string
          correlation_id: string | null
          created_at: string
          diff: Json | null
          entity: string | null
          entity_id: string | null
          error_code: string | null
          id: string
          ip_address: string | null
          request_id: string | null
          session_id: string | null
          user_agent: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          company_id: string
          correlation_id?: string | null
          created_at?: string
          diff?: Json | null
          entity?: string | null
          entity_id?: string | null
          error_code?: string | null
          id?: string
          ip_address?: string | null
          request_id?: string | null
          session_id?: string | null
          user_agent?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          company_id?: string
          correlation_id?: string | null
          created_at?: string
          diff?: Json | null
          entity?: string | null
          entity_id?: string | null
          error_code?: string | null
          id?: string
          ip_address?: string | null
          request_id?: string | null
          session_id?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "team_audit_log_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_audit_log_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company_usage_current_month"
            referencedColumns: ["company_id"]
          },
        ]
      }
      team_entity_history: {
        Row: {
          action: string
          actor_id: string | null
          after: Json | null
          before: Json | null
          change_reason: string | null
          company_id: string
          correlation_id: string | null
          created_at: string
          entity: string
          entity_id: string
          id: string
          metadata: Json | null
          revision_hash: string | null
          version: number | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          after?: Json | null
          before?: Json | null
          change_reason?: string | null
          company_id: string
          correlation_id?: string | null
          created_at?: string
          entity: string
          entity_id: string
          id?: string
          metadata?: Json | null
          revision_hash?: string | null
          version?: number | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          after?: Json | null
          before?: Json | null
          change_reason?: string | null
          company_id?: string
          correlation_id?: string | null
          created_at?: string
          entity?: string
          entity_id?: string
          id?: string
          metadata?: Json | null
          revision_hash?: string | null
          version?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "team_entity_history_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_entity_history_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company_usage_current_month"
            referencedColumns: ["company_id"]
          },
        ]
      }
      team_member_profiles: {
        Row: {
          ai_agent_id: string | null
          bio: string | null
          company_id: string
          created_at: string
          deactivated_at: string | null
          department_id: string | null
          hire_date: string | null
          job_title: string | null
          job_title_id: string | null
          phone: string | null
          status: string
          supervisor_id: string | null
          tags: string[] | null
          timezone: string | null
          updated_at: string
          user_id: string
          whatsapp: string | null
        }
        Insert: {
          ai_agent_id?: string | null
          bio?: string | null
          company_id: string
          created_at?: string
          deactivated_at?: string | null
          department_id?: string | null
          hire_date?: string | null
          job_title?: string | null
          job_title_id?: string | null
          phone?: string | null
          status?: string
          supervisor_id?: string | null
          tags?: string[] | null
          timezone?: string | null
          updated_at?: string
          user_id: string
          whatsapp?: string | null
        }
        Update: {
          ai_agent_id?: string | null
          bio?: string | null
          company_id?: string
          created_at?: string
          deactivated_at?: string | null
          department_id?: string | null
          hire_date?: string | null
          job_title?: string | null
          job_title_id?: string | null
          phone?: string | null
          status?: string
          supervisor_id?: string | null
          tags?: string[] | null
          timezone?: string | null
          updated_at?: string
          user_id?: string
          whatsapp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "team_member_profiles_ai_agent_id_fkey"
            columns: ["ai_agent_id"]
            isOneToOne: false
            referencedRelation: "ai_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_member_profiles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_member_profiles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company_usage_current_month"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "team_member_profiles_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_member_profiles_job_title_id_fkey"
            columns: ["job_title_id"]
            isOneToOne: false
            referencedRelation: "job_titles"
            referencedColumns: ["id"]
          },
        ]
      }
      team_presence: {
        Row: {
          company_id: string
          current_activity: string | null
          last_seen: string
          status: string
          user_id: string
        }
        Insert: {
          company_id: string
          current_activity?: string | null
          last_seen?: string
          status?: string
          user_id: string
        }
        Update: {
          company_id?: string
          current_activity?: string | null
          last_seen?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_presence_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_presence_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company_usage_current_month"
            referencedColumns: ["company_id"]
          },
        ]
      }
      team_queue_members: {
        Row: {
          created_at: string
          queue_id: string
          user_id: string
          weight: number | null
        }
        Insert: {
          created_at?: string
          queue_id: string
          user_id: string
          weight?: number | null
        }
        Update: {
          created_at?: string
          queue_id?: string
          user_id?: string
          weight?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "team_queue_members_queue_id_fkey"
            columns: ["queue_id"]
            isOneToOne: false
            referencedRelation: "team_queues"
            referencedColumns: ["id"]
          },
        ]
      }
      team_queues: {
        Row: {
          archived_at: string | null
          business_hours: Json | null
          capacity: number
          color: string | null
          company_id: string
          created_at: string
          description: string | null
          id: string
          max_concurrent: number
          name: string
          priority: number
          strategy: string
          tags: string[] | null
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          business_hours?: Json | null
          capacity?: number
          color?: string | null
          company_id: string
          created_at?: string
          description?: string | null
          id?: string
          max_concurrent?: number
          name: string
          priority?: number
          strategy?: string
          tags?: string[] | null
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          business_hours?: Json | null
          capacity?: number
          color?: string | null
          company_id?: string
          created_at?: string
          description?: string | null
          id?: string
          max_concurrent?: number
          name?: string
          priority?: number
          strategy?: string
          tags?: string[] | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_queues_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_queues_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company_usage_current_month"
            referencedColumns: ["company_id"]
          },
        ]
      }
      team_role_permissions: {
        Row: {
          action: string
          allowed: boolean
          company_id: string
          id: string
          module: string
          role: string
          updated_at: string
        }
        Insert: {
          action: string
          allowed?: boolean
          company_id: string
          id?: string
          module: string
          role: string
          updated_at?: string
        }
        Update: {
          action?: string
          allowed?: boolean
          company_id?: string
          id?: string
          module?: string
          role?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_role_permissions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_role_permissions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company_usage_current_month"
            referencedColumns: ["company_id"]
          },
        ]
      }
      team_schedules: {
        Row: {
          company_id: string
          created_at: string
          end_time: string
          id: string
          start_time: string
          user_id: string
          weekday: number
        }
        Insert: {
          company_id: string
          created_at?: string
          end_time: string
          id?: string
          start_time: string
          user_id: string
          weekday: number
        }
        Update: {
          company_id?: string
          created_at?: string
          end_time?: string
          id?: string
          start_time?: string
          user_id?: string
          weekday?: number
        }
        Relationships: [
          {
            foreignKeyName: "team_schedules_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_schedules_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company_usage_current_month"
            referencedColumns: ["company_id"]
          },
        ]
      }
      user_roles: {
        Row: {
          company_id: string
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_roles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company_usage_current_month"
            referencedColumns: ["company_id"]
          },
        ]
      }
    }
    Views: {
      company_usage_current_month: {
        Row: {
          agent_count: number | null
          channel_count: number | null
          company_id: string | null
          contact_count: number | null
          messages_this_month: number | null
        }
        Insert: {
          agent_count?: never
          channel_count?: never
          company_id?: string | null
          contact_count?: never
          messages_this_month?: never
        }
        Update: {
          agent_count?: never
          channel_count?: never
          company_id?: string | null
          contact_count?: never
          messages_this_month?: never
        }
        Relationships: []
      }
    }
    Functions: {
      accept_invite_token: { Args: { _token: string }; Returns: Json }
      cascade_run_claim: {
        Args: { _ttl_seconds?: number }
        Returns: {
          id: string
          lock_token: string
        }[]
      }
      cascade_run_release: {
        Args: { _lock_token: string; _run_id: string }
        Returns: boolean
      }
      cascade_stop_on_reply: {
        Args: {
          _company_id: string
          _contact_id: string
          _reply_channel_id: string
          _reply_message_id: string
        }
        Returns: number
      }
      current_company_id: { Args: never; Returns: string }
      exec_read_sql: { Args: { p_sql: string }; Returns: Json }
      flow_run_acquire_lock: {
        Args: { _run_id: string; _ttl_seconds?: number }
        Returns: Json
      }
      flow_run_release_lock: {
        Args: { _lock_token: string; _run_id: string }
        Returns: boolean
      }
      has_permission: {
        Args: { _permission_key: string; _user_id: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_company_member: { Args: { _company_id: string }; Returns: boolean }
      my_effective_permissions: {
        Args: never
        Returns: {
          granted: boolean
          permission_key: string
          source: string
        }[]
      }
      next_flow_version_number: { Args: { _flow_id: string }; Returns: number }
      preview_invite_by_token: {
        Args: { _token: string }
        Returns: {
          company_name: string
          email: string
          expired: boolean
          expires_at: string
          found: boolean
          role: Database["public"]["Enums"]["app_role"]
          status: string
        }[]
      }
    }
    Enums: {
      app_role: "admin" | "agent"
      assigned_type: "unassigned" | "agent_user" | "ai_agent"
      broadcast_status:
        | "draft"
        | "scheduled"
        | "sending"
        | "completed"
        | "failed"
        | "paused"
        | "cancelled"
      channel_event_type:
        | "connected"
        | "disconnected"
        | "qr_generated"
        | "error"
        | "message_sent"
        | "message_received"
        | "rate_limited"
        | "paused"
        | "resumed"
        | "test_sent"
        | "email_sent"
        | "cascade_started"
        | "cascade_step_sent"
        | "cascade_completed"
        | "cascade_cancelled"
        | "conversation_transferred"
        | "flow_run_started"
        | "flow_run_completed"
        | "conversation_assigned"
        | "webhook_received"
        | "send_failed"
        | "status_delivered"
        | "status_read"
      channel_provider:
        | "whatsapp_cloud"
        | "whatsapp_business"
        | "baileys"
        | "evolution"
        | "stevo"
      channel_status: "disconnected" | "connecting" | "connected"
      conversation_status: "open" | "pending" | "resolved"
      custom_field_type: "text" | "number" | "date" | "email" | "select"
      enrichment_action:
        | "auto_applied"
        | "suggested"
        | "ignored"
        | "applied_from_suggestion"
        | "rejected"
      enrichment_run_status:
        | "pending"
        | "processing"
        | "completed"
        | "failed"
        | "skipped"
      enrichment_source_type:
        | "text_message"
        | "audio_transcript"
        | "ocr_document"
        | "ocr_image"
      enrichment_suggestion_status:
        | "pending"
        | "approved"
        | "rejected"
        | "superseded"
        | "expired"
      flow_status: "draft" | "active" | "archived"
      flow_trigger_type:
        | "keyword"
        | "new_contact"
        | "button_click"
        | "webhook"
        | "manual"
        | "default"
      message_deletion_scope: "inbox_only" | "for_me" | "for_everyone"
      message_direction: "inbound" | "outbound"
      message_type: "text" | "image" | "audio" | "file" | "video" | "system"
      routing_strategy:
        | "round_robin"
        | "least_busy"
        | "best_conversion"
        | "manual"
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
      app_role: ["admin", "agent"],
      assigned_type: ["unassigned", "agent_user", "ai_agent"],
      broadcast_status: [
        "draft",
        "scheduled",
        "sending",
        "completed",
        "failed",
        "paused",
        "cancelled",
      ],
      channel_event_type: [
        "connected",
        "disconnected",
        "qr_generated",
        "error",
        "message_sent",
        "message_received",
        "rate_limited",
        "paused",
        "resumed",
        "test_sent",
        "email_sent",
        "cascade_started",
        "cascade_step_sent",
        "cascade_completed",
        "cascade_cancelled",
        "conversation_transferred",
        "flow_run_started",
        "flow_run_completed",
        "conversation_assigned",
        "webhook_received",
        "send_failed",
        "status_delivered",
        "status_read",
      ],
      channel_provider: [
        "whatsapp_cloud",
        "whatsapp_business",
        "baileys",
        "evolution",
        "stevo",
      ],
      channel_status: ["disconnected", "connecting", "connected"],
      conversation_status: ["open", "pending", "resolved"],
      custom_field_type: ["text", "number", "date", "email", "select"],
      enrichment_action: [
        "auto_applied",
        "suggested",
        "ignored",
        "applied_from_suggestion",
        "rejected",
      ],
      enrichment_run_status: [
        "pending",
        "processing",
        "completed",
        "failed",
        "skipped",
      ],
      enrichment_source_type: [
        "text_message",
        "audio_transcript",
        "ocr_document",
        "ocr_image",
      ],
      enrichment_suggestion_status: [
        "pending",
        "approved",
        "rejected",
        "superseded",
        "expired",
      ],
      flow_status: ["draft", "active", "archived"],
      flow_trigger_type: [
        "keyword",
        "new_contact",
        "button_click",
        "webhook",
        "manual",
        "default",
      ],
      message_deletion_scope: ["inbox_only", "for_me", "for_everyone"],
      message_direction: ["inbound", "outbound"],
      message_type: ["text", "image", "audio", "file", "video", "system"],
      routing_strategy: [
        "round_robin",
        "least_busy",
        "best_conversion",
        "manual",
      ],
    },
  },
} as const
