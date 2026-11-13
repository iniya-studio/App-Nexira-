import { IsEmail, IsString, Length, Matches, MaxLength } from 'class-validator';

export class RegisterDto {
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @IsString()
  @Length(12, 128)
  password!: string;

  @IsString()
  @Matches(/^[a-zA-Z0-9_]{3,20}$/)
  username!: string;

  @IsString()
  @Length(1, 40)
  displayName!: string;
}