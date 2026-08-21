import { generateVAPIDKeys } from 'web-push-neo';

const keys=await generateVAPIDKeys();
console.log('VAPID_PUBLIC_KEY='+keys.publicKey);
console.log('VAPID_PRIVATE_KEY='+keys.privateKey);
console.log('\nStore the private key as a Cloudflare secret. Do not commit generated keys to Git.');
