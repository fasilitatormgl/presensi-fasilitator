import { auth, db } from "./firebase-init.js"
import { collection, getDocs, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js"
import { signOut } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js"

// ========== VARIABEL GLOBAL ==========
let userData = {}
let currentFilter = {
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

// ========== FORMAT BULAN ==========
function formatBulan(bulan, tahun) {
    const namaBulan = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
        'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember']
    return `${namaBulan[bulan - 1]} ${tahun}`
}

// ========== INIT DASHBOARD ==========
window.addEventListener('load', async () => {
    showLoading(true)
    console.log("🚀 Memulai dashboard pemantau...")

    try {
        const storedData = localStorage.getItem("userData")
        if (storedData) {
            userData = JSON.parse(storedData)
        }

        if (!userData || userData.role !== 'pemantau') {
            window.location.href = "index.html"
            return
        }

        document.getElementById("userName").textContent = userData.nama || "Pemantau"
        document.getElementById("avatar").textContent = (userData.nama || "P").charAt(0).toUpperCase()
        document.getElementById("userRole").textContent = "Pemantau - Monitoring"

        const logoutBtn = document.getElementById("logoutBtn")
        if (logoutBtn) logoutBtn.addEventListener("click", logout)

        // Set default bulan & tahun saat ini
        document.getElementById("filterBulan").value = new Date().getMonth() + 1
        document.getElementById("filterTahun").value = new Date().getFullYear()

        await loadData()
        await loadFilterOptions()
        await cekStatusLokasiAktif()
        await loadRekapBulanan()

        console.log("✅ Dashboard pemantau siap!")

    } catch (error) {
        console.error("❌ Error:", error)
        showError("Gagal memuat dashboard: " + error.message)
    } finally {
        showLoading(false)
    }
})

// ========== LOAD SEMUA DATA ==========
async function loadData() {
    try {
        console.log("📥 Mengambil data users...")
        const usersSnap = await getDocs(collection(db, "users"))
        allUsers = []
        usersSnap.forEach(doc => {
            const data = doc.data()
            // Abaikan admin & pemantau
            if (data.role !== 'admin' && data.role !== 'pemantau') {
                allUsers.push({
                    id: doc.id,
                    uid: data.uid || doc.id,
                    ...data
                })
            }
        })
        console.log(`✅ ${allUsers.length} user dimuat`)

        console.log("📥 Mengambil data presensi...")
        const presensiSnap = await getDocs(collection(db, "presensi"))
        allPresensi = []
        presensiSnap.forEach(doc => {
            allPresensi.push({ id: doc.id, ...doc.data() })
        })
        console.log(`✅ ${allPresensi.length} presensi dimuat`)

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

        const select = document.getElementById("filterKelurahan")
        if (select) {
            select.innerHTML = '<option value="">Semua Kelurahan</option>'
            Array.from(kelurahanSet).sort().forEach(kel => {
                const option = document.createElement("option")
                option.value = kel
                option.textContent = kel
                select.appendChild(option)
            })
        }

        console.log("✅ Filter kelurahan dimuat:", kelurahanSet.size, "kelurahan")

    } catch (error) {
        console.error("❌ Error load filter:", error)
    }
}

// ========== LOAD REKAP BULANAN ==========
async function loadRekapBulanan() {
    try {
        console.log("📊 Memuat rekap bulanan...")
        const filterBulanEl = document.getElementById("filterBulan");
        const filterTahunEl = document.getElementById("filterTahun");
        const filterKelurahanEl = document.getElementById("filterKelurahan");

        if (!filterBulanEl || !filterTahunEl) {
            console.warn("⚠️ Elemen filter tidak ditemukan");
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

        console.log(`👥 Users: ${filteredUsers.length}`)

        // Sorting: Koordinator di atas → Kelurahan A-Z → Nama A-Z
        filteredUsers.sort((a, b) => {
            const isAKoord = a.role === 'koordinator' ? 1 : 0;
            const isBKoord = b.role === 'koordinator' ? 1 : 0;
            if (isAKoord !== isBKoord) return isBKoord - isAKoord;

            const kelA = (a.kelurahan || '').toUpperCase();
            const kelB = (b.kelurahan || '').toUpperCase();
            if (kelA < kelB) return -1;
            if (kelA > kelB) return 1;

            return (a.nama || '').localeCompare(b.nama || '');
        });

        const daysInMonth = new Date(tahun, bulan, 0).getDate();
        const strBulan = String(bulan).padStart(2, '0');

        // Hitung hari kerja efektif (Senin-Jumat)
        let totalHariKerjaEfektif = 0;
        for (let d = 1; d <= daysInMonth; d++) {
            const dayOfWeek = new Date(tahun, bulan - 1, d).getDay();
            if (dayOfWeek !== 0 && dayOfWeek !== 6) totalHariKerjaEfektif++;
        }

        // Header tabel dinamis (tanggal 1-31)
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

        // Mapping presensi per user per tanggal
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
                            jamAbsen = `${String(dateObj.getHours()).padStart(2, '0')}:${String(dateObj.getMinutes()).padStart(2, '0')}`;
                        } catch (e) { }
                    }

                    if (!jamAbsen && p.waktu?.seconds !== undefined) {
                        try {
                            const dateObj = new Date(p.waktu.seconds * 1000);
                            jamAbsen = dateObj.toLocaleTimeString('id-ID', {
                                hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Jakarta'
                            }).replace(/\./g, ':');
                        } catch (e) { }
                    }

                    if (!jamAbsen && typeof p.waktu === 'string') {
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
                    const jamMasuk = presensiMapByUser[user.uid]?.[strDate];

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

            userStatsForGrafik.push({ ...user, totalHadir: totalHadirUser, persentase });

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
            tableBulananEl.innerHTML = html || `<tr><td colspan="${daysInMonth + 6}" class="text-center">Tidak ada data</td></tr>`;
        }

        // Update stat cards
        const totalUser = filteredUsers.length;
        const rataHadir = totalUser > 0 ? (totalHadirSemua / totalUser).toFixed(1) : 0;
        const persenGlobal = totalHariKerjaEfektif > 0 ? Math.round((rataHadir / totalHariKerjaEfektif) * 100) : 0;

        const totalHariEl = document.getElementById("totalHari");
        if (totalHariEl) totalHariEl.textContent = totalHariKerjaEfektif + " Hari";

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
        console.error("❌ Error:", error);
        const tableBulananEl = document.getElementById("tableBulanan");
        if (tableBulananEl) {
            tableBulananEl.innerHTML = `<tr><td colspan="15" style="color:red; text-align:center; padding:15px;">⚠️ Gagal: ${error.message}</td></tr>`;
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
        bar.style.cssText = 'flex:1; display:flex; flex-direction:column; align-items:center; gap:5px;'

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

// ========== FILTER ==========
window.applyFilter = function() {
    loadRekapBulanan()
}

window.resetFilter = function() {
    document.getElementById("filterKelurahan").value = ''
    document.getElementById("filterBulan").value = new Date().getMonth() + 1
    document.getElementById("filterTahun").value = new Date().getFullYear()
    loadRekapBulanan()
}

// ========== EXPORT EXCEL ==========
window.exportBulanan = async function() {
    const bulan = parseInt(document.getElementById("filterBulan").value)
    const tahun = parseInt(document.getElementById("filterTahun").value)
    const kelurahan = document.getElementById("filterKelurahan").value

    showLoading(true)
    try {
        let filteredUsers = [...allUsers]
        if (kelurahan) {
            filteredUsers = filteredUsers.filter(u => u.kelurahan === kelurahan)
        }

        filteredUsers.sort((a, b) => {
            const aKoord = a.role === 'koordinator' ? 1 : 0
            const bKoord = b.role === 'koordinator' ? 1 : 0
            if (aKoord !== bKoord) return bKoord - aKoord
            const kelA = (a.kelurahan || '').toUpperCase()
            const kelB = (b.kelurahan || '').toUpperCase()
            if (kelA < kelB) return -1
            if (kelA > kelB) return 1
            return (a.nama || '').localeCompare(b.nama || '')
        })

        const daysInMonth = new Date(tahun, bulan, 0).getDate()
        const strBulan = String(bulan).padStart(2, '0')

        let totalHariKerjaEfektif = 0
        for (let d = 1; d <= daysInMonth; d++) {
            const dayOfWeek = new Date(tahun, bulan - 1, d).getDay()
            if (dayOfWeek !== 0 && dayOfWeek !== 6) totalHariKerjaEfektif++
        }

        // Header
        const headerRow = ['No', 'Nama', 'Role', 'Kelurahan']
        for (let d = 1; d <= daysInMonth; d++) headerRow.push(d)
        headerRow.push('Total Hadir', 'Hari Kerja', 'Persentase')

        const excelData = [headerRow]

        // Mapping presensi
        const presensiMapByUser = {}
        allPresensi.forEach(p => {
            if (p.tanggal) {
                const pDate = new Date(p.tanggal)
                if (pDate.getMonth() + 1 === bulan && pDate.getFullYear() === tahun) {
                    if (!presensiMapByUser[p.uid]) presensiMapByUser[p.uid] = {}
                    let jamAbsen = "H"
                    if (p.waktu?.seconds) {
                        const waktu = new Date(p.waktu.seconds * 1000)
                        jamAbsen = waktu.toLocaleTimeString('id-ID', {
                            hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Jakarta'
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
                    rowData.push('L')
                } else {
                    const jamMasuk = presensiMapByUser[user.uid]?.[strDate]
                    if (jamMasuk) {
                        rowData.push(jamMasuk)
                        totalHadirUser++
                    } else {
                        rowData.push('-')
                    }
                }
            }

            const persentase = totalHariKerjaEfektif > 0
                ? ((totalHadirUser / totalHariKerjaEfektif) * 100).toFixed(1) + '%'
                : '0%'
            rowData.push(totalHadirUser, totalHariKerjaEfektif, persentase)
            excelData.push(rowData)
        })

        const wb = XLSX.utils.book_new()
        const ws = XLSX.utils.aoa_to_sheet(excelData)

        const wscols = [{ wch: 5 }, { wch: 25 }, { wch: 15 }, { wch: 20 }]
        for (let i = 1; i <= daysInMonth; i++) wscols.push({ wch: 4 })
        wscols.push({ wch: 12 }, { wch: 12 }, { wch: 20 })
        ws['!cols'] = wscols

        const namaBulan = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
            'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember']
        const fileName = kelurahan
            ? `Rekap_Bulanan_${kelurahan}_${namaBulan[bulan - 1]}_${tahun}.xlsx`
            : `Rekap_Bulanan_${namaBulan[bulan - 1]}_${tahun}.xlsx`

        XLSX.utils.book_append_sheet(wb, ws, "Rekap Bulanan")
        XLSX.writeFile(wb, fileName)

        console.log("✅ Export berhasil:", fileName)

    } catch (error) {
        console.error("❌ Error export:", error)
        alert("❌ Gagal export: " + error.message)
    } finally {
        showLoading(false)
    }
}

// ========== MONITORING STATUS LOKASI ==========
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
                now >= start && now <= end;

            notifEl.style.display = "block";

            if (isCustomActive) {
                notifEl.innerHTML = `
                    <div style="background-color: #F5EEF8; color: #6C3483; border: 1px solid #D7BDE2; padding: 12px 15px; border-radius: 8px; font-size: 13px; font-weight: 500; display: flex; align-items: center; gap: 10px; box-shadow: 0 2px 4px rgba(0,0,0,0.02); margin-bottom: 15px;">
                        <span style="font-size: 16px;">🟣</span> 
                        <span><strong>Status Wilayah:</strong> <strong>Lokasi Custom ("${data.temporaryLocationName}")</strong> aktif, radius ${data.temporaryRadius}m.</span>
                    </div>
                `;
            } else {
                notifEl.innerHTML = `
                    <div style="background-color: #E8F8F5; color: #117864; border: 1px solid #A3E4D7; padding: 12px 15px; border-radius: 8px; font-size: 13px; font-weight: 500; display: flex; align-items: center; gap: 10px; box-shadow: 0 2px 4px rgba(0,0,0,0.02); margin-bottom: 15px;">
                        <span style="font-size: 16px;">🟢</span> 
                        <span><strong>Status Wilayah:</strong> Normal - <strong>Lokasi Default</strong> digunakan.</span>
                    </div>
                `;
            }
        }
    } catch (error) {
        console.error("Gagal cek status lokasi:", error);
    }
}

console.log("✅ pemantau.js siap (mode bulanan only)");
