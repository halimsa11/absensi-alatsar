import 'dotenv/config';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { eq, and, desc } from 'drizzle-orm';
import { db } from './db/index.js';
import { students, classes, attendances } from './db/schema.js';
import { jwt, sign } from 'hono/jwt';

const app = new Hono();

app.use('*', cors());
app.use('/*', serveStatic({ root: './public' }));

// KONFIGURASI KEAMANAN & GPS
const JWT_SECRET = process.env.JWT_SECRET || 'R4h4s14_4dm1n_4l4ts4r_!@#';
const SEKOLAH_LAT = -7.555812;
const SEKOLAH_LON = 110.765618;
const MAX_RADIUS_METER = 50; // Radius maksimal GPS (50 Meter)

// Middleware JWT untuk Admin
const checkAdmin = jwt({ secret: JWT_SECRET, alg: 'HS256' });

// Helper Menghitung Jarak GPS (Formula Haversine dalam Meter)
function calculateDistanceMeter(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * 
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

const getTodayDateStr = () => {
  const nowWib = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }));
  const year = nowWib.getFullYear();
  const month = String(nowWib.getMonth() + 1).padStart(2, '0');
  const day = String(nowWib.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// ==========================================
// 1. API STAF / ADMIN (DILINDUNGI JWT)
// ==========================================
app.post('/api/staf/login', async (c) => {
  try {
    const { password } = await c.req.json();
    const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';

    if (password === adminPassword || password === 'staf123') {
      const token = await sign({ role: 'admin', exp: Math.floor(Date.now() / 1000) + (60 * 60 * 24) }, JWT_SECRET);
      return c.json({ success: true, message: 'Login berhasil', token });
    }
    return c.json({ success: false, message: 'Password salah!' }, 401);
  } catch (err) {
    return c.json({ success: false, message: 'Request tidak valid' }, 400);
  }
});

app.get('/api/students', checkAdmin, async (c) => {
  try {
    const dataSiswa = await db.select({
      id: students.id, nisn: students.nisn, fullName: students.fullName, classId: students.classId, className: classes.name,
    }).from(students).leftJoin(classes, eq(students.classId, classes.id));
    return c.json({ success: true, data: dataSiswa });
  } catch (err) { return c.json({ success: false }, 500); }
});

app.post('/api/students', checkAdmin, async (c) => {
  try {
    const { nisn, fullName, classId } = await c.req.json();
    const existing = await db.select().from(students).where(eq(students.nisn, String(nisn).trim())).limit(1);
    if (existing.length > 0) return c.json({ success: false, message: 'NIS sudah terdaftar!' }, 400);
    const newStudent = await db.insert(students).values({ nisn: String(nisn).trim(), fullName: String(fullName).trim(), classId: parseInt(classId) }).returning();
    return c.json({ success: true, data: newStudent[0] });
  } catch (err) { return c.json({ success: false }, 500); }
});

app.put('/api/students/:id', checkAdmin, async (c) => {
  try {
    const id = parseInt(c.req.param('id'));
    const { nisn, fullName, classId } = await c.req.json();
    const updated = await db.update(students).set({ nisn: String(nisn).trim(), fullName: String(fullName).trim(), classId: parseInt(classId) }).where(eq(students.id, id)).returning();
    return c.json({ success: true, data: updated[0] });
  } catch (err) { return c.json({ success: false }, 500); }
});

app.delete('/api/students/:id', checkAdmin, async (c) => {
  try {
    const id = parseInt(c.req.param('id'));
    await db.delete(attendances).where(eq(attendances.studentId, id));
    await db.delete(students).where(eq(students.id, id));
    return c.json({ success: true });
  } catch (err) { return c.json({ success: false }, 500); }
});

app.get('/api/attendance', checkAdmin, async (c) => {
  try {
    const dateParam = c.req.query('date') || getTodayDateStr();
    const records = await db.select({
      id: attendances.id, studentId: attendances.studentId, nisn: students.nisn, studentName: students.fullName, className: classes.name,
      date: attendances.date, checkInTime: attendances.checkInTime, status: attendances.status,
    }).from(attendances).innerJoin(students, eq(attendances.studentId, students.id)).leftJoin(classes, eq(students.classId, classes.id)).where(eq(attendances.date, dateParam));
    return c.json({ success: true, data: records });
  } catch (err) { return c.json({ success: false }, 500); }
});


// ==========================================
// 2. API PUBLIK (SANTRI & WALI MURID)
// ==========================================
app.get('/api/students/check', async (c) => {
  try {
    const nisParam = c.req.query('nis');
    if (!nisParam) return c.json({ success: false, message: 'NIS wajib diisi' }, 400);
    const result = await db.select({
      id: students.id, nisn: students.nisn, fullName: students.fullName, classId: students.classId, className: classes.name,
    }).from(students).leftJoin(classes, eq(students.classId, classes.id)).where(eq(students.nisn, String(nisParam).trim())).limit(1);
    
    if (result.length === 0) return c.json({ success: false, message: 'NIS tidak ditemukan' }, 404);
    return c.json({ success: true, data: result[0] });
  } catch (err) { return c.json({ success: false }, 500); }
});

app.get('/api/students/check-attendance', async (c) => {
  try {
    const studentId = parseInt(c.req.query('studentId'));
    const date = c.req.query('date');
    if (!studentId || !date) return c.json({ success: false });
    const existing = await db.select().from(attendances).where(and(eq(attendances.studentId, studentId), eq(attendances.date, date))).limit(1);
    return c.json({ success: true, data: existing.length > 0 ? existing[0] : null });
  } catch (err) { return c.json({ success: false }, 500); }
});

// Proses Kirim Presensi GPS, Validasi Jam, & Penentuan Status Hadir/Terlambat
app.post('/api/attendance', async (c) => {
  try {
    const { studentId, latitude, longitude } = await c.req.json();
    const parsedStudentId = parseInt(studentId);
    if (isNaN(parsedStudentId)) return c.json({ success: false, message: 'ID siswa tidak valid' }, 400);

    if (!latitude || !longitude) return c.json({ success: false, message: 'Akses lokasi (GPS) wajib diaktifkan!' }, 400);

    // 1. Cek Radius Geofencing GPS (50 Meter)
    const jarak = calculateDistanceMeter(SEKOLAH_LAT, SEKOLAH_LON, parseFloat(latitude), parseFloat(longitude));
    if (jarak > MAX_RADIUS_METER) {
      return c.json({ 
        success: false, 
        message: `Presensi ditolak! Anda berada di luar area sekolah (${Math.round(jarak)} meter). Maksimal radius: ${MAX_RADIUS_METER}m.` 
      }, 400);
    }

    // 2. Cek Jam Operasional WIB (07.00 - 14.00 WIB)
    const nowWib = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }));
    const currentHour = nowWib.getHours();
    const currentMinute = nowWib.getMinutes();
    const currentMinutesTotal = currentHour * 60 + currentMinute;

    const startPresensi = 7 * 60;       // 07:00 WIB
    const batasTerlambat = 8 * 60 + 15; // 08:15 WIB
    const closePresensi = 14 * 60;      // 14:00 WIB

    if (currentMinutesTotal < startPresensi || currentMinutesTotal > closePresensi) {
      return c.json({ 
        success: false, 
        message: 'Presensi ditolak! Jam presensi dibuka pukul 07.00 sampai 14.00 WIB.' 
      }, 400);
    }

    // 3. Tentukan Status Otomatis (Hadir / Hadir (Terlambat))
    let statusPresensi = 'Hadir';
    if (currentMinutesTotal > batasTerlambat) {
      statusPresensi = 'Hadir (Terlambat)';
    }

    const todayStr = getTodayDateStr();
    
    // 4. Cek Duplikasi Absen Hari Ini
    const existingAbsence = await db.select().from(attendances).where(and(eq(attendances.studentId, parsedStudentId), eq(attendances.date, todayStr))).limit(1);
    if (existingAbsence.length > 0) {
      return c.json({ success: false, message: `Kamu sudah melakukan absensi hari ini.` }, 400);
    }

    // 5. Simpan ke Database
    const newAttendance = await db.insert(attendances).values({ 
      studentId: parsedStudentId, 
      date: todayStr, 
      status: statusPresensi 
    }).returning();

    const pesanSukses = statusPresensi === 'Hadir (Terlambat)'
      ? 'Absensi berhasil dicatat, namun Anda tercatat TERLAMBAT (lewat dari pukul 08.15 WIB).'
      : 'Absensi berhasil dicatat dengan status Hadir!';

    return c.json({ success: true, message: pesanSukses, data: newAttendance[0] });
  } catch (err) { 
    console.error('Error in POST /api/attendance:', err);
    return c.json({ success: false, message: 'Gagal mencatat absensi: ' + (err.message || 'Kesalahan server') }, 500); 
  }
});

