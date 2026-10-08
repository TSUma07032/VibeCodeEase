export type PersonaId = 'exploration' | 'learning' | 'quality';

export type PersonaMode = 'adaptive' | 'fixed:exploration' | 'fixed:learning' | 'fixed:quality';

export type SituationId = 
  | 'learning' 
  | 'ideation' 
  | 'design_review' 
  | 'implementation' 
  | 'debugging' 
  | 'deadline_rush';

export interface Candidate {
  id: string;
  text: string;
  persona: PersonaId;
  embedding?: number[];
  policyCompliant?: boolean; // If false, do not show to user
}

export interface ResponseRecord {
  id: string;
  text: string;
  embedding: number[];
  feedback: 'liked' | 'disliked' | 'none';
  persona: PersonaId;
  situation: SituationId;
  createdAt: number;
  providerId: string; // To handle embedding model changes
}

export interface PersonaWeights {
  exploration: number;
  learning: number;
  quality: number;
}

export type VisibilityLevel = 'stealth' | 'subtle' | 'active';
export type ExplanationVerbosity = 'minimal' | 'summary' | 'detailed';
export type ApplicationAutomation = 'manual' | 'bulk' | 'auto';

export interface PersonalizationProfile {
  userId: string;
  likedRecords: ResponseRecord[];
  dislikedRecords: ResponseRecord[];
  positiveProfile?: number[];
  negativeProfile?: number[];
  recentPreferences?: number[];
  preferenceSummary: string;
  currentPersonaMode: PersonaMode;
  currentSituation: SituationId;
  personaSummary: string;
  
  // UIUX Personalization Axes
  visibilityLevel: VisibilityLevel;
  explanationVerbosity: ExplanationVerbosity;
  applicationAutomation: ApplicationAutomation;
}

export interface PzMetrics {
  totalInteractions: number;
  preferenceHits: number; // Selected candidate was ranked #1
  acceptedCount: number; // Selected a candidate (no rejection)
  regenerationCount: number; // Asked for regeneration
}
