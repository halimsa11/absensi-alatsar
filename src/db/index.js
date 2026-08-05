import express from 'express';
import cors from 'cors';
import { db } from './db/index.js';
import { students, attendances } from './db/schema.js';
import { eq, and } from 'drizzle-orm';
import 'dotenv/config';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// ==========================================
// 1. API: Lihat Daftar Siswa
// ==========================================
app.get('/api/students', async (req, res) => {
  try {
    const data = await db.select().from(students);
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ==========================================
// 2. API: PROSES ABSENSI SISWA (Core Feature)
// ==========================================
app.post('/api/absen', async (req, res) => {
  try {
    const { nisn } = req.body;

    if (!nisn) {
      return res.status(400).json({ success: false, message: 'NISN wajib diisi!' });
    }

    // A. Cek apakah siswa dengan NISN tersebut ada di database
    const [siswa] = await db
      .select()
      .from(students)
      .where(eq(students.nisn, nisn));

    if (!siswa) {
      return res.status(404).json({ success: false, message: 'Siswa dengan NISN tersebut tidak ditemukan!' });
    }

    // B. Ambil Waktu Sekarang & Format Tanggal (YYYY-MM-DD)
    const sekarang = new Date();
    const tanggalHariIni = sekarang.toISOString().split('T')[0];
    
    // Ambil jam & menit untuk hitung aturan jam masuk/pulang
    const jamSekarang = sekarang.getHours();
    const menitSekarang = sekarang.getMinutes();
    const totalMenit = jamSekarang * 60 + menitSekarang;
    
    // Konversi aturan batas waktu ke menit:
    // 08:00 = 8 * 60 = 480 menit
    // 14:30 = 14 * 60 + 30 = 870 menit
    const batasJamMasuk = 8 * 60; 
    const batasJamPulang = 14 * 60 + 30;

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

    // F. Simpan Rekap Absensi ke Database Neon DB
    const [hasilAbsen] = await db
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
// 3. API: Lihat Rekap Absen Hari Ini
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
      .where(eq(attendances.date, tanggalHariIni));

    res.json({ success: true, total: dataHariIni.length, data: dataHariIni });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Jalankan Server
app.listen(PORT, () => {
  console.log(`🚀 Server Absensi berjalan di http://localhost:${PORT}`);
});