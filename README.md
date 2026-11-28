# Brewer

Kalkulator rasio kopi dan katalog resep yang berjalan sebagai situs statis. Brewer mendukung resep kopi instan, manual brew, dan eksperimen.

## Fitur

- Skala takaran bahan berdasarkan dosis kopi, dengan pilihan pengali cepat.
- Stopwatch dan hitung mundur dengan suara opsional, serta Screen Wake Lock pada browser yang mendukungnya.
- Resep pribadi disimpan di browser melalui `localStorage`; data tidak disinkronkan antarperangkat dan dapat hilang ketika data browser dibersihkan.
- Tautan berbagi membawa data resep dalam takaran asli; skala yang dipilih tidak ikut dibagikan. Tombol kontribusi menyiapkan GitHub Issue untuk dikurasi sebelum resep ditambahkan ke katalog.

Suara timer perlu interaksi pengguna dan mengikuti aturan browser. Saat tab berada di latar belakang atau layar terkunci, timer dan suara dapat tertunda.

Angka dalam langkah seduh merupakan takaran resep asli dan tidak berubah saat skala diganti. Ketika skala berubah, ringkasan bahan yang disesuaikan ditampilkan di dekat langkah. Waktu dan suhu tetap mengikuti resep asli. Takaran dibulatkan hingga tiga angka desimal untuk tampilan; total dihitung sebelum pembulatan. Total bahan dan proporsi bahan pemanis adalah perhitungan berat bahan, bukan ukuran hasil minuman atau kadar gula aktual.

## Asal-usul resep

Ketujuh resep awal adalah contoh dan eksperimen, bukan koleksi resep barista yang sudah terverifikasi. Dua versi bitter-sweet dan kopi soda dicatat sebagai eksperimen Said; asal setiap takaran dan pengujian versi persisnya belum terdokumentasi. Referensi yang tercantum adalah pembanding teknik atau rasio, bukan klaim bahwa resep disalin atau diadaptasi dari sumber tersebut.

Setiap resep katalog menyimpan `provenance`: `kind` (jenis resep), `creator` (pembuat, atau `null` jika belum diketahui), `origin` (penjelasan asal), `verification` (status uji resep persis), dan `references` (judul, URL, serta hubungan dengan resep). `target_yield_g` digunakan untuk target hasil espresso dan terpisah dari `ingredients` yang berisi bahan masuk. Resep lokal lama tanpa metadata tetap dapat dibuka, dengan status asal-usul belum dicatat.

Periksa struktur dataset dengan `node scripts/validate-recipes.js`. Validasi ini tidak membuktikan asal-usul, rasa, atau ketepatan sebuah resep; hal-hal tersebut tetap memerlukan kurasi manusia.

## Menjalankan secara lokal

Jalankan server HTTP dari direktori proyek:

```sh
python3 -m http.server 8080
```

Buka `http://localhost:8080/`. Tidak perlu proses build atau instalasi paket. Halaman memuat CSS, JavaScript, dan katalog resep dari berkas lokal proyek.

## GitHub Pages

Situs Brewer tersedia di [GitHub Pages](https://srmdn.github.io/brewer/) dan diterbitkan dari root branch `main`. Pertahankan path aset dan data relatif agar berfungsi pada path `/brewer/`. Workflow validasi resep memeriksa dataset ketika file terkait berubah; workflow tersebut terpisah dari proses penerbitan Pages.

## Lisensi

Kode sumber Brewer tersedia di bawah [MIT License](LICENSE). Dataset resep dan identitas visual belum ditetapkan sebagai bagian dari lisensi ini; referensi dan materi pihak ketiga tetap tunduk pada hak masing-masing pemiliknya.
