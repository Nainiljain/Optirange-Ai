const { MongoClient } = require('mongodb');
const uri = 'mongodb+srv://admin:admin@cluster0.0hmpatm.mongodb.net/?appName=Cluster0';

MongoClient.connect(uri).then(async client => {
  const db = client.db();
  // Promote the test user to admin
  const res = await db.collection('users').updateOne(
    { email: 'test@test.com' },
    { $set: { role: 'admin' } }
  );
  console.log('Matched:', res.matchedCount, '| Modified:', res.modifiedCount);
  await client.close();
}).catch(e => { console.error(e); process.exit(1); });
