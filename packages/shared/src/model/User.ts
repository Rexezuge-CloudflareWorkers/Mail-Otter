interface User {
  email: string;
  preferredLanguage?: string | null;
  createdAt: number;
  updatedAt: number;
}

interface UserInternal {
  email: string;
  preferred_language?: string | null;
  created_at: number;
  updated_at: number;
}

export type { User, UserInternal };
