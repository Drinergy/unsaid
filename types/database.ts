/**
 * Database types generated from Supabase schema
 * Auto-generated types for type-safe database operations
 *
 * @author CKD
 * @created 2026-01-23
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      unsaids: {
        Row: {
          id: string;
          content: string;
          content_hash: string;
          city: string | null;
          country_code: string;
          location: string; // PostGIS geometry as GeoJSON string
          device_id: string;
          ip_address: string | null;
          is_shadow_banned: boolean;
          report_count: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          content: string;
          content_hash: string;
          city?: string | null;
          country_code: string;
          location: string; // GeoJSON format
          device_id: string;
          ip_address?: string | null;
          is_shadow_banned?: boolean;
          report_count?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          content?: string;
          content_hash?: string;
          city?: string | null;
          country_code?: string;
          location?: string;
          device_id?: string;
          ip_address?: string | null;
          is_shadow_banned?: boolean;
          report_count?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      replies: {
        Row: {
          id: string;
          unsaid_id: string;
          parent_reply_id: string | null;
          content: string;
          city: string | null;
          country_code: string | null;
          depth: number;
          content_hash: string;
          device_id: string;
          ip_address: string | null;
          is_shadow_banned: boolean;
          report_count: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          unsaid_id: string;
          parent_reply_id?: string | null;
          content: string;
          city?: string | null;
          country_code?: string | null;
          depth?: number;
          content_hash: string;
          device_id: string;
          ip_address?: string | null;
          is_shadow_banned?: boolean;
          report_count?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          unsaid_id?: string;
          parent_reply_id?: string | null;
          content?: string;
          city?: string | null;
          country_code?: string | null;
          depth?: number;
          content_hash?: string;
          device_id?: string;
          ip_address?: string | null;
          is_shadow_banned?: boolean;
          report_count?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      reports: {
        Row: {
          id: string;
          unsaid_id: string | null;
          reply_id: string | null;
          device_id: string;
          ip_address: string | null;
          reason: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          unsaid_id?: string | null;
          reply_id?: string | null;
          device_id: string;
          ip_address?: string | null;
          reason?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          unsaid_id?: string | null;
          reply_id?: string | null;
          device_id?: string;
          ip_address?: string | null;
          reason?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      reactions: {
        Row: {
          id: string;
          unsaid_id: string;
          device_id: string;
          ip_address: string | null;
          type: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          unsaid_id: string;
          device_id: string;
          ip_address?: string | null;
          type: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          unsaid_id?: string;
          device_id?: string;
          ip_address?: string | null;
          type?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      get_unsaids_in_bbox: {
        Args: {
          min_lng: number;
          min_lat: number;
          max_lng: number;
          max_lat: number;
          result_limit?: number;
        };
        Returns: {
          id: string;
          content: string;
          city: string | null;
          country_code: string;
          location: Json;
          created_at: string;
        }[];
      };
      get_unsaid_clusters: {
        Args: {
          min_lng: number;
          min_lat: number;
          max_lng: number;
          max_lat: number;
          cell_size: number;
        };
        Returns: {
          lng: number;
          lat: number;
          count: number;
          bounds_min_lng: number;
          bounds_min_lat: number;
          bounds_max_lng: number;
          bounds_max_lat: number;
          sample_id: string;
          sample_content: string;
          sample_city: string | null;
          sample_country_code: string;
          sample_created_at: string;
        }[];
      };
      get_reaction_counts: {
        Args: { p_unsaid_id: string };
        Returns: { type: string; count: number }[];
      };
      create_unsaid_with_location: {
        Args: {
          p_content: string;
          p_content_hash: string;
          p_city: string | null;
          p_country_code: string;
          p_lng: number;
          p_lat: number;
          p_device_id: string;
          p_ip_address: string;
        };
        Returns: {
          id: string;
          content: string;
          city: string | null;
          country_code: string;
          location: Json;
          created_at: string;
        }[];
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
