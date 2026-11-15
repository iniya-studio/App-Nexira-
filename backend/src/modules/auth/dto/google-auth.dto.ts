import { IsString, Length, Matches } from 'class-validator';

export class GoogleAuthDto {
  @IsString()
  @Length(20, 8192)
  idToken!: string;

  @IsString()
  @Length(43, 43)
  @Matches(/^[A-Za-z0-9_-]{43}$/)
  nonce!: string;
}