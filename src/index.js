import 'dotenv/config';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { eq, and, desc } from 'drizzle-orm';
import { db } from './db/index.js';
import { students, classes, attendances } from './db/schema.js';

const app = new Hono();

app.use('*', cors());
app.use('/*', serveStatic({ root: './public' }));

// KOORDINAT SEKOLAH (Tanuragan Raya, Gonilan, Kartasura)
const SEKOLAH_LAT = -7.555812;
const SEKOLAH_LON = 110.765618;
const MAX_RADIUS_METER = 50; // Radius batas maksimal diubah menjadi 50 Meter

// Helper Menghitung Jarak GPS (Formula Haversine dalam Meter)
function calculateDistanceMeter(lat1, lon1, lat2, lon2) {
  const R = 6371000; // Radius bumi dalam meter
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * 
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
    
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // Hasil jarak dalam meter
}

const getTodayDateStr = () => {
  const nowWib = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }));
  const year = nowWib.getFullYear();
  const month = String(nowWib.getMonth() + 1).padStart(2, '0');
  const day = String(nowWib.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// ==========================================
// API STAF / ADMIN - KELOLA SISWA
// ==========================================

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
      return c.json({ success: false, message: 'NIS, Nama Lengkap, dan Kelas wajib diisi!' }, 400);
    }

    const existingStudent = await db
      .select()
      .from(students)
      .where(eq(students.nisn, String(nisn).trim()))
      .limit(1);

    if (existingStudent.length > 0) {
      return c.json({ success: false, message: 'NIS sudah terdaftar di database!' }, 400);
    }

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
    return c.json({ success: false, message: 'Gagal menambahkan data siswa' }, 500);
  }
});

app.put('/api/students/:id', async (c) => {
  try {
    const studentId = parseInt(c.req.param('id'));
    const { nisn, fullName, classId } = await c.req.json();

    if (isNaN(studentId)) {
      return c.json({ success: false, message: 'ID siswa tidak valid' }, 400);
    }

    if (!nisn || !fullName || !classId) {
      return c.json({ success: false, message: 'NIS, Nama Lengkap, dan Kelas wajib diisi!' }, 400);
    }

    const updatedStudent = await db
      .update(students)
      .set({
        nisn: String(nisn).trim(),
        fullName: String(fullName).trim(),
        classId: parseInt(classId),
      })
      .where(eq(students.id, studentId))
      .returning();

    if (updatedStudent.length === 0) {
      return c.json({ success: false, message: 'Data siswa tidak ditemukan' }, 404);
    }

    return c.json({
      success: true,
      message: 'Data siswa berhasil diperbarui!',
      data: updatedStudent[0],
    });
  } catch (err) {
    console.error('Error Update Student:', err);
    return c.json({ success: false, message: 'Gagal memperbarui data siswa' }, 500);
  }
});

app.delete('/api/students/:id', async (c) => {
  try {
    const studentId = parseInt(c.req.param('id'));

    if (isNaN(studentId)) {
      return c.json({ success: false, message: 'ID siswa tidak valid' }, 400);
    }

    await db.delete(attendances).where(eq(attendances.studentId, studentId));
    await db.delete(students).where(eq(students.id, studentId));

    return c.json({ success: true, message: 'Data siswa berhasil dihapus' });
  } catch (err) {
    return c.json({ success: false, message: 'Gagal menghapus data siswa' }, 500);
  }
});

// ==========================================
// API PRESENSI & REKAP
// ==========================================

app.get('/api/students/check', async (c) => {
  try {
    const nisParam = c.req.query('nis');
    if (!nisParam) return c.json({ success: false, message: 'NIS wajib diisi' }, 400);

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
    return c.json({ success: false, message: 'Terjadi kesalahan server' }, 500);
  }
});

// Simpan Presensi dengan Cek Lokasi GPS
app.post('/api/attendance', async (c) => {
  try {
    const { studentId, latitude, longitude } = await c.req.json();
    const parsedStudentId = parseInt(studentId);

    if (isNaN(parsedStudentId)) {
      return c.json({ success: false, message: 'ID siswa tidak valid' }, 400);
    }

    // 1. VALIDASI GPS LOKASI
    if (!latitude || !longitude) {
      return c.json({ 
        success: false, 
        message: 'Akses lokasi (GPS) wajib diaktifkan untuk melakukan presensi!' 
      }, 400);
    }

    const jarak = calculateDistanceMeter(SEKOLAH_LAT, SEKOLAH_LON, parseFloat(latitude), parseFloat(longitude));

    if (jarak > MAX_RADIUS_METER) {
      return c.json({
        success: false,
        message: `Presensi ditolak! Anda berada di luar area sekolah (${Math.round(jarak)} meter dari lokasi sekolah). Maksimal radius: ${MAX_RADIUS_METER} meter.`,
      }, 400);
    }

    // 2. VALIDASI JAM OPERASIONAL (07.00 - 14.30 WIB)
    const nowWib = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }));
    const currentMinutes = nowWib.getHours() * 60 + nowWib.getMinutes();

    const startPresensi = 7 * 60;       // 07:00 WIB
    const closePresensi = 14 * 60 + 30; // 14:30 WIB

    if (currentMinutes < startPresensi || currentMinutes > closePresensi) {
      return c.json({
        success: false,
        message: 'Presensi ditolak! Jam presensi dibuka dari pukul 07.00 sampai 14.30 WIB.',
      }, 400);
    }

    const statusPresensi = 'Hadir';
    const todayStr = getTodayDateStr();

    // 3. CEK DUPLIKASI ABSENSI HARI INI
    const existingAbsence = await db
      .select()
      .from(attendances)
      .where(and(eq(attendances.studentId, parsedStudentId), eq(attendances.date, todayStr)))
      .limit(1);

    if (existingAbsence.length > 0) {
      return c.json({
        success: false,
        message: `Kamu sudah melakukan absensi hari ini dengan status "${existingAbsence[0].status}".`,
      }, 400);
    }

    const newAttendance = await db
      .insert(attendances)
      .values({
        studentId: parsedStudentId,
        date: todayStr,
        status: statusPresensi,
      })
      .returning();

    return c.json({ success: true, message: 'Absensi berhasil dicatat!', data: newAttendance[0] });
  } catch (err) {
    console.error('Error Attendance:', err);
    return c.json({ success: false, message: 'Gagal mencatat absensi' }, 500);
  }
});

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
    return c.json({ success: false, message: 'Gagal mengambil data rekap' }, 500);
  }
});

app.get('/api/ortu/rekap/:studentId', async (c) => {
  try {
    const studentId = parseInt(c.req.param('studentId'));
    if (isNaN(studentId)) return c.json({ success: false, message: 'ID siswa tidak valid' }, 400);

    const records = await db
      .select({
        id: attendances.id,
        studentId: attendances.studentId,
        date: attendances.date,
        checkInTime: attendances.checkInTime,
        status: attendances.status,
      })
      .from(attendances)
      .where(eq(attendances.studentId, studentId))
      .orderBy(desc(attendances.date));

    return c.json({ success: true, data: records });
  } catch (err) {
    return c.json({ success: false, message: 'Gagal mengambil data rekap' }, 500);
  }
});

serve({ fetch: app.fetch, port: 3000 }, (info) => {
  console.log(`Server menyala di http://127.0.0.1:${info.port}`);
});

export default app;