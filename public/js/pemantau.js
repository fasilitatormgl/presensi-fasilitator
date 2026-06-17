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
    if (tab === 'absensi') {
        document.getElementById('tabAbsensiContent').style.display = 'block'
        document.getElementById('tabRekapContent').style.display = 'none'
        document.getElementById('tabAbsensi').style.background = '#EE2737'
        document.getElementById('tabRekap').style.background = '#3498DB'
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

        if (!userData || userData.role !== 'pemantau') {
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

        await loadData()
        await loadFilterOptions()
        await cekStatusLokasiAktif()
        await loadRekapHarian()

    } catch (error) {
        console.error("Error:", error)
        showError("Gagal memuat dashboard pemantau")
    } finally {
        showLoading(false)
    }
})

// ========== LOAD SEMUA DATA ==========
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
        document.getElementById("persentase").textContent = total > 0 ? Math.round((hadir / total) * 100) + '%' : '0%'

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
                </tr>
            `
        })

        document.getElementById("tableHarian").innerHTML = html || '<tr><td colspan="6" class="text-center">Tidak ada data</td></tr>'

    } catch (error) {
        console.error("Error load rekap harian:", error)
    }
}

// ========== LOAD REKAP BULANAN ==========
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

        const totalUser = filteredUsers.length;
        const rataHadir = totalUser > 0 ? (totalHadirSemua / totalUser).toFixed(1) : 0;
        const persenGlobal = totalHariKerjaEfektif > 0 ? Math.round((rataHadir / totalHariKerjaEfektif) * 100) : 0;

        const totalHariEl = document.getElementById("totalHari");
        if (totalHariEl) totalHariEl.textContent = totalHariKerjaEfektif + " Hari Kerja";

        const rataHadirEl = document.getElementById("rataHadir");
        if (rataHadirEl) rataHadirEl.textContent = rataHadir + " Hari";

        const persenBulananEl = document.getElementById("persenBulanan");
        if (persenBulananEl) persenBulananEl.textContent = persenGlobal + '%';

    } catch (error) {
        console.error("Error load rekap bulanan:", error);
        const tableBulananEl = document.getElementById("tableBulanan");
        if (tableBulananEl) {
            tableBulananEl.innerHTML = `<tr><td colspan="15" style="color:red; text-align:center; font-weight:bold; padding:15px;">⚠️ Gagal mengurai data: ${error.message}</td></tr>`;
        }
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

// ========== FUNGSI EXPORT EXCEL ==========
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
            if (aKoord && !bKoord) return -1
            if (!aKoord && bKoord) return 1
            const kelA = (a.kelurahan || '').toUpperCase()
            const kelB = (b.kelurahan || '').toUpperCase()
            if (kelA < kelB) return -1
            if (kelA > kelB) return 1
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
        ws['!cols'] = [{ wch: 5 }, { wch: 25 }, { wch: 15 }, { wch: 20 }, { wch: 18 }, { wch: 15 }, { wch: 20 }]

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
            if (aKoord && !bKoord) return -1
            if (!aKoord && bKoord) return 1
            const kelA = (a.kelurahan || '').toUpperCase()
            const kelB = (b.kelurahan || '').toUpperCase()
            if (kelA < kelB) return -1
            if (kelA > kelB) return 1
            return (a.nama || '').localeCompare(b.nama || '')
        })

        const daysInMonth = new Date(tahun, bulan, 0).getDate()
        const strBulan = String(bulan).padStart(2, '0')

        let totalHariKerjaEfektif = 0;
        for (let d = 1; d <= daysInMonth; d++) {
            const dayOfWeek = new Date(tahun, bulan - 1, d).getDay();
            if (dayOfWeek !== 0 && dayOfWeek !== 6) totalHariKerjaEfektif++;
        }

        const headerRow = ['No', 'Nama Fasilitator', 'Role', 'Kelurahan']
        for (let d = 1; d <= daysInMonth; d++) {
            headerRow.push(d)
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
                    rowData.push('L')
                } else {
                    const jamMasuk = presensiMapByUser[user.uid] && presensiMapByUser[user.uid][strDate]
                    if (jamMasuk) {
                        rowData.push(jamMasuk)
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

        const wscols = [{ wch: 5 }, { wch: 25 }, { wch: 15 }, { wch: 20 }]
        for (let i = 1; i <= daysInMonth; i++) wscols.push({ wch: 4 })
        wscols.push({ wch: 12 }, { wch: 12 }, { wch: 20 })
        ws['!cols'] = wscols

        const namaBulan = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
            'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember']
        const fileName = kelurahan
            ? `Rekap_Bulanan_${kelurahan}_${namaBulan[bulan - 1]}_${tahun}.xlsx`
            : `Rekap_Bulanan_${namaBulan[bulan - 1]}_${tahun}.xlsx`

        XLSX.utils.book_append_sheet(wb, ws, "Rekap Bulanan Matriks")
        XLSX.writeFile(wb, fileName)

    } catch (error) {
        console.error("Error export bulanan:", error)
        alert("❌ Gagal export bulanan: " + error.message)
    } finally {
        showLoading(false)
    }
}

// ========== FUNGSI MONITORING STATUS LOKASI ==========
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
        console.error("Gagal memeriksa status lokasi:", error);
    }
}
