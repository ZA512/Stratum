import {
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import { spawn } from 'child_process';
import type { Response } from 'express';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator';

const EXPORT_FILE_PREFIX = 'stratum-export';

@Injectable()
export class TestDataService {
  private readonly logger = new Logger(TestDataService.name);

  constructor(private readonly configService: ConfigService) {}

  async exportDatabase(user: AuthenticatedUser, res: Response): Promise<void> {
    this.ensureAuthorized(user);
    const databaseUrl = this.getDatabaseUrl();
    const schema = this.getSchemaFromUrl(databaseUrl);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `${EXPORT_FILE_PREFIX}-${timestamp}.dump`;

    const args = [
      '--format=custom',
      '--no-owner',
      '--no-privileges',
      ...(schema ? [`--schema=${schema}`] : []),
      databaseUrl,
    ];

    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${filename}"`,
    );

    await this.runDumpProcess('pg_dump', args, res);
  }

  async importDatabase(user: AuthenticatedUser, filePath: string): Promise<void> {
    this.ensureAuthorized(user);
    const databaseUrl = this.getDatabaseUrl();
    const schema = this.getSchemaFromUrl(databaseUrl);

    const args = [
      '--clean',
      '--if-exists',
      '--no-owner',
      '--no-privileges',
      ...(schema ? [`--schema=${schema}`] : []),
      '--dbname',
      databaseUrl,
      filePath,
    ];

    await this.runProcess('pg_restore', args);
  }

  private ensureAuthorized(user?: AuthenticatedUser): void {
    const allowedHash = this.configService.get<string>(
      'TEST_DATA_ACCESS_HASH',
    );
    if (!allowedHash) {
      throw new ForbiddenException('Accès non autorisé');
    }
    const email = user?.email ?? '';
    const normalized = email.trim().toLowerCase();
    const digest = createHash('sha256').update(normalized).digest('hex');

    if (digest !== allowedHash) {
      throw new ForbiddenException('Accès non autorisé');
    }
  }

  private getDatabaseUrl(): string {
    const databaseUrl = this.configService.get<string>('DATABASE_URL');
    if (!databaseUrl) {
      throw new InternalServerErrorException('Configuration base absente');
    }
    return databaseUrl;
  }

  private getSchemaFromUrl(databaseUrl: string): string | undefined {
    try {
      const parsed = new URL(databaseUrl);
      const schema = parsed.searchParams.get('schema');
      return schema || undefined;
    } catch {
      return undefined;
    }
  }

  private async runDumpProcess(
    command: string,
    args: string[],
    res: Response,
  ): Promise<void> {
    try {
      const proc = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });

      const stderrChunks: Buffer[] = [];
      proc.stderr.on('data', (chunk) => {
        stderrChunks.push(chunk);
      });

      proc.stdout.pipe(res);

      const exitCode = await new Promise<number>((resolve, reject) => {
        proc.on('error', reject);
        proc.on('close', resolve);
      });

      if (exitCode !== 0) {
        const stderr = Buffer.concat(stderrChunks).toString('utf-8');
        this.logger.error(
          `Export test-data échoué (code ${exitCode}). ${stderr}`,
        );
        if (!res.headersSent) {
          res.status(500).json({ message: 'Export impossible' });
          return;
        }
        res.end();
      }
    } catch (error) {
      this.logger.error('Export test-data impossible', error);
      if (!res.headersSent) {
        throw new InternalServerErrorException('Export impossible');
      }
      res.end();
    }
  }

  private async runProcess(command: string, args: string[]): Promise<void> {
    try {
      const proc = spawn(command, args, { stdio: ['ignore', 'ignore', 'pipe'] });

      const stderrChunks: Buffer[] = [];
      proc.stderr.on('data', (chunk) => {
        stderrChunks.push(chunk);
      });

      const exitCode = await new Promise<number>((resolve, reject) => {
        proc.on('error', reject);
        proc.on('close', resolve);
      });

      if (exitCode !== 0) {
        const stderr = Buffer.concat(stderrChunks).toString('utf-8');
        this.logger.error(
          `Import test-data échoué (code ${exitCode}). ${stderr}`,
        );
        throw new InternalServerErrorException('Import impossible');
      }
    } catch (error) {
      this.logger.error('Import test-data impossible', error);
      throw new InternalServerErrorException('Import impossible');
    }
  }
}
