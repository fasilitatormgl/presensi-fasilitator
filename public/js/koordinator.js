import { auth, db } from "./firebase-init.js"
import { collection, getDocs, query, where, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js"
import { signOut } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js"

// ========== CACHE SYSTEM ==========
const CACHE_DURATION = 300000; // 5 menit
const dataCache = {
    users: null,
    usersTimestamp: null,
    presensi: null,
    presensiTimestamp: null
};

function getCache(key) {
    const cache = dataCache[key];
    const timestamp = dataCache[`${key}Timestamp`];
    if (cache && timestamp && (Date.now() - timestamp < CACHE_DURATION)) {
        return cache;
    }
    return null;
}

function setCache(key, data) {
    dataCache[key] = data;
    dataCache[`${key}Timestamp`] = Date.now();
}

// Variabel global
let userData = {}
let currentFilter = {
    kelurahan: '',
    tanggal: new Date().toISOString().split('T')[0],
    bulan: new Date().getMonth() + 1,
    tahun: new Date().getFullYear(),
    mode: 'harian'
}

let allUsers = []
let allPresensi = []

// Fungsi Logout
async function logout() {
    if (confirm("Apakah Anda yakin ingin keluar?")) {
        await signOut(auth)
        localStorage.clear()
        window.location.href = "index.html"
    }
}

// Tampilkan loading
function showLoading(show) {
    const loadingEl = document.getElementById("loading")
    if (loadingEl) loadingEl.style.display = show ? "flex" : "none"
}

// Format tanggal
function formatTanggal(date) {
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }
    return new Date(date).toLocaleDateString('id-ID', options)
}

// Format bulan
function formatBulan(bulan, tahun) {
    const namaBulan = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 
                       'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember']
    return `${namaBulan[bulan-1]} ${tahun}`
}

// Inisialisasi
window.addEventListener('load', async () => {
    showLoading(true)
    
    try {
        const storedData = localStorage.getItem("userData")
        if (storedData) {
            userData = JSON.parse(storedData)
        }
        
        if (!userData || userData.role !== 'koordinator') {
            console.log("Bukan koordinator, redirect ke index");
            window.location.href = "index.html"
            return
        }
        
        console.log("✅ Login sebagai koordinator:", userData.nama);
        
        document.getElementById("userName").textContent = userData.nama || "Koordinator"
        document.getElementById("avatar").textContent = (userData.nama || "K").charAt(0).toUpperCase()
        document.getElementById("userRole").textContent = "Koordinator Wilayah"
        
        document.getElementById("logoutBtn").addEventListener("click", logout)
        
        document.getElementById("filterTanggal").value = currentFilter.tanggal
        document.getElementById("tanggalDisplay").textContent = formatTanggal(currentFilter.tanggal)
        
        await loadData()
        await loadFilterOptions()
        await loadRekapHarian()
        
    } catch (error) {
        console.error("Error:", error)
        alert("Gagal memuat data")
    } finally {
        showLoading(false)
    }
})

// ========== LOAD DATA DENGAN CACHE ==========
async function loadData(force = false) {
    try {
        // Cek cache users
        let users = getCache('users');
        let presensi = getCache('presensi');
        
        if (!users || force) {
            const usersSnap = await getDocs(collection(db, "users"));
            users = [];
            usersSnap.forEach(doc => {
                const data = doc.data();
                if (data.role !== 'admin') {
                    users.push({ 
                        id: doc.id,
                        uid: data.uid || doc.id,
                        ...data 
                    });
                }
            });
            setCache('users', users);
        }
        
        if (!presensi || force) {
            const presensiSnap = await getDocs(collection(db, "presensi"));
            presensi = [];
            presensiSnap.forEach(doc => {
                presensi.push({ id: doc.id, ...doc.data() });
            });
            setCache('presensi', presensi);
        }
        
        allUsers = users;
        allPresensi = presensi;
        
        console.log(`📊 Total user: ${allUsers.length} (${allUsers.filter(u => u.role === 'user').length} user, ${allUsers.filter(u => u.role === 'koordinator').length} koordinator)`);
        document.getElementById("totalFasilitator").textContent = allUsers.length;
        
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
        
        const selectKelurahan = document.getElementById("filterKelurahan")
        selectKelurahan.innerHTML = '<option value="">Semua Kelurahan</option>';
        
        Array.from(kelurahanSet).sort().forEach(kel => {
            const option = document.createElement("option")
            option.value = kel
            option.textContent = kel
            selectKelurahan.appendChild(option)
        })
        
        const selectBulan = document.getElementById("filterBulan")
        const namaBulan = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 
                           'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember']
        
        selectBulan.innerHTML = '<option value="">Pilih Bulan</option>';
        namaBulan.forEach((nama, index) => {
            const option = document.createElement("option")
            option.value = index + 1
            option.textContent = nama
            if (index + 1 === currentFilter.bulan) option.selected = true
            selectBulan.appendChild(option)
        })
        
        const tahunSet = new Set()
        const tahunSekarang = new Date().getFullYear()
        for (let i = 0; i < 3; i++) {
            tahunSet.add(tahunSekarang - i)
        }
        
        const selectTahun = document.getElementById("filterTahun")
        selectTahun.innerHTML = '<option value="">Pilih Tahun</option>';
        Array.from(tahunSet).sort().reverse().forEach(tahun => {
            const option = document.createElement("option")
            option.value = tahun
            option.textContent = tahun
            if (tahun === currentFilter.tahun) option.selected = true
            selectTahun.appendChild(option)
        })
        
    } catch (error) {
        console.error("Error load filter:", error)
    }
}

