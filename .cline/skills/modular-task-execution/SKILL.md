# SKILL.md — Modular Task Execution for Cline

## Tujuan

Skill ini mengatur cara Cline mengerjakan task coding agar selalu:

* menyelesaikan pekerjaan per module,
* tidak lompat antar fitur tanpa alasan,
* menjaga perubahan tetap kecil dan mudah direview,
* tidak merusak module lain,
* selalu melakukan validasi setelah perubahan,
* memberi laporan ringkas tentang apa yang sudah selesai.

Gunakan instruksi ini untuk semua task development, refactor, bug fix, migration, dan implementasi fitur.

---

## Project Guidance Loader

Sebelum mengerjakan task coding di project apa pun, Cline harus mengecek apakah project memiliki folder `.agents/`.

Jika ada, baca dan ikuti file berikut sebelum edit besar:

```text
.agents/RULES.md
.agents/SKILL.md
.agents/MEMORY_BANK.md
```

Prioritas instruksi project:

```text
1. .agents/RULES.md
2. .agents/SKILL.md
3. .agents/MEMORY_BANK.md
4. Pola existing codebase
```

Jika folder `.agents/` atau salah satu file di atas belum ada, sarankan user membuat:

```text
.agents/SKILL.md
.agents/RULES.md
.agents/MEMORY_BANK.md
```

Saran ini wajib muncul sebelum task besar, refactor besar, migration, atau perubahan multi-module.

---

## Prinsip Utama

Cline harus bekerja dengan prinsip:

1. **Module-first**
   Selesaikan satu module atau satu area fitur terlebih dahulu sebelum pindah ke module lain.

2. **Small safe changes**
   Lakukan perubahan kecil, terarah, dan mudah dibatalkan.

3. **No random edits**
   Jangan mengubah file yang tidak terkait langsung dengan task.

4. **Read before edit**
   Baca struktur project, file terkait, dan pola kode yang sudah ada sebelum menulis perubahan.

5. **Validate after edit**
   Setelah mengubah kode, jalankan validasi yang relevan: lint, typecheck, test, build, atau command project.

6. **Explain what changed**
   Setelah selesai, berikan ringkasan perubahan, file yang disentuh, dan status validasi.

---

## Workflow Wajib

Untuk setiap task, Cline harus mengikuti urutan ini:

### 1. Pahami Task

Sebelum mengubah file, identifikasi:

* tujuan task,
* module yang terdampak,
* file utama yang kemungkinan perlu diedit,
* dependency atau side effect yang mungkin terjadi,
* validasi yang perlu dijalankan.

Jika task terlalu besar, pecah menjadi beberapa module kerja.

Contoh pembagian module:

```text
Module 1: Database schema / migration
Module 2: Backend API / service
Module 3: Frontend page / component
Module 4: Validation / form / state
Module 5: Testing / build check
```

---

### 2. Buat Rencana Singkat

Sebelum melakukan perubahan besar, tulis rencana singkat:

```text
Plan:
1. Inspect existing module structure.
2. Update only files related to <module>.
3. Run validation.
4. Summarize result.
```

Jangan membuat rencana terlalu panjang. Rencana harus praktis dan langsung bisa dieksekusi.

---

### 3. Kerjakan Satu Module Sampai Selesai

Cline harus menyelesaikan satu module terlebih dahulu.

Dilarang:

* mengubah backend, frontend, migration, dan styling sekaligus tanpa urutan,
* membuat banyak perubahan lintas folder tanpa menjelaskan hubungan antar file,
* pindah module sebelum module sebelumnya selesai atau minimal stabil.

Urutan yang disarankan:

```text
1. Schema / type / contract
2. Backend logic
3. Frontend integration
4. UI polish
5. Validation and tests
```

Jika task hanya menyentuh frontend, jangan mengubah backend.
Jika task hanya menyentuh backend, jangan mengubah UI kecuali diperlukan.

---

### 4. Ikuti Pola Project yang Sudah Ada

Sebelum membuat file baru, cek apakah sudah ada pola existing untuk:

* struktur folder,
* naming convention,
* service layer,
* repository layer,
* hooks,
* components,
* API routes,
* validation schema,
* error handling,
* logging,
* styling,
* test files.

Jangan membuat pattern baru kalau pattern lama sudah cukup.

---

### 5. Minimal File Changes

Sebelum edit, tentukan file yang benar-benar perlu disentuh.

Prioritas:

```text
1. Edit file existing yang relevan
2. Tambah file baru hanya jika memang diperlukan
3. Hindari refactor global kecuali diminta
4. Hindari formatting massal
```

Jangan menjalankan formatter ke seluruh project kecuali user meminta.

---

## Aturan Per Module

### Database / Supabase Module

Jika task menyentuh database:

* cek migration existing,
* jangan langsung mengubah remote database tanpa instruksi,
* buat migration yang jelas,
* hindari destructive changes tanpa konfirmasi,
* jangan drop table/column/data kecuali diminta eksplisit,
* periksa RLS policy jika table terkait Supabase Auth,
* validasi migration sebelum lanjut ke backend/frontend.

Checklist:

```text
- [ ] Migration dibuat atau diperbarui
- [ ] Table/column/index sesuai kebutuhan
- [ ] RLS policy dicek
- [ ] Foreign key dicek
- [ ] Tidak ada destructive change tanpa izin
```

---

### Backend / API Module

Jika task menyentuh backend/API:

* cek route/controller/service existing,
* pastikan input validation ada,
* pastikan error handling konsisten,
* jangan hardcode secret,
* jangan expose service role key,
* pastikan response shape konsisten dengan frontend.

Checklist:

