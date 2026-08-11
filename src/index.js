import 'dotenv/config'; // MENGIMPOR ENV AGAR TERHUBUNG KE NEON
import express from 'express';
import cors from 'cors';
import { db } from './db/index.js';
import { classes, students, attendances } from './db/schema.js';
import { eq, desc, gte, lte, and, or, ilike } from 'drizzle-orm';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Menyajikan file statis dari folder "public"
app.use(express.static('public'));

// 1. Endpoint untuk mengambil daftar kelas
app.get('/api/classes', async (req, res) => {
  try {
    const classesList = await db.select().from(classes);
    res.json({ success: true, data: classesList });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 2. Endpoint untuk mengambil daftar seluruh santri (Dengan nama kelas)
app.get('/api/students', async (req, res) => {
  try {
    const studentsList = await db
      .select({
        id: students.id,
        nisn: students.nisn,
        nis: students.nisn,
        fullName: students.fullName,
        classId: students.classId,
        className: classes.name
      })
      .from(students)
      .leftJoin(classes, eq(students.classId, classes.id));

    res.json({ success: true, data: studentsList });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 3. Endpoint Khusus Login / Cek NIS Siswa (Dipanggil oleh login-siswa.html)
app.get('/api/students/check', async (req, res) => {
  try {
    const { nis, nisn } = req.query;
    const searchVal = (nis || nisn || '').toString().trim();

    if (!searchVal) {
      return res.status(400).json({ success: false, message: 'NIS wajib diisi!' });
    }

    const studentList = await db
      .select()
      .from(students)
      .where(eq(students.nisn, searchVal));

    if (studentList.length === 0) {
      return res.status(404).json({ success: false, message: 'NIS tidak ditemukan di database!' });
    }

    const student = studentList[0];
    res.json({
      success: true,
      data: {
        id: student.id,
        nis: student.nisn,
        nisn: student.nisn,
        fullName: student.fullName,
        classId: student.classId
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 4. Endpoint untuk menyimpan data santri baru
app.post('/api/students', async (req, res) => {
  try {
    const { nisn, nis, fullName, classId } = req.body;
    const inputNis = (nisn || nis || '').toString().trim();

    if (!inputNis || !fullName || !classId) {
      return res.status(400).json({ success: false, message: 'Semua kolom wajib diisi!' });
    }

    const existingClass = await db.select().from(classes).where(eq(classes.id, parseInt(classId)));
    
    if (existingClass.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: `Kelas dengan ID ${classId} tidak ditemukan. Silakan pilih kelas yang valid!` 
      });
    }

    await db.insert(students).values({
      nisn: inputNis,
      fullName: fullName,
      classId: parseInt(classId) 
    });

    res.json({ success: true, message: 'Data siswa berhasil disimpan ke database!' });
  } catch (err) {
    console.error('Error saat menyimpan siswa:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// 5. Endpoint untuk menghapus data santri beserta riwayat absensinya
app.delete('/api/students/:id', async (req, res) => {
  try {
    const studentId = parseInt(req.params.id);
    
    // Hapus relasi di tabel attendances terlebih dahulu
    await db.delete(attendances).where(eq(attendances.studentId, studentId));
    
    // Hapus data siswa di tabel students
    await db.delete(students).where(eq(students.id, studentId));
    
    res.json({ success: true, message: 'Data siswa berhasil dihapus!' });
  } catch (err) {
    console.error('Error saat menghapus siswa:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// 6. Endpoint simpan absensi
app.post('/api/attendance', async (req, res) => {
  try {
    const { studentId, nis, nisn, status, note, notes } = req.body;

    let validStudentId = studentId;
    const searchVal = (nis || nisn || '').toString().trim();

    if (!validStudentId && searchVal) {
      const foundStudent = await db.select().from(students).where(eq(students.nisn, searchVal));
      if (foundStudent.length > 0) {
        validStudentId = foundStudent[0].id;
      }
    }

    if (!validStudentId || !status) {
      return res.status(400).json({ success: false, message: 'Data absensi/Siswa tidak valid!' });
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

    await db.insert(attendances).values({
      studentId: parseInt(validStudentId),
      status: statusAkhir,
      checkInTime: sekarang,
      notes: notes || note || ''
    });

    res.json({ success: true, message: 'Absensi berhasil dicatat!' });
  } catch (err) {
    console.error('Error saat menyimpan absensi:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// 7. Endpoint Rekap Absensi (Untuk Staf / Admin)
app.get('/api/attendance', async (req, res) => {
  try {
    const { search, date } = req.query;

    let conditions = [];

    if (date) {
      const startOfDay = new Date(`${date}T00:00:00.000Z`);
      const endOfDay = new Date(`${date}T23:59:59.999Z`);
      conditions.push(
        and(
          gte(attendances.checkInTime, startOfDay),
          lte(attendances.checkInTime, endOfDay)
        )
      );
    }

    if (search) {
      const keyword = `%${search.trim()}%`;
      conditions.push(
        or(
          ilike(students.fullName, keyword),
          ilike(students.nisn, keyword)
        )
      );
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const rekapList = await db
      .select({
        id: attendances.id,
        studentName: students.fullName,
        nisn: students.nisn,
        nis: students.nisn,
        classId: students.classId,
        className: classes.name,
        date: attendances.checkInTime,
        status: attendances.status
      })
      .from(attendances)
      .leftJoin(students, eq(attendances.studentId, students.id))
      .leftJoin(classes, eq(students.classId, classes.id))
      .where(whereClause)
      .orderBy(desc(attendances.checkInTime));

    res.json({ success: true, data: rekapList });
  } catch (err) {
    console.error('Error saat mengambil rekap:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// 8. API Login Orang Tua
app.post('/api/ortu/login', async (req, res) => {
  try {
    const { nisn, nis, password } = req.body;
    const searchVal = (nisn || nis || '').toString().trim();

    if (!searchVal || !password) {
      return res.status(400).json({ success: false, message: 'NIS dan Password wajib diisi!' });
    }

    const studentList = await db
      .select()
      .from(students)
      .where(eq(students.nisn, searchVal));
    
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
      const cls = await db.select().from(classes).where(eq(classes.id, student.classId));
      if (cls.length > 0) className = cls[0].name;
    }

    res.json({
      success: true,
      data: {
        id: student.id,
        nisn: student.nisn,
        nis: student.nisn,
        fullName: student.fullName,
        className: className
      }
    });
  } catch (err) {
    console.error('Error login ortu:', err);
    res.status(500).json({ success: false, message: 'Terjadi kesalahan pada server.' });
  }
});

// 9. API Rekap Absensi 1 Santri (KHUSUS UNTUK WALI-MURID.HTML)
app.get('/api/ortu/rekap/:studentId', async (req, res) => {
  try {
    const studentId = parseInt(req.params.studentId);

    const logs = await db
      .select({
        id: attendances.id,
        checkInTime: attendances.checkInTime,
        status: attendances.status,
        notes: attendances.notes
      })
      .from(attendances)
      .where(eq(attendances.studentId, studentId))
      .orderBy(desc(attendances.checkInTime));

    res.json({ success: true, data: logs });
  } catch (err) {
    console.error('Error get rekap ortu:', err);
    res.status(500).json({ success: false, message: 'Gagal mengambil riwayat absensi siswa.' });
  }
});

// Jalankan Server Lokal
if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log(`🚀 Server berjalan di http://localhost:${PORT}`);
  });
}

export default app;