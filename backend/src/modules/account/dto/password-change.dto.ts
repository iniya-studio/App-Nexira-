import { IsString, Length } from 'class-validator';
export class PasswordChangeDto {
  @IsString() @Length(1, 128) currentPassword!: string;
  @IsString() @Length(12, 128) newPassword!: string;
}
