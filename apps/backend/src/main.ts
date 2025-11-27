import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  
  // CORS: autoriser les origines configurées via CORS_ORIGINS (séparées par des virgules)
  // Par défaut: localhost sur ports 3xxx pour le dev
  const corsOrigins = process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(',').map((origin) => origin.trim())
    : [/^http:\/\/localhost:3\d{3}$/];
  
  app.enableCors({
    origin: corsOrigins,
    credentials: true,
  });
  const globalPrefix = 'api/v1';
  app.setGlobalPrefix(globalPrefix);

  const config = new DocumentBuilder()
    .setTitle('Stratum API')
    .setDescription('API-first kanban fractal platform')
    .setVersion('0.1.0')
    .addBearerAuth({
      type: 'http',
      scheme: 'bearer',
      bearerFormat: 'JWT',
    })
    .addServer('/api/v1')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
    },
  });

  // Utiliser 4001 par défaut pour éviter collision avec Next.js (port 3000)
  const port = Number(process.env.PORT) || 4001;
  await app.listen(port);
  const logger = new Logger('Bootstrap');
  logger.log(
    'HTTP server ready at http://localhost:' +
      String(port) +
      '/' +
      globalPrefix,
  );
  logger.log(
    'Swagger UI available at http://localhost:' + String(port) + '/docs',
  );
}
bootstrap().catch((error) => {
  const logger = new Logger('Bootstrap');
  logger.error('Failed to start application', error);
  process.exitCode = 1;
});
