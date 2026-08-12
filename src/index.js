import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { eq } from 'drizzle-orm';
import { db } from './db/index.js';
import { students, classes, attendances } from './db/schema.js';

const app = new Hono();

app.use('/api/*', cors());

// API STAF / ADMIN
app.post('/api/staf/login', async (c) => {
  const { password } = await c.req.json();
  if (password === 'admin123' || password === 'staf123') {
    return c.json({ success: true, message: 'Login staf berhasil' });
  }
  return c.json({ success: false, message: 'Password staf salah!' }, 401);
});

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

app.post('/api/students', async (c) => {
  try {
    const { nisn, fullName, classId } = await c.req.json();

    if (!nisn || !fullName || !classId) {
      return c.json({ success: false, message: 'Data tidak lengkap' }, 400);
    }

    const existing = await db.select().from(students).where(eq(students.nisn, nisn)).limit(1);
    if (existing.length > 0) {
      return c.json({ success: false, message: 'NISN sudah terdaftar' }, 400);
    }

    const newStudent = await db
      .insert(students)
      .values({
        nisn: nisn,
        fullName: fullName,
        classId: parseInt(classId),
      })
      .returning();

    return c.json({
      success: true,
      message: 'Siswa berhasil ditambahkan!',
      data: newStudent[0],
    });
  } catch (err) {
    return c.json({ success: false, message: 'Gagal menyimpan siswa' }, 500);
  }
});

app.delete('/api/students/:id', async (c) => {
  try {
    const id = parseInt(c.req.param('id'));
    await db.delete(attendances).where(eq(attendances.studentId, id));
    await db.delete(students).where(eq(students.id, id));

    return c.json({ success: true, message: 'Data siswa berhasil dihapus' });
  } catch (err) {
    return c.json({ success: false, message: 'Gagal menghapus data siswa' }, 500);
  }
});

// API PRESENSI SISWA
app.get('/api/students/check', async (c) => {
  try {
    const nis = c.req.query('nis');

    if (!nis) {
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
      .where(eq(students.nisn, nis))
      .limit(1);

    if (!result || result.length === 0) {
      return c.json({ success: false, message: 'NIS tidak ditemukan' }, 404);
    }

    return c.json({
      success: true,
      data: result[0],
    });
  } catch (err) {
    return c.json({ success: false, message: 'Terjadi kesalahan server' }, 500);
  }
});

app.post('/api/attendance', async (c) => {
  try {
    const { studentId, status } = await c.req.json();
    const todayStr = new Date().toISOString().split('T')[0];

    const existingAbsence = await db
      .select()
      .from(attendances)
      .where(
        eq(attendances.studentId, parseInt(studentId))
      )
      .limit(1);

    const isAlreadyPresent = existingAbsence.find((a) => a.date === todayStr);

    if (isAlreadyPresent) {
      return c.json({
        success: false,
        message: `Anda sudah melakukan absensi hari ini dengan status "${isAlreadyPresent.status}".`,
      }, 400);
    }

    const newAttendance = await db
      .insert(attendances)
      .values({
        studentId: parseInt(studentId),
        date: todayStr,
        status: status,
      })
      .returning();

    return c.json({
      success: true,
      message: 'Absensi berhasil dicatat!',
      data: newAttendance[0],
    });
  } catch (err) {
    return c.json({ success: false, message: 'Gagal mencatat absensi' }, 500);
  }
});

app.get('/api/attendance', async (c) => {
  try {
    const dateParam = c.req.query('date') || new Date().toISOString().split('T')[0];

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
    return c.json({ success: false, message: 'Gagal mengambil data rekap' }, 500);
  }
});

// API PORTAL ORANG TUA / WALI MURID
app.post('/api/ortu/login', async (c) => {
  try {
    const { nisn, password } = await c.req.json();

    if (!nisn || !password) {
      return c.json({ success: false, message: 'NISN dan Password harus diisi' }, 400);
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
      .where(eq(students.nisn, nisn))
      .limit(1);

    if (result.length === 0) {
      return c.json({ success: false, message: 'NISN siswa tidak ditemukan' }, 404);
    }

    const student = result[0];

    if (student.password !== password) {
      return c.json({ success: false, message: 'Password salah!' }, 401);
    }

    return c.json({
      success: true,
      message: 'Login Wali Murid berhasil',
      data: {
        id: student.id,
        nisn: student.nisn,
        fullName: student.fullName,
        classId: student.classId,
        className: student.className,
      },
    });
  } catch (err) {
    return c.json({ success: false, message: 'Gagal memproses login' }, 500);
  }
});

app.get('/api/ortu/rekap/:studentId', async (c) => {
  try {
    const studentId = parseInt(c.req.param('studentId'));

    const logs = await db
      .select({
        id: attendances.id,
        date: attendances.date,
        checkInTime: attendances.checkInTime,
        status: attendances.status,
      })
      .from(attendances)
      .where(eq(attendances.studentId, studentId));

    return c.json({ success: true, data: logs });
  } catch (err) {
    return c.json({ success: false, message: 'Gagal mengambil log presensi' }, 500);
  }
});

export default app;