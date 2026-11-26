# Brewer

Kalkulator rasio kopi dan katalog resep yang berjalan sebagai situs statis. Brewer mendukung resep kopi instan, manual brew, dan eksperimen.

## Fitur

- Skala takaran bahan berdasarkan dosis kopi, dengan pilihan pengali cepat.
- Timer seduh dan Screen Wake Lock pada browser yang mendukungnya.
- Resep pribadi disimpan di browser melalui `localStorage`; data tidak disinkronkan antarperangkat dan dapat hilang ketika data browser dibersihkan.
- Tautan berbagi membawa data resep. Tombol kontribusi menyiapkan GitHub Issue untuk dikurasi sebelum resep ditambahkan ke katalog.

Angka dalam langkah seduh merupakan takaran resep asli dan tidak berubah saat skala diganti. Gunakan tabel bahan untuk takaran yang disesuaikan. Total bahan dan proporsi bahan pemanis adalah perhitungan berat bahan, bukan ukuran hasil minuman atau kadar gula aktual.

## Asal-usul resep

Ketujuh resep awal adalah contoh dan eksperimen yang disusun Gemini, bukan koleksi resep barista yang sudah terverifikasi. Dua versi bitter-sweet dikembangkan dalam diskusi bersama srmdn; salah satu versi pernah dicoba, tetapi versi dan takaran persisnya belum dicatat. Resep kopi soda terinspirasi percobaan srmdn tanpa takaran yang dicatat. Referensi yang tercantum adalah pembanding teknik atau rasio, bukan klaim bahwa resep disalin atau diadaptasi dari sumber tersebut.

Setiap resep katalog menyimpan `provenance`: `kind` (jenis resep), `creator` (pembuat, atau `null` jika belum diketahui), `origin` (penjelasan asal), `verification` (status uji resep persis), dan `references` (judul, URL, serta hubungan dengan resep). `target_yield_g` digunakan untuk target hasil espresso dan terpisah dari `ingredients` yang berisi bahan masuk. Resep lokal lama tanpa metadata tetap dapat dibuka, dengan status asal-usul belum dicatat.

Periksa struktur dataset dengan `node scripts/validate-recipes.js`. Validasi ini tidak membuktikan asal-usul, rasa, atau ketepatan sebuah resep; hal-hal tersebut tetap memerlukan kurasi manusia.

## Menjalankan secara lokal

Jalankan server HTTP dari direktori proyek:

```sh
python3 -m http.server 8080
```

Buka `http://localhost:8080/`. Tidak perlu proses build atau instalasi paket. Scaffold memuat HTMX dari CDN, meskipun fitur saat ini menggunakan JavaScript biasa.

## GitHub Pages

Proyek dirancang untuk disajikan sebagai situs statis pada `https://srmdn.github.io/brewer/`. Setelah repositori tersedia dan siap dipublikasikan, pilih sumber GitHub Pages dari branch atau workflow. Workflow validasi resep yang disertakan memeriksa dataset ketika file tersebut berubah; workflow itu tidak melakukan deployment.

## Lisensi

Kode sumber Brewer tersedia di bawah [MIT License](LICENSE). Dataset resep dan identitas visual belum ditetapkan sebagai bagian dari lisensi ini; referensi dan materi pihak ketiga tetap tunduk pada hak masing-masing pemiliknya.
