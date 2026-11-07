import { IsString, MinLength } from 'class-validator';

export class RefreshSessionDto {
  @IsString()
  @MinLength(32)
  refreshToken!: string;

  @IsString()
  @MinLength(32)
  idempotencyKey!: string;
}
