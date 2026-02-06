export interface User {
  id: string;
  email?: string;
  created_at?: string;
}

export interface AuthError {
  message: string;
  status?: number;
}

export interface AuthContextType {
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  error: string | null;
}
