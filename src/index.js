import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { eq, sql, or } from 'drizzle-orm';
import { db } from './db/index.js';
import { students, classes, attendances } from './db/schema.js';

const app = new Hono();

// Enable CORS
app.use('*', cors());

// ==========================================
// 1. API STAF / ADMIN
// ==========================================

// Login Staf Simple
app.post('/api/staf/login', async (c) => {
  const { password } = await c.req.json();
  if (password === 'admin123' || password === 'staf123') { // Ganti dengan password staf kamu
    return c.json({ success: true, message: 'Login staf berhasil' });
  }
  return c.json({ success: false, message: 'Password staf salah!' }, 401);
});

// Get Daftar Seluruh Siswa
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

// Tambah Siswa Baru (Staf Panel)
app.post('/api/students', async (c) => {
  try {
    const { nisn, fullName, classId } = await c.req.json();

    // Pastikan NISN disimpan murni sebagai STRING (alfanumerik)
    const cleanNisn = String(nisn || '').trim();
    const cleanName = String(fullName || '').trim();
    const parsedClassId = parseInt(classId);

    if (!cleanNisn || !cleanName || isNaN(parsedClassId)) {
      return c.json({ success: false, message: 'Data tidak lengkap atau ID kelas tidak valid' }, 400);
    }

    // Cek apakah NISN sudah terdaftar
    const existing = await db
      .select()
      .from(students)
      .where(sql`LOWER(${students.nisn}) = ${cleanNisn.toLowerCase()}`)
      .limit(1);

    if (existing.length > 0) {
      return c.json({ success: false, message: 'NISN sudah terdaftar di database' }, 400);
    }

    const newStudent = await db
      .insert(students)
      .values({
        nisn: cleanNisn,
        fullName: cleanName,
        classId: parsedClassId,
      })
      .returning();

    return c.json({
      success: true,
      message: 'Siswa berhasil ditambahkan!',
      data: newStudent[0],
    });
  } catch (err) {
    return c.json({ success: false, message: 'Gagal menyimpan siswa ke database' }, 500);
  }
});

// Hapus Siswa berdasarkan ID
app.delete('/api/students/:id', async (c) => {
  try {
    const id = parseInt(c.req.param('id'));
    if (isNaN(id)) {
      return c.json({ success: false, message: 'ID siswa tidak valid' }, 400);
    }

    // Hapus absensi terkait terlebih dahulu jika ada constraint foreign key
    await db.delete(attendances).where(eq(attendances.studentId, id));
    await db.delete(students).where(eq(students.id, id));

    return c.json({ success: true, message: 'Data siswa berhasil dihapus' });
  } catch (err) {
    return c.json({ success: false, message: 'Gagal menghapus data siswa' }, 500);
  }
});


// ==========================================
// 2. API PRESENSI SISWA
// ==========================================

// Check NIS Siswa untuk Login Siswa (Mendukung Huruf & Angka)
app.get('/api/students/check', async (c) => {
  try {
    // Ambil parameter nis murni sebagai String
    const nisParam = String(c.req.query('nis') || '').trim();

    if (!nisParam) {
      return c.json({ success: false, message: 'NIS wajib diisi' }, 400);
    }

    // Cari siswa tanpa case-sensitivity (LOWER)
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
      .where(sql`LOWER(${students.nisn}) = ${nisParam.toLowerCase()}`)
      .limit(1);

    if (!result || result.length === 0) {
      return c.json({ success: false, message: 'NIS tidak ditemukan di database' }, 404);
    }

    return c.json({
      success: true,
      data: result[0],
    });
  } catch (err) {
    return c.json({ success: false, message: 'Terjadi kesalahan server saat memeriksa NIS' }, 500);
  }
});

// Submit Absensi Siswa
app.post('/api/attendance', async (c) => {
  try {
    const { studentId, status } = await c.req.json();
    const parsedStudentId = parseInt(studentId);

    if (isNaN(parsedStudentId) || !status) {
      return c.json({ success: false, message: 'Data absensi tidak valid' }, 400);
    }

    // Tanggal hari ini format YYYY-MM-DD
    const todayStr = new Date().toISOString().split('T')[0];

    // Cek apakah siswa sudah absen hari ini
    const existingAbsence = await db
      .select()
      .from(attendances)
      .where(
        sql`${attendances.studentId} = ${parsedStudentId} AND ${attendances.date} = ${todayStr}`
      )
      .limit(1);

    if (existingAbsence.length > 0) {
      return c.json({
        success: false,
        message: `Anda sudah melakukan absensi hari ini dengan status "${existingAbsence[0].status}".`,
      }, 400);
    }

    // Insert Absensi
    const newAttendance = await db
      .insert(attendances)
      .values({
        studentId: parsedStudentId,
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

// Get Rekap Absensi (Untuk Staf / Admin Rekap)
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
    return c.json({ success: false, message: 'Gagal mengambil data rekap absensi' }, 500);
  }
});


// ==========================================
// 3. API PORTAL ORANG TUA / WALI MURID
// ==========================================

// Login Wali Murid (Cek NIS + Password)
app.post('/api/ortu/login', async (c) => {
  try {
    const { nisn, nis, password } = await c.req.json();
    const cleanNis = String(nisn || nis || '').trim();
    const inputPwd = String(password || '').trim();

    if (!cleanNis || !inputPwd) {
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
      .where(sql`LOWER(${students.nisn}) = ${cleanNis.toLowerCase()}`)
      .limit(1);

    if (result.length === 0) {
      return c.json({ success: false, message: 'NIS siswa tidak ditemukan' }, 404);
    }

    const student = result[0];

    // Cek Password (default '123456')
    if (student.password !== inputPwd) {
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
    return c.json({ success: false, message: 'Gagal memproses login wali murid' }, 500);
  }
});

// Rekap Per-Siswa (Untuk Portal Orang Tua)
app.get('/api/ortu/rekap/:studentId', async (c) => {
  try {
    const studentId = parseInt(c.req.param('studentId'));
    if (isNaN(studentId)) {
      return c.json({ success: false, message: 'ID siswa tidak valid' }, 400);
    }

    const logs = await db
      .select({
        id: attendances.id,
        date: attendances.date,
        checkInTime: attendances.checkInTime,
        status: attendances.status,
      })
      .from(attendances)
      .where(eq(attendances.studentId, studentId))
      .orderBy(sql`${attendances.date} DESC`);

    return c.json({ success: true, data: logs });
  } catch (err) {
    return c.json({ success: false, message: 'Gagal mengambil log presensi' }, 500);
  }
});

export default app;