import { createContext, useContext, type ReactNode } from 'react';
import type { EmployeeUser } from '@/types/employee';

export type UserContextValue = {
  user: EmployeeUser | null;
  setUser: (u: EmployeeUser | null) => void;
  avatarOverride: string | null;
  setAvatarOverride: (u: string | null) => void;
};

export const UserContext = createContext<UserContextValue | null>(null);

export function UserProvider({
  children,
  value,
}: {
  children: ReactNode;
  value: UserContextValue;
}) {
  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
}

export function useUser() {
  const c = useContext(UserContext);
  if (!c) throw new Error('useUser must be used within UserProvider');
  return c;
}
