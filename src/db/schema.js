import { pgTable, serial, varchar, timestamp, date, text, pgEnum, integer } from 'drizzle-orm/pg-core';

// Enum untuk status kehadiran
export const attendanceStatusEnum = pgEnum('attendance_status', [
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
  date: date('date').notNull(),
  checkInTime: timestamp('check_in_time').defaultNow().notNull(),
  status: attendanceStatusEnum('status').default('hadir').notNull(),
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});