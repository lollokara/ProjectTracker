import webpush from 'web-push';

const vapidKeys = webpush.generateVAPIDKeys();

console.log('\n' + '═'.repeat(60));
console.log('  VAPID KEYS GENERATED');
console.log('═'.repeat(60));
console.log('');
console.log(`  VAPID_PUBLIC_KEY=${vapidKeys.publicKey}`);
console.log(`  VAPID_PRIVATE_KEY=${vapidKeys.privateKey}`);
console.log('');
console.log('  Add these to your .env file.');
console.log('═'.repeat(60) + '\n');
