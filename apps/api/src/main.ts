import { NestFactory } from '@nestjs/core';
import { Logger as NestLogger, VersioningType, VERSION_NEUTRAL } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import session from 'express-session';
import RedisStore from 'connect-redis';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { RedisService } from './redis/redis.service';
import { EventsGateway } from './realtime/events.gateway';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const logger = new NestLogger('Bootstrap');

  // Behind Nginx Proxy Manager — trust the proxy so Secure cookies work over TLS.
  app.set('trust proxy', 1);
  app.setGlobalPrefix('api');

  // URI versioning: routes are served BOTH unversioned (/api/*, keeps the current
  // web app working) and under /api/v1/* (which native clients pin to).
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: ['1', VERSION_NEUTRAL] });

  app.useGlobalFilters(new AllExceptionsFilter());

  // Allow a comma-separated origin list (WEB_ORIGIN) plus native clients, which send
  // no Origin header (or a custom app scheme) and authenticate with a bearer token.
  // Tauri desktop webviews load from these origins (Windows: http(s)://tauri.localhost,
  // macOS: tauri://localhost) and call the API cross-origin with a bearer token.
  const NATIVE_ORIGINS = ['tauri://localhost', 'http://tauri.localhost', 'https://tauri.localhost'];
  const allowedOrigins = [
    ...(process.env.WEB_ORIGIN ?? 'http://localhost:5173').split(',').map((o) => o.trim()).filter(Boolean),
    ...NATIVE_ORIGINS,
  ];
  app.enableCors({
    origin: (origin, cb) => cb(null, !origin || allowedOrigins.includes(origin)),
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  });

  // OpenAPI spec + docs at /api/docs (JSON at /api/docs-json) for native SDK generation.
  const swaggerConfig = new DocumentBuilder()
    .setTitle('OpenChat API')
    .setDescription('OpenChat REST API — versioned under /api/v1')
    .setVersion('1.0')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'token' }, 'app-token')
    .addCookieAuth('chat.sid')
    .build();
  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, swaggerConfig));

  app.use(helmet({ crossOriginResourcePolicy: false }));

  const redis = app.get(RedisService);
  app.use(
    session({
      store: new RedisStore({ client: redis.getClient(), prefix: 'sess:' }),
      secret: process.env.SESSION_SECRET as string,
      name: 'chat.sid',
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 1000 * 60 * 60 * 24 * 7,
      },
    }),
  );

  const port = Number(process.env.API_PORT ?? 3001);
  await app.listen(port);
  logger.log(`API listening on :${port}`);

  // Attach the raw WebSocket server to the same HTTP server (path /ws).
  app.get(EventsGateway).attach(app.getHttpServer());
}

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Fatal bootstrap error:', err);
  process.exit(1);
});
