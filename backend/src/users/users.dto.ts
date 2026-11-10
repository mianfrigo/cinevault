import { Transform } from 'class-transformer';
import { IsEmail, IsString, Length, MaxLength } from 'class-validator';
import { email, trim } from '../auth/auth.dto';

// Passwords are never trimmed and are capped before any argon2 call (DoS).
export class UpdateMeDto {
  @Transform(trim)
  @IsString()
  @Length(1, 80)
  name!: string;
}

export class ChangePasswordDto {
  @IsString()
  @Length(1, 128)
  oldPassword!: string;

  // Same limits as registration.
  @IsString()
  @Length(10, 128)
  newPassword!: string;
}

export class ChangeEmailDto {
  @Transform(email)
  @IsEmail()
  @MaxLength(254)
  newEmail!: string;

  @IsString()
  @Length(1, 128)
  password!: string;
}

export class PasswordDto {
  @IsString()
  @Length(1, 128)
  password!: string;
}
