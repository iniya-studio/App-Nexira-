import { PrincipalType } from '@prisma/client';

export interface AuthenticatedPrincipal {
  principalType: PrincipalType;
  principalId: string;
  sessionId: string;
}

export interface AccessTokenClaims {
  iss: string;
  aud: string;
  sub: string;
  principalType: PrincipalType;
  sid: string;
  jti: string;
  iat: number;
  exp: number;
}
