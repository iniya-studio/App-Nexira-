import { IsOptional, IsString, Length } from 'class-validator';

export class GetRoundQuestionDto {
  @IsOptional()
  @IsString()
  @Length(2, 16)
  language?: string;
}
