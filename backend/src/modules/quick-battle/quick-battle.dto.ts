import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateQuickBattleDto {
  @IsOptional()
  @IsString()
  @MaxLength(16)
  language?: string;
}
