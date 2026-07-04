import { NestFactory } from '@nestjs/core';
import { Logger as NestLogger } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import session from 'express-session';
import RedisStore from 'connect-redis';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { RedisService } from './redis/redis.service';
import { EventsGateway } from './realtime/events.gateway';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const logger = new NestLogger('Bootstrap');

  // Behind Nginx Proxy Manager — trust the proxy so Secure cookies work over TLS.
  app.set('trust proxy', 1);
  app.setGlobalPrefix('api');

  app.enableCors({
    origin: [process.env.WEB_ORIGIN ?? 'http://localhost:5173'],
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  });

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
