import { db } from './src/db/index.js';
import * as schema from './src/db/schema.js';

async function seed() {
  try {
    const targetTable = schema.classes || schema.classesTable;
    console.log('Sedang memasukkan data kelas ke database...');

    await db.insert(targetTable).values([
      { id: 10, name: 'Kelas 10', academicYear: '2025/2026' },
      { id: 11, name: 'Kelas 11', academicYear: '2025/2026' },
      { id: 12, name: 'Kelas 12', academicYear: '2025/2026' }
    ]).onConflictDoNothing();

    console.log('✅ BERHASIL! Data kelas 10, 11, dan 12 sudah masuk ke database.');
    process.exit(0);
  } catch (err) {
    console.error('❌ Gagal memasukkan data kelas:', err);
    process.exit(1);
  }
}

seed();