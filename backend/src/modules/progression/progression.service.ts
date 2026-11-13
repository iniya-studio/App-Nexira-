import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { PrincipalType, RankingSeasonStatus, UserStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthenticatedPrincipal } from '../identity/authenticated-principal';

const LEADERBOARD_LIMIT = 50;

@Injectable()
export class ProgressionService {
  constructor(private readonly prisma: PrismaService) {}

  async getMyProgress(principal: AuthenticatedPrincipal) {
    const progress = principal.principalType === PrincipalType.USER
      ? await this.prisma.userProgress.findUnique({
          where: { userId: principal.principalId },
          select: { level: true, currentLevelXp: true, totalXp: true },
        })
      : await this.prisma.guestProgress.findUnique({
          where: { guestIdentityId: principal.principalId },
          select: { level: true, currentLevelXp: true, totalXp: true },
        });

    const level = progress?.level ?? 1;
    const currentLevelXp = progress?.currentLevelXp ?? 0;
    const totalXp = progress?.totalXp ?? 0n;
    const xpRequiredForNextLevel = level * 100;

    return {
      principalType: principal.principalType,
      level,
      currentLevelXp,
      totalXp: totalXp.toString(),
      xpRequiredForNextLevel,
      xpRemaining: Math.max(0, xpRequiredForNextLevel - currentLevelXp),
      progressPercent: Math.min(100, Math.floor((currentLevelXp / xpRequiredForNextLevel) * 100)),
    };
  }

  async getGlobalRanking(principal: AuthenticatedPrincipal) {
    const rows = await this.prisma.globalUserRanking.findMany({
      where: { user: { is: { status: UserStatus.ACTIVE } } },
      orderBy: [
        { rankingPoints: 'desc' },
        { wins: 'desc' },
        { updatedAt: 'asc' },
        { userId: 'asc' },
      ],
      take: LEADERBOARD_LIMIT,
      include: { user: { select: { username: true, displayName: true } } },
    });
    const entries = rows.map((row, index) => ({
      position: index + 1,
      userId: row.userId,
      username: row.user.username,
      displayName: row.user.displayName,
      rankingPoints: row.rankingPoints,
      wins: row.wins,
      losses: row.losses,
      draws: row.draws,
      matchesPlayed: row.matchesPlayed,
    }));
    const eligible = principal.principalType === PrincipalType.USER;
    const mine = eligible
      ? await this.prisma.globalUserRanking.findUnique({ where: { userId: principal.principalId } })
      : null;
    const myPosition = mine
      ? (await this.prisma.globalUserRanking.count({
          where: {
            user: { is: { status: UserStatus.ACTIVE } },
            OR: [
              { rankingPoints: { gt: mine.rankingPoints } },
              { rankingPoints: mine.rankingPoints, wins: { gt: mine.wins } },
              { rankingPoints: mine.rankingPoints, wins: mine.wins, updatedAt: { lt: mine.updatedAt } },
              { rankingPoints: mine.rankingPoints, wins: mine.wins, updatedAt: mine.updatedAt, userId: { lt: mine.userId } },
            ],
          },
        })) + 1
      : null;
    return {
      scope: 'GLOBAL',
      eligible,
      entries,
      me: mine
        ? {
            position: myPosition,
            rankingPoints: mine.rankingPoints,
            wins: mine.wins,
            losses: mine.losses,
            draws: mine.draws,
            matchesPlayed: mine.matchesPlayed,
          }
        : eligible
          ? { position: null, rankingPoints: 0, wins: 0, losses: 0, draws: 0, matchesPlayed: 0 }
          : null,
    };
  }

  async getCurrentSeasonRanking(principal: AuthenticatedPrincipal) {
    const now = new Date();
    const seasons = await this.prisma.rankingSeason.findMany({
      where: {
        status: RankingSeasonStatus.ACTIVE,
        startsAt: { lte: now },
        endsAt: { gt: now },
      },
      orderBy: { startsAt: 'desc' },
      take: 2,
      select: { id: true, name: true, startsAt: true, endsAt: true },
    });
    if (seasons.length > 1) {
      throw new InternalServerErrorException('Multiple active ranking seasons are configured');
    }
    const season = seasons[0];
    if (!season) {
      return {
        scope: 'SEASON',
        eligible: principal.principalType === PrincipalType.USER,
        season: null,
        entries: [],
        me: null,
      };
    }

    const rows = await this.prisma.userRanking.findMany({
      where: {
        seasonId: season.id,
        user: { is: { status: UserStatus.ACTIVE } },
      },
      orderBy: [
        { rankingPoints: 'desc' },
        { wins: 'desc' },
        { updatedAt: 'asc' },
        { userId: 'asc' },
      ],
      take: LEADERBOARD_LIMIT,
      include: { user: { select: { username: true, displayName: true } } },
    });
    const entries = rows.map((row, index) => ({
      position: index + 1,
      userId: row.userId,
      username: row.user.username,
      displayName: row.user.displayName,
      rankingPoints: row.rankingPoints,
      wins: row.wins,
      losses: row.losses,
      draws: row.draws,
      matchesPlayed: row.matchesPlayed,
    }));
    const eligible = principal.principalType === PrincipalType.USER;
    const mine = eligible
      ? await this.prisma.userRanking.findUnique({
          where: { userId_seasonId: { userId: principal.principalId, seasonId: season.id } },
        })
      : null;
    const myPosition = mine
      ? (await this.prisma.userRanking.count({
          where: {
            seasonId: season.id,
            user: { is: { status: UserStatus.ACTIVE } },
            OR: [
              { rankingPoints: { gt: mine.rankingPoints } },
              { rankingPoints: mine.rankingPoints, wins: { gt: mine.wins } },
              { rankingPoints: mine.rankingPoints, wins: mine.wins, updatedAt: { lt: mine.updatedAt } },
              { rankingPoints: mine.rankingPoints, wins: mine.wins, updatedAt: mine.updatedAt, userId: { lt: mine.userId } },
            ],
          },
        })) + 1
      : null;

    return {
      scope: 'SEASON',
      eligible,
      season: {
        id: season.id,
        name: season.name,
        startsAt: season.startsAt,
        endsAt: season.endsAt,
      },
      entries,
      me: mine
        ? {
            position: myPosition,
            rankingPoints: mine.rankingPoints,
            wins: mine.wins,
            losses: mine.losses,
            draws: mine.draws,
            matchesPlayed: mine.matchesPlayed,
          }
        : eligible
          ? { position: null, rankingPoints: 0, wins: 0, losses: 0, draws: 0, matchesPlayed: 0 }
          : null,
    };
  }
}
