import { Transform } from 'class-transformer';
import {
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { IntBetween } from '../catalog/catalog.dto';
import type { Role } from '../generated/prisma/client';

export const ADMIN_MAX_PAGE = 500;

export class UsersQuery {
  // Trimmed; blank means no filter.
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() || undefined : value,
  )
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @IntBetween(1, ADMIN_MAX_PAGE)
  page = 1;
}

export class UserIdParams {
  @IsUUID()
  id!: string;
}

// ValidateIf (not IsOptional) so an explicit null is rejected, not skipped.
export class UpdateUserDto {
  @ValidateIf((_, v) => v !== undefined)
  @IsIn(['USER', 'ADMIN'])
  role?: Role;

  @ValidateIf((_, v) => v !== undefined)
  @IsIn(['ACTIVE', 'BLOCKED'])
  status?: 'ACTIVE' | 'BLOCKED';
}
