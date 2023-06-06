import * as firebase from 'firebase-admin';

export const FirebaseDB = () => {
  const db = firebase.database();

  return {
    products: db.ref('products'),
    consumables: db.ref('consumables'),
    clientCategories: db.ref('clientCategories'),
  };
};
