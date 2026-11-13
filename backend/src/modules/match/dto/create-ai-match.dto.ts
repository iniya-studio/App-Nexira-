import { IsIn, IsOptional, IsString, Length } from 'class-validator';

export class CreateAiMatchDto {
  @IsOptional()
  @IsString()
  @Length(1, 64)
  category?: string;

  @IsOptional()
  @IsIn(['en', 'fa'])
  language?: string;
}
