import 'dotenv/config';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { serve } from '@hono/node-server';
import { eq, desc } from 'drizzle-orm';
import { db } from './db/index.js';
import { students, classes, attendances } from './db/schema.js';

const app = new Hono();

app.use('*', cors());

const getTodayDateStr = () => {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// API Staf Login
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

// API Get All Students
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

// API Cek NIS Siswa (Kembali ke Pencarian Angka Murni)
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
      .where(eq(students.nisn, String(nisParam)))
      .limit(1);

    if (!result || result.length === 0) {
      return c.json({ success: false, message: 'NIS tidak ditemukan' }, 404);
    }

    return c.json({ success: true, data: result[0] });
  } catch (err) {
    return c.json({ success: false, message: 'Terjadi kesalahan server saat memeriksa NIS' }, 500);
  }
});

// API Simpan Absensi
app.post('/api/attendance', async (c) => {
  try {
    const { studentId, status } = await c.req.json();
    const parsedStudentId = parseInt(studentId);

    if (isNaN(parsedStudentId) || !status) {
      return c.json({ success: false, message: 'Data absensi tidak valid' }, 400);
    }

    const todayStr = getTodayDateStr();

    const existingAbsence = await db
      .select()
      .from(attendances)
      .where(eq(attendances.studentId, parsedStudentId))
      .limit(1);

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

// API Login Wali Murid
app.post('/api/ortu/login', async (c) => {
  try {
    const { nisn, password } = await c.req.json();

    if (!nisn || !password) {
      return c.json({ success: false, message: 'NIS dan Password harus diisi' }, 400);
    }

    const result = await db
      .select({
        id: students.id,
        nisn: students.nisn,
        fullName: students.fullName,
        classId: students.classId,
        className: classes.name,
        password: students.password,
      })
      .from(students)
      .leftJoin(classes, eq(students.classId, classes.id))
      .where(eq(students.nisn, String(nisn)))
      .limit(1);

    if (result.length === 0) {
      return c.json({ success: false, message: 'NIS siswa tidak ditemukan' }, 404);
    }

    const student = result[0];

    if (student.password !== String(password)) {
      return c.json({ success: false, message: 'Password salah!' }, 401);
    }

    return c.json({
      success: true,
      message: 'Login Wali Murid berhasil',
      data: student,
    });
  } catch (err) {
    return c.json({ success: false, message: 'Gagal memproses login' }, 500);
  }
});

serve({
  fetch: app.fetch,
  port: 3001
}, (info) => {
  console.log(`Server backend menyala di http://127.0.0.1:${info.port}`);
});

export default app;