```text
- [ ] API menerima input yang benar
- [ ] Validation diterapkan
- [ ] Error handling konsisten
- [ ] Tidak ada secret hardcoded
- [ ] Response shape stabil
```

---

### Frontend / UI Module

Jika task menyentuh frontend:

* cek component existing,
* gunakan component reusable yang sudah ada,
* jangan membuat UI pattern baru tanpa alasan,
* pastikan loading, empty, error state ada jika data async,
* pastikan form validation jelas,
* pastikan responsive behavior tidak rusak.

Checklist:

```text
- [ ] Component mengikuti pattern existing
- [ ] Loading state ada
- [ ] Error state ada
- [ ] Empty state ada jika perlu
- [ ] Form validation ada jika perlu
- [ ] Responsive layout aman
```

---

### State Management Module

Jika task menyentuh state:

* cek state existing terlebih dahulu,
* jangan membuat duplicate source of truth,
* jangan menyimpan data server di local state jika sudah ada query/cache,
* pastikan update state tidak menyebabkan stale data.

Checklist:

```text
- [ ] Tidak ada duplicate state
- [ ] Data flow jelas
- [ ] Cache invalidation dicek
- [ ] State reset dicek
```

---

### Auth / Permission Module

Jika task menyentuh auth:

* cek role user,
* cek permission existing,
* cek Supabase RLS jika digunakan,
* jangan bypass auth di frontend saja,
* validasi permission di server/database.

Checklist:

```text
- [ ] Auth check ada
- [ ] Permission check ada
- [ ] RLS/policy dicek jika Supabase
- [ ] Tidak ada bypass security
```

---

## Aturan Validasi

Setelah menyelesaikan module, jalankan command yang relevan.

Prioritas validasi:

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```

Jika command tidak tersedia, cek `package.json` dan pilih script yang paling sesuai.

Jika validasi gagal:

1. baca error,
2. perbaiki hanya penyebab terkait task,
3. jalankan ulang validasi,
4. jangan memperbaiki error unrelated terlalu luas tanpa memberi catatan.

Jika error bukan akibat perubahan task, laporkan sebagai:

```text
Known unrelated issue:
- <error>
- file: <file>
- reason: existed before / outside current task
```

---

## Aturan Git / Safety

Sebelum perubahan besar:

```bash
git status
```

Cline harus memperhatikan file yang sudah dimodifikasi user.

Dilarang:

* overwrite perubahan user tanpa izin,
* reset branch tanpa izin,
* menjalankan `git clean`, `git reset --hard`, atau command destruktif tanpa instruksi eksplisit,
* menghapus file besar tanpa alasan jelas.

Jika ada perubahan existing dari user, jangan sentuh kecuali terkait task.

---

## Aturan Komunikasi

Saat bekerja, Cline harus memberi update singkat:

```text
Working on module: <module name>
Files inspected:
- ...
Next:
- ...
```

Setelah selesai satu module:

```text
Completed module: <module name>
Changed:
- ...
Validation:
- ...
```

Di akhir task, laporan harus berisi:

```text
Summary:
- ...

Files changed:
- ...

Validation:
- Passed / Failed / Not run

Notes:
- ...
```

---

## Format Penyelesaian Task

Gunakan format akhir berikut:

```text
Done.

Summary:
- <perubahan utama>
- <perubahan pendukung>

Files changed:
- <path/file>
- <path/file>

Validation:
- <command>: passed
- <command>: failed / not run

Notes:
- <catatan penting>
```

Jika task belum bisa selesai penuh:

```text
Partial completion.

Completed:
- ...

Blocked by:
- ...

Recommended next step:
- ...
```

---

## Aturan Khusus Agar Tidak Random

Cline tidak boleh:

* membuat file baru tanpa mengecek file existing,
* mengganti arsitektur project tanpa diminta,
* melakukan refactor besar saat task kecil,
* mengubah formatting seluruh repo,
* mengubah dependency tanpa alasan kuat,
* mengubah `.env`, credential, token, atau secret,
* menjalankan migration remote tanpa instruksi,
* melakukan deploy tanpa instruksi,
* menghapus data tanpa instruksi,
* pindah ke module lain sebelum module sekarang selesai.

Jika merasa perlu melakukan hal besar, Cline harus menulis alasan terlebih dahulu.

---

## Module Completion Checklist

Sebelum menganggap module selesai, pastikan:

```text
- [ ] Requirement module sudah terpenuhi
- [ ] File yang diubah relevan
- [ ] Tidak ada perubahan random
- [ ] Tidak ada secret hardcoded
- [ ] Error handling aman
- [ ] Validasi dijalankan atau dijelaskan kenapa tidak
- [ ] Ringkasan perubahan disiapkan
```

---

## Default Behavior

Jika user memberi task umum seperti:

```text
Fix bug checkout
Add invoice module
Improve product form
Push Supabase migration
Refactor customer page
```

Cline harus otomatis:

1. inspect project,
2. identifikasi module terkait,
3. buat plan pendek,
4. kerjakan module pertama,
5. validasi,
6. lanjut module berikutnya hanya jika perlu,
7. beri summary akhir.

---

## Bahasa

Gunakan bahasa Indonesia untuk komunikasi dengan user, kecuali kode, nama file, error message, dan command terminal.
Jaga penjelasan tetap ringkas, teknis, dan langsung ke solusi.

## Project-Specific Rule

Untuk project ERP, selalu selesaikan fitur berdasarkan domain module:

1. Master Data
2. Transaction
3. Report
4. Auth / Permission
5. Database / Migration

Jangan mencampur perubahan antar domain kecuali task memang membutuhkan integrasi.