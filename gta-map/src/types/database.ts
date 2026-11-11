// Types alignés sur supabase/migrations. Régénérables avec `npm run types:db`.
export type CategoryGroup = "missions" | "collectibles" | "vehicules" | "lieux" | "activites";
export type PublishStatus = "draft" | "published";
export type SubmissionStatus = "pending" | "approved" | "rejected";
export type MissionCharacter = "lucia" | "jason" | "both";

interface Table<Row, Insert = Partial<Row>> {
  Row: Row;
  Insert: Insert;
  Update: Partial<Row>;
  Relationships: [];
}

export interface CategoryRow {
  id: string;
  slug: string;
  name: string;
  icon: string | null;
  color: string;
  group_type: CategoryGroup;
  sort_order: number;
}
export interface MarkerRow {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  category_id: string;
  x: number;
  y: number;
  region: string | null;
  image_url: string | null;
  youtube_url: string | null;
  source_credit: string | null;
  status: PublishStatus;
  created_at: string;
  updated_at: string;
}
export interface MissionRow {
  id: string;
  slug: string;
  title: string;
  character: MissionCharacter;
  chapter: number | null;
  order_index: number;
  summary: string | null;
  walkthrough: string | null;
  rewards: string | null;
  marker_id: string | null;
  youtube_url: string | null;
  source_credit: string | null;
  status: PublishStatus;
  created_at: string;
  updated_at: string;
}
export interface VehicleRow {
  id: string;
  slug: string;
  name: string;
  type: string;
  rarity: string | null;
  top_speed: number | null;
  price: number | null;
  how_to_get: string | null;
  marker_id: string | null;
  image_url: string | null;
  status: PublishStatus;
  created_at: string;
  updated_at: string;
}
export interface GuideRow {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  content: string | null;
  category: string | null;
  seo_title: string | null;
  seo_description: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
}
export interface SubmissionRow {
  id: string;
  type: "new_marker" | "correction" | "other";
  payload: Record<string, unknown>;
  x: number | null;
  y: number | null;
  submitter_email: string | null;
  status: SubmissionStatus;
  ip_hash: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
}
export interface UserProgressRow {
  user_id: string;
  marker_id: string;
  completed_at: string;
}

export interface Database {
  public: {
    Tables: {
      categories: Table<CategoryRow>;
      markers: Table<MarkerRow>;
      missions: Table<MissionRow>;
      vehicles: Table<VehicleRow>;
      guides: Table<GuideRow>;
      submissions: Table<SubmissionRow>;
      user_progress: Table<UserProgressRow>;
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
