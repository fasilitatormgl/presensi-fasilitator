import { auth, db } from "./firebase-init.js"
import { collection, getDocs, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js"
import { signOut } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js"

// ========== FUNGSI FORMAT TANGGAL LOKAL ==========
function getTodayLocal() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// ========== VARIABEL GLOBAL ==========
let userData = {}
let currentMode = 'harian'
let currentFilter = {
    tanggal: getTodayLocal(),
    bulan: new Date().getMonth() + 1,
    tahun: new Date().getFullYear(),
    kelurahan: ''
}

let allUsers = []
let allPresensi = []

// ========== FUNGSI LOGOUT ==========
async function logout() {
    if (confirm("Apakah Anda yakin ingin keluar?")) {
        await signOut(auth)
        localStorage.clear()
        window.location.href = "index.html"
    }
}

// ========== FUNGSI LOADING & ERROR ==========
function showLoading(show) {
    const loadingEl = document.getElementById("loading")
    if (loadingEl) loadingEl.style.display = show ? "flex" : "none"
}

function showError(message) {
    const errorModal = document.getElementById("errorModal")
    const errorMessage = document.getElementById("errorMessage")
    if (errorModal && errorMessage) {
        errorMessage.textContent = message
        errorModal.style.display = "flex"
    } else {
        alert(message)
    }
}

window.closeErrorModal = function() {
    const modal = document.getElementById("errorModal")
    if (modal) modal.style.display = "none"
}

// ========== FORMAT TANGGAL & BULAN ==========
function formatTanggal(date) {
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }
    return new Date(date).toLocaleDateString('id-ID', options)
}

function formatBulan(bulan, tahun) {
    const namaBulan = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
        'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember']
    return `${namaBulan[bulan - 1]} ${tahun}`
}

// ========== SWITCH TAB ==========
window.showTab = function(tab) {
    if (tab === 'harian') {
        document.getElementById('tabHarianContent').style.display = 'block'
        document.getElementById('tabBulananContent').style.display = 'none'
        document.getElementById('tabHarian').style.background = '#EE2737'
        document.getElementById('tabBulanan').style.background = '#3498DB'
        currentMode = 'harian'
        loadRekapHarian()
    } else {
        document.getElementById('tabHarianContent').style.display = 'none'
        document.getElementById('tabBulananContent').style.display = 'block'
        document.getElementById('tabHarian').style.background = '#3498DB'
        document.getElementById('tabBulanan').style.background = '#EE2737'
        currentMode = 'bulanan'
        loadRekapBulanan()
    }
}

// ========== INIT DASHBOARD ==========
window.addEventListener('load', async () => {
    showLoading(true)
    console.log("🚀 Memulai inisialisasi dashboard pemantau...")

    try {
        const storedData = localStorage.getItem("userData")
        if (storedData) {
            userData = JSON.parse(storedData)
            console.log("📦 Data user dari localStorage:", userData)
        }

        if (!userData || userData.role !== 'pemantau') {
            console.log("❌ Bukan pemantau, redirect ke login")
            window.location.href = "index.html"
            return
        }

        document.getElementById("userName").textContent = userData.nama || "Pemantau"
        document.getElementById("avatar").textContent = (userData.nama || "P").charAt(0).toUpperCase()
        document.getElementById("userRole").textContent = "Pemantau - Monitoring"

        const logoutBtn = document.getElementById("logoutBtn")
        if (logoutBtn) logoutBtn.addEventListener("click", logout)

        const today = getTodayLocal();
        document.getElementById("filterTanggal").value = today
        document.getElementById("filterBulan").value = new Date().getMonth() + 1
        document.getElementById("filterTahun").value = new Date().getFullYear()
        currentFilter.tanggal = today

        console.log("📥 Memuat data dari Firestore...")
        await loadData()
        console.log("✅ Data berhasil dimuat:", { allUsers: allUsers.length, allPresensi: allPresensi.length })

        await loadFilterOptions()
        await cekStatusLokasiAktif()
        await loadRekapHarian()

        console.log("✅ Dashboard pemantau siap!")

    } catch (error) {
        console.error("❌ Error inisialisasi:", error)
        showError("Gagal memuat dashboard pemantau: " + error.message)
    } finally {
        showLoading(false)
    }
})

