import type { Role, User, UserStatus } from '../generated/prisma/client';

export interface UserDto {
  id: string;
  email: string;
  name: string;
  role: Role;
  status: UserStatus;
  createdAt: string;
}

/** The only way a User leaves the API: passwordHash is never copied. */
export const toUserDto = (u: User): UserDto => ({
  id: u.id,
  email: u.email,
  name: u.name,
  role: u.role,
  status: u.status,
  createdAt: u.createdAt.toISOString(),
});
