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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      ai_cache: {
        Row: {
          created_at: string
          expires_at: string
          function_name: string
          hit_count: number
          id: string
          model: string | null
          prompt_hash: string
          response_text: string
          tokens_used: number | null
        }
        Insert: {
          created_at?: string
          expires_at: string
          function_name: string
          hit_count?: number
          id?: string
          model?: string | null
          prompt_hash: string
          response_text: string
          tokens_used?: number | null
        }
        Update: {
          created_at?: string
          expires_at?: string
          function_name?: string
          hit_count?: number
          id?: string
          model?: string | null
          prompt_hash?: string
          response_text?: string
          tokens_used?: number | null
        }
        Relationships: []
      }
      ai_conversations: {
        Row: {
          analysis_type: string | null
          created_at: string
          id: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          analysis_type?: string | null
          created_at?: string
          id?: string
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          analysis_type?: string | null
          created_at?: string
          id?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      ai_messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          id: string
          role: string
          user_id: string
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string
          id?: string
          role: string
          user_id: string
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "ai_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_trader_decisions: {
        Row: {
          action: string
          conversation_id: string | null
          created_at: string
          entry_price: number | null
          id: string
          outcome_pct: number | null
          rationale: string | null
          reviewed_at: string | null
          status: string
          stop_price: number | null
          target_price: number | null
          ticker: string
          updated_at: string
          user_id: string
        }
        Insert: {
          action: string
          conversation_id?: string | null
          created_at?: string
          entry_price?: number | null
          id?: string
          outcome_pct?: number | null
          rationale?: string | null
          reviewed_at?: string | null
          status?: string
          stop_price?: number | null
          target_price?: number | null
          ticker: string
          updated_at?: string
          user_id: string
        }
        Update: {
          action?: string
          conversation_id?: string | null
          created_at?: string
          entry_price?: number | null
          id?: string
          outcome_pct?: number | null
          rationale?: string | null
          reviewed_at?: string | null
          status?: string
          stop_price?: number | null
          target_price?: number | null
          ticker?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_trader_decisions_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "ai_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      alert_rules: {
        Row: {
          channel: string
          cooldown_minutes: number
          created_at: string
          enabled: boolean
          id: string
          kind: string
          meta: Json
          threshold_minutes: number | null
          threshold_pct: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          channel?: string
          cooldown_minutes?: number
          created_at?: string
          enabled?: boolean
          id?: string
          kind: string
          meta?: Json
          threshold_minutes?: number | null
          threshold_pct?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          channel?: string
          cooldown_minutes?: number
          created_at?: string
          enabled?: boolean
          id?: string
          kind?: string
          meta?: Json
          threshold_minutes?: number | null
          threshold_pct?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      alerts: {
        Row: {
          alert_type: Database["public"]["Enums"]["alert_type"]
          condition_logic: string
          created_at: string
          current_value: number | null
          id: string
          name: string
          notes: string | null
          notify_email: boolean
          notify_telegram: boolean
          secondary_type: string | null
          secondary_value: number | null
          status: Database["public"]["Enums"]["alert_status"]
          target_value: number
          ticker: string
          triggered_at: string | null
          updated_at: string
          user_id: string
          valid_until: string | null
        }
        Insert: {
          alert_type: Database["public"]["Enums"]["alert_type"]
          condition_logic?: string
          created_at?: string
          current_value?: number | null
          id?: string
          name: string
          notes?: string | null
          notify_email?: boolean
          notify_telegram?: boolean
          secondary_type?: string | null
          secondary_value?: number | null
          status?: Database["public"]["Enums"]["alert_status"]
          target_value: number
          ticker: string
          triggered_at?: string | null
          updated_at?: string
          user_id: string
          valid_until?: string | null
        }
        Update: {
          alert_type?: Database["public"]["Enums"]["alert_type"]
          condition_logic?: string
          created_at?: string
          current_value?: number | null
          id?: string
          name?: string
          notes?: string | null
          notify_email?: boolean
          notify_telegram?: boolean
          secondary_type?: string | null
          secondary_value?: number | null
          status?: Database["public"]["Enums"]["alert_status"]
          target_value?: number
          ticker?: string
          triggered_at?: string | null
          updated_at?: string
          user_id?: string
          valid_until?: string | null
        }
        Relationships: []
      }
      api_rate_limits: {
        Row: {
          created_at: string
          id: number
          request_count: number
          resource: string
          subject_id: string
          updated_at: string
          window_seconds: number
          window_start: string
        }
        Insert: {
          created_at?: string
          id?: number
          request_count?: number
          resource: string
          subject_id: string
          updated_at?: string
          window_seconds: number
          window_start: string
        }
        Update: {
          created_at?: string
          id?: number
          request_count?: number
          resource?: string
          subject_id?: string
          updated_at?: string
          window_seconds?: number
          window_start?: string
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          action: string
          created_at: string
          details: Json | null
          entity_id: string | null
          entity_type: string
          id: string
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_type: string
          id?: string
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_type?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      backups: {
        Row: {
          backup_type: string
          created_at: string
          file_path: string
          id: string
          size_bytes: number | null
          status: string
          user_id: string
        }
        Insert: {
          backup_type?: string
          created_at?: string
          file_path: string
          id?: string
          size_bytes?: number | null
          status?: string
          user_id: string
        }
        Update: {
          backup_type?: string
          created_at?: string
          file_path?: string
          id?: string
          size_bytes?: number | null
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      broker_logo_overrides: {
        Row: {
          broker: string
          created_at: string
          format: string | null
          height: number | null
          id: string
          size_bytes: number | null
          updated_at: string
          url: string
          user_id: string
          width: number | null
        }
        Insert: {
          broker: string
          created_at?: string
          format?: string | null
          height?: number | null
          id?: string
          size_bytes?: number | null
          updated_at?: string
          url: string
          user_id: string
          width?: number | null
        }
        Update: {
          broker?: string
          created_at?: string
          format?: string | null
          height?: number | null
          id?: string
          size_bytes?: number | null
          updated_at?: string
          url?: string
          user_id?: string
          width?: number | null
        }
        Relationships: []
      }
      cash_balance: {
        Row: {
          balance: number
          broker: string | null
          created_at: string
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          balance?: number
          broker?: string | null
          created_at?: string
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          balance?: number
          broker?: string | null
          created_at?: string
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      cash_movements: {
        Row: {
          amount: number
          broker: string | null
          created_at: string
          description: string | null
          id: string
          type: string
          user_id: string
        }
        Insert: {
          amount: number
          broker?: string | null
          created_at?: string
          description?: string | null
          id?: string
          type: string
          user_id: string
        }
        Update: {
          amount?: number
          broker?: string | null
          created_at?: string
          description?: string | null
          id?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      function_metrics: {
        Row: {
          cache_hit: boolean
          created_at: string
          duration_ms: number
          error_message: string | null
          function_name: string
          id: number
          meta: Json | null
          status_code: number
          tokens_in: number | null
          tokens_out: number | null
          user_id: string | null
        }
        Insert: {
          cache_hit?: boolean
          created_at?: string
          duration_ms: number
          error_message?: string | null
          function_name: string
          id?: number
          meta?: Json | null
          status_code: number
          tokens_in?: number | null
          tokens_out?: number | null
          user_id?: string | null
        }
        Update: {
          cache_hit?: boolean
          created_at?: string
          duration_ms?: number
          error_message?: string | null
          function_name?: string
          id?: number
          meta?: Json | null
          status_code?: number
          tokens_in?: number | null
          tokens_out?: number | null
          user_id?: string | null
        }
        Relationships: []
      }
      holdings: {
        Row: {
          avg_price: number
          broker: string | null
          created_at: string
          id: string
          indexer_type: string | null
          maturity_date: string | null
          name: string
          property_purpose: string | null
          purchase_currency: string
          quantity: number
          rental_value: number | null
          sector: string | null
          ticker: string
          type: string
          updated_at: string
          user_id: string
          yield_rate: string | null
        }
        Insert: {
          avg_price: number
          broker?: string | null
          created_at?: string
          id?: string
          indexer_type?: string | null
          maturity_date?: string | null
          name: string
          property_purpose?: string | null
          purchase_currency?: string
          quantity: number
          rental_value?: number | null
          sector?: string | null
          ticker: string
          type: string
          updated_at?: string
          user_id: string
          yield_rate?: string | null
        }
        Update: {
          avg_price?: number
          broker?: string | null
          created_at?: string
          id?: string
          indexer_type?: string | null
          maturity_date?: string | null
          name?: string
          property_purpose?: string | null
          purchase_currency?: string
          quantity?: number
          rental_value?: number | null
          sector?: string | null
          ticker?: string
          type?: string
          updated_at?: string
          user_id?: string
          yield_rate?: string | null
        }
        Relationships: []
      }
      notification_log: {
        Row: {
          channel: string
          error: string | null
          id: string
          kind: string
          payload: Json
          rule_id: string | null
          sent_at: string
          status: string
          user_id: string
        }
        Insert: {
          channel: string
          error?: string | null
          id?: string
          kind: string
          payload?: Json
          rule_id?: string | null
          sent_at?: string
          status: string
          user_id: string
        }
        Update: {
          channel?: string
          error?: string | null
          id?: string
          kind?: string
          payload?: Json
          rule_id?: string | null
          sent_at?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_log_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "alert_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      portfolio_daily_metrics: {
        Row: {
          by_broker: Json
          by_sector: Json
          by_type: Json
          distinct_tickers: number
          metric_date: string
          top_holdings: Json
          total_invested: number
          total_positions: number
          updated_at: string
          user_id: string
        }
        Insert: {
          by_broker?: Json
          by_sector?: Json
          by_type?: Json
          distinct_tickers?: number
          metric_date?: string
          top_holdings?: Json
          total_invested?: number
          total_positions?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          by_broker?: Json
          by_sector?: Json
          by_type?: Json
          distinct_tickers?: number
          metric_date?: string
          top_holdings?: Json
          total_invested?: number
          total_positions?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      portfolio_snapshots: {
        Row: {
          assets_count: number
          created_at: string
          id: string
          snapshot_date: string
          total_cost: number
          total_value: number
          user_id: string
        }
        Insert: {
          assets_count?: number
          created_at?: string
          id?: string
          snapshot_date?: string
          total_cost?: number
          total_value?: number
          user_id: string
        }
        Update: {
          assets_count?: number
          created_at?: string
          id?: string
          snapshot_date?: string
          total_cost?: number
          total_value?: number
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
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      security_events: {
        Row: {
          claims: Json | null
          created_at: string
          function_name: string
          id: string
          ip: string | null
          key_id: string | null
          meta: Json | null
          outcome: string
          reason: string
          status_code: number | null
          subject_id: string | null
          user_agent: string | null
        }
        Insert: {
          claims?: Json | null
          created_at?: string
          function_name: string
          id?: string
          ip?: string | null
          key_id?: string | null
          meta?: Json | null
          outcome?: string
          reason: string
          status_code?: number | null
          subject_id?: string | null
          user_agent?: string | null
        }
        Update: {
          claims?: Json | null
          created_at?: string
          function_name?: string
          id?: string
          ip?: string | null
          key_id?: string | null
          meta?: Json | null
          outcome?: string
          reason?: string
          status_code?: number | null
          subject_id?: string | null
          user_agent?: string | null
        }
        Relationships: []
      }
      serial_keys: {
        Row: {
          activated_at: string | null
          created_at: string
          created_by: string | null
          expires_at: string | null
          id: string
          key: string
          plan_type: string
          status: string
          updated_at: string
          used_by: string | null
        }
        Insert: {
          activated_at?: string | null
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          key: string
          plan_type?: string
          status?: string
          updated_at?: string
          used_by?: string | null
        }
        Update: {
          activated_at?: string | null
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          key?: string
          plan_type?: string
          status?: string
          updated_at?: string
          used_by?: string | null
        }
        Relationships: []
      }
      snapshot_refresh_failures: {
        Row: {
          attempts: number
          created_at: string
          id: string
          last_error: string | null
          next_retry_at: string
          reason: string
          resolved_at: string | null
          snapshot_date: string
          source: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          id?: string
          last_error?: string | null
          next_retry_at?: string
          reason: string
          resolved_at?: string | null
          snapshot_date?: string
          source?: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          attempts?: number
          created_at?: string
          id?: string
          last_error?: string | null
          next_retry_at?: string
          reason?: string
          resolved_at?: string | null
          snapshot_date?: string
          source?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      telegram_settings: {
        Row: {
          bot_token: string | null
          chat_id: string | null
          created_at: string
          email_address: string | null
          enabled: boolean
          event_prefs: Json
          id: string
          link_code: string | null
          notify_email: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          bot_token?: string | null
          chat_id?: string | null
          created_at?: string
          email_address?: string | null
          enabled?: boolean
          event_prefs?: Json
          id?: string
          link_code?: string | null
          notify_email?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          bot_token?: string | null
          chat_id?: string | null
          created_at?: string
          email_address?: string | null
          enabled?: boolean
          event_prefs?: Json
          id?: string
          link_code?: string | null
          notify_email?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      transactions: {
        Row: {
          created_at: string
          date: string
          fees: number
          id: string
          is_daytrade: boolean
          name: string
          notes: string | null
          operation: string
          price: number
          quantity: number
          ticker: string
          total: number
          type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          date: string
          fees?: number
          id?: string
          is_daytrade?: boolean
          name: string
          notes?: string | null
          operation: string
          price: number
          quantity: number
          ticker: string
          total: number
          type: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          date?: string
          fees?: number
          id?: string
          is_daytrade?: boolean
          name?: string
          notes?: string | null
          operation?: string
          price?: number
          quantity?: number
          ticker?: string
          total?: number
          type?: string
          updated_at?: string
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
          role?: Database["public"]["Enums"]["app_role"]
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
      function_metrics_24h: {
        Row: {
          avg_ms: number | null
          cache_hits: number | null
          calls: number | null
          errors: number | null
          function_name: string | null
          p95_ms: number | null
          tokens_in: number | null
          tokens_out: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      cleanup_old_snapshots: { Args: never; Returns: number }
      cleanup_security_data: { Args: never; Returns: number }
      consume_rate_limit: {
        Args: {
          _max_requests: number
          _resource: string
          _subject_id: string
          _window_seconds?: number
        }
        Returns: {
          allowed: boolean
          current_count: number
          retry_after_seconds: number
        }[]
      }
      enqueue_snapshot_failure: {
        Args: {
          _error?: string
          _reason: string
          _source?: string
          _user_id: string
        }
        Returns: undefined
      }
      get_dashboard_bootstrap: { Args: never; Returns: Json }
      get_user_email: { Args: { _user_id: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      import_transactions_atomic: { Args: { _rows: Json }; Returns: Json }
      list_pending_snapshot_failures: {
        Args: { _limit?: number }
        Returns: {
          attempts: number
          created_at: string
          id: string
          last_error: string | null
          next_retry_at: string
          reason: string
          resolved_at: string | null
          snapshot_date: string
          source: string
          status: string
          updated_at: string
          user_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "snapshot_refresh_failures"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      mark_snapshot_failure_resolved: {
        Args: { _user_id: string }
        Returns: undefined
      }
      refresh_all_daily_snapshots: { Args: never; Returns: number }
      refresh_my_portfolio_metrics: { Args: never; Returns: undefined }
      refresh_portfolio_metrics: {
        Args: { _user_id: string }
        Returns: undefined
      }
      upsert_daily_snapshot: { Args: { _user_id: string }; Returns: undefined }
    }
    Enums: {
      alert_status: "active" | "triggered" | "paused"
      alert_type:
        | "price_above"
        | "price_below"
        | "variation_up"
        | "variation_down"
        | "stop_loss"
        | "take_profit"
      app_role: "admin" | "user"
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
      alert_status: ["active", "triggered", "paused"],
      alert_type: [
        "price_above",
        "price_below",
        "variation_up",
        "variation_down",
        "stop_loss",
        "take_profit",
      ],
      app_role: ["admin", "user"],
    },
  },
} as const