// Tampilkan mode harian
window.showHarian = function() {
    currentFilter.mode = 'harian'
    document.getElementById("rekapHarian").style.display = 'block'
    document.getElementById("rekapBulanan").style.display = 'none'
    document.getElementById("filterTanggal").style.display = 'inline-block'
    document.getElementById("filterBulan").style.display = 'none'
    document.getElementById("filterTahun").style.display = 'none'
    loadRekapHarian()
}

// Tampilkan mode bulanan
window.showBulanan = function() {
    currentFilter.mode = 'bulanan'
    document.getElementById("rekapHarian").style.display = 'none'
    document.getElementById("rekapBulanan").style.display = 'block'
    document.getElementById("filterTanggal").style.display = 'none'
    document.getElementById("filterBulan").style.display = 'inline-block'
    document.getElementById("filterTahun").style.display = 'inline-block'
    loadRekapBulanan()
}

// ========== LOAD REKAP HARIAN (PAKAI CACHE) ==========
async function loadRekapHarian() {
    try {
        const tanggal = document.getElementById("filterTanggal").value
        const kelurahan = document.getElementById("filterKelurahan").value
        
        document.getElementById("tanggalDisplay").textContent = formatTanggal(tanggal)
        
        let filteredUsers = allUsers
        if (kelurahan) {
            filteredUsers = allUsers.filter(u => u.kelurahan === kelurahan)
        }
        
        // Filter presensi untuk tanggal ini (dari cache)
        const presensiHariIni = allPresensi.filter(p => p.tanggal === tanggal);
        const presensiMap = new Map()
        presensiHariIni.forEach(p => presensiMap.set(p.uid, p))
        
        const hadir = filteredUsers.filter(u => presensiMap.has(u.uid)).length
        const total = filteredUsers.length
        document.getElementById("hadirHariIni").textContent = hadir
        document.getElementById("belumHadir").textContent = total - hadir
        document.getElementById("persentase").textContent = total > 0 ? Math.round((hadir/total)*100) + '%' : '0%'
        
        let html = ''
        filteredUsers.forEach((user, index) => {
            const p = presensiMap.get(user.uid)
            const status = p ? 'Hadir' : 'Belum'
            const statusColor = p ? '#27AE60' : '#E74C3C'
            const waktu = p ? new Date(p.waktu?.seconds * 1000).toLocaleTimeString() : '-'
            const lokasi = p ? (p.lokasi === 'kantor' ? 'Kantor Pusat' : (p.lokasi || '-')) : '-'
            
            let roleBadge = ''
            if (user.role === 'koordinator') {
                roleBadge = '<span style="background:#F39C12; color:white; padding:2px 6px; border-radius:10px; font-size:10px; margin-left:5px;">📋 Koord</span>'
            }
            
            html += `
                <tr>
                    <td>${index + 1}</td>
                    <td>${user.nama || '-'} ${roleBadge}</td>
                    <td>${user.kelurahan || '-'}</td>
                    <td><span style="color: ${statusColor}; font-weight: 600;">${status}</span></td>
                    <td>${waktu}</td>
                    <td>${lokasi}</td>
                </tr>
            `
        })
        
        if (filteredUsers.length === 0) {
            html = '<tr><td colspan="6" class="text-center">Tidak ada data</td></tr>'
        }
        
        document.getElementById("tableHarian").innerHTML = html
        
    } catch (error) {
        console.error("Error load rekap harian:", error)
    }
}

