import { auth, db } from "./firebase-init.js"
import { collection, addDoc, query, where, getDocs, getDoc, doc, updateDoc } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js"
import { signOut } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js"
import { initMap, addMarker } from "./map.js"
import { resetUserDevice } from "./device.js"

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
let latUser = null
let lngUser = null
let map = null
let userMarker = null

let currentMode = 'harian' // 'harian' atau 'bulanan'
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
    return `${namaBulan[bulan-1]} ${tahun}`
}

// ========== SWITCH TAB ==========
window.showTab = function(tab) {
    if (tab === 'absensi') {
        document.getElementById('tabAbsensiContent').style.display = 'block'
        document.getElementById('tabRekapContent').style.display = 'none'
        document.getElementById('tabAbsensi').style.background = '#EE2737'
        document.getElementById('tabRekap').style.background = '#3498DB'
        setTimeout(() => {
            if (map) map.invalidateSize()
        }, 200)
    } else {
        document.getElementById('tabAbsensiContent').style.display = 'none'
        document.getElementById('tabRekapContent').style.display = 'block'
        document.getElementById('tabAbsensi').style.background = '#3498DB'
        document.getElementById('tabRekap').style.background = '#EE2737'
        loadRekap()
    }
}

// ========== SET MODE REKAP ==========
window.setMode = function(mode) {
    currentMode = mode
    
    if (mode === 'harian') {
        document.getElementById('filterHarian').style.display = 'block'
        document.getElementById('filterBulanan').style.display = 'none'
        document.getElementById('rekapHarian').style.display = 'block'
        document.getElementById('rekapBulanan').style.display = 'none'
        document.getElementById('btnHarian').style.background = '#EE2737'
        document.getElementById('btnBulanan').style.background = '#3498DB'
        loadRekapHarian()
    } else {
        document.getElementById('filterHarian').style.display = 'none'
        document.getElementById('filterBulanan').style.display = 'block'
        document.getElementById('rekapHarian').style.display = 'none'
        document.getElementById('rekapBulanan').style.display = 'block'
        document.getElementById('btnHarian').style.background = '#3498DB'
        document.getElementById('btnBulanan').style.background = '#EE2737'
        loadRekapBulanan()
    }
}

// ========== INIT DASHBOARD ==========
window.addEventListener('load', async () => {
    showLoading(true)
    
    try {
        const storedData = localStorage.getItem("userData")
        if (storedData) {
            userData = JSON.parse(storedData)
        }
        
        if (!userData || userData.role !== 'koordinator') {
            window.location.href = "index.html"
            return
        }
        
        document.getElementById("userName").textContent = userData.nama || "Koordinator"
        document.getElementById("avatar").textContent = (userData.nama || "K").charAt(0).toUpperCase()
        document.getElementById("userRole").textContent = "Koordinator - Fasilitator"
        
        const logoutBtn = document.getElementById("logoutBtn")
        if (logoutBtn) logoutBtn.addEventListener("click", logout)
        
        // Set tanggal filter internal ke waktu default saat ini
        const today = getTodayLocal();
        document.getElementById("filterTanggal").value = today
        document.getElementById("filterBulan").value = new Date().getMonth() + 1
        document.getElementById("filterTahun").value = new Date().getFullYear()
        currentFilter.tanggal = today
        
        await loadData()
        await loadFilterOptions()
        await getLokasiUser()
        await cekStatusPresensi()
        await loadRekapHarian()
        
    } catch (error) {
        console.error("Error:", error)
        showError("Gagal memuat dashboard pastikan lokasi aktif")
    } finally {
        showLoading(false)
    }
})

