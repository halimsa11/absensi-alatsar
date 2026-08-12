import 'dotenv/config';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { eq, and, desc } from 'drizzle-orm';
import { db } from './db/index.js';
import { students, classes, attendances } from './db/schema.js';

const app = new Hono();

// Middleware CORS
app.use('*', cors());

// Serve Static Files dari folder 'public'
app.use('/*', serveStatic({ root: './public' }));

// Helper Format Tanggal (YYYY-MM-DD)
const getTodayDateStr = () => {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// ==========================================
// 1. API STAF / ADMIN
// ==========================================

// Login Staf
app.post('/api/staf/login', async (c) => {
  try {
    const { password } = await c.req.json();
    if (password === 'admin123' || password === 'staf123') {
      return c.json({ success: true, message: 'Login staf berhasil' });
    }
    return c.json({ success: false, message: 'Password staf salah!' }, 401);
  } catch (err) {
    return c.json({ success: false, message: 'Request tidak valid' }, 400);
  }
});

// Get All Students
app.get('/api/students', async (c) => {
  try {
    const dataSiswa = await db
      .select({
        id: students.id,
        nisn: students.nisn,
        fullName: students.fullName,
        classId: students.classId,
        className: classes.name,
      })
      .from(students)
      .leftJoin(classes, eq(students.classId, classes.id));

    return c.json({ success: true, data: dataSiswa });
  } catch (err) {
    return c.json({ success: false, message: 'Gagal memuat data siswa' }, 500);
  }
});

// ADD STUDENT (POST /api/students) -> YANG BIKIN ERROR 404 KEMARIN
app.post('/api/students', async (c) => {
  try {
    const { nisn, fullName, classId } = await c.req.json();

    if (!nisn || !fullName || !classId) {
      return c.json({ success: false, message: 'NIS, Nama Lengkap, dan Kelas wajib diisi!' }, 400);
    }

    // Cek apakah NISN sudah terdaftar
    const existingStudent = await db
      .select()
      .from(students)
      .where(eq(students.nisn, String(nisn).trim()))
      .limit(1);

    if (existingStudent.length > 0) {
      return c.json({ success: false, message: 'NIS sudah terdaftar di database!' }, 400);
    }

    // Insert Siswa Baru
    const newStudent = await db
      .insert(students)
      .values({
        nisn: String(nisn).trim(),
        fullName: String(fullName).trim(),
        classId: parseInt(classId),
      })
      .returning();

    return c.json({
      success: true,
      message: 'Siswa berhasil ditambahkan!',
      data: newStudent[0],
    });
  } catch (err) {
    console.error('Error Add Student:', err);
    return c.json({ success: false, message: 'Gagal menambahkan data siswa ke server.' }, 500);
  }
});

// DELETE STUDENT (DELETE /api/students/:id)
app.delete('/api/students/:id', async (c) => {
  try {
    const studentId = parseInt(c.req.param('id'));

    if (isNaN(studentId)) {
      return c.json({ success: false, message: 'ID siswa tidak valid' }, 400);
    }

    // Hapus data absensi terkait terlebih dahulu (agar tidak terpukul constraint Foreign Key)
    await db.delete(attendances).where(eq(attendances.studentId, studentId));

    // Hapus data siswa
    await db.delete(students).where(eq(students.id, studentId));

    return c.json({ success: true, message: 'Data siswa berhasil dihapus' });
  } catch (err) {
    console.error('Error Delete Student:', err);
    return c.json({ success: false, message: 'Gagal menghapus data siswa' }, 500);
  }
});

// ==========================================
// 2. API PRESENSI SISWA
// ==========================================

// Cek NIS Siswa untuk Login
app.get('/api/students/check', async (c) => {
  try {
    const nisParam = c.req.query('nis');

    if (!nisParam) {
      return c.json({ success: false, message: 'NIS wajib diisi' }, 400);
    }

    const result = await db
      .select({
        id: students.id,
        nisn: students.nisn,
        fullName: students.fullName,
        classId: students.classId,
        className: classes.name,
      })
      .from(students)
      .leftJoin(classes, eq(students.classId, classes.id))
      .where(eq(students.nisn, String(nisParam).trim()))
      .limit(1);

    if (!result || result.length === 0) {
      return c.json({ success: false, message: 'NIS tidak ditemukan' }, 404);
    }

    return c.json({ success: true, data: result[0] });
  } catch (err) {
    return c.json({ success: false, message: 'Terjadi kesalahan server saat memeriksa NIS' }, 500);
  }
});

// Simpan Absensi Siswa
app.post('/api/attendance', async (c) => {
  try {
    const { studentId, status } = await c.req.json();
    const parsedStudentId = parseInt(studentId);

    if (isNaN(parsedStudentId) || !status) {
      return c.json({ success: false, message: 'Data absensi tidak valid' }, 400);
    }

    const todayStr = getTodayDateStr();

    // Cek apakah siswa SUDAH ABSEN HARI INI
    const existingAbsence = await db
      .select()
      .from(attendances)
      .where(
        and(
          eq(attendances.studentId, parsedStudentId),
          eq(attendances.date, todayStr)
        )
      )
      .limit(1);

    if (existingAbsence.length > 0) {
      return c.json({
        success: false,
        message: `Anda sudah melakukan absensi hari ini dengan status "${existingAbsence[0].status}".`,
      }, 400);
    }

    // Insert data absensi baru
    const newAttendance = await db
      .insert(attendances)
      .values({
        studentId: parsedStudentId,
        date: todayStr,
        status: status,
      })
      .returning();

    return c.json({ success: true, message: 'Absensi berhasil dicatat!', data: newAttendance[0] });
  } catch (err) {
    return c.json({ success: false, message: 'Gagal mencatat absensi' }, 500);
  }
});

// Get Rekap Absensi Berdasarkan Tanggal
app.get('/api/attendance', async (c) => {
  try {
    const dateParam = c.req.query('date') || getTodayDateStr();

    const records = await db
      .select({
        id: attendances.id,
        studentId: attendances.studentId,
        nisn: students.nisn,
        studentName: students.fullName,
        classId: students.classId,
        className: classes.name,
        date: attendances.date,
        checkInTime: attendances.checkInTime,
        status: attendances.status,
      })
      .from(attendances)
      .innerJoin(students, eq(attendances.studentId, students.id))
      .leftJoin(classes, eq(students.classId, classes.id))
      .where(eq(attendances.date, dateParam));

    return c.json({ success: true, data: records });
  } catch (err) {
    return c.json({ success: false, message: 'Gagal mengambil data rekap absensi' }, 500);
  }
});

// Jalankan Server di Port 3000
serve({
  fetch: app.fetch,
  port: 3000
}, (info) => {
  console.log(`Server backend menyala di http://127.0.0.1:${info.port}`);
});

export default app;