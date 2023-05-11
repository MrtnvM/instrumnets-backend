import { DecodedIdToken } from 'firebase-admin/lib/auth/token-verifier';

export type FirebaseUserRequest = {
  profileId: string;
  email: string;
  decodedToken: DecodedIdToken;
};
