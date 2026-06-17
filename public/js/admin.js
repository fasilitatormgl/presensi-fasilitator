import { auth, db } from "./firebase-init.js"
import { collection, getDocs, query, where, doc, updateDoc, getDoc, setDoc, serverTimestamp, limit, startAfter } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js"
import { signOut } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js"
import { initMap, addMarker } from "./map.js"
import { resetUserDevice } from "./device.js"
import { exportToExcel } from "./export.js"
import { importFromExcel } from "./import.js"

// ========== FUNGSI FORMAT TANGGAL LOKAL ==========
function getTodayLocal() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// ========== CACHE SYSTEM ==========
const CACHE_DURATION = 300000; // 5 menit
const dataCache = {
    users: null,
    usersTimestamp: null,
    stats: null,
    statsTimestamp: null,
    kelurahan: null,
    kelurahanTimestamp: null
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

// ========== PAGINATION ==========
const PAGE_SIZE = 20;
let lastVisible = null;
let currentPage = 1;
let currentUsers = [];

// Variabel global
let map = null;
let tempMap = null;
let tempMarker = null;
let currentFilter = {
    kelurahan: '',
    tanggal: getTodayLocal()
};

// Fungsi logout
async function logout() {
    if (confirm("Yakin ingin keluar?")) {
        await signOut(auth);
        localStorage.clear();
        window.location.href = "index.html";
    }
}

// Tampilkan loading
function showLoading(show) {
    const loadingEl = document.getElementById("loading");
    if (loadingEl) loadingEl.style.display = show ? "flex" : "none";
}

// ========== CREATE PAGINATION BUTTONS ==========
function createPaginationButtons() {
    // PERBAIKAN: Menggunakan DOM traversal untuk support semua browser
    const tableContainer = document.querySelector('.table-responsive');
    const tabelCard = tableContainer ? tableContainer.parentElement : null;
    
    if (!tabelCard) {
        console.log("Card tabel tidak ditemukan");
        return;
    }
    
    if (document.getElementById("paginationNav")) {
        return;
    }
    
    const nav = document.createElement('div');
    nav.id = 'paginationNav';
    nav.style.display = 'flex';
    nav.style.justifyContent = 'center';
    nav.style.gap = '10px';
    nav.style.marginTop = '15px';
    nav.style.marginBottom = '10px';
    nav.innerHTML = `
        <button onclick="window.prevPage()" id="prevBtn" style="padding:8px 16px; background:#3498DB; color:white; border:none; border-radius:5px; cursor:pointer; font-weight:bold;">◀ Sebelumnya</button>
        <span id="pageInfo" style="padding:8px 16px; background:#ecf0f1; border-radius:5px; font-weight:bold;">Halaman 1</span>
        <button onclick="window.nextPage()" id="nextBtn" style="padding:8px 16px; background:#3498DB; color:white; border:none; border-radius:5px; cursor:pointer; font-weight:bold;">Berikutnya ▶</button>
    `;
    tabelCard.appendChild(nav);
}

// ========== PAGINATION FUNCTIONS ==========
window.prevPage = function() {
    if (currentPage > 1) {
        loadPresensi(currentPage - 1);
    }
}

window.nextPage = function() {
    loadPresensi(currentPage + 1);
}

// ========== UPDATE PAGINATION BUTTONS ==========
function updatePaginationButtons() {
    const prevBtn = document.getElementById("prevBtn");
    const nextBtn = document.getElementById("nextBtn");
    const pageInfo = document.getElementById("pageInfo");
    
    if (!prevBtn || !nextBtn || !pageInfo) return;
    
    prevBtn.disabled = currentPage === 1;
    
    const isLastPage = currentUsers.length < PAGE_SIZE;
    nextBtn.disabled = isLastPage;
    
    pageInfo.textContent = `Halaman ${currentPage}`;
}

// Inisialisasi
window.addEventListener('load', async () => {
    showLoading(true);
    
    try {
        const logoutBtn = document.getElementById("logoutBtn");
        if (logoutBtn) logoutBtn.addEventListener("click", logout);
        
        const filterTanggal = document.getElementById("filterTanggal");
        if (filterTanggal) {
            filterTanggal.value = currentFilter.tanggal;
        }
        
        await loadStats();
        await loadFilterOptions();
        await loadPresensi(1);

        initTemporaryMap();
        await loadTemporaryLocation();
        await loadLocationModeStatus();
        
        setTimeout(() => {
            createPaginationButtons();
        }, 500);

        await initMapMonitoring();
        
        // Auto-refresh menggunakan rekursif setTimeout
        async function autoRefresh() {
            try {
                await loadStats(true);
                await loadPresensi(currentPage);
            } catch (error) {
                console.error("Gagal auto-refresh:", error);
            } finally {
                setTimeout(autoRefresh, 60000);
            }
        }
        
        setTimeout(autoRefresh, 60000);
        
    } catch (error) {
        console.error("Error init:", error);
        alert("Gagal memuat data");
    } finally {
        showLoading(false);
    }
});

// Load statistik
async function loadStats(force = false) {
    try {
        if (!force) {
            const cached = getCache('stats');
            if (cached) {
                const totalUserEl = document.getElementById("totalUser");
                if (totalUserEl) totalUserEl.textContent = cached.totalUser;
                
                const totalKelurahanEl = document.getElementById("totalKelurahan");
                if (totalKelurahanEl) totalKelurahanEl.textContent = cached.totalKelurahan;
                
                const hadirHariIniEl = document.getElementById("hadirHariIni");
                if (hadirHariIniEl) hadirHariIniEl.textContent = cached.hadirHariIni;
                
                const belumHadirEl = document.getElementById("belumHadir");
                if (belumHadirEl) belumHadirEl.textContent = cached.belumHadir;
                return;
            }
        }
        
        const [usersSnap, kelurahanSnap, presensiSnap] = await Promise.all([
            getDocs(collection(db, "users")),
            getDocs(query(collection(db, "lokasi"), where("tipe", "==", "kelurahan"))),
            getDocs(query(collection(db, "presensi"), where("tanggal", "==", currentFilter.tanggal)))
        ]);
        
        const stats = {
            totalUser: usersSnap.size,
            totalKelurahan: kelurahanSnap.size,
            hadirHariIni: presensiSnap.size,
            belumHadir: usersSnap.size - presensiSnap.size
        };
        
        setCache('stats', stats);
        
        const totalUserEl = document.getElementById("totalUser");
        if (totalUserEl) totalUserEl.textContent = stats.totalUser;
        
        const totalKelurahanEl = document.getElementById("totalKelurahan");
        if (totalKelurahanEl) totalKelurahanEl.textContent = stats.totalKelurahan;
        
        const hadirHariIniEl = document.getElementById("hadirHariIni");
        if (hadirHariIniEl) hadirHariIniEl.textContent = stats.hadirHariIni;
        
        const belumHadirEl = document.getElementById("belumHadir");
        if (belumHadirEl) belumHadirEl.textContent = stats.belumHadir;
        
    } catch (error) {
        console.error("Error load stats:", error);
    }
}

// Load filter options
async function loadFilterOptions() {
    try {
        let kelurahanList = getCache('kelurahan');
        
        if (!kelurahanList) {
            const lokasiSnap = await getDocs(query(collection(db, "lokasi"), where("tipe", "==", "kelurahan")));
            kelurahanList = [];
            lokasiSnap.forEach(doc => {
                kelurahanList.push(doc.data().nama);
            });
            setCache('kelurahan', kelurahanList);
        }
        
        const select = document.getElementById("filterKelurahan");
        if (!select) return;
        
        select.innerHTML = '<option value="">Semua Kelurahan</option>';
        kelurahanList.forEach(nama => {
            const option = document.createElement("option");
            option.value = nama;
            option.textContent = nama;
            select.appendChild(option);
        });
        
    } catch (error) {
        console.error("Error load filter:", error);
    }
}

// ========== LOAD PRESENSI DENGAN PAGINATION ==========
async function loadPresensi(page = 1) {
    try {
        showLoading(true);
        currentPage = page;
        
        if (page === 1) {
            lastVisible = null;
        }
        
        let q = query(collection(db, "users"), limit(PAGE_SIZE));
        
        if (currentFilter.kelurahan) {
            q = query(collection(db, "users"), where("kelurahan", "==", currentFilter.kelurahan), limit(PAGE_SIZE));
        }
        
        if (lastVisible && page > 1) {
            q = query(q, startAfter(lastVisible));
        }
        
        const usersSnap = await getDocs(q);
        lastVisible = usersSnap.docs[usersSnap.docs.length - 1];
        
        currentUsers = [];
        usersSnap.forEach(doc => {
            const data = doc.data();
            currentUsers.push({ 
                id: doc.id,
                uid: data.uid || doc.id,
                ...data 
            });
        });
        
        const presensiSnap = await getDocs(
            query(collection(db, "presensi"), where("tanggal", "==", currentFilter.tanggal))
        );
        
        const presensiMap = new Map();
        presensiSnap.forEach(doc => {
            const data = doc.data();
            presensiMap.set(data.uid, { id: doc.id, ...data });
        });
        
        renderTabel(currentUsers, presensiMap, page);
        updatePaginationButtons();
        
        showLoading(false);
        
    } catch (error) {
        console.error("Error load presensi:", error);
        showLoading(false);
    }
}

// ========== RENDER TABEL ==========
function renderTabel(users, presensiMap, page) {
    const tbody = document.getElementById("tableBody");
    if (!tbody) return;
    
    let html = '';
    const startNo = (page - 1) * PAGE_SIZE + 1;
    
    users.forEach((user, index) => {
        const p = presensiMap.get(user.uid);
        const status = p ? 'Hadir' : 'Belum';
        const waktu = p ? new Date(p.waktu?.seconds * 1000).toLocaleTimeString() : '-';
        const lokasi = p ? (p.lokasi === 'kantor' ? 'Kantor' : (p.lokasi || '-')) : '-';
        
        let roleBadge = '';
        if (user.role === 'admin') {
            roleBadge = '<span style="background:#3498DB; color:white; padding:2px 6px; border-radius:10px; font-size:10px;">👑 Admin</span>';
        } else if (user.role === 'koordinator') {
            roleBadge = '<span style="background:#F39C12; color:white; padding:2px 6px; border-radius:10px; font-size:10px;">📋 Koord</span>';
        } else {
            roleBadge = '<span style="background:#95A5A6; color:white; padding:2px 6px; border-radius:10px; font-size:10px;">👤 User</span>';
        }
        
        const uidForButton = user.uid || user.id;
        
        html += `
            <tr>
                <td>${startNo + index}</td>
                <td>${user.nama || '-'} ${roleBadge}</td>
                <td>${user.kelurahan || '-'}</td>
                <td><span style="background:${p ? '#E8F5E9' : '#FFEBEE'}; color:${p ? '#27AE60' : '#E74C3C'}; padding:3px 8px; border-radius:12px;">${status}</span></td>
                <td>${waktu}</td>
                <td>${lokasi}</td>
                <td>${user.deviceId ? '📱' : '📱-'}</td>
                <td>
                    <button onclick="resetDevice('${uidForButton}')" style="background:none; border:none; color:#EE2737; cursor:pointer;">
                        ⟲ Reset
                    </button>
                </td>
            </tr>
        `;
    });
    
    if (users.length === 0) {
        html = '<tr><td colspan="8" class="text-center">Tidak ada data untuk tanggal ini</td></tr>';
    }
    
    tbody.innerHTML = html;
}

// Init map monitoring
async function initMapMonitoring() {
    map = initMap('map', -7.4706, 110.2177, 12);
    if (!map) return;
    
    const lokasiSnap = await getDocs(collection(db, "lokasi"));
    lokasiSnap.forEach(doc => {
        const data = doc.data();
        addMarker(map, data.lat, data.lng, data.nama, data.tipe === 'kantor' ? 'kantor' : 'kelurahan');
    });
    
    const presensiSnap = await getDocs(
        query(collection(db, "presensi"), where("tanggal", "==", currentFilter.tanggal))
    );
    
    presensiSnap.forEach(doc => {
        const data = doc.data();
        if (data.lat && data.lng) {
            addMarker(map, data.lat, data.lng, data.nama || 'User', 'user');
        }
    });
}

// =========================================
// LOKASI LOGIN SEMENTARA
// =========================================

function initTemporaryMap() {
    const tempMapDiv = document.getElementById("tempMap");
    if (!tempMapDiv) return;

    if (typeof L === 'undefined') {
        console.warn("Leaflet (L) tidak ditemukan. Pastikan script Leaflet sudah dimuat di HTML.");
        return;
    }

    if (tempMap) {
        tempMap.remove();
    }

    tempMap = L.map("tempMap").setView([-7.4706, 110.2177], 13);

    L.tileLayer(
        "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
        {
            attribution: "&copy; OpenStreetMap"
        }
    ).addTo(tempMap);

    tempMap.on("click", function(e) {
        const lat = e.latlng.lat;
        const lng = e.latlng.lng;
        setTemporaryMarker(lat, lng);
    });
}

function setTemporaryMarker(lat, lng) {
    const latInput = document.getElementById("tempLat");
    const lngInput = document.getElementById("tempLng");
    
    if (latInput) latInput.value = lat;
    if (lngInput) lngInput.value = lng;

    if (tempMarker) {
        tempMap.removeLayer(tempMarker);
    }

    tempMarker = L.marker([lat, lng]).addTo(tempMap);
    tempMap.setView([lat, lng], 16);
}

window.useCurrentAdminLocation = function() {
    if (!navigator.geolocation) {
        alert("Browser tidak mendukung GPS");
        return;
    }

    navigator.geolocation.getCurrentPosition(
        function(position) {
            const lat = position.coords.latitude;
            const lng = position.coords.longitude;
            setTemporaryMarker(lat, lng);
        },
        function() {
            alert("Gagal mengambil lokasi");
        }
    );
};

window.saveTemporaryLocation = async function() {
    try {
        const nameEl = document.getElementById("tempLocationName");
        const latEl = document.getElementById("tempLat");
        const lngEl = document.getElementById("tempLng");
        const radiusEl = document.getElementById("tempRadius");
        const startEl = document.getElementById("tempStart");
        const endEl = document.getElementById("tempEnd");
        
        if (!nameEl || !latEl || !lngEl || !radiusEl || !startEl || !endEl) {
            console.error("Elemen form lokasi sementara tidak lengkap di halaman ini.");
            return;
        }

        const name = nameEl.value;
        const lat = parseFloat(latEl.value);
        const lng = parseFloat(lngEl.value);
        const radius = parseInt(radiusEl.value);
        const start = startEl.value;
        const end = endEl.value;

        if (isNaN(lat) || isNaN(lng)) {
            alert("Pilih titik lokasi dulu");
            return;
        }

        if (!start || !end) {
            alert("Isi waktu mulai & selesai");
            return;
        }

        showLoading(true);

        await setDoc(
            doc(db, "system_settings", "global"),
            {
                temporaryLocationEnabled: true,
                statusLokasi: "custom",
                temporaryLocationName: name,
                temporaryLatitude: lat,
                temporaryLongitude: lng,
                temporaryRadius: radius,
                temporaryStart: start,
                temporaryEnd: end,
                updatedAt: serverTimestamp()
            },
            { merge: true }
        );

        alert("✅ Lokasi login sementara berhasil diaktifkan");

    } catch (error) {
        alert("❌ Gagal menyimpan: " + error.message);
    } finally {
        showLoading(false);
    }
};

window.disableTemporaryLocation = async function() {
    if (!confirm("Kembalikan ke lokasi normal?")) return;

    try {
        showLoading(true);

        await updateDoc(doc(db, "system_settings", "global"), {
            temporaryLocationEnabled: false,
            statusLokasi: "default",
            updatedAt: serverTimestamp()
        });

        alert("✅ Lokasi normal dipulihkan");

    } catch (error) {
        alert("❌ Gagal: " + error.message);
    } finally {
        showLoading(false);
    }
};

async function loadTemporaryLocation() {
    try {
        const snap = await getDoc(doc(db, "system_settings", "global"));
        if (!snap.exists()) return;

        const data = snap.data();

        if (data.temporaryLocationEnabled) {
            const nameEl = document.getElementById("tempLocationName");
            if (nameEl) nameEl.value = data.temporaryLocationName || "";

            const radiusEl = document.getElementById("tempRadius");
            if (radiusEl) radiusEl.value = data.temporaryRadius || 200;

            const startEl = document.getElementById("tempStart");
            if (startEl) startEl.value = data.temporaryStart || "";

            const endEl = document.getElementById("tempEnd");
            if (endEl) endEl.value = data.temporaryEnd || "";

            if (data.temporaryLatitude && data.temporaryLongitude) {
                setTemporaryMarker(data.temporaryLatitude, data.temporaryLongitude);
            }
        }
    } catch (error) {
        console.log("Tidak ada lokasi sementara yang disimpan atau gagal dimuat.");
    }
}

// Filter functions
window.applyFilter = function() {
    const filterKelurahanEl = document.getElementById("filterKelurahan");
    const filterTanggalEl = document.getElementById("filterTanggal");
    
    if (filterKelurahanEl) currentFilter.kelurahan = filterKelurahanEl.value;
    if (filterTanggalEl) currentFilter.tanggal = filterTanggalEl.value;
    
    loadPresensi(1);
}

window.resetFilter = function() {
    currentFilter.kelurahan = '';
    currentFilter.tanggal = getTodayLocal();
    
    const filterKelurahan = document.getElementById("filterKelurahan");
    const filterTanggal = document.getElementById("filterTanggal");
    
    if (filterKelurahan) filterKelurahan.value = '';
    if (filterTanggal) filterTanggal.value = currentFilter.tanggal;
    
    loadPresensi(1);
}

// RESET DEVICE
window.resetDevice = async function(uid) {
    if (!uid || uid === 'undefined') {
        alert("❌ Error: ID user tidak valid!");
        return;
    }
    
    if (!confirm("⚠️ Yakin ingin reset device user ini?")) return;
    
    showLoading(true);
    
    try {
        const result = await resetUserDevice(uid);
        
        if (result.success) {
            alert("✅ Device berhasil direset!");
            loadPresensi(currentPage);
        } else {
            throw new Error(result.message);
        }
        
    } catch (error) {
        alert("❌ Gagal: " + error.message);
    } finally {
        showLoading(false);
    }
}

// RESET SEMUA DEVICE
window.resetAllDevices = async function() {
    if (!confirm("⚠️ RESET SEMUA DEVICE?")) return;
    
    showLoading(true);
    
    try {
        const snapshot = await getDocs(collection(db, "users"));
        let success = 0;
        
        for (const userDoc of snapshot.docs) {
            await updateDoc(doc(db, "users", userDoc.id), {
                deviceId: null,
                deviceResetAt: new Date()
            });
            success++;
        }
        
        alert(`✅ ${success} user berhasil direset!`);
        loadPresensi(currentPage);
        
    } catch (error) {
        alert("❌ Gagal: " + error.message);
    } finally {
        showLoading(false);
    }
}

// ========== HANDLE FILE SELECT UNTUK IMPORT ==========
window.handleFileSelect = async function(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    if (!file.name.match(/\.(xlsx|xls)$/)) {
        alert("❌ Format file harus .xlsx atau .xls");
        return;
    }
    
    if (!confirm(`Import data dari file "${file.name}"?\n\nProses akan memakan waktu beberapa saat.`)) {
        return;
    }
    
    const progressDiv = document.getElementById("importProgress");
    const progressBar = document.getElementById("importProgressBar");
    const progressStatus = document.getElementById("importStatus");
    
    if (progressDiv) progressDiv.style.display = "block";
    if (progressBar) progressBar.style.width = "10%";
    if (progressStatus) progressStatus.textContent = "Membaca file...";
    
    showLoading(true);
    
    try {
        const result = await importFromExcel(file);
        
        if (progressBar) progressBar.style.width = "100%";
        if (progressStatus) progressStatus.textContent = "Selesai!";
        
        let message = `✅ IMPORT SELESAI\n\n`;
        message += `📊 RINGKASAN:\n`;
        message += `- User berhasil: ${result.users}\n`;
        message += `- Lokasi berhasil: ${result.lokasi}\n`;
        message += `- Dilewati: ${result.skipped}\n`;
        
        if (result.errors && result.errors.length > 0) {
            message += `\n⚠️ Error: ${result.errors.length} data gagal\n`;
        }
        
        alert(message);
        
        if (result.users > 0 || result.lokasi > 0) {
            setCache('stats', null);
            setCache('kelurahan', null);
            
            if (confirm("Data berhasil diimport. Refresh halaman?")) {
                location.reload();
            }
        }
        
    } catch (error) {
        console.error("❌ Import error:", error);
        alert("❌ Gagal import: " + error.message);
        
        if (progressStatus) progressStatus.textContent = "Gagal: " + error.message;
    } finally {
        showLoading(false);
        
        setTimeout(() => {
            if (progressDiv) progressDiv.style.display = "none";
        }, 3000);
        
        event.target.value = '';
    }
}

// Export data
window.exportData = async function() {
    showLoading(true);
    try {
        await exportToExcel(currentFilter.tanggal);
    } catch (error) {
        alert("Gagal export");
    } finally {
        showLoading(false);
    }
}

// Download template
window.downloadTemplate = function() {
    const template = [
        ['USER'],
        ['nama', 'email', 'password', 'role', 'kelurahan'],
        ['Budi', 'budi@mail.com', '123456', 'user', 'Magelang Tengah'],
        [''],
        ['LOKASI'],
        ['nama', 'tipe', 'lat', 'lng'],
        ['Kantor Pusat', 'kantor', '-7.4706', '110.2177']
    ];
    
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(template);
    XLSX.utils.book_append_sheet(wb, ws, "Template");
    XLSX.writeFile(wb, "template_import.xlsx");
}

async function loadLocationModeStatus() {
    try {
        const snap = await getDoc(doc(db, "system_settings", "global"));
        const el = document.getElementById("locationModeStatus");
        
        if (!el) return;

        if (!snap.exists()) {
            el.innerHTML = "⚪ Menggunakan lokasi default";
            return;
        }

        const data = snap.data();
        const now = new Date();
        
        const start = data.temporaryStart ? new Date(data.temporaryStart) : null;
        const end = data.temporaryEnd ? new Date(data.temporaryEnd) : null;

        const temporaryActive = 
            data.temporaryLocationEnabled &&
            data.temporaryLatitude !== undefined &&
            data.temporaryLongitude !== undefined &&
            start && end && 
            now >= start &&
            now <= end;

        if (temporaryActive) {
            el.classList.add("active"); // Akan aktif jika didefinisikan di css/style.css
            el.innerHTML = `
                🟣 <b>Lokasi sementara aktif</b><br>
                Nama: ${data.temporaryLocationName}<br>
                Radius: ${data.temporaryRadius} m
            `;
        } else {
            el.classList.remove("active");
            el.innerHTML = "🟢 Menggunakan lokasi default (kantor/kelurahan)";
        }

    } catch (error) {
        console.error("Gagal load status lokasi:", error);
        const el = document.getElementById("locationModeStatus");
        if (el) {
            el.innerHTML = "❌ Gagal memuat status lokasi";
        }
    }
}