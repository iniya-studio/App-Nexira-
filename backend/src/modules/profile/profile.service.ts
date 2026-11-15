import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { MatchStatus, PrincipalType, Prisma, UserStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthenticatedPrincipal } from '../identity/authenticated-principal';
import { UpdateProfileDto } from './dto/update-profile.dto';

@Injectable()
export class ProfileService {
  constructor(private readonly prisma: PrismaService) {}

  async getMyProfile(principal: AuthenticatedPrincipal) {
    if (principal.principalType === PrincipalType.USER) {
      const user = await this.prisma.user.findFirst({
        where: { id: principal.principalId, status: UserStatus.ACTIVE },
        select: { id: true, username: true, displayName: true, preferredLanguage: true, createdAt: true },
      });
      if (!user) throw new NotFoundException('Profile not found');
      return {
        principalType: PrincipalType.USER,
        profile: { displayName: user.displayName, username: user.username, preferredLanguage: user.preferredLanguage, createdAt: user.createdAt },
        statistics: await this.getMatchStatistics({ userId: user.id }),
      };
    }

    const guest = await this.prisma.guestIdentity.findFirst({
      where: { id: principal.principalId, status: 'ACTIVE' },
      select: { id: true, displayName: true, createdAt: true },
    });
    if (!guest) throw new NotFoundException('Profile not found');
    return {
      principalType: PrincipalType.GUEST,
      profile: {
        displayName: guest.displayName ?? this.guestFallback(guest.id),
        username: null,
        preferredLanguage: null,
        createdAt: guest.createdAt,
      },
      statistics: await this.getMatchStatistics({ guestIdentityId: guest.id }),
    };
  }

  async updateMyProfile(principal: AuthenticatedPrincipal, input: UpdateProfileDto) {
    if (input.displayName === undefined && input.preferredLanguage === undefined) {
      throw new BadRequestException('At least one supported profile field is required');
    }
    const displayName = input.displayName === undefined ? undefined : this.normalizeDisplayName(input.displayName);
    if (principal.principalType === PrincipalType.USER) {
      const result = await this.prisma.user.updateMany({
        where: { id: principal.principalId, status: UserStatus.ACTIVE },
        data: {
          ...(displayName === undefined ? {} : { displayName }),
          ...(input.preferredLanguage === undefined ? {} : { preferredLanguage: input.preferredLanguage }),
        },
      });
      if (result.count !== 1) throw new NotFoundException('Profile not found');
    } else {
      if (input.preferredLanguage !== undefined) {
        throw new BadRequestException('Guest language is a device preference until account conversion');
      }
      const result = await this.prisma.guestIdentity.updateMany({
        where: { id: principal.principalId, status: 'ACTIVE' },
        data: { displayName },
      });
      if (result.count !== 1) throw new NotFoundException('Profile not found');
    }
    return this.getMyProfile(principal);
  }

  private async getMatchStatistics(owner: { userId?: string; guestIdentityId?: string }) {
    const where: Prisma.MatchParticipantWhereInput = {
      ...(owner.userId ? { userId: owner.userId } : { guestIdentityId: owner.guestIdentityId }),
      match: { is: { status: MatchStatus.COMPLETED, result: { isNot: null } } },
    };
    const participants = await this.prisma.matchParticipant.findMany({
      where,
      select: { id: true, match: { select: { result: { select: { winnerParticipantId: true } } } } },
    });
    let wins = 0;
    let losses = 0;
    let draws = 0;
    for (const participant of participants) {
      const winnerId = participant.match.result?.winnerParticipantId ?? null;
      if (winnerId === null) draws += 1;
      else if (winnerId === participant.id) wins += 1;
      else losses += 1;
    }
    return { matchesPlayed: participants.length, wins, losses, draws, availability: 'AVAILABLE' as const };
  }

  private normalizeDisplayName(value: string): string {
    const normalized = value.normalize('NFC').trim();
    const codePoints = Array.from(normalized);
    if (codePoints.length < 1 || codePoints.length > 40) {
      throw new BadRequestException('Display name must contain 1 to 40 Unicode code points');
    }
    if (/[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2060\u2066-\u2069\uFEFF]/u.test(normalized)) {
      throw new BadRequestException('Display name contains unsupported invisible or control characters');
    }
    return normalized;
  }

  private guestFallback(id: string): string {
    return `Player-${id.slice(0, 6)}`;
  }
}
