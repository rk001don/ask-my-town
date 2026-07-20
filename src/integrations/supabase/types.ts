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
      categories: {
        Row: {
          created_at: string
          icon_key: string | null
          id: string
          name: string
          parent_id: string | null
          slug: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          icon_key?: string | null
          id?: string
          name: string
          parent_id?: string | null
          slug: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          icon_key?: string | null
          id?: string
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
        }
        Insert: {
          address: string
          created_at?: string
          id?: string
          landmark?: string | null
          name: string
          phone: string
        }
        Update: {
          address?: string
          created_at?: string
          id?: string
          landmark?: string | null
          name?: string
          phone?: string
        }
        Relationships: []
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
      order_items: {
        Row: {
          category: string | null
          created_at: string
          id: string
          is_freeform: boolean
          item_name: string
          notes: string | null
          order_id: string
          quantity: number
          subcategory: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string
          id?: string
          is_freeform?: boolean
          item_name: string
          notes?: string | null
          order_id: string
          quantity?: number
          subcategory?: string | null
        }
        Update: {
          category?: string | null
          created_at?: string
          id?: string
          is_freeform?: boolean
          item_name?: string
          notes?: string | null
          order_id?: string
          quantity?: number
          subcategory?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
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
          completed_at: string | null
          confirmed_at: string | null
          created_at: string
          customer_id: string
          id: string
          notes: string | null
          status: Database["public"]["Enums"]["order_status"]
          updated_at: string
        }
        Insert: {
          assigned_employee_id?: string | null
          completed_at?: string | null
          confirmed_at?: string | null
          created_at?: string
          customer_id: string
          id: string
          notes?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          updated_at?: string
        }
        Update: {
          assigned_employee_id?: string | null
          completed_at?: string | null
          confirmed_at?: string | null
          created_at?: string
          customer_id?: string
          id?: string
          notes?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      mytown_new_order_id: { Args: never; Returns: string }
    }
    Enums: {
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
