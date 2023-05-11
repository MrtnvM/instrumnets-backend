import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import * as admin from 'firebase-admin';

@Injectable()
export class FirebaseAuthGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const token = request.headers.authorization?.split(' ')[1];

    if (!token) {
      return false;
    }

    try {
      const decodedToken = await admin.auth().verifyIdToken(token);
      request.profileId = decodedToken.uid;
      request.email = decodedToken.email;
      request.decodedToken = decodedToken;

      return true;
    } catch (error) {
      console.error('Error while verifying Firebase ID token:', error);
      return false;
    }
  }
}
