export interface User {
  id: number;
  email: string;
  password_hash: string;
  created_at: string;
}

export interface SafeUser {
  id: number;
  email: string;
  created_at: string;
}
