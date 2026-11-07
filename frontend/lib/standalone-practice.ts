import type { Question } from "./types";

export type PracticeKind = "drag-drop" | "performance-based";
export type PracticeItem = {
  _id: string;
  title: string;
  category: string;
  subcategory: string;
  status: "DRAFT" | "PUBLISHED" | "INACTIVE";
  hasUnpublishedChanges: boolean;
  draftQuestion: Question;
  draftCount?: number;
  shortDescription?: string;
  description?: string;
  imageUrl?: string;
  publishedAt?: string;
};
export type PublicPracticeItem = {
  _id: string;
  title: string;
  category: string;
  subcategory: string;
  prompt?: string;
  question: Question;
  questions?: Question[];
};

export const practiceLabel = (kind: PracticeKind) => kind === "drag-drop" ? "Drag and drop" : "Performance-based";