// ========== LOAD SEMUA DATA (OPTIMASI KUOTA FIRESTORE) ==========
async function loadData() {
    try {
        const usersSnap = await getDocs(collection(db, "users"))
        allUsers = []
        usersSnap.forEach(doc => {
            const data = doc.data()
            if (data.role !== 'admin') {
                allUsers.push({ 
                    id: doc.id,
                    uid: data.uid || doc.id,
                    ...data 
                })
            }
        })
        
        const presensiSnap = await getDocs(collection(db, "presensi"))
        allPresensi = []
        presensiSnap.forEach(doc => {
            allPresensi.push({ id: doc.id, ...doc.data() })
        })
        
    } catch (error) {
        console.error("Error load data:", error)
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
        
        const select = document.getElementById("filterKelurahan")
        select.innerHTML = '<option value="">Semua Kelurahan</option>'
        
        Array.from(kelurahanSet).sort().forEach(kel => {
            const option = document.createElement("option")
            option.value = kel
            option.textContent = kel
            select.appendChild(option)
        })
        
    } catch (error) {
        console.error("Error load filter:", error)
    }
}

// ========== DAPATKAN LOKASI USER ==========
function getLokasiUser() {
    return new Promise((resolve, reject) => {
        if (!navigator.geolocation) {
            showError("Browser tidak mendukung geolocation")
            reject()
            return
        }
        
        navigator.geolocation.getCurrentPosition(
            (position) => {
                latUser = position.coords.latitude
                lngUser = position.coords.longitude
                setTimeout(() => initMapWithLocations(), 500)
                resolve()
            },
            (error) => {
                console.error("Error getting location:", error)
                showError("Gagal mendapatkan lokasi. Pastikan GPS aktif.")
                reject()
            },
            { enableHighAccuracy: true, timeout: 10000 }
        )
    })
}

// ========== INIT MAP ==========
function initMapWithLocations() {
    const mapElement = document.getElementById('map')
    if (!mapElement || !latUser || !lngUser) return
    
    try {
        if (map) map.remove()
        map = initMap('map', latUser, lngUser, 16)
        if (!map) return
        userMarker = addMarker(map, latUser, lngUser, 'Lokasi Anda', 'user')
        setTimeout(() => map.invalidateSize(), 300)
    } catch (error) {
        console.error("Error init map:", error)
    }
}

// ========== CEK STATUS PRESENSI KOORDINATOR ==========
async function cekStatusPresensi() {
    const today = getTodayLocal();
    
    // Gunakan array lokal allPresensi agar tidak memboroskan query Firestore
    const dataExist = allPresensi.find(p => p.uid === userData.uid && p.tanggal === today)
    
    const btnPresensi = document.getElementById("btnPresensi")
    const statusBadge = document.getElementById("statusBadge")
    const statusEmoji = document.getElementById("statusEmoji")
    const statusText = document.getElementById("statusText")
    const presensiTime = document.getElementById("presensiTime")
    
    if (dataExist) {
        const waktu = dataExist.waktu?.seconds ? new Date(dataExist.waktu.seconds * 1000) : new Date()
        
        if (statusBadge) statusBadge.innerHTML = '✓ Hadir'
        if (statusEmoji) statusEmoji.textContent = '✅'
        if (statusText) statusText.textContent = 'Koordinator - sudah presensi'
        if (presensiTime) presensiTime.textContent = `Pukul: ${waktu.toLocaleTimeString()} (Lokasi)`
        
        if (btnPresensi) {
            btnPresensi.disabled = true
            btnPresensi.innerHTML = '<span>✅</span> Sudah Presensi'
        }
    } else {
        if (statusBadge) statusBadge.innerHTML = '○ Belum'
        if (statusEmoji) statusEmoji.textContent = '⏰'
        if (statusText) statusText.textContent = 'Koordinator - Fasilitator'
        if (presensiTime) presensiTime.textContent = ''
        
        if (btnPresensi) {
            btnPresensi.disabled = false
            btnPresensi.innerHTML = '<span>📍</span> Presensi Sekarang'
            btnPresensi.onclick = presensi
        }
    }
}

