import {DatabaseSync} from 'node:sqlite';
import {readFileSync,existsSync,openSync,closeSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';

// Offline only. Never connects to the live CRM, Google Sheets, or GitHub.
const [input,output]=process.argv.slice(2);
if(!input||!output)throw Error('Usage: node scripts/restore-backup.mjs BACKUP.json NEW_DATABASE.sqlite');
const target=resolve(output);
if(existsSync(target))throw Error('Destination already exists; refusing to overwrite');
const backup=JSON.parse(readFileSync(resolve(input),'utf8'));
const tables=['clients','events','sales','sync_state'];
if(backup.version!==1||!backup.tables||Object.keys(backup.tables).sort().join()!==[...tables].sort().join())throw Error('Unexpected backup format');
for(const table of tables){
 const rows=backup.tables[table];
 if(!Array.isArray(rows)||rows.some(r=>!r.id)||new Set(rows.map(r=>r.id)).size!==rows.length)throw Error('Invalid rows or duplicate IDs: '+table);
}
const ids=new Set(backup.tables.clients.map(r=>r.id));
for(const table of ['events','sales'])for(const row of backup.tables[table])if(!ids.has(row.client_id))throw Error('Orphan record: '+table);
const canonical=rows=>JSON.stringify([...rows].sort((a,b)=>String(a.id).localeCompare(String(b.id),'en')).map(r=>Object.fromEntries(Object.entries(r).sort(([a],[b])=>a.localeCompare(b,'en')))));
const hash=rows=>createHash('sha256').update(canonical(rows)).digest('hex');
closeSync(openSync(target,'wx',0o600));
const db=new DatabaseSync(target);
try{
 db.exec('BEGIN IMMEDIATE');
 const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
 for(const migration of ['0000_violet_ultimo.sql','0001_wakeful_retro_girl.sql'])db.exec(readFileSync(resolve(root,'drizzle',migration),'utf8'));
 const report={sourceExportedAt:backup.exportedAt,restoredAt:new Date().toISOString(),tables:{}};
 for(const table of tables){
  const columns=db.prepare(`PRAGMA table_info("${table}")`).all().map(c=>c.name);
  const rows=backup.tables[table];
  const insert=db.prepare(`INSERT INTO "${table}" (${columns.map(c=>'"'+c+'"').join(',')}) VALUES (${columns.map(()=>'?').join(',')})`);
  for(const row of rows){
   if(Object.keys(row).sort().join()!==[...columns].sort().join())throw Error('Missing or unknown fields: '+table);
   insert.run(...columns.map(c=>row[c]));
  }
  const restored=db.prepare(`SELECT * FROM "${table}"`).all();
  if(hash(rows)!==hash(restored))throw Error('Round-trip mismatch: '+table);
  report.tables[table]={rows:rows.length,sha256:hash(restored),allFieldsMatch:true};
 }
 if(db.prepare('PRAGMA integrity_check').get().integrity_check!=='ok')throw Error('SQLite integrity check failed');
 db.exec('COMMIT');
 console.log(JSON.stringify(report,null,2));
}catch(error){db.exec('ROLLBACK');throw error;}finally{db.close();}
