import { IsString, Matches, MaxLength } from 'class-validator';

const HIGH_ENTROPY_BASE64URL = /^[A-Za-z0-9_-]{43,}$/;

export class RefreshSessionDto {
  @IsString()
  @Matches(HIGH_ENTROPY_BASE64URL)
  @MaxLength(128)
  refreshToken!: string;

  @IsString()
  @Matches(HIGH_ENTROPY_BASE64URL)
  @MaxLength(128)
  idempotencyKey!: string;
}
