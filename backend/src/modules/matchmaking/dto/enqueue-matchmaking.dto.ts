import { IsIn, IsString, Length, Matches } from 'class-validator';
import { ENABLED_LOCALES } from '../../../common/localization/locale-registry';

export class EnqueueMatchmakingDto {
  @IsString()
  @Length(1, 64)
  @Matches(/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/)
  category!: string;

  @IsString()
  @IsIn([...ENABLED_LOCALES])
  language!: string;

  @IsString()
  @Length(16, 128)
  @Matches(/^[a-zA-Z0-9._:-]+$/)
  idempotencyKey!: string;
}