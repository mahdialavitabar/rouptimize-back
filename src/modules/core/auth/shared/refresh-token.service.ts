import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { v4 as uuidv4 } from 'uuid';
import { DRIZZLE_DB } from '../../../../common/database/database.tokens';
import * as schema from '../../../../db/schema';

@Injectable()
export class RefreshTokenService {
  constructor(
    @Inject(DRIZZLE_DB)
    private readonly db: NodePgDatabase<typeof schema>,
    private readonly configService: ConfigService,
  ) {}

  async generateRefreshToken(
    userId: string | null,
    mobileUserId: string | null,
    familyId?: string,
  ) {
    const token = uuidv4();
    const tokenHash = await bcrypt.hash(token, 10);
    const expiresInDays = this.configService.get<number>(
      'REFRESH_TOKEN_EXPIRATION_DAYS',
      7,
    );
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + expiresInDays);

    const newFamilyId = familyId || uuidv4();

    const [inserted] = await this.db
      .insert(schema.refreshTokens)
      .values({
        userId: userId || undefined,
        mobileUserId: mobileUserId || undefined,
        tokenHash,
        expiresAt,
        familyId: newFamilyId,
      })
      .returning({ id: schema.refreshTokens.id });

    return {
      token: `${inserted.id}.${token}`,
      familyId: newFamilyId,
      expiresAt,
    };
  }

  async rotateRefreshToken(oldToken: string) {
    const [id, secret] = oldToken.split('.');
    if (!id || !secret) {
      throw new UnauthorizedException('Invalid refresh token format');
    }

    const [storedToken] = await this.db
      .select()
      .from(schema.refreshTokens)
      .where(eq(schema.refreshTokens.id, id))
      .limit(1);

    if (!storedToken) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (storedToken.isRevoked) {
      // Reuse detection! Revoke the whole family.
      await this.revokeFamily(storedToken.familyId);
      throw new UnauthorizedException('Refresh token reused');
    }

    const isValid = await bcrypt.compare(secret, storedToken.tokenHash);
    if (!isValid) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (new Date() > storedToken.expiresAt) {
      throw new UnauthorizedException('Refresh token expired');
    }

    // Invalidate old token
    await this.db
      .update(schema.refreshTokens)
      .set({ isRevoked: true })
      .where(eq(schema.refreshTokens.id, id));

    // Generate new one
    const { token: newToken } = await this.generateRefreshToken(
      storedToken.userId,
      storedToken.mobileUserId,
      storedToken.familyId,
    );

    return {
      token: newToken,
      userId: storedToken.userId,
      mobileUserId: storedToken.mobileUserId,
    };
  }

  async revokeRefreshToken(token: string) {
    const [id, secret] = token.split('.');
    if (!id || !secret) return;

    await this.db
      .update(schema.refreshTokens)
      .set({ isRevoked: true })
      .where(eq(schema.refreshTokens.id, id));
  }

  private async revokeFamily(familyId: string) {
    await this.db
      .update(schema.refreshTokens)
      .set({ isRevoked: true })
      .where(eq(schema.refreshTokens.familyId, familyId));
  }
}
