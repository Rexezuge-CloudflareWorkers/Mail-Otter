interface User {
  email: string;
  createdAt: number;
  updatedAt: number;
}

interface UserInternal {
  email: string;
  created_at: number;
  updated_at: number;
}

export type { User, UserInternal };
