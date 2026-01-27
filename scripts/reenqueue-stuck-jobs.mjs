import pg from 'pg';
import PgBoss from 'pg-boss';

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://foliofunnel:foliofunnel@postgres:5432/foliofunnel';

async function reenqueueStuckJobs() {
  console.log('Connecting to database...');
  const boss = new PgBoss({ connectionString: DATABASE_URL });
  await boss.start();

  console.log('Finding stuck processor runs...');
  
  // Query for queued processor runs
  const client = new pg.Client({ connectionString: DATABASE_URL });
  await client.connect();
  
  const result = await client.query(`
    SELECT pr.id as run_id, pr.project_id, pr.document_id, pr.column_id
    FROM processor_runs pr
    WHERE pr.status = 'queued'
    ORDER BY pr.created_at ASC
  `);
  
  console.log(`Found ${result.rows.length} stuck jobs`);
  
  for (const row of result.rows) {
    console.log(`Re-enqueueing job for run ${row.run_id}...`);
    
    await boss.send('process-job', {
      type: 'column_processor',
      projectId: row.project_id,
      documentId: row.document_id,
      columnId: row.column_id,
      runId: row.run_id,
    }, {
      retryLimit: 2,
      retryDelay: 10,
      expireInMinutes: 60,
    });
    
    console.log(`✓ Enqueued job for run ${row.run_id}`);
  }
  
  await client.end();
  await boss.stop();
  console.log('Done!');
}

reenqueueStuckJobs().catch(console.error);