// API Portal Wali Murid (Dengan Left Join ke Classes agar Nama Kelas Muncul)
app.post('/api/ortu/rekap', async (c) => {
  try {
    const { nis } = await c.req.json();
    if (!nis) return c.json({ success: false, message: 'NIS wajib diisi' }, 400);

    const student = await db.select({
      id: students.id,
      nisn: students.nisn,
      fullName: students.fullName,
      classId: students.classId,
      className: classes.name
    })
    .from(students)
    .leftJoin(classes, eq(students.classId, classes.id))
    .where(eq(students.nisn, String(nis).trim()))
    .limit(1);

    if (student.length === 0) return c.json({ success: false, message: 'Siswa dengan NIS tersebut tidak ditemukan' }, 404);

    const records = await db.select({
      date: attendances.date, checkInTime: attendances.checkInTime, status: attendances.status,
    }).from(attendances).where(eq(attendances.studentId, student[0].id)).orderBy(desc(attendances.date));

    return c.json({ 
      success: true, 
      data: records,
      student: { 
        fullName: student[0].fullName, 
        className: student[0].className || (student[0].classId ? `Kelas ${student[0].classId}` : '-') 
      } 
    });
  } catch (err) { 
    return c.json({ success: false, message: 'Gagal memuat rekap' }, 500); 
  }
});

serve({ fetch: app.fetch, port: 3000 }, (info) => {
  console.log(`Server menyala di http://127.0.0.1:${info.port}`);
});
export default app;