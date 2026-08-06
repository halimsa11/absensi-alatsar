import 'dotenv/config'; // MENGIMPOR ENV AGAR TERHUBUNG KE NEON
import express from 'express';
import cors from 'cors';
import { db } from './db/index.js';
import * as schema from './db/schema.js';
import { eq } from 'drizzle-orm';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Fungsi untuk memasukkan data contoh jika tabel masih kosong
async function seedInitialData() {
  try {
    const targetClassTable = schema.classes || schema.classesTable;
    const targetStudentTable = schema.students || schema.studentsTable;

    const existingClasses = await db.select().from(targetClassTable);
    if (existingClasses.length === 0) {
      await db.insert(targetClassTable).values([
        { id: 10, name: 'Kelas 10', academicYear: '2025/2026' },
        { id: 11, name: 'Kelas 11', academicYear: '2025/2026' },
        { id: 12, name: 'Kelas 12', academicYear: '2025/2026' }
      ]);
      console.log('✅ Data contoh kelas berhasil ditambahkan.');
    }

    const existingStudents = await db.select().from(targetStudentTable);
    if (existingStudents.length === 0) {
      await db.insert(targetStudentTable).values([
        { nisn: 123456, fullName: 'Contoh Santri 1', classId: 10 },
        { nisn: 654321, fullName: 'Contoh Santri 2', classId: 12 }
      ]);
      console.log('✅ Data contoh santri berhasil ditambahkan.');
    }
  } catch (err) {
    console.log('Catatan seeding data:', err.message);
  }
}

// Endpoint untuk mengambil daftar kelas
app.get('/api/classes', async (req, res) => {
  try {
    const classesList = await db.select().from(schema.classes || schema.classesTable);
    res.json({ success: true, data: classesList });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Endpoint untuk mengambil daftar seluruh santri
app.get('/api/students', async (req, res) => {
  try {
    const studentsList = await db.select().from(schema.students || schema.studentsTable);
    res.json({ success: true, data: studentsList });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Endpoint untuk menyimpan data santri baru
app.post('/api/students', async (req, res) => {
  try {
    const { nisn, fullName, classId } = req.body;

    if (!nisn || !fullName || !classId) {
      return res.status(400).json({ success: false, message: 'Semua kolom wajib diisi!' });
    }

    const nisnAngka = parseInt(nisn);
    if (isNaN(nisnAngka)) {
      return res.status(400).json({ success: false, message: 'NISN harus berupa angka!' });
    }

    const targetTable = schema.students || schema.studentsTable;

    await db.insert(targetTable).values({
      nisn: nisnAngka,
      fullName: fullName,
      classId: parseInt(classId) 
    });

    res.json({ success: true, message: 'Data santri berhasil disimpan ke database!' });
  } catch (err) {
    console.error('Error saat menyimpan santri:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// Endpoint untuk menghapus data santri beserta riwayat absensinya
app.delete('/api/students/:id', async (req, res) => {
  try {
    const studentId = parseInt(req.params.id);
    const targetStudentTable = schema.students || schema.studentsTable;
    const targetAttendanceTable = schema.attendance || schema.attendances || schema.attendanceTable;
    
    if (targetAttendanceTable && targetAttendanceTable.studentId) {
      await db.delete(targetAttendanceTable).where(eq(targetAttendanceTable.studentId, studentId));
    }
    
    await db.delete(targetStudentTable).where(eq(targetStudentTable.id, studentId));
    
    res.json({ success: true, message: 'Data santri berhasil dihapus!' });
  } catch (err) {
    console.error('Error saat menghapus santri:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// Endpoint untuk menyimpan data absensi dengan validasi jam (08:00 - 14:30)
app.post('/api/attendance', async (req, res) => {
  try {
    const { studentId, status } = req.body;
    
    if (!studentId || !status) {
      return res.status(400).json({ success: false, message: 'Data absensi tidak lengkap!' });
    }

    const sekarang = new Date();
    const jam = sekarang.getHours();
    const menit = sekarang.getMinutes();
    const totalMenitSekarang = jam * 60 + menit;

    const batasBukaMenit = 8 * 60;       // 08:00
    const batasTutupMenit = 14 * 60 + 30; // 14:30

    if (totalMenitSekarang > batasTutupMenit) {
      return res.status(400).json({ success: false, message: 'Waktu absen telah ditutup (lewat jam 14.30).' });
    }

    let statusAkhir = status;
    if (totalMenitSekarang > batasBukaMenit && status === 'Hadir') {
      statusAkhir = 'Hadir (Terlambat)';
    }

    const targetAttendanceTable = schema.attendance || schema.attendances || schema.attendanceTable;
    
    await db.insert(targetAttendanceTable).values({
      studentId: parseInt(studentId),
      status: statusAkhir,
      jamMasuk: sekarang
    });

    res.json({ success: true, message: 'Absensi berhasil dicatat!' });
  } catch (err) {
    console.error('Error saat menyimpan absensi:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// Endpoint untuk mengambil data rekap kehadiran
// Endpoint untuk mengambil data rekap kehadiran hari ini
app.get('/api/absen/hari-ini', async (req, res) => {
  try {
    const targetAttendanceTable = schema.attendances || schema.attendance;
    const targetStudentTable = schema.students;

    const rekapList = await db
      .select({
        id: targetAttendanceTable.id,
        namaSiswa: targetStudentTable.fullName,
        nisn: targetStudentTable.nisn,
        jamMasuk: targetAttendanceTable.checkInTime, // Menggunakan checkInTime dari schema
        keterangan: targetAttendanceTable.status
      })
      .from(targetAttendanceTable)
      .leftJoin(targetStudentTable, eq(targetAttendanceTable.studentId, targetStudentTable.id));

    const formattedData = rekapList.map(item => ({
      ...item,
      keterangan: item.keterangan || 'Hadir'
    }));

    res.json({ success: true, data: formattedData });
  } catch (err) {
    console.error('Error saat mengambil rekap:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

app.listen(PORT, async () => {
  console.log(`🚀 Server berjalan di http://localhost:${PORT}`);
  await seedInitialData();
});