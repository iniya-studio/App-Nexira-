import { IsIn, IsString, Length, Matches } from 'class-validator';

export class EnqueueMatchmakingDto {
  @IsString()
  @Length(1, 64)
  @Matches(/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/)
  category!: string;

  @IsString()
  @IsIn(['en', 'fa'])
  language!: string;

  @IsString()
  @Length(16, 128)
  @Matches(/^[a-zA-Z0-9._:-]+$/)
  idempotencyKey!: string;
}