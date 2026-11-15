import { IsString, Length } from 'class-validator';
export class GoogleIdentityLinkDto {
  @IsString()
  @Length(20, 8192)
  idToken!: string;
}
