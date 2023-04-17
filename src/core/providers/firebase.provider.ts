import * as fs from 'fs';
import * as Firebase from 'firebase-admin';

export class FirebaseProvider {
  private static isInitialized = false;

  static async initialize() {
    if (FirebaseProvider.isInitialized) {
      return;
    }

    FirebaseProvider.isInitialized = true;

    const projectId = process.env.FIREBASE_PROJECT_ID;
    const databaseName = process.env.FIREBASE_REALTIME_DB_NAME;
    const serviceAccountContent = Buffer.from(
      process.env.FIREBASE_SERVICE_ACCOUNT_KEY,
      'base64',
    ).toString('utf-8');
    const tempDir = 'temp';
    const serviceAccountPath = `${tempDir}/firebase.config.json`;

    if (!fs.existsSync(tempDir)) {
      await fs.promises.mkdir(tempDir);
    }

    try {
      if (fs.existsSync(serviceAccountPath)) {
        await fs.promises.unlink(serviceAccountPath);
      }

      await fs.promises.writeFile(serviceAccountPath, serviceAccountContent);

      Firebase.initializeApp({
        credential: Firebase.credential.cert(serviceAccountPath),
        projectId: projectId,
        storageBucket: `${projectId}.appspot.com`,
        databaseURL: `https://${databaseName}.firebasedatabase.app/`,
      });
    } catch (error) {
      console.error(error);
    }
  }
}
