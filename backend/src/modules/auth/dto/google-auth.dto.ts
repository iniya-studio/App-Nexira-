import { IsString, Length, MaxLength } from 'class-validator';

export class GoogleAuthDto {
  @IsString()
  @Length(20, 8192)
  idToken!: string;
}