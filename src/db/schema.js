import { pgTable, serial, varchar, timestamp, date, text, pgEnum, integer } from 'drizzle-orm/pg-core';

// 1. Enum Status Absensi (Termasuk versi Kapital & Huruf Kecil)
export const attendanceStatusEnum = pgEnum('attendance_status', [
  'Hadir',
  'Hadir (Terlambat)',
  'Sakit',
  'Izin',
  'Alfa',
  'Alpa',
  'hadir',
  'sakit',
  'izin',
  'alpa'
]);

// 2. Tabel Kelas
export const classes = pgTable('classes', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 50 }).notNull(),
  academicYear: varchar('academic_year', { length: 20 }).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// 3. Tabel Siswa (nisn menggunakan varchar sehingga mendukung NIS alfanumerik / huruf + angka)
export const students = pgTable('students', {
  id: serial('id').primaryKey(),
  nisn: varchar('nisn', { length: 50 }).notNull().unique(), // Menampung NIS/NISN huruf + angka
  fullName: varchar('full_name', { length: 100 }).notNull(),
  classId: integer('class_id').references(() => classes.id).notNull(),
  password: varchar('password', { length: 255 }).default('123456'), // Password default portal orang tua
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// 4. Tabel Absensi
export const attendances = pgTable('attendances', {
  id: serial('id').primaryKey(),
  studentId: integer('student_id').references(() => students.id).notNull(),
  date: date('date').defaultNow().notNull(),
  checkInTime: timestamp('check_in_time').defaultNow().notNull(),
  status: attendanceStatusEnum('status').default('Hadir').notNull(),
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Export Alias
export const attendance = attendances;