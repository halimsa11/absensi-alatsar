import 'dotenv/config'; // MENGIMPOR ENV AGAR TERHUBUNG KE NEON
import express from 'express';
import cors from 'cors';
import { db } from './db/index.js';
import * as schema from './db/schema.js';
import { eq, desc, gte, lte, and } from 'drizzle-orm';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Menyajikan file statis dari folder "public" (tempat index.html, ortu.html, dll. berada)
// Jika file HTML kamu ada di root project, ubah 'public' menjadi '.'
app.use(express.static('public'));

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

    const targetClassTable = schema.classes;
    const targetStudentTable = schema.students;

    const existingClass = await db.select().from(targetClassTable).where(eq(targetClassTable.id, parseInt(classId)));
    
    if (existingClass.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: `Kelas dengan ID ${classId} tidak ditemukan. Silakan pilih kelas yang valid!` 
      });
    }

    await db.insert(targetStudentTable).values({
      nisn: nisn.toString(),
      fullName: fullName,
      classId: parseInt(classId) 
    });

    res.json({ success: true, message: 'Data siswa berhasil disimpan ke database!' });
  } catch (err) {
    console.error('Error saat menyimpan siswa:', err);
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
    
    res.json({ success: true, message: 'Data siswa berhasil dihapus!' });
  } catch (err) {
    console.error('Error saat menghapus siswa:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// Endpoint untuk menyimpan data absensi
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
      checkInTime: sekarang
    });

    res.json({ success: true, message: 'Absensi berhasil dicatat!' });
  } catch (err) {
    console.error('Error saat menyimpan absensi:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// Endpoint untuk mengambil data rekap kehadiran
app.get('/api/absen/hari-ini', async (req, res) => {
  try {
    const targetAttendanceTable = schema.attendances || schema.attendance || schema.attendanceTable;
    const targetStudentTable = schema.students || schema.studentsTable;
    const targetClassTable = schema.classes || schema.classesTable;
    const { date } = req.query;

    let whereCondition = undefined;

    if (date) {
      const startOfDay = new Date(`${date}T00:00:00.000Z`);
      const endOfDay = new Date(`${date}T23:59:59.999Z`);
      whereCondition = and(
        gte(targetAttendanceTable.checkInTime, startOfDay),
        lte(targetAttendanceTable.checkInTime, endOfDay)
      );
    }

    const rekapList = await db
      .select({
        id: targetAttendanceTable.id,
        namaSiswa: targetStudentTable.fullName,
        nisn: targetStudentTable.nisn,
        classId: targetStudentTable.classId,
        className: targetClassTable.name,
        jamMasuk: targetAttendanceTable.checkInTime,
        keterangan: targetAttendanceTable.status
      })
      .from(targetAttendanceTable)
      .leftJoin(targetStudentTable, eq(targetAttendanceTable.studentId, targetStudentTable.id))
      .leftJoin(targetClassTable, eq(targetStudentTable.classId, targetClassTable.id))
      .where(whereCondition)
      .orderBy(desc(targetAttendanceTable.checkInTime));

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

// API Login Orang Tua
app.post('/api/ortu/login', async (req, res) => {
  try {
    const { nisn, password } = req.body;

    if (!nisn || !password) {
      return res.status(400).json({ success: false, message: 'NIS dan Password wajib diisi!' });
    }

    const targetStudentTable = schema.students || schema.studentsTable;
    const targetClassTable = schema.classes || schema.classesTable;

    const studentList = await db.select().from(targetStudentTable).where(eq(targetStudentTable.nisn, nisn.toString().trim()));
    
    if (studentList.length === 0) {
      return res.status(404).json({ success: false, message: 'NIS siswa tidak ditemukan!' });
    }

    const student = studentList[0];
    const validPassword = student.password || '123456';

    if (password !== validPassword) {
      return res.status(401).json({ success: false, message: 'Password salah!' });
    }

    let className = 'Kelas -';
    if (student.classId) {
      const cls = await db.select().from(targetClassTable).where(eq(targetClassTable.id, student.classId));
      if (cls.length > 0) className = cls[0].name;
    }

    res.json({
      success: true,
      data: {
        id: student.id,
        nisn: student.nisn,
        fullName: student.fullName,
        className: className
      }
    });
  } catch (err) {
    console.error('Error login ortu:', err);
    res.status(500).json({ success: false, message: 'Terjadi kesalahan pada server.' });
  }
});

// API Riwayat Absensi Khusus 1 Santri (Untuk Akses Orang Tua)
app.get('/api/ortu/rekap/:studentId', async (req, res) => {
  try {
    const { studentId } = req.params;
    const targetAttendanceTable = schema.attendances || schema.attendance || schema.attendanceTable;

    const logs = await db.select({
      id: targetAttendanceTable.id,
      checkInTime: targetAttendanceTable.checkInTime,
      status: targetAttendanceTable.status
    })
    .from(targetAttendanceTable)
    .where(eq(targetAttendanceTable.studentId, parseInt(studentId)))
    .orderBy(desc(targetAttendanceTable.checkInTime));

    res.json({ success: true, data: logs });
  } catch (err) {
    console.error('Error rekap ortu:', err);
    res.status(500).json({ success: false, message: 'Gagal mengambil riwayat absensi.' });
  }
});

// Hanya jalankan app.listen di lingkungan non-produksi (lokal)
if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log(`🚀 Server berjalan di http://localhost:${PORT}`);
  });
}

export default app;