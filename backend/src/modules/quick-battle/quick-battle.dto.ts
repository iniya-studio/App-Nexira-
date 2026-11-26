import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateQuickBattleDto {
  @IsOptional()
  @IsString()
  @MaxLength(16)
  language?: string;
}

export class SubmitQuickBattleAnswerDto {
  @IsString()
  @MaxLength(2000)
  responseText!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  idempotencyKey!: string;
}