// ========== LOAD SEMUA DATA ==========
async function loadData() {
    try {
        console.log("📥 Mengambil data users dari Firestore...")
        const usersSnap = await getDocs(collection(db, "users"))
        allUsers = []
        usersSnap.forEach(doc => {
            const data = doc.data()
            // Ambil semua user kecuali admin
            if (data.role !== 'admin') {
                allUsers.push({
                    id: doc.id,
                    uid: data.uid || doc.id,
                    ...data
                })
            }
        })
        console.log(`✅ ${allUsers.length} user berhasil dimuat`)

        console.log("📥 Mengambil data presensi dari Firestore...")
        const presensiSnap = await getDocs(collection(db, "presensi"))
        allPresensi = []
        presensiSnap.forEach(doc => {
            allPresensi.push({ id: doc.id, ...doc.data() })
        })
        console.log(`✅ ${allPresensi.length} presensi berhasil dimuat`)

    } catch (error) {
        console.error("❌ Error load data:", error)
        throw error
    }
}

// ========== LOAD FILTER OPTIONS ==========
async function loadFilterOptions() {
    try {
        const kelurahanSet = new Set()
        allUsers.forEach(user => {
            if (user.kelurahan && user.kelurahan !== '-') {
                kelurahanSet.add(user.kelurahan)
            }
        })

        // Isi filter kelurahan untuk harian
        const selectHarian = document.getElementById("filterKelurahan")
        if (selectHarian) {
            selectHarian.innerHTML = '<option value="">Semua Kelurahan</option>'
            Array.from(kelurahanSet).sort().forEach(kel => {
                const option = document.createElement("option")
                option.value = kel
                option.textContent = kel
                selectHarian.appendChild(option)
            })
        }

        // Isi filter kelurahan untuk bulanan
        const selectBulanan = document.getElementById("filterKelurahanBulanan")
        if (selectBulanan) {
            selectBulanan.innerHTML = '<option value="">Semua Kelurahan</option>'
            Array.from(kelurahanSet).sort().forEach(kel => {
                const option = document.createElement("option")
                option.value = kel
                option.textContent = kel
                selectBulanan.appendChild(option)
            })
        }

        console.log("✅ Filter kelurahan berhasil dimuat:", kelurahanSet.size, "kelurahan")

    } catch (error) {
        console.error("❌ Error load filter:", error)
    }
}

// ========== LOAD REKAP ==========
function loadRekap() {
    if (currentMode === 'harian') {
        loadRekapHarian()
    } else {
        loadRekapBulanan()
    }
}

