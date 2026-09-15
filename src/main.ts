import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const port = Number(process.env.PORT) || 3101;
  await app.listen(port);
  console.log(`calls-local-service listening on :${port}`);
}

bootstrap();
