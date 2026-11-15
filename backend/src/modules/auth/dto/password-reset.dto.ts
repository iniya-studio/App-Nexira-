import { IsString, Length, Matches } from 'class-validator';
export class PasswordResetDto {
  @IsString() @Matches(/^[A-Za-z0-9_-]{43}$/) token!: string;
  @IsString() @Length(12, 128) newPassword!: string;
}
