import { IsIn, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
const DISPLAY_NAME_PATTERN = /^[\p{L}\p{M}\p{N} ._'’-]+$/u;
export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  @Matches(DISPLAY_NAME_PATTERN)
  displayName?: string;
  @IsOptional()
  @IsString()
  @IsIn(['en', 'fa'])
  preferredLanguage?: string;
}
