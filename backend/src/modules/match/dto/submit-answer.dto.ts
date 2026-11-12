import { IsString, Length } from 'class-validator';

export class SubmitAnswerDto {
  @IsString()
  @Length(1, 2000)
  responseText!: string;

  @IsString()
  @Length(8, 128)
  idempotencyKey!: string;
}