// ========== PRESENSI KOORDINATOR ==========
async function presensi() {
    showLoading(true)
    
    try {
        if (!latUser || !lngUser) {
            showError("Gagal mendapatkan lokasi! Pastikan GPS aktif.")
            return
        }
        
        const today = getTodayLocal();
        
        const q = query(
            collection(db, "presensi"),
            where("uid", "==", userData.uid),
            where("tanggal", "==", today)
        )
        
        const cek = await getDocs(q)
        if (!cek.empty) {
            showError("Hari ini sudah presensi!")
            return
        }
        
        await addDoc(collection(db, "presensi"), {
            uid: userData.uid,
            nama: userData.nama,
            tanggal: today,
            lat: latUser,
            lng: lngUser,
            lokasi: "koordinator",
            waktu: new Date(),
            deviceId: localStorage.getItem("deviceId")
        })
        
        alert("✅ Presensi koordinator berhasil!")
        window.location.reload()
        
    } catch (error) {
        console.error("Error presensi:", error)
        showError("Gagal presensi: " + error.message)
    } finally {
        showLoading(false)
    }
}

// ========== LOAD REKAP (SWITCH MODE) ==========
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
        const tanggal = document.getElementById("filterTanggal").value
        const kelurahan = document.getElementById("filterKelurahan").value
        
        currentFilter.tanggal = tanggal
        currentFilter.kelurahan = kelurahan
        
        document.getElementById("tanggalDisplay").textContent = formatTanggal(tanggal)
        
        let filteredUsers = allUsers
        if (kelurahan) {
            filteredUsers = allUsers.filter(u => u.kelurahan === kelurahan)
        }
        
        const presensiHariIni = allPresensi.filter(p => p.tanggal === tanggal)
        const presensiMap = new Map()
        presensiHariIni.forEach(p => presensiMap.set(p.uid, p))
        
        const usersWithStatus = filteredUsers.map(user => ({
            ...user,
            status: presensiMap.has(user.uid) ? 'Hadir' : 'Belum',
            dataPresensi: presensiMap.get(user.uid)
        }))
        
        // SORTING: BELUM di atas, HADIR di bawah
        usersWithStatus.sort((a, b) => {
            if (a.status === 'Belum' && b.status === 'Hadir') return -1
            if (a.status === 'Hadir' && b.status === 'Belum') return 1
            return 0
        })
        
        const hadir = usersWithStatus.filter(u => u.status === 'Hadir').length
        const total = filteredUsers.length
        document.getElementById("totalFasilitator").textContent = total
        document.getElementById("hadirHariIni").textContent = hadir
        document.getElementById("belumHadir").textContent = total - hadir
        document.getElementById("persentase").textContent = total > 0 ? Math.round((hadir/total)*100) + '%' : '0%'
        
        let html = ''
        usersWithStatus.forEach((user, index) => {
            const p = user.dataPresensi
            const statusColor = p ? '#27AE60' : '#E74C3C'
            const waktu = p ? new Date(p.waktu?.seconds * 1000).toLocaleTimeString() : '-'
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
                    <td>
                        <button onclick="resetDevice('${user.uid}')" style="background:none; border:none; color:#EE2737; cursor:pointer; font-size:12px;">
                            ⟲ Reset
                        </button>
                    </td>
                </tr>
            `
        })
        
        document.getElementById("tableHarian").innerHTML = html || '<tr><td colspan="7" class="text-center">Tidak ada data</td></tr>'
        
    } catch (error) {
        console.error("Error load rekap harian:", error)
    }
}

// ========== LOAD REKAP BULANAN (MATRIKS OTOMATIS + JAM ABSENSI + FIX TOTAL HADIR EROR) ==========
async function loadRekapBulanan() {
    try {
        const filterBulanEl = document.getElementById("filterBulan");
        const filterTahunEl = document.getElementById("filterTahun");
        const filterKelurahanEl = document.getElementById("filterKelurahan");

        if (!filterBulanEl || !filterTahunEl) {
            console.warn("Elemen filter bulan/tahun belum siap di HTML.");
            return;
        }

        const bulan = parseInt(filterBulanEl.value);
        const tahun = parseInt(filterTahunEl.value);
        const kelurahan = filterKelurahanEl ? filterKelurahanEl.value : "";
        
        // Proteksi jika objek global currentFilter belum di-declare sebelumnya
        if (typeof currentFilter !== 'undefined') {
            currentFilter.bulan = bulan;
            currentFilter.tahun = tahun;
            currentFilter.kelurahan = kelurahan;
        }
        
        const bulanDisplayEl = document.getElementById("bulanDisplay");
        if (bulanDisplayEl && typeof formatBulan === 'function') {
            bulanDisplayEl.textContent = formatBulan(bulan, tahun);
        }
        
        // Pastikan variabel data user massal tersedia
        let filteredUsers = typeof allUsers !== 'undefined' ? [...allUsers] : []; 
        if (kelurahan) {
            filteredUsers = filteredUsers.filter(u => u.kelurahan === kelurahan);
        }
        
        // PROSES SORTING: KOORDINATOR PALING ATAS -> LALU URUT KELURAHAN A-Z
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
        
        // 1. HITUNG HARI KERJA EFEKTIF (Senin - Jumat)
        let totalHariKerjaEfektif = 0;
        for (let d = 1; d <= daysInMonth; d++) {
            const dayOfWeek = new Date(tahun, bulan - 1, d).getDay();
            if (dayOfWeek !== 0 && dayOfWeek !== 6) {
                totalHariKerjaEfektif++;
            }
        }
        
        // 2. GENERATE HEADER TABEL DINAMIS (MATRIKS TANGGAL 1 - 31)
        const dynamicHeader = document.getElementById("headerBulanan");
        if (dynamicHeader) {
            let headerHtml = '<th>No</th><th>Nama Fasilitator</th><th>Kelurahan</th>';
            for (let d = 1; d <= daysInMonth; d++) {
                const dayOfWeek = new Date(tahun, bulan - 1, d).getDay();
                const isWeekend = (dayOfWeek === 0 || dayOfWeek === 6);
                headerHtml += `<th style="background: ${isWeekend ? '#E74C3C' : '#34495E'}; color: white; min-width: 35px; padding: 4px; text-align: center;">${d}</th>`;
            }
            headerHtml += '<th>Hadir</th><th>Kerja</th><th>%</th><th>Aksi</th>';
            dynamicHeader.innerHTML = headerHtml;
        }

        // 3. MAP PRESENSI USER (PROTEKSI TOTAL DARI AKUN LOG CORRUPT)
        const presensiMapByUser = {};
        const sourcePresensi = typeof allPresensi !== 'undefined' ? allPresensi : [];

        sourcePresensi.forEach(p => {
            if (p.tanggal && p.uid) {
                const pDate = new Date(p.tanggal);
                if (pDate.getMonth() + 1 === bulan && pDate.getFullYear() === tahun) {
                    if (!presensiMapByUser[p.uid]) presensiMapByUser[p.uid] = {};
                    
                    let jamAbsen = '';
                    
                    // Metode 1: Firebase Timestamp Object asli
                    if (p.waktu && typeof p.waktu.toDate === 'function') {
                        try {
                            const dateObj = p.waktu.toDate();
                            const jam = String(dateObj.getHours()).padStart(2, '0');
                            const menit = String(dateObj.getMinutes()).padStart(2, '0');
                            jamAbsen = `${jam}:${menit}`;
                        } catch(e) {}
                    } 
                    
                    // Metode 2: Sekadar menyisakan properti .seconds mentah akibat serialisasi data lokal
                    if (!jamAbsen && p.waktu && p.waktu.seconds !== undefined) {
                        try {
                            const dateObj = new Date(p.waktu.seconds * 1000);
                            jamAbsen = dateObj.toLocaleTimeString('id-ID', {
                                hour: '2-digit',
                                minute: '2-digit',
                                hour12: false,
                                timeZone: 'Asia/Jakarta'
                            }).replace(/\./g, ':');
                        } catch(e) {}
                    }
                    
                    // Metode 3: Format String biasa
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

        // 4. SUSUN ROW BARIS DATA MATRIX PER FASILITATOR
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
<td style="
    white-space: normal;
    word-break: break-word;
    min-width: 150px;
    font-weight: 500;
">
    ${user.nama || '-'} ${roleBadge}
</td>

<td style="
    white-space: normal;
    word-break: break-word;
    min-width: 100px;
">
    ${user.kelurahan || '-'}
</td>
                    ${cellsHtml}
                    <td style="font-weight: bold; text-align: center; background: #EAF2F8;">${totalHadirUser}</td>
                    <td style="text-align: center; color: #7F8C8D;">${totalHariKerjaEfektif}</td>
                    <td style="font-weight: bold; color: ${persentase >= 80 ? '#27AE60' : (persentase >= 50 ? '#F39C12' : '#E74C3C')}; text-align: center;">${persentase}%</td>
                    <td>
                        <button onclick="resetDevice('${user.uid}')" style="background:none; border:none; color:#EE2737; cursor:pointer; font-size:11px;">⟲ Reset</button>
                    </td>
                </tr>
            `;
        });
        
        const tableBulananEl = document.getElementById("tableBulanan");
        if (tableBulananEl) {
            tableBulananEl.innerHTML = html || `<tr><td colspan="${daysInMonth + 7}" class="text-center">Tidak ada data terdeteksi</td></tr>`;
        } else {
            console.error("Elemen dengan ID 'tableBulanan' tidak ditemukan di HTML.");
        }
        
        // 5. UPDATE CARD KOTAK STATISTIK BULANAN
        const totalUser = filteredUsers.length;
        const rataHadir = totalUser > 0 ? (totalHadirSemua / totalUser).toFixed(1) : 0;
        const persenGlobal = totalHariKerjaEfektif > 0 ? Math.round((rataHadir / totalHariKerjaEfektif) * 100) : 0;
        
        const totalHariEl = document.getElementById("totalHari");
        if (totalHariEl) totalHariEl.textContent = totalHariKerjaEfektif + " Hari Kerja";
        
        const rataHadirEl = document.getElementById("rataHadir");
        if (rataHadirEl) rataHadirEl.textContent = rataHadir + " Hari";
        
        const persenBulananEl = document.getElementById("persenBulanan");
        if (persenBulananEl) persenBulananEl.textContent = persenGlobal + '%';
        
        // 6. RENDER GRAFIK
        if (typeof renderGrafik === 'function' && userStatsForGrafik.length > 0) {
            userStatsForGrafik.sort((a, b) => a.totalHadir - b.totalHadir);
            renderGrafik(userStatsForGrafik.slice(0, 10), totalHariKerjaEfektif);
        }
        
    } catch (error) {
        console.error("Kritical Error rekap bulanan di-bypass:", error);
        
        // Penyelamat halaman: Jika error terjadi, ganti tulisan 'Memuat...' agar tidak gantung selamanya
        const tableBulananEl = document.getElementById("tableBulanan");
        if (tableBulananEl) {
            tableBulananEl.innerHTML = `<tr><td colspan="15" style="color:red; text-align:center; font-weight:bold; padding:15px;">⚠️ Gagal mengurai data: ${error.message}</td></tr>`;
        }
    } finally {
        // Amankan pemanggilan loading indicator bawaan jika menggunakan elemen UI biasa
        const loader = document.getElementById("loading");
        if (loader) loader.style.display = "none";
    }
}
// ========== RENDER WIDGET GRAFIK BAR ==========
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
            <div style="font-size: 10px; text-align: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 80px;" title="${user.nama}">
                ${user.nama?.split(' ')[0] || '-'}
            </div>
        `
        container.appendChild(bar)
    })
}

// ========== RESET DEVICE USER ==========
window.resetDevice = async function(uid) {
    if (!uid || uid === 'undefined') {
        alert("❌ Error: ID user tidak valid!")
        return
    }
    
    if (!confirm("⚠️ Yakin ingin reset device user ini?\n\nUser akan bisa login dari perangkat manapun.")) return
    
    showLoading(true)
    try {
        const result = await resetUserDevice(uid)
        if (result.success) {
            alert("✅ Device berhasil direset!")
            await loadData()
            loadRekap()
        } else {
            throw new Error(result.message)
        }
    } catch (error) {
        alert("❌ Gagal: " + error.message)
    } finally {
        showLoading(false)
    }
}

// ========== TRIGGER EVENT FILTER ==========
window.applyFilter = function() {
    loadRekap()
}

window.resetFilter = function() {
    document.getElementById("filterKelurahan").value = ''
    document.getElementById("filterTanggal").value = getTodayLocal()
    document.getElementById("filterBulan").value = new Date().getMonth() + 1
    document.getElementById("filterTahun").value = new Date().getFullYear()
    loadRekap()
}

// ========== FUNGSI EXPORT EXCEL RAPI ==========

// 1. Export Excel Harian
window.exportHarian = async function() {
    const tanggal = document.getElementById("filterTanggal").value
    const kelurahan = document.getElementById("filterKelurahan").value
    
    showLoading(true)
    try {
        let filteredUsers = allUsers
        if (kelurahan) {
            filteredUsers = allUsers.filter(u => u.kelurahan === kelurahan)
        }
        filteredUsers.sort((a, b) => {

    const aKoord = a.role === 'koordinator'
    const bKoord = b.role === 'koordinator'

    // Koordinator paling atas
    if (aKoord && !bKoord) return -1
    if (!aKoord && bKoord) return 1

    // Kelurahan A-Z
    const kelA = (a.kelurahan || '').toUpperCase()
    const kelB = (b.kelurahan || '').toUpperCase()

    if (kelA < kelB) return -1
    if (kelA > kelB) return 1

    // Nama A-Z
    return (a.nama || '').localeCompare(b.nama || '')
})
        
        const presensiHariIni = allPresensi.filter(p => p.tanggal === tanggal)
        const presensiMap = new Map()
        presensiHariIni.forEach(p => presensiMap.set(p.uid, p))
        
        const data = [['No', 'Nama', 'Role', 'Kelurahan', 'Status Kehadiran', 'Waktu Absen', 'Lokasi']]
        
        let no = 1
        filteredUsers.forEach(user => {
            const p = presensiMap.get(user.uid)
            const status = p ? 'Hadir' : 'Belum Hadir'
            const waktu = p ? new Date(p.waktu?.seconds * 1000).toLocaleTimeString() : '-'
            const lokasi = p ? (p.lokasi === 'kantor' ? 'Kantor Pusat' : (p.lokasi || '-')) : '-'
            const role = user.role === 'koordinator' ? 'Koordinator' : 'Fasilitator'
            
            data.push([no++, user.nama || '-', role, user.kelurahan || '-', status, waktu, lokasi])
        })
        
        const wb = XLSX.utils.book_new()
        const ws = XLSX.utils.aoa_to_sheet(data)
        
        ws['!cols'] = [{wch: 5}, {wch: 25}, {wch: 15}, {wch: 20}, {wch: 18}, {wch: 15}, {wch: 20}]
        
        const fileName = kelurahan ? `Rekap_Harian_${kelurahan}_${tanggal}.xlsx` : `Rekap_Harian_${tanggal}.xlsx`
        XLSX.utils.book_append_sheet(wb, ws, "Harian")
        XLSX.writeFile(wb, fileName)
        
    } catch (error) {
        console.error("Error export harian:", error)
        alert("❌ Gagal export harian: " + error.message)
    } finally {
        showLoading(false)
    }
}

// 2. Export Excel Bulanan Bermatriks Tanggal Ke Samping (1-31)
window.exportBulanan = async function() {
    const bulan = parseInt(document.getElementById("filterBulan").value)
    const tahun = parseInt(document.getElementById("filterTahun").value)
    const kelurahan = document.getElementById("filterKelurahan").value
    
    showLoading(true)
    try {
        let filteredUsers = allUsers
        if (kelurahan) {
            filteredUsers = allUsers.filter(u => u.kelurahan === kelurahan)
        }
        filteredUsers.sort((a, b) => {

    const aKoord = a.role === 'koordinator'
    const bKoord = b.role === 'koordinator'

    // Koordinator paling atas
    if (aKoord && !bKoord) return -1
    if (!aKoord && bKoord) return 1

    // Kelurahan A-Z
    const kelA = (a.kelurahan || '').toUpperCase()
    const kelB = (b.kelurahan || '').toUpperCase()

    if (kelA < kelB) return -1
    if (kelA > kelB) return 1

    // Nama A-Z
    return (a.nama || '').localeCompare(b.nama || '')
})
        
        const daysInMonth = new Date(tahun, bulan, 0).getDate()
        const strBulan = String(bulan).padStart(2, '0')
        
        // Hitung total hari kerja efektif dalam sebulan (exclude Sabtu-Minggu)
        let totalHariKerjaEfektif = 0;
        for (let d = 1; d <= daysInMonth; d++) {
            const dayOfWeek = new Date(tahun, bulan - 1, d).getDay();
            if (dayOfWeek !== 0 && dayOfWeek !== 6) totalHariKerjaEfektif++;
        }
        
        // Buat Baris Header Matriks Excel
        const headerRow = ['No', 'Nama Fasilitator', 'Role', 'Kelurahan']
        for (let d = 1; d <= daysInMonth; d++) {
            headerRow.push(d) // Kolom angka penanggalan sebulan penuh
        }
        headerRow.push('Total Hadir', 'Hari Kerja', 'Persentase Kehadiran')
        
        const excelData = [headerRow]
        
const presensiMapByUser = {}

allPresensi.forEach(p => {
    if (p.tanggal) {
        const pDate = new Date(p.tanggal)

        if (pDate.getMonth() + 1 === bulan && pDate.getFullYear() === tahun) {

            if (!presensiMapByUser[p.uid]) {
                presensiMapByUser[p.uid] = {}
            }

            let jamAbsen = "H"

            if (p.waktu?.seconds) {
                const waktu = new Date(p.waktu.seconds * 1000)

                jamAbsen = waktu.toLocaleTimeString('id-ID', {
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: false,
                    timeZone: 'Asia/Jakarta'
                }).replace(/\./g, ':')
            }

            presensiMapByUser[p.uid][p.tanggal] = jamAbsen
        }
    }
})
        
        let no = 1
        filteredUsers.forEach(user => {
            const role = user.role === 'koordinator' ? 'Koordinator' : 'Fasilitator'
            const rowData = [no++, user.nama || '-', role, user.kelurahan || '-']
            let totalHadirUser = 0
            
            for (let d = 1; d <= daysInMonth; d++) {
                const strDate = `${tahun}-${strBulan}-${String(d).padStart(2, '0')}`
                const dayOfWeek = new Date(tahun, bulan - 1, d).getDay()
                const isWeekend = (dayOfWeek === 0 || dayOfWeek === 6)
                
                if (isWeekend) {
                    rowData.push('L') // Isi L di kolom Excel untuk Sabtu & Minggu
                } else {
                const jamMasuk = presensiMapByUser[user.uid] && presensiMapByUser[user.uid][strDate]

                if (jamMasuk) {
                rowData.push(jamMasuk) // tampilkan jam
                totalHadirUser++
                } else {
                   rowData.push('-')
                }
                }
            }
            
            const persentase = totalHariKerjaEfektif > 0 ? ((totalHadirUser / totalHariKerjaEfektif) * 100).toFixed(1) + '%' : '0%'
            rowData.push(totalHadirUser, totalHariKerjaEfektif, persentase)
            excelData.push(rowData)
        })
        
        const wb = XLSX.utils.book_new()
        const ws = XLSX.utils.aoa_to_sheet(excelData)
        ws["!rows"] = []

for (let i = 0; i < 500; i++) {
    ws["!rows"].push({ hpt: 35 })
}
        
        // Konfigurasi lebar kolom agar rapi saat dibuka di Excel
        const wscols = [{wch: 5}, {wch: 25}, {wch: 15}, {wch: 20}]
        for (let i = 1; i <= daysInMonth; i++) wscols.push({wch: 4}) 
        wscols.push({wch: 12}, {wch: 12}, {wch: 20})
        ws['!cols'] = wscols
        
        const namaBulan = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 
                           'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember']
        const fileName = kelurahan 
            ? `Rekap_Bulanan_${kelurahan}_${namaBulan[bulan-1]}_${tahun}.xlsx` 
            : `Rekap_Bulanan_${namaBulan[bulan-1]}_${tahun}.xlsx`
            
        XLSX.utils.book_append_sheet(wb, ws, "Rekap Bulanan Matriks")
        XLSX.writeFile(wb, fileName)
        
    } catch (error) {
        console.error("Error export bulanan:", error)
        alert("❌ Gagal export bulanan: " + error.message)
    } finally {
        showLoading(false)
    }
}
// ==========================================================
// PASTE KODE INI DI BARIS PALING BAWAH FILE
// ==========================================================

// === FUNGSI MONITORING STATUS LOKASI DARI ADMIN ===
async function cekStatusLokasiAktif() {
    const notifEl = document.getElementById("notifikasiStatusLokasi");
    if (!notifEl) return;

    try {
        const docSnap = await getDoc(doc(db, "system_settings", "global"));
        
        if (docSnap.exists()) {
            const data = docSnap.data();
            const now = new Date();
            const start = data.temporaryStart ? new Date(data.temporaryStart) : null;
            const end = data.temporaryEnd ? new Date(data.temporaryEnd) : null;

            const isCustomActive = 
                data.statusLokasi === "custom" && 
                data.temporaryLocationEnabled &&
                start && end && 
                now >= start && 
                now <= end;

            notifEl.style.display = "block";

            if (isCustomActive) {
                notifEl.innerHTML = `
                    <div style="background-color: #F5EEF8; color: #6C3483; border: 1px solid #D7BDE2; padding: 12px 15px; border-radius: 8px; font-size: 13px; font-weight: 500; display: flex; align-items: center; gap: 10px; box-shadow: 0 2px 4px rgba(0,0,0,0.02); margin-bottom: 15px;">
                        <span style="font-size: 16px;">🟣</span> 
                        <span><strong>Status Wilayah:</strong> <strong>Lokasi Custom ("${data.temporaryLocationName}")</strong> sedang diaktifkan oleh Pusat untuk radius ${data.temporaryRadius} meter.</span>
                    </div>
                `;
            } else {
                notifEl.innerHTML = `
                    <div style="background-color: #E8F8F5; color: #117864; border: 1px solid #A3E4D7; padding: 12px 15px; border-radius: 8px; font-size: 13px; font-weight: 500; display: flex; align-items: center; gap: 10px; box-shadow: 0 2px 4px rgba(0,0,0,0.02); margin-bottom: 15px;">
                        <span style="font-size: 16px;">🟢</span> 
                        <span><strong>Status Wilayah:</strong> Sistem berjalan normal. <strong>Lokasi Default (Kantor/Kelurahan)</strong> digunakan.</span>
                    </div>
                `;
            }
        } else {
            notifEl.style.display = "block";
            notifEl.innerHTML = `
                <div style="background-color: #E8F8F5; color: #117864; border: 1px solid #A3E4D7; padding: 12px 15px; border-radius: 8px; font-size: 13px; font-weight: 500; display: flex; align-items: center; gap: 10px; margin-bottom: 15px;">
                    <span>🟢</span> <span><strong>Status Wilayah:</strong> <strong>Lokasi Default digunakan</strong>.</span>
                </div>
            `;
        }
    } catch (error) {
        console.error("Gagal memeriksa status lokasi dari admin:", error);
    }
}

// Jalankan fungsi setelah halaman koordinator selesai dimuat sepenuhnya
window.addEventListener('load', () => {
    cekStatusLokasiAktif();
});
