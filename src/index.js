import express from 'express';
import cors from 'cors';
import { db } from './db/index.js';
import { classes, students, attendances } from './db/schema.js';
import { eq, and, desc } from 'drizzle-orm';
import 'dotenv/config';

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public')); // Agar server bisa membaca file HTML di folder public

// ==========================================
// 1. ROOT ENDPOINT (Cek Status Server)
// ==========================================
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: '🚀 Server Absensi Siswa Berjalan Normal!',
    version: '1.0.0'
  });
});

// ==========================================
// 2. API KELAS (Lihat & Tambah Kelas)
// ==========================================
app.get('/api/classes', async (req, res) => {
  try {
    const data = await db.select().from(classes);
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.post('/api/classes', async (req, res) => {
  try {
    const { name, academicYear } = req.body;
    if (!name || !academicYear) {
      return res.status(400).json({ 
        success: false, 
        message: 'Nama kelas (name) dan tahun ajaran (academicYear) wajib diisi!' 
      });
    }

    const [newClass] = await db
      .insert(classes)
      .values({ name, academicYear })
      .returning();

    res.status(201).json({ 
      success: true, 
      message: 'Kelas berhasil ditambahkan!', 
      data: newClass 
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ==========================================
// 3. API SISWA (Lihat & Tambah Siswa dari Admin)
// ==========================================
app.get('/api/students', async (req, res) => {
  try {
    const data = await db
      .select({
        id: students.id,
        nisn: students.nisn,
        fullName: students.fullName,
        classId: students.classId,
        className: classes.name
      })
      .from(students)
      .leftJoin(classes, eq(students.classId, classes.id));

    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.post('/api/students', async (req, res) => {
  try {
    const { nisn, fullName, classId } = req.body;
    if (!nisn || !fullName || !classId) {
      return res.status(400).json({ 
        success: false, 
        message: 'NISN, Nama Lengkap, dan ID Kelas wajib diisi!' 
      });
    }

    const [newStudent] = await db
      .insert(students)
      .values({ nisn, fullName, classId: Number(classId) })
      .returning();

    res.status(201).json({ 
      success: true, 
      message: 'Data siswa berhasil ditambahkan!', 
      data: newStudent 
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ==========================================
// 4. API ABSENSI (Core Logic: Validasi & Keterlambatan)
// ==========================================
app.post('/api/absen', async (req, res) => {
  try {
    const { fullName } = req.body;

    if (!fullName) {
      return res.status(400).json({ success: false, message: 'Nama siswa wajib diisi!' });
    }

    // A. Cari siswa berdasarkan Nama Lengkap yang dipilih dari database
    const [siswa] = await db
      .select()
      .from(students)
      .where(eq(students.fullName, fullName));

    if (!siswa) {
      return res.status(404).json({ 
        success: false, 
        message: 'Nama siswa tidak ditemukan di database! Silakan hubungi admin.' 
      });
    }

    // B. Ambil Waktu Sekarang & Format Tanggal (YYYY-MM-DD)
    const sekarang = new Date();
    const tanggalHariIni = sekarang.toISOString().split('T')[0];
    
    const jamSekarang = sekarang.getHours();
    const menitSekarang = sekarang.getMinutes();
    const totalMenit = jamSekarang * 60 + menitSekarang;
    
    const batasJamMasuk = 8 * 60; // 08:00 WIB
    const batasJamPulang = 14 * 60 + 30; // 14:30 WIB

    // C. Validasi Batas Akhir Jam Sekolah (14:30)
    if (totalMenit > batasJamPulang) {
      return res.status(400).json({ 
        success: false, 
        message: 'Jam sekolah sudah berakhir (Batas 14:30 WIB). Absensi ditutup!' 
      });
    }

    // D. Anti-Double Absen: Cek apakah siswa SUDAH ABSEN hari ini
    const [absenHariIni] = await db
      .select()
      .from(attendances)
      .where(
        and(
          eq(attendances.studentId, siswa.id),
          eq(attendances.date, tanggalHariIni)
        )
      );

    if (absenHariIni) {
      return res.status(400).json({ 
        success: false, 
        message: `Halo ${siswa.fullName}, kamu sudah melakukan absensi hari ini!` 
      });
    }

    // E. Tentukan Keterangan: Tepat Waktu atau Terlambat (Batas 08:00)
    let catatan = 'Tepat Waktu';
    if (totalMenit > batasJamMasuk) {
      catatan = 'Terlambat (Masuk di atas jam 08:00 WIB)';
    }

    // F. Simpan Rekap Absensi ke Database
    await db
      .insert(attendances)
      .values({
        studentId: siswa.id,
        date: tanggalHariIni,
        checkInTime: sekarang,
        status: 'hadir',
        notes: catatan
      })
      .returning();

    res.status(201).json({
      success: true,
      message: `Absensi berhasil! Selamat datang, ${siswa.fullName}.`,
      data: {
        nama: siswa.fullName,
        waktu: sekarang,
        status: 'hadir',
        keterangan: catatan
      }
    });

  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ==========================================
// 5. API REKAP & RIWAYAT ABSENSI
// ==========================================
app.get('/api/absen/hari-ini', async (req, res) => {
  try {
    const tanggalHariIni = new Date().toISOString().split('T')[0];
    
    const dataHariIni = await db
      .select({
        id: attendances.id,
        namaSiswa: students.fullName,
        nisn: students.nisn,
        jamMasuk: attendances.checkInTime,
        status: attendances.status,
        keterangan: attendances.notes
      })
      .from(attendances)
      .innerJoin(students, eq(attendances.studentId, students.id))
      .where(eq(attendances.date, tanggalHariIni))
      .orderBy(desc(attendances.checkInTime));

    res.json({ success: true, total: dataHariIni.length, data: dataHariIni });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ==========================================
// 6. NYALAKAN SERVER (Wajib di baris paling bawah)
// ==========================================
app.listen(PORT, () => {
  console.log(`=========================================`);
  console.log(`🚀 Server Absensi aktif di http://localhost:${PORT}`);
  console.log(`=========================================`);
});