// ========== LOAD REKAP BULANAN (PAKAI CACHE) ==========
async function loadRekapBulanan() {
    try {
        const bulan = parseInt(document.getElementById("filterBulan").value) || currentFilter.bulan
        const tahun = parseInt(document.getElementById("filterTahun").value) || currentFilter.tahun
        const kelurahan = document.getElementById("filterKelurahan").value
        
        currentFilter.bulan = bulan
        currentFilter.tahun = tahun
        
        document.getElementById("bulanDisplay").textContent = formatBulan(bulan, tahun)
        
        let filteredUsers = allUsers
        if (kelurahan) {
            filteredUsers = allUsers.filter(u => u.kelurahan === kelurahan)
        }
        
        const daysInMonth = new Date(tahun, bulan, 0).getDate()
        
        const userStats = []
        let totalHadirSemua = 0
        
        filteredUsers.forEach(user => {
            const presensiUser = allPresensi.filter(p => 
                p.uid === user.uid && 
                p.tanggal && 
                new Date(p.tanggal).getMonth() + 1 === bulan &&
                new Date(p.tanggal).getFullYear() === tahun
            )
            
            const totalHadir = presensiUser.length
            totalHadirSemua += totalHadir
            const persentase = Math.round((totalHadir / daysInMonth) * 100)
            
            userStats.push({
                ...user,
                totalHadir,
                persentase
            })
        })
        
        const totalFasilitator = filteredUsers.length
        const rataHadir = totalFasilitator > 0 ? Math.round(totalHadirSemua / totalFasilitator) : 0
        document.getElementById("hadirHariIni").textContent = rataHadir
        document.getElementById("belumHadir").textContent = daysInMonth - rataHadir
        document.getElementById("persentase").textContent = Math.round((rataHadir/daysInMonth)*100) + '%'
        
        let html = ''
        userStats.sort((a, b) => b.totalHadir - a.totalHadir).forEach((user, index) => {
            let roleBadge = ''
            if (user.role === 'koordinator') {
                roleBadge = '<span style="background:#F39C12; color:white; padding:2px 6px; border-radius:10px; font-size:10px; margin-left:5px;">📋 Koord</span>'
            }
            
            html += `
                <tr>
                    <td>${index + 1}</td>
                    <td>${user.nama || '-'} ${roleBadge}</td>
                    <td>${user.kelurahan || '-'}</td>
                    <td style="font-weight: 600;">${user.totalHadir}</td>
                    <td>${daysInMonth}</td>
                    <td>
                        <div style="display: flex; align-items: center; gap: 5px;">
                            <span style="width: 40px;">${user.persentase}%</span>
                            <div style="flex: 1; height: 8px; background: #ecf0f1; border-radius: 4px;">
                                <div style="height: 100%; width: ${user.persentase}%; background: ${user.persentase > 75 ? '#27AE60' : (user.persentase > 50 ? '#F39C12' : '#E74C3C')}; border-radius: 4px;"></div>
                            </div>
                        </div>
                    </td>
                </tr>
            `
        })
        
        if (filteredUsers.length === 0) {
            html = '<tr><td colspan="6" class="text-center">Tidak ada data</td></tr>'
        }
        
        document.getElementById("tableBulanan").innerHTML = html
        
        renderGrafik(userStats.slice(0, 10), daysInMonth)
        
    } catch (error) {
        console.error("Error load rekap bulanan:", error)
    }
}

// Render grafik
function renderGrafik(users, daysInMonth) {
    const container = document.getElementById("grafikContainer")
    container.innerHTML = ''
    
    if (users.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: #7F8C8D;">Tidak ada data</p>'
        return
    }
    
    users.forEach(user => {
        const height = (user.totalHadir / daysInMonth) * 100
        const bar = document.createElement('div')
        bar.style.flex = '1'
        bar.style.display = 'flex'
        bar.style.flexDirection = 'column'
        bar.style.alignItems = 'center'
        bar.style.gap = '5px'
        
        let roleIcon = ''
        if (user.role === 'koordinator') {
            roleIcon = '📋'
        }
        
        bar.innerHTML = `
            <div style="height: 150px; width: 100%; display: flex; align-items: flex-end;">
                <div style="height: ${height}%; width: 100%; background: ${user.persentase > 75 ? '#27AE60' : (user.persentase > 50 ? '#F39C12' : '#E74C3C')}; border-radius: 5px 5px 0 0;"></div>
            </div>
            <div style="font-size: 10px; text-align: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 80px;">
                ${roleIcon} ${user.nama?.split(' ')[0] || '-'}
            </div>
        `
        
        container.appendChild(bar)
    })
}

