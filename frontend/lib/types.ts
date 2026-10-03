export type CategoryOption = { name: string; subcategories: { name: string }[] };
export interface ExamSummary {
  id: string;
  slug: string;
  title: string;
  shortDescription: string;
  description?: string;
  imageUrl?: string;
  category: string;
  subcategory?: string;
  questionCount: number;
  freeQuestionCount: number;
  durationMinutes: number;
  validityDays: number;
  featured: boolean;
  rating: number;
  reviewCount: number;
  passingPercentage?: number;
  attemptSize?: number;
  publishedAt?: string;
}

export interface Question {
  type?: "SINGLE_CHOICE" | "MULTIPLE_CHOICE" | "DRAG_DROP" | "IMAGE_PBQ";
  pbq?: PbqDefinition;
  pbqKey?: PbqKey[];
  dropTargets?: DropTarget[];
  correctPlacements?: Placement[];
  _id?: string; text: string; options: { id: string; text: string }[]; correctOptionIds: string[];
  explanation: string; accessLevel: "FREE" | "PREMIUM"; topic: string; difficulty: string; imageUrl: string; displayOrder: number;
  errors?: string[]; duplicate?: boolean; row?: number;
}
export type PbqField = { id: string; label: string; kind: "text" | "textarea" | "select" | "radio" | "checkbox" | "match"; tabId?: string; points: number; caseSensitive: boolean; evidence: string; options: { id: string; text: string }[] };
export type PbqArea = Omit<PbqField, "kind" | "tabId"> & { kind: PbqField["kind"] | "evidence" | "form"; x: number; y: number; width?: number; height?: number; marker?: "none" | "question"; tabs?: { id: string; label: string }[]; fields?: PbqField[] };
export type PbqDefinition = { alt: string; areas: PbqArea[] };
export type PbqKey = { areaId: string; fieldId?: string; values: string[]; explanation: string };
export type PbqAnswer = { areaId: string; fieldId?: string; values: string[] };
export type DropTarget = { id: string; label: string; capacity: number };
export type Placement = { itemId: string; targetId: string };
export interface AdminExam extends ExamSummary { _id: string; status: string; draftCount?: number; draftFree?: number; hasUnpublishedChanges?: boolean; }
