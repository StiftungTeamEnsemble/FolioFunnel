import PgBoss from 'pg-boss';

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://foliofunnel:foliofunnel_secret@localhost:5433/foliofunnel';

async function clearOrphanedJobs() {
  console.log('Connecting to database...');
  const boss = new PgBoss({ connectionString: DATABASE_URL });
  await boss.start();

  console.log('Clearing all jobs from queue...');
  
  // Clear all jobs from the process-job queue
  await boss.clearStorage();
  
  console.log('✓ All jobs cleared from queue');
  
  await boss.stop();
  console.log('Done!');
}

clearOrphanedJobs().catch(console.error);
