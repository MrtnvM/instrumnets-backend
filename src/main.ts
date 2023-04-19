import { NestFactory } from '@nestjs/core';
import Airtable from 'airtable';
import { AppModule } from './app.module';
import { FirebaseProvider } from './core/providers/firebase.provider';
import { ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  Airtable.configure({ apiKey: process.env.AIRTABLE_TOKEN });
  await FirebaseProvider.initialize();

  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(new ValidationPipe());
  app.enableCors();
  await app.listen(process.env.PORT || 3000);
}

bootstrap();
