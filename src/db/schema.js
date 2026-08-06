import { pgTable, serial, varchar, timestamp, date, text, pgEnum, integer } from 'drizzle-orm/pg-core';

// Enum status disesuaikan dengan teks kapital yang dikirim dari server/app
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

// Tabel Kelas
export const classes = pgTable('classes', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 50 }).notNull(),
  academicYear: varchar('academic_year', { length: 20 }).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Tabel Siswa
export const students = pgTable('students', {
  id: serial('id').primaryKey(),
  nisn: varchar('nisn', { length: 20 }).notNull().unique(),
  fullName: varchar('full_name', { length: 100 }).notNull(),
  classId: integer('class_id').references(() => classes.id).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Tabel Absensi
export const attendances = pgTable('attendances', {
  id: serial('id').primaryKey(),
  studentId: integer('student_id').references(() => students.id).notNull(),
  date: date('date').defaultNow().notNull(),
  checkInTime: timestamp('check_in_time').defaultNow().notNull(),
  status: attendanceStatusEnum('status').default('Hadir').notNull(),
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Export alias jika index.js memanggil schema.attendance
export const attendance = attendances;