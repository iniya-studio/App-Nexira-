import { IsString, Length, Matches } from 'class-validator';

export class GuestConversionRetryDto {
  @IsString()
  @Length(43, 128)
  @Matches(/^[A-Za-z0-9_-]+$/)
  refreshToken!: string;
}
