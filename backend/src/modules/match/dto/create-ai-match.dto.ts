import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, Length, Matches } from 'class-validator';
import { ENABLED_LOCALES, normalizeLocaleCode } from '../../../common/localization/locale-registry';

export class CreateAiMatchDto {
  @IsOptional()
  @IsString()
  @Length(1, 64)
  category?: string;

  @IsOptional()
  @IsString()
  @Length(1, 64)
  @Matches(/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/)
  subcategoryId?: string;

  @IsOptional()
  @Transform(({ value }) => typeof value === 'string' ? normalizeLocaleCode(value) : value)
  @IsIn([...ENABLED_LOCALES])
  language?: string;
}