// Reset filter
window.resetFilter = function() {
    document.getElementById("filterKelurahan").value = ''
    document.getElementById("filterTanggal").value = new Date().toISOString().split('T')[0]
    document.getElementById("filterBulan").value = new Date().getMonth() + 1
    document.getElementById("filterTahun").value = new Date().getFullYear()
    
    if (currentFilter.mode === 'harian') {
        loadRekapHarian()
    } else {
        loadRekapBulanan()
    }
}

// ========== EXPORT FUNCTIONS ==========
window.exportToExcel = function() {
    const mode = currentFilter.mode;
    
    if (mode === 'harian') {
        exportHarianToExcel();
    } else {
        exportBulananToExcel();
    }
}

function exportHarianToExcel() {
    const tanggal = document.getElementById("filterTanggal").value;
    const kelurahan = document.getElementById("filterKelurahan").value;
    const rows = document.querySelectorAll("#tableHarian tr");
    
    if (rows.length === 0 || (rows.length === 1 && rows[0].cells.length === 1)) {
        alert("Tidak ada data untuk diexport!");
        return;
    }
    
    const data = [];
    data.push(['No', 'Nama', 'Role', 'Kelurahan', 'Status', 'Waktu', 'Lokasi']);
    
    rows.forEach((row) => {
        const cells = row.querySelectorAll("td");
        if (cells.length === 6) {
            const namaCell = cells[1].innerHTML;
            const role = namaCell.includes('📋 Koord') ? 'Koordinator' : 'User';
            const nama = namaCell.replace('<span style="background:#F39C12; color:white; padding:2px 6px; border-radius:10px; font-size:10px; margin-left:5px;">📋 Koord</span>', '').trim();
            
            data.push([
                cells[0].textContent,
                nama,
                role,
                cells[2].textContent,
                cells[3].textContent,
                cells[4].textContent,
                cells[5].textContent
            ]);
        }
    });
    
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(data);
    const title = kelurahan ? `Rekap_Harian_${kelurahan}_${tanggal}` : `Rekap_Harian_${tanggal}`;
    XLSX.utils.book_append_sheet(wb, ws, "Rekap Harian");
    XLSX.writeFile(wb, `${title}.xlsx`);
}

function exportBulananToExcel() {
    const bulan = document.getElementById("filterBulan").value;
    const tahun = document.getElementById("filterTahun").value;
    const kelurahan = document.getElementById("filterKelurahan").value;
    const rows = document.querySelectorAll("#tableBulanan tr");
    
    if (rows.length === 0 || (rows.length === 1 && rows[0].cells.length === 1)) {
        alert("Tidak ada data untuk diexport!");
        return;
    }
    
    const data = [];
    data.push(['No', 'Nama', 'Role', 'Kelurahan', 'Total Hadir', 'Total Hari', 'Persentase']);
    
    rows.forEach((row) => {
        const cells = row.querySelectorAll("td");
        if (cells.length === 6) {
            const namaCell = cells[1].innerHTML;
            const role = namaCell.includes('📋 Koord') ? 'Koordinator' : 'User';
            const nama = namaCell.replace('<span style="background:#F39C12; color:white; padding:2px 6px; border-radius:10px; font-size:10px; margin-left:5px;">📋 Koord</span>', '').trim();
            
            data.push([
                cells[0].textContent,
                nama,
                role,
                cells[2].textContent,
                cells[3].textContent,
                cells[4].textContent,
                cells[5].textContent.split('%')[0] + '%'
            ]);
        }
    });
    
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(data);
    const namaBulan = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 
                       'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
    const title = kelurahan ? `Rekap_Bulanan_${kelurahan}_${namaBulan[bulan-1]}_${tahun}` : `Rekap_Bulanan_${namaBulan[bulan-1]}_${tahun}`;
    XLSX.utils.book_append_sheet(wb, ws, "Rekap Bulanan");
    XLSX.writeFile(wb, `${title}.xlsx`);
}

window.exportToPDF = function() {
    window.print();
}

window.printRekap = function() {
    window.print();
}