// ========== LOAD REKAP HARIAN ==========
async function loadRekapHarian() {
    try {
        console.log("📊 Memuat rekap harian...")
        const tanggal = document.getElementById("filterTanggal")?.value || getTodayLocal()
        const kelurahan = document.getElementById("filterKelurahan")?.value || ""

        currentFilter.tanggal = tanggal
        currentFilter.kelurahan = kelurahan

        const tanggalDisplayEl = document.getElementById("tanggalDisplay")
        if (tanggalDisplayEl) {
            tanggalDisplayEl.textContent = formatTanggal(tanggal)
        }

        let filteredUsers = allUsers
        if (kelurahan) {
            filteredUsers = allUsers.filter(u => u.kelurahan === kelurahan)
        }

        console.log(`👥 Filtered users: ${filteredUsers.length} (kelurahan: ${kelurahan || 'semua'})`)

        const presensiHariIni = allPresensi.filter(p => p.tanggal === tanggal)
        const presensiMap = new Map()
        presensiHariIni.forEach(p => presensiMap.set(p.uid, p))

        const usersWithStatus = filteredUsers.map(user => ({
            ...user,
            status: presensiMap.has(user.uid) ? 'Hadir' : 'Belum',
            dataPresensi: presensiMap.get(user.uid)
        }))

        usersWithStatus.sort((a, b) => {
            if (a.status === 'Belum' && b.status === 'Hadir') return -1
            if (a.status === 'Hadir' && b.status === 'Belum') return 1
            return 0
        })

        const hadir = usersWithStatus.filter(u => u.status === 'Hadir').length
        const total = filteredUsers.length

        console.log(`📊 Statistik: ${hadir}/${total} hadir`)

        // Update stat cards
        const totalFasilitatorEl = document.getElementById("totalFasilitator")
        const hadirHariIniEl = document.getElementById("hadirHariIni")
        const belumHadirEl = document.getElementById("belumHadir")
        const persentaseEl = document.getElementById("persentase")

        if (totalFasilitatorEl) totalFasilitatorEl.textContent = total
        if (hadirHariIniEl) hadirHariIniEl.textContent = hadir
        if (belumHadirEl) belumHadirEl.textContent = total - hadir
        if (persentaseEl) persentaseEl.textContent = total > 0 ? Math.round((hadir / total) * 100) + '%' : '0%'

        // Generate tabel
        let html = ''
        usersWithStatus.forEach((user, index) => {
            const p = user.dataPresensi
            const statusColor = p ? '#27AE60' : '#E74C3C'
            const waktu = p ? new Date(p.waktu?.seconds * 1000).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '-'
            const lokasi = p ? (p.lokasi === 'kantor' ? 'Kantor Pusat' : (p.lokasi || '-')) : '-'

            let roleBadge = ''
            if (user.role === 'koordinator') {
                roleBadge = '<span style="background:#F39C12; color:white; padding:2px 6px; border-radius:10px; font-size:10px; margin-left:5px;">📋 Koord</span>'
            }

            html += `
                <tr style="background: ${!p ? '#FFF5F5' : 'white'};">
                    <td>${index + 1}</td>
                    <td style="white-space: normal; word-break: break-word; min-width: 140px;">
                    ${user.nama || '-'} ${roleBadge}
                    </td>
                    <td style="white-space: normal; word-break: break-word; min-width: 120px;">
                    ${user.kelurahan || '-'}
                    </td>
                    <td><span style="color: ${statusColor}; font-weight: bold;">${user.status}</span></td>
                    <td>${waktu}</td>
                    <td>${lokasi}</td>
                </tr>
            `
        })

        const tableHarianEl = document.getElementById("tableHarian")
        if (tableHarianEl) {
            tableHarianEl.innerHTML = html || '<tr><td colspan="6" class="text-center">Tidak ada data</td></tr>'
        }

        console.log("✅ Rekap harian berhasil dimuat")

    } catch (error) {
        console.error("❌ Error load rekap harian:", error)
        const tableHarianEl = document.getElementById("tableHarian")
        if (tableHarianEl) {
            tableHarianEl.innerHTML = `<tr><td colspan="6" class="text-center" style="color:red;">Gagal memuat: ${error.message}</td></tr>`
        }
    }
}

// ========== LOAD REKAP BULANAN ==========
async function loadRekapBulanan() {
    try {
        console.log("📊 Memuat rekap bulanan...")
        const filterBulanEl = document.getElementById("filterBulan");
        const filterTahunEl = document.getElementById("filterTahun");
        const filterKelurahanEl = document.getElementById("filterKelurahanBulanan");

        if (!filterBulanEl || !filterTahunEl) {
            console.warn("⚠️ Elemen filter bulan/tahun tidak ditemukan");
            return;
        }

        const bulan = parseInt(filterBulanEl.value);
        const tahun = parseInt(filterTahunEl.value);
        const kelurahan = filterKelurahanEl ? filterKelurahanEl.value : "";

        currentFilter.bulan = bulan;
        currentFilter.tahun = tahun;
        currentFilter.kelurahan = kelurahan;

        const bulanDisplayEl = document.getElementById("bulanDisplay");
        if (bulanDisplayEl) {
            bulanDisplayEl.textContent = formatBulan(bulan, tahun);
        }

        let filteredUsers = [...allUsers];
        if (kelurahan) {
            filteredUsers = filteredUsers.filter(u => u.kelurahan === kelurahan);
        }

        console.log(`👥 Filtered users bulanan: ${filteredUsers.length}`)

        filteredUsers.sort((a, b) => {
            const isAKoord = a.role === 'koordinator' ? 1 : 0;
            const isBKoord = b.role === 'koordinator' ? 1 : 0;
            if (isAKoord !== isBKoord) return isBKoord - isAKoord;

            const kelurahanA = (a.kelurahan || '').toUpperCase();
            const kelurahanB = (b.kelurahan || '').toUpperCase();
            if (kelurahanA < kelurahanB) return -1;
            if (kelurahanA > kelurahanB) return 1;

            const namaA = (a.nama || '').toUpperCase();
            const namaB = (b.nama || '').toUpperCase();
            return namaA.localeCompare(namaB);
        });

        const daysInMonth = new Date(tahun, bulan, 0).getDate();
        const strBulan = String(bulan).padStart(2, '0');

        let totalHariKerjaEfektif = 0;
        for (let d = 1; d <= daysInMonth; d++) {
            const dayOfWeek = new Date(tahun, bulan - 1, d).getDay();
            if (dayOfWeek !== 0 && dayOfWeek !== 6) {
                totalHariKerjaEfektif++;
            }
        }

        // Generate header dinamis
        const dynamicHeader = document.getElementById("headerBulanan");
        if (dynamicHeader) {
            let headerHtml = '<th>No</th><th>Nama Fasilitator</th><th>Kelurahan</th>';
            for (let d = 1; d <= daysInMonth; d++) {
                const dayOfWeek = new Date(tahun, bulan - 1, d).getDay();
                const isWeekend = (dayOfWeek === 0 || dayOfWeek === 6);
                headerHtml += `<th style="background: ${isWeekend ? '#E74C3C' : '#34495E'}; color: white; min-width: 35px; padding: 4px; text-align: center;">${d}</th>`;
            }
            headerHtml += '<th>Hadir</th><th>Kerja</th><th>%</th>';
            dynamicHeader.innerHTML = headerHtml;
        }

        // Mapping presensi
        const presensiMapByUser = {};
        allPresensi.forEach(p => {
            if (p.tanggal && p.uid) {
                const pDate = new Date(p.tanggal);
                if (pDate.getMonth() + 1 === bulan && pDate.getFullYear() === tahun) {
                    if (!presensiMapByUser[p.uid]) presensiMapByUser[p.uid] = {};

                    let jamAbsen = '';

                    if (p.waktu && typeof p.waktu.toDate === 'function') {
                        try {
                            const dateObj = p.waktu.toDate();
                            const jam = String(dateObj.getHours()).padStart(2, '0');
                            const menit = String(dateObj.getMinutes()).padStart(2, '0');
                            jamAbsen = `${jam}:${menit}`;
                        } catch (e) { }
                    }

                    if (!jamAbsen && p.waktu && p.waktu.seconds !== undefined) {
                        try {
                            const dateObj = new Date(p.waktu.seconds * 1000);
                            jamAbsen = dateObj.toLocaleTimeString('id-ID', {
                                hour: '2-digit',
                                minute: '2-digit',
                                hour12: false,
                                timeZone: 'Asia/Jakarta'
                            }).replace(/\./g, ':');
                        } catch (e) { }
                    }

                    if (!jamAbsen && p.waktu && typeof p.waktu === 'string') {
                        jamAbsen = p.waktu.substring(0, 5);
                    }

                    presensiMapByUser[p.uid][p.tanggal] = jamAbsen || "-";
                }
            }
        });

        let html = '';
        let totalHadirSemua = 0;
        const userStatsForGrafik = [];

        filteredUsers.forEach((user, index) => {
            let totalHadirUser = 0;
            let cellsHtml = '';

            for (let d = 1; d <= daysInMonth; d++) {
                const strDate = `${tahun}-${strBulan}-${String(d).padStart(2, '0')}`;
                const dayOfWeek = new Date(tahun, bulan - 1, d).getDay();
                const isWeekend = (dayOfWeek === 0 || dayOfWeek === 6);

                if (isWeekend) {
                    cellsHtml += `<td style="background: #FADBD8; color: #C0392B; text-align: center; font-size: 10px; font-weight: bold;">L</td>`;
                } else {
                    const jamMasuk = presensiMapByUser[user.uid] && presensiMapByUser[user.uid][strDate];

                    if (jamMasuk && jamMasuk !== "-") {
                        cellsHtml += `
                            <td style="background: #D4EFDF; color: #27AE60; text-align: center; padding: 4px 2px; line-height: 1.1;">
                                <div style="font-weight: bold; font-size: 11px;">H</div>
                                <div style="font-size: 9px; color: #1E8449; font-weight: 500;">${jamMasuk}</div>
                            </td>`;
                        totalHadirUser++;
                    } else {
                        cellsHtml += `<td style="background: #FCF3CF; color: #D35400; text-align: center; font-size: 11px;">-</td>`;
                    }
                }
            }

            totalHadirSemua += totalHadirUser;
            const persentase = totalHariKerjaEfektif > 0 ? Math.round((totalHadirUser / totalHariKerjaEfektif) * 100) : 0;

            userStatsForGrafik.push({
                ...user,
                totalHadir: totalHadirUser,
                persentase: persentase
            });

            let roleBadge = '';
            if (user.role === 'koordinator') {
                roleBadge = '<span style="background:#F39C12; color:white; padding:2px 4px; border-radius:10px; font-size:9px; margin-left:3px;">📋 K</span>';
            }

            html += `
                <tr>
                    <td>${index + 1}</td>
                    <td style="white-space: normal; word-break: break-word; min-width: 150px; font-weight: 500;">
                        ${user.nama || '-'} ${roleBadge}
                    </td>
                    <td style="white-space: normal; word-break: break-word; min-width: 100px;">
                        ${user.kelurahan || '-'}
                    </td>
                    ${cellsHtml}
                    <td style="font-weight: bold; text-align: center; background: #EAF2F8;">${totalHadirUser}</td>
                    <td style="text-align: center; color: #7F8C8D;">${totalHariKerjaEfektif}</td>
                    <td style="font-weight: bold; color: ${persentase >= 80 ? '#27AE60' : (persentase >= 50 ? '#F39C12' : '#E74C3C')}; text-align: center;">${persentase}%</td>
                </tr>
            `;
        });

        const tableBulananEl = document.getElementById("tableBulanan");
        if (tableBulananEl) {
            tableBulananEl.innerHTML = html || `<tr><td colspan="${daysInMonth + 6}" class="text-center">Tidak ada data terdeteksi</td></tr>`;
        }

        // Update stat cards bulanan
        const totalUser = filteredUsers.length;
        const rataHadir = totalUser > 0 ? (totalHadirSemua / totalUser).toFixed(1) : 0;
        const persenGlobal = totalHariKerjaEfektif > 0 ? Math.round((rataHadir / totalHariKerjaEfektif) * 100) : 0;

        const totalHariEl = document.getElementById("totalHari");
        if (totalHariEl) totalHariEl.textContent = totalHariKerjaEfektif + " Hari Kerja";

        const rataHadirEl = document.getElementById("rataHadir");
        if (rataHadirEl) rataHadirEl.textContent = rataHadir + " Hari";

        const persenBulananEl = document.getElementById("persenBulanan");
        if (persenBulananEl) persenBulananEl.textContent = persenGlobal + '%';

        // Render grafik
        if (userStatsForGrafik.length > 0) {
            userStatsForGrafik.sort((a, b) => a.totalHadir - b.totalHadir);
            renderGrafik(userStatsForGrafik.slice(0, 10), totalHariKerjaEfektif);
        }

        console.log("✅ Rekap bulanan berhasil dimuat")

    } catch (error) {
        console.error("❌ Error load rekap bulanan:", error);
        const tableBulananEl = document.getElementById("tableBulanan");
        if (tableBulananEl) {
            tableBulananEl.innerHTML = `<tr><td colspan="15" style="color:red; text-align:center; font-weight:bold; padding:15px;">⚠️ Gagal mengurai data: ${error.message}</td></tr>`;
        }
    }
}

// ========== RENDER GRAFIK ==========
function renderGrafik(users, totalHariKerja) {
    const container = document.getElementById("grafikContainer")
    if (!container) return
    container.innerHTML = ''

    if (users.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: #7F8C8D;">Tidak ada data</p>'
        return
    }

    users.forEach(user => {
        const height = totalHariKerja > 0 ? (user.totalHadir / totalHariKerja) * 100 : 0
        const bar = document.createElement('div')
        bar.style.flex = '1'
        bar.style.display = 'flex'
        bar.style.flexDirection = 'column'
        bar.style.alignItems = 'center'
        bar.style.gap = '5px'

        bar.innerHTML = `
            <div style="height: 150px; width: 100%; display: flex; align-items: flex-end;">
                <div style="height: ${height}%; width: 100%; background: ${user.persentase > 75 ? '#27AE60' : (user.persentase > 50 ? '#F39C12' : '#E74C3C')}; border-radius: 5px 5px 0 0;"></div>
            </div>
            <div style="font-size: 10px; text-align: center; white
