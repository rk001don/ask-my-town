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
      app_config: {
        Row: {
          description: string | null
          is_public: boolean
          key: string
          scope: string
          scope_id: string
          updated_at: string
          value: Json
        }
        Insert: {
          description?: string | null
          is_public?: boolean
          key: string
          scope?: string
          scope_id?: string
          updated_at?: string
          value: Json
        }
        Update: {
          description?: string | null
          is_public?: boolean
          key?: string
          scope?: string
          scope_id?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      audit_log: {
        Row: {
          action: string
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          metadata: Json | null
          staff_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          entity_id: string
          entity_type: string
          id?: string
          metadata?: Json | null
          staff_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: string
          metadata?: Json | null
          staff_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          created_at: string
          icon_key: string | null
          id: string
          image_url: string | null
          name: string
          parent_id: string | null
          slug: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          icon_key?: string | null
          id?: string
          image_url?: string | null
          name: string
          parent_id?: string | null
          slug: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          icon_key?: string | null
          id?: string
          image_url?: string | null
          name?: string
          parent_id?: string | null
          slug?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          address: string
          created_at: string
          id: string
          landmark: string | null
          name: string
          phone: string
          user_id: string | null
        }
        Insert: {
          address: string
          created_at?: string
          id?: string
          landmark?: string | null
          name: string
          phone: string
          user_id?: string | null
        }
        Update: {
          address?: string
          created_at?: string
          id?: string
          landmark?: string | null
          name?: string
          phone?: string
          user_id?: string | null
        }
        Relationships: []
      }
      delivery_batches: {
        Row: {
          created_at: string
          id: string
          location_id: string
          rider_id: string | null
          scheduled_at: string
          scheduled_date: string
          status: string
          window_label: string
        }
        Insert: {
          created_at?: string
          id?: string
          location_id: string
          rider_id?: string | null
          scheduled_at: string
          scheduled_date: string
          status?: string
          window_label: string
        }
        Update: {
          created_at?: string
          id?: string
          location_id?: string
          rider_id?: string | null
          scheduled_at?: string
          scheduled_date?: string
          status?: string
          window_label?: string
        }
        Relationships: [
          {
            foreignKeyName: "delivery_batches_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_batches_rider_id_fkey"
            columns: ["rider_id"]
            isOneToOne: false
            referencedRelation: "riders"
            referencedColumns: ["id"]
          },
        ]
      }
      employees: {
        Row: {
          active: boolean
          created_at: string
          id: string
          name: string
          pin_hash: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          name: string
          pin_hash: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          name?: string
          pin_hash?: string
        }
        Relationships: []
      }
      group_orders: {
        Row: {
          created_at: string
          id: string
          initiator_customer_id: string
          location_id: string
          status: string
        }
        Insert: {
          created_at?: string
          id?: string
          initiator_customer_id: string
          location_id: string
          status?: string
        }
        Update: {
          created_at?: string
          id?: string
          initiator_customer_id?: string
          location_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_orders_initiator_customer_id_fkey"
            columns: ["initiator_customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_orders_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      locations: {
        Row: {
          active: boolean
          config: Json
          created_at: string
          default_language: string
          id: string
          name: string
          slug: string
          timezone: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          config?: Json
          created_at?: string
          default_language?: string
          id?: string
          name: string
          slug: string
          timezone?: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          config?: Json
          created_at?: string
          default_language?: string
          id?: string
          name?: string
          slug?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      order_attachments: {
        Row: {
          created_at: string
          file_path: string
          file_type: string
          id: string
          order_item_id: string
        }
        Insert: {
          created_at?: string
          file_path: string
          file_type: string
          id?: string
          order_item_id: string
        }
        Update: {
          created_at?: string
          file_path?: string
          file_type?: string
          id?: string
          order_item_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_attachments_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "order_items"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          category: string | null
          created_at: string
          id: string
          is_freeform: boolean
          item_name: string
          notes: string | null
          order_id: string
          product_id: string | null
          quantity: number
          subcategory: string | null
          unit_price: number | null
        }
        Insert: {
          category?: string | null
          created_at?: string
          id?: string
          is_freeform?: boolean
          item_name: string
          notes?: string | null
          order_id: string
          product_id?: string | null
          quantity?: number
          subcategory?: string | null
          unit_price?: number | null
        }
        Update: {
          category?: string | null
          created_at?: string
          id?: string
          is_freeform?: boolean
          item_name?: string
          notes?: string | null
          order_id?: string
          product_id?: string | null
          quantity?: number
          subcategory?: string | null
          unit_price?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_campaigns: {
        Row: {
          body: string
          category: string | null
          created_at: string
          created_by: string | null
          deep_link: string | null
          id: string
          image_url: string | null
          scheduled_at: string | null
          sent_at: string | null
          status: string
          target: string
          target_filter: Json
          title: string
          type: string
          updated_at: string
        }
        Insert: {
          body: string
          category?: string | null
          created_at?: string
          created_by?: string | null
          deep_link?: string | null
          id?: string
          image_url?: string | null
          scheduled_at?: string | null
          sent_at?: string | null
          status?: string
          target?: string
          target_filter?: Json
          title: string
          type?: string
          updated_at?: string
        }
        Update: {
          body?: string
          category?: string | null
          created_at?: string
          created_by?: string | null
          deep_link?: string | null
          id?: string
          image_url?: string | null
          scheduled_at?: string | null
          sent_at?: string | null
          status?: string
          target?: string
          target_filter?: Json
          title?: string
          type?: string
          updated_at?: string
        }
        Relationships: []
      }
      notification_deliveries: {
        Row: {
          campaign_id: string
          created_at: string
          device_id: string
          error: string | null
          id: string
          status: string
        }
        Insert: {
          campaign_id: string
          created_at?: string
          device_id: string
          error?: string | null
          id?: string
          status?: string
        }
        Update: {
          campaign_id?: string
          created_at?: string
          device_id?: string
          error?: string | null
          id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_deliveries_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "notification_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_deliveries_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "push_devices"
            referencedColumns: ["id"]
          },
        ]
      }
      order_push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          order_id: string
          p256dh: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          order_id: string
          p256dh: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          order_id?: string
          p256dh?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_push_subscriptions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          assigned_employee_id: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          cancelled_by_role: string | null
          cancellation_reason: string | null
          completed_at: string | null
          confirmed_at: string | null
          created_at: string
          customer_id: string
          delivery_batch_id: string | null
          group_order_id: string | null
          id: string
          location_id: string | null
          notes: string | null
          payment_status: string
          refund_status: string
          requested_date: string
          requested_window: string | null
          service_fee_estimate: number | null
          service_fee_final: number | null
          status: Database["public"]["Enums"]["order_status"]
          subscription_id: string | null
          updated_at: string
          wallet_amount_used: number
        }
        Insert: {
          assigned_employee_id?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          cancelled_by_role?: string | null
          cancellation_reason?: string | null
          completed_at?: string | null
          confirmed_at?: string | null
          created_at?: string
          customer_id: string
          delivery_batch_id?: string | null
          group_order_id?: string | null
          id: string
          location_id?: string | null
          notes?: string | null
          payment_status?: string
          refund_status?: string
          requested_date?: string
          requested_window?: string | null
          service_fee_estimate?: number | null
          service_fee_final?: number | null
          status?: Database["public"]["Enums"]["order_status"]
          subscription_id?: string | null
          updated_at?: string
          wallet_amount_used?: number
        }
        Update: {
          assigned_employee_id?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          cancelled_by_role?: string | null
          cancellation_reason?: string | null
          completed_at?: string | null
          confirmed_at?: string | null
          created_at?: string
          customer_id?: string
          delivery_batch_id?: string | null
          group_order_id?: string | null
          id?: string
          location_id?: string | null
          notes?: string | null
          payment_status?: string
          refund_status?: string
          requested_date?: string
          requested_window?: string | null
          service_fee_estimate?: number | null
          service_fee_final?: number | null
          status?: Database["public"]["Enums"]["order_status"]
          subscription_id?: string | null
          updated_at?: string
          wallet_amount_used?: number
        }
        Relationships: [
          {
            foreignKeyName: "orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_delivery_batch_id_fkey"
            columns: ["delivery_batch_id"]
            isOneToOne: false
            referencedRelation: "delivery_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_group_order_id_fkey"
            columns: ["group_order_id"]
            isOneToOne: false
            referencedRelation: "group_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          category_id: string
          created_at: string
          currency: string
          description: string | null
          id: string
          image_url: string | null
          is_available: boolean
          is_service: boolean
          is_subscription_eligible: boolean
          is_veg: boolean | null
          location_id: string | null
          name: string
          payment_mode: string
          price: number | null
          schedulable: boolean
          show_price: boolean
          sort_order: number
          tags: string[]
          updated_at: string
        }
        Insert: {
          category_id: string
          created_at?: string
          currency?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_available?: boolean
          is_service?: boolean
          is_subscription_eligible?: boolean
          is_veg?: boolean | null
          location_id?: string | null
          name: string
          payment_mode?: string
          price?: number | null
          schedulable?: boolean
          show_price?: boolean
          sort_order?: number
          tags?: string[]
          updated_at?: string
        }
        Update: {
          category_id?: string
          created_at?: string
          currency?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_available?: boolean
          is_service?: boolean
          is_subscription_eligible?: boolean
          is_veg?: boolean | null
          location_id?: string | null
          name?: string
          payment_mode?: string
          price?: number | null
          schedulable?: boolean
          show_price?: boolean
          sort_order?: number
          tags?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      rate_limit_hits: {
        Row: {
          bucket: string
          hit_at: string
        }
        Insert: {
          bucket: string
          hit_at?: string
        }
        Update: {
          bucket?: string
          hit_at?: string
        }
        Relationships: []
      }
      push_devices: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          last_seen_at: string
          p256dh: string
          platform: string
          topics: string[]
          user_id: string | null
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          last_seen_at?: string
          p256dh: string
          platform?: string
          topics?: string[]
          user_id?: string | null
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          last_seen_at?: string
          p256dh?: string
          platform?: string
          topics?: string[]
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "push_devices_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      riders: {
        Row: {
          active: boolean
          created_at: string
          id: string
          id_proof_url: string | null
          location_id: string
          name: string
          phone: string
          photo_url: string | null
          verified: boolean
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          id_proof_url?: string | null
          location_id: string
          name: string
          phone: string
          photo_url?: string | null
          verified?: boolean
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          id_proof_url?: string | null
          location_id?: string
          name?: string
          phone?: string
          photo_url?: string | null
          verified?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "riders_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      search_analytics: {
        Row: {
          created_at: string
          id: string
          normalized_term: string
          result_count: number
          term: string
        }
        Insert: {
          created_at?: string
          id?: string
          normalized_term: string
          result_count?: number
          term: string
        }
        Update: {
          created_at?: string
          id?: string
          normalized_term?: string
          result_count?: number
          term?: string
        }
        Relationships: []
      }
      staff: {
        Row: {
          active: boolean
          created_at: string
          id: string
          location_id: string | null
          name: string
          role: string
          user_id: string | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          location_id?: string | null
          name: string
          role: string
          user_id?: string | null
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          location_id?: string | null
          name?: string
          role?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "staff_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
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
      mytown_check_rate_limit: {
        Args: { p_bucket: string; p_max_hits: number; p_window_seconds: number }
        Returns: boolean
      }
      mytown_new_order_id: { Args: never; Returns: string }
      mytown_verify_employee_pin: {
        Args: { p_pin: string }
        Returns: {
          id: string
          name: string
        }[]
      }
      mytown_warden_daily_counts: {
        Args: { p_location_id?: string }
        Returns: {
          completed_orders: number
          delivery_date: string
          total_orders: number
        }[]
      }
    }
    Enums: {
      app_role: "admin" | "ops" | "warden_viewer" | "customer"
      order_status:
        | "received"
        | "confirmed"
        | "arranging"
        | "on_the_way"
        | "completed"
        | "cancelled"
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
      app_role: ["admin", "ops", "warden_viewer", "customer"],
      order_status: [
        "received",
        "confirmed",
        "arranging",
        "on_the_way",
        "completed",
        "cancelled",
      ],
    },
  },
} as const
