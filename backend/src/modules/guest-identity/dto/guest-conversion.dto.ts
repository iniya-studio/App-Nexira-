import { IsEmail, IsOptional, IsString, Length, Matches, MaxLength } from 'class-validator';

export class GuestConversionDto {
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @IsString()
  @Length(12, 128)
  password!: string;

  @IsString()
  @Matches(/^[a-zA-Z0-9_]{3,20}$/)
  username!: string;

  @IsOptional()
  @IsString()
  @Length(1, 80)
  @Matches(/^[\p{L}\p{M}\p{N} ._'’-]+$/u)
  displayName?: string;
}
