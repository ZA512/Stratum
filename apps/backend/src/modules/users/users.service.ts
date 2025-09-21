import { Injectable } from '@nestjs/common';
import { MembershipStatus, Prisma, User } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  findByEmail(email: string) {
    return this.prisma.user.findUnique({ where: { email } });
  }

  findById(id: string) {
    return this.prisma.user.findUnique({ where: { id } });
  }

  createUser(data: Prisma.UserCreateInput) {
    return this.prisma.user.create({ data });
  }

  updatePassword(id: string, passwordHash: string) {
    return this.prisma.user.update({ where: { id }, data: { passwordHash } });
  }

  updateProfile(
    id: string,
    data: Partial<Pick<User, 'displayName' | 'locale' | 'avatarUrl' | 'bio'>>,
  ) {
    return this.prisma.user.update({ where: { id }, data });
  }

  async getProfileWithTeams(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        displayName: true,
        locale: true,
        avatarUrl: true,
        bio: true,
        memberships: {
          where: { status: MembershipStatus.ACTIVE },
          select: {
            id: true,
            title: true,
            team: {
              select: {
                id: true,
                name: true,
                slug: true,
              },
            },
          },
        },
      },
    });

    if (!user) {
      return null;
    }

    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      locale: user.locale,
      avatarUrl: user.avatarUrl,
      bio: user.bio,
      teams: user.memberships.map((membership) => ({
        membershipId: membership.id,
        title: membership.title,
        team: membership.team,
      })),
    };
  }
}
