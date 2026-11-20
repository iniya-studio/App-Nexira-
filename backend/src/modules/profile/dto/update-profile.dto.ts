import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, Matches, MaxLength, ValidateIf } from 'class-validator';
import { ENABLED_LOCALES, normalizeLocaleCode } from '../../../common/localization/locale-registry';
const DISPLAY_NAME_PATTERN = /^[\p{L}\p{M}\p{N} ._'’-]+$/u;
export class UpdateProfileDto {
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MaxLength(80)
  @Matches(DISPLAY_NAME_PATTERN)
  displayName?: string;
  @IsOptional()
  @IsString()
  @Transform(({ value }) => typeof value === 'string' ? normalizeLocaleCode(value) : value)
  @IsIn([...ENABLED_LOCALES])
  preferredLanguage?: string;
}
