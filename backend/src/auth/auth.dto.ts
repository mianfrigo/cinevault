import { Transform } from 'class-transformer';
import { IsEmail, IsString, Length, MaxLength } from 'class-validator';
import { normalizeEmail } from './email';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
const email = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? normalizeEmail(value) : value;

export class RegisterDto {
  @Transform(trim)
  @IsString()
  @Length(1, 80)
  name!: string;

  @Transform(email)
  @IsEmail()
  @MaxLength(254)
  email!: string;

  // Never trimmed: the limits apply to exactly what the user typed.
  @IsString()
  @Length(10, 128)
  password!: string;
}

export class EmailDto {
  @Transform(email)
  @IsEmail()
  @MaxLength(254)
  email!: string;
}

export class LoginDto extends EmailDto {
  // No minimum here: a wrong short password is a 401, not a 400.
  @IsString()
  @Length(1, 128)
  password!: string;
}

export class TokenDto {
  @IsString()
  @Length(1, 256)
  token!: string;
}
