import { auth, db } from "./firebase-init.js"
import { collection, addDoc, query, where, getDocs, getDoc, doc } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js"
import { signOut } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js"
import { initMap, addMarker, calculateDistance, drawRadius } from "./map.js"
import { validateDevice } from "./device.js"

// ========== FUNGSI FORMAT TANGGAL LOKAL ==========
function getTodayLocal() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// ========== CACHE SEDERHANA ==========
const lokasiCache = {
    kantor: null,
    kelurahan: null,
    kota: null
};

// Variabel global
let userData = {}
let latUser = null
let lngUser = null
let lokasiKantor = null
let lokasiKelurahan = null
let lokasiKota = null // Ditambahkan untuk pelacakan lokasi tingkat kota
let temporaryLocation = null 
let map = null
let userMarker = null
let radiusCircle = null

// Fungsi Logout
async function logout() {
    if (confirm("Apakah Anda yakin ingin keluar?")) {
        try {
            showLoading(true)
            await signOut(auth)
            localStorage.clear()
            window.location.href = "index.html"
        } catch (error) {
            console.error("Logout error:", error)
            alert("Gagal logout")
        } finally {
            showLoading(false)
        }
    }
}

// Tutup modal
window.closeErrorModal = function() {
    const modal = document.getElementById("errorModal")
    if (modal) modal.style.display = "none"
}

// Tampilkan error
function showError(message) {
    const errorModal = document.getElementById("errorModal")
    const errorMessage = document.getElementById("errorMessage")
    if (errorModal && errorMessage) {
        errorMessage.innerHTML = message
        errorModal.style.display = "flex"
    } else {
        alert(message)
    }
}

// Tampilkan loading
function showLoading(show) {
    const loadingEl = document.getElementById("loading")
    if (loadingEl) {
        loadingEl.style.display = show ? "flex" : "none"
    }
}

// Fungsi aman untuk set text
function safeSetText(elementId, text) {
    const element = document.getElementById(elementId)
    if (element) element.textContent = text
}

// ========== INIT DASHBOARD ==========
window.addEventListener('load', async () => {
    showLoading(true)
    
    try {
        const storedData = localStorage.getItem("userData")
        if (storedData) {
            userData = JSON.parse(storedData)
        } else {
            if (auth.currentUser) {
                const userDoc = await getDoc(doc(db, "users", auth.currentUser.uid))
                if (userDoc.exists()) {
                    userData = {
                        uid: auth.currentUser.uid,
                        ...userDoc.data()
                    }
                    localStorage.setItem("userData", JSON.stringify(userData))
                }
            }
        }
        
        if (!userData || !userData.uid) {
            window.location.href = "index.html"
            return
        }
        
        safeSetText("userName", userData.nama || "Fasilitator")
        safeSetText("avatar", (userData.nama || "U").charAt(0).toUpperCase())
        safeSetText("userRole", userData.role || "User")
        
        const logoutBtn = document.getElementById("logoutBtn")
        if (logoutBtn) logoutBtn.addEventListener("click", logout)
        
        await loadLokasi()
        await loadTemporaryLocation() 
        await getLokasiUser()
        await cekStatusPresensi()
        
        try {
            await cekDevice()
        } catch (deviceError) {
            console.warn("Device check warning:", deviceError)
        }
        
        await loadRekap()
        
        console.log("✅ Dashboard loaded successfully")
        
    } catch (error) {
        console.error("Error di dashboard:", error)
        showError("Gagal memuat dashboard: " + error.message)
    } finally {
        showLoading(false)
    }
})

// ========== CEK DEVICE DENGAN PESAN ERROR JELAS ==========
async function cekDevice() {
    console.log("🔒 Device check")
    
    if (!userData || !userData.uid) {
        return true
    }
    
    try {
        const isValid = await validateDevice(userData.uid)
        console.log("Device check result:", isValid)
        
        if (!isValid) {
            showError(`
            ⚠️ <b>Akun ini sudah digunakan di perangkat lain dalam 24 jam terakhir.</b><br><br>

            Jika Anda baru berganti HP atau browser, silakan:
            <ol style="margin:8px 0 8px 20px;">
            <li>Hubungi admin untuk <b>reset device</b></li>
            <li>Atau silahkan tunggu <b>24 jam</b> (reset otomatis)</li>
            </ol>
            Terima kasih.
            `)
            
            const btnPresensi = document.getElementById("btnPresensi")
            if (btnPresensi) {
                btnPresensi.disabled = true
                btnPresensi.title = "Tidak bisa presensi - device berbeda"
            }
            
            const statusContainer = document.getElementById("statusContainer")
            if (statusContainer && !document.getElementById("requestResetBtn")) {
                const resetBtn = document.createElement("button")
                resetBtn.id = "requestResetBtn"
                resetBtn.style.marginTop = "10px"
                resetBtn.style.padding = "8px 16px"
                resetBtn.style.background = "#F39C12"
                resetBtn.style.color = "white"
                resetBtn.style.border = "none"
                resetBtn.style.borderRadius = "20px"
                resetBtn.style.cursor = "pointer"
                resetBtn.style.width = "100%"
                resetBtn.innerHTML = "📱 Minta Reset Device"
                resetBtn.onclick = function() {
                    alert("Silakan hubungi admin untuk reset device.\n\nAtau tunggu 24 jam untuk reset otomatis.")
                }
                statusContainer.appendChild(resetBtn)
            }
            
            return false
        }
        
        return true
        
    } catch (error) {
        console.error("Error di cekDevice:", error)
        return true
    }
}

// ========== LOAD LOKASI SEMENTARA ==========
async function loadTemporaryLocation() {
    try {
        const snap = await getDoc(doc(db, "system_settings", "global"))
        if (!snap.exists()) return
        
        const data = snap.data()
        if (
            data.temporaryLocationEnabled &&
            data.temporaryLatitude != null &&
            data.temporaryLongitude != null
        ) {
            const now = new Date()
            const start = new Date(data.temporaryStart)
            const end = new Date(data.temporaryEnd)
            
            if (now >= start && now <= end) {
                temporaryLocation = {
                    nama: data.temporaryLocationName || "Lokasi Sementara",
                    lat: data.temporaryLatitude,
                    lng: data.temporaryLongitude,
                    radius: data.temporaryRadius || 200
                }
                console.log("📍 Lokasi sementara aktif:", temporaryLocation)
            }
        }
    } catch (error) {
        console.log("Tidak ada lokasi sementara atau gagal memuat setting:", error)
    }
}

// ========== LOAD LOKASI DENGAN CACHE ==========
async function loadLokasi() {
    try {
        // 1. Ambil lokasi kantor pusat
        if (!lokasiCache.kantor) {
            const kantorQuery = query(collection(db, "lokasi"), where("tipe", "==", "kantor"))
            const kantorSnapshot = await getDocs(kantorQuery)
            kantorSnapshot.forEach(doc => {
                lokasiCache.kantor = { id: doc.id, ...doc.data() }
            })
        }
        lokasiKantor = lokasiCache.kantor;
        
        // Untuk koordinator, tidak perlu memuat kelurahan/kota dampingan spesifik
        if (userData.role === 'koordinator') {
            console.log("📋 Koordinator - tidak memerlukan data kelurahan & kota spesifik")
            const lokasiKelurahanEl = document.getElementById("lokasiKelurahan")
            if (lokasiKelurahanEl) lokasiKelurahanEl.style.display = 'none'
            const lokasiKotaEl = document.getElementById("lokasiKota")
            if (lokasiKotaEl) lokasiKotaEl.style.display = 'none'
            return
        }
        
        // 2. Ambil lokasi Kelurahan dampingan user
        if (userData.kelurahan && userData.kelurahan !== '-') {
            const cacheKey = `kelurahan_${userData.kelurahan}`;
            if (!lokasiCache[cacheKey]) {
                const kelurahanQuery = query(collection(db, "lokasi"), where("nama", "==", userData.kelurahan))
                const kelurahanSnapshot = await getDocs(kelurahanQuery)
                kelurahanSnapshot.forEach(doc => {
                    lokasiCache[cacheKey] = { id: doc.id, ...doc.data() }
                })
            }
            lokasiKelurahan = lokasiCache[cacheKey];
            if (lokasiKelurahan) {
                safeSetText("namaKelurahan", lokasiKelurahan.nama)
            }
        }

        // 3. Ambil lokasi Kota dampingan user
        if (userData.kota && userData.kota !== '-') {
            const cacheKey = `kota_${userData.kota}`;
            if (!lokasiCache[cacheKey]) {
                const kotaQuery = query(collection(db, "lokasi"), where("nama", "==", userData.kota))
                const kotaSnapshot = await getDocs(kotaQuery)
                kotaSnapshot.forEach(doc => {
                    lokasiCache[cacheKey] = { id: doc.id, ...doc.data() }
                })
            }
            lokasiKota = lokasiCache[cacheKey];
            if (lokasiKota) {
                safeSetText("namaKota", lokasiKota.nama)
            }
        }
    } catch (error) {
        console.error("Error load lokasi:", error)
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
                hitungSemuaJarak()
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

// ========== INIT MAP (MENAMPILKAN SEMUA RADIUS LOKASI AKTIF) ==========
function initMapWithLocations() {
    const mapElement = document.getElementById('map')
    if (!mapElement || !latUser || !lngUser) return
    
    try {
        if (map) map.remove()
        
        map = initMap('map', latUser, lngUser, 16)
        if (!map) return
        
        // Marker posisi user saat ini
        userMarker = addMarker(map, latUser, lngUser, 'Lokasi Anda', 'user')
        radiusCircle = drawRadius(map, latUser, lngUser, 100, '#EE2737')
        
        // 1. Tampilkan Marker & Radius LOKASI SEMENTARA (Jika sedang aktif)
        if (temporaryLocation) {
            addMarker(map, temporaryLocation.lat, temporaryLocation.lng, temporaryLocation.nama, 'kelurahan')
            drawRadius(map, temporaryLocation.lat, temporaryLocation.lng, temporaryLocation.radius, '#9B59B6')
        }

        // 2. Tampilkan Marker & Radius KANTOR PUSAT
        if (lokasiKantor) {
            addMarker(map, lokasiKantor.lat, lokasiKantor.lng, 'Kantor Pusat', 'kantor')
            drawRadius(map, lokasiKantor.lat, lokasiKantor.lng, 100, '#EE2737')
        }

        // 3. Tampilkan Marker & Radius KELURAHAN DAMPINGAN
        if (lokasiKelurahan) {
            addMarker(map, lokasiKelurahan.lat, lokasiKelurahan.lng, `Kelurahan: ${lokasiKelurahan.nama}`, 'kelurahan')
            drawRadius(map, lokasiKelurahan.lat, lokasiKelurahan.lng, 100, '#3498DB')
        }

        // 4. Tampilkan Marker & Radius KOTA DAMPINGAN
        if (lokasiKota) {
            addMarker(map, lokasiKota.lat, lokasiKota.lng, `Kota: ${lokasiKota.nama}`, 'kantor')
            drawRadius(map, lokasiKota.lat, lokasiKota.lng, 100, '#E67E22')
        }

        setTimeout(() => map.invalidateSize(), 300)
        
    } catch (error) {
        console.error("Error init map:", error)
    }
}

// ========== HITUNG JARAK UNTUK SEMUA LOKASI PILIHAN ==========
function hitungSemuaJarak() {
    if (!latUser || !lngUser) return
    
    // 1. EVALUASI LOKASI SEMENTARA
    const lokasiSementaraEl = document.getElementById("lokasiSementara");
    if (temporaryLocation) {
        if (lokasiSementaraEl) lokasiSementaraEl.style.display = 'block';
        safeSetText("namaSementara", temporaryLocation.nama);
        
        const jarakTemp = calculateDistance(latUser, lngUser, temporaryLocation.lat, temporaryLocation.lng)
        safeSetText("jarakSementara", `Jarak: ${jarakTemp} m`)
        
        const progressBar = document.getElementById("progressSementara")
        if (progressBar) {
            const progress = Math.min((jarakTemp / temporaryLocation.radius) * 100, 100)
            progressBar.style.width = progress + '%'
            if (jarakTemp <= temporaryLocation.radius) progressBar.classList.add('safe')
            else progressBar.classList.remove('safe')
        }
        
        const statusSementara = document.getElementById("statusSementara")
        if (statusSementara) {
            if (jarakTemp <= temporaryLocation.radius) {
                statusSementara.innerHTML = '✅ Dalam radius'
                statusSementara.className = 'distance-status safe'
            } else {
                statusSementara.innerHTML = '📍 Di luar radius'
                statusSementara.className = 'distance-status'
            }
        }
    } else {
        if (lokasiSementaraEl) lokasiSementaraEl.style.display = 'none';
    }
    
    // 2. EVALUASI KELURAHAN DAMPINGAN
    const lokasiKelurahanEl = document.getElementById("lokasiKelurahan");
    if (lokasiKelurahan && userData.role !== 'koordinator') {
        if (lokasiKelurahanEl) lokasiKelurahanEl.style.display = 'block';
        
        const jarakKel = calculateDistance(latUser, lngUser, lokasiKelurahan.lat, lokasiKelurahan.lng)
        safeSetText("jarakKelurahan", `Jarak: ${jarakKel} m`)
        
        const progressKel = Math.min((jarakKel / 100) * 100, 100)
        const progressBarKel = document.getElementById("progressKelurahan")
        if (progressBarKel) {
            progressBarKel.style.width = progressKel + '%'
            if (jarakKel <= 100) progressBarKel.classList.add('safe')
            else progressBarKel.classList.remove('safe')
        }
        
        const statusKelurahan = document.getElementById("statusKelurahan")
        if (statusKelurahan) {
            if (jarakKel <= 100) {
                statusKelurahan.innerHTML = '✅ Dalam radius'
                statusKelurahan.className = 'distance-status safe'
            } else {
                statusKelurahan.innerHTML = '📍 Di luar radius'
                statusKelurahan.className = 'distance-status'
            }
        }
    }

    // 3. EVALUASI KOTA DAMPINGAN
    const lokasiKotaEl = document.getElementById("lokasiKota");
    if (lokasiKota && userData.role !== 'koordinator') {
        if (lokasiKotaEl) lokasiKotaEl.style.display = 'block';
        
        const jarakKota = calculateDistance(latUser, lngUser, lokasiKota.lat, lokasiKota.lng)
        safeSetText("jarakKota", `Jarak: ${jarakKota} m`)
        
        const progressKota = Math.min((jarakKota / 100) * 100, 100)
        const progressBarKota = document.getElementById("progressKota")
        if (progressBarKota) {
            progressBarKota.style.width = progressKota + '%'
            if (jarakKota <= 100) progressBarKota.classList.add('safe')
            else progressBarKota.classList.remove('safe')
        }
        
        const statusKota = document.getElementById("statusKota")
        if (statusKota) {
            if (jarakKota <= 100) {
                statusKota.innerHTML = '✅ Dalam radius'
                statusKota.className = 'distance-status safe'
            } else {
                statusKota.innerHTML = '📍 Di luar radius'
                statusKota.className = 'distance-status'
            }
        }
    }
    
    // 4. EVALUASI KANTOR PUSAT
    if (lokasiKantor) {
        const jarakKantor = calculateDistance(latUser, lngUser, lokasiKantor.lat, lokasiKantor.lng)
        safeSetText("jarakKantor", `Jarak: ${jarakKantor} m`)
        
        const progressKan = Math.min((jarakKantor / 100) * 100, 100)
        const progressBarKan = document.getElementById("progressKantor")
        if (progressBarKan) {
            progressBarKan.style.width = progressKan + '%'
            if (jarakKantor <= 100) progressBarKan.classList.add('safe')
            else progressBarKan.classList.remove('safe')
        }
        
        const statusKantor = document.getElementById("statusKantor")
        if (statusKantor) {
            if (jarakKantor <= 100) {
                statusKantor.innerHTML = '✅ Dalam radius'
                statusKantor.className = 'distance-status safe'
            } else {
                statusKantor.innerHTML = '📍 Di luar radius'
                statusKantor.className = 'distance-status'
            }
        }
    }
}

// ========== CEK STATUS PRESENSI HARI INI ==========
async function cekStatusPresensi() {
    const today = getTodayLocal();
    
    try {
        const q = query(
            collection(db, "presensi"),
            where("uid", "==", userData.uid),
            where("tanggal", "==", today)
        )
        
        const snapshot = await getDocs(q)
        const btnPresensi = document.getElementById("btnPresensi")
        const statusBadge = document.getElementById("statusBadge")
        const statusEmoji = document.getElementById("statusEmoji")
        const statusText = document.getElementById("statusText")
        const presensiTime = document.getElementById("presensiTime")
        
        if (!snapshot.empty) {
            const data = snapshot.docs[0].data()
            const waktu = data.waktu?.seconds ? new Date(data.waktu.seconds * 1000) : new Date()
            
            if (statusBadge) statusBadge.innerHTML = '✓ Hadir'
            if (statusEmoji) statusEmoji.textContent = '✅'
            
            if (userData.role === 'koordinator') {
                if (statusText) statusText.textContent = 'Koordinator - sudah presensi'
            } else {
                if (statusText) statusText.textContent = 'Sudah presensi hari ini'
            }
            
            if (presensiTime) presensiTime.textContent = `Pukul: ${waktu.toLocaleTimeString()}`
            
            if (btnPresensi) {
                btnPresensi.disabled = true
                btnPresensi.innerHTML = '<span>✅</span> Sudah Presensi'
            }
            
            // Render text lokasi tempat user melakukan absensi
            if (data.lokasi === 'kantor' && presensiTime) {
                presensiTime.innerHTML += ' di Kantor Pusat'
            } else if (data.lokasi === 'kelurahan' && presensiTime) {
                presensiTime.innerHTML += ` di Kelurahan ${userData.kelurahan}`
            } else if (data.lokasi === 'kota' && presensiTime) {
                presensiTime.innerHTML += ` di Kota ${userData.kota}`
            } else if (data.lokasi === 'koordinator' && presensiTime) {
                presensiTime.innerHTML += ' (Lokasi Bebas)'
            } else if (data.lokasi === 'lokasi_sementara' && presensiTime) {
                presensiTime.innerHTML += ` di ${temporaryLocation?.nama || 'Lokasi Sementara'}`
            }
        } else {
            if (statusBadge) statusBadge.innerHTML = '○ Belum'
            if (statusEmoji) statusEmoji.textContent = '⏰'
            
            if (userData.role === 'koordinator') {
                if (statusText) statusText.textContent = 'Koordinator - bebas presensi'
            } else {
                if (statusText) statusText.textContent = 'Belum presensi'
            }
            
            if (presensiTime) presensiTime.textContent = ''
            
            if (btnPresensi) {
                btnPresensi.disabled = false
                btnPresensi.innerHTML = '<span>📍</span> Presensi Sekarang'
                btnPresensi.onclick = presensi
            }
        }
    } catch (error) {
        console.error("Error cek status:", error)
    }
}

// ========== FUNGSI SUBMIT PRESENSI DENGAN MULTI-LOKASI ==========
async function presensi() {
    showLoading(true)
    
    try {
        let deviceValid = true
        try {
            deviceValid = await validateDevice(userData.uid)
        } catch (error) {
            console.warn("Device check warning:", error)
            deviceValid = true
        }
        
        if (!deviceValid) {
            showError("Akun ini sudah digunakan di perangkat lain! Hubungi admin.")
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
        
        if (!latUser || !lngUser) {
            showError("Gagal mendapatkan lokasi! Pastikan GPS aktif.")
            return
        }
        
        let lokasiPresensi = null
        
        if (userData.role === 'koordinator') {
            lokasiPresensi = "koordinator"
            console.log("📋 Koordinator - bebas presensi di manapun")
        } else {
            // OPTSI 1: Pengecekan Lokasi Sementara (jika statusnya aktif)
            if (temporaryLocation) {
                const jarakTemp = calculateDistance(latUser, lngUser, temporaryLocation.lat, temporaryLocation.lng)
                if (jarakTemp <= temporaryLocation.radius) {
                    lokasiPresensi = 'lokasi_sementara'
                }
            } 
            
            // OPSI 2: Pengecekan Kelurahan Dampingan (Maksimal radius 100m)
            if (!lokasiPresensi && lokasiKelurahan) {
                const jarakKelurahan = calculateDistance(latUser, lngUser, lokasiKelurahan.lat, lokasiKelurahan.lng)
                if (jarakKelurahan <= 100) {
                    lokasiPresensi = "kelurahan"
                }
            }
            
            // OPSI 3: Pengecekan Wilayah Kota Dampingan (Maksimal radius 100m)
            if (!lokasiPresensi && lokasiKota) {
                const jarakKota = calculateDistance(latUser, lngUser, lokasiKota.lat, lokasiKota.lng)
                if (jarakKota <= 100) {
                    lokasiPresensi = "kota"
                }
            }

            // OPSI CADANGAN: Kantor Pusat
            if (!lokasiPresensi && lokasiKantor) {
                const jarakKantor = calculateDistance(latUser, lngUser, lokasiKantor.lat, lokasiKantor.lng)
                if (jarakKantor <= 100) {
                    lokasiPresensi = "kantor"
                }
            }
            
            // JIKA TIDAK MEMENUHI SALAH SATU DARI SEMUA OPSI LOKASI DI ATAS
            if (!lokasiPresensi) {
                let pesanError = "Anda berada di luar jangkauan radius presensi yang diizinkan!"
                if (temporaryLocation) {
                    pesanError = `<b>Presensi Gagal!</b> Anda berada di luar radius.<br><br>Saat ini Anda hanya diizinkan presensi di area berikut:<br>
                    1. Area ${temporaryLocation.nama} (Radius ${temporaryLocation.radius}m)<br>
                    2. Area Kelurahan: ${userData.kelurahan || '-'}<br>
                    3. Area Kota: ${userData.kota || '-'}`;
                }
                showError(pesanError)
                return
            }
        }
        
        // Simpan data presensi ke Firestore
        await addDoc(collection(db, "presensi"), {
            uid: userData.uid,
            nama: userData.nama,
            tanggal: today,
            lat: latUser,
            lng: lngUser,
            lokasi: lokasiPresensi,
            waktu: new Date(),
            deviceId: localStorage.getItem("deviceId")
        })
        
        alert("✅ Presensi berhasil!")
        window.location.reload()
        
    } catch (error) {
        console.error("Error presensi:", error)
        showError("Gagal presensi: " + error.message)
    } finally {
        showLoading(false)
    }
}

// ========== LOAD REKAP KEHADIRAN GLOBAL HARI INI ==========
async function loadRekap() {
    const today = getTodayLocal();
    
    try {
        const q = query(
            collection(db, "presensi"),
            where("tanggal", "==", today)
        )
        
        const snapshot = await getDocs(q)
        const total = snapshot.size
        
        const rekapContainer = document.getElementById("rekapContainer")
        if (rekapContainer) {
            rekapContainer.innerHTML = `
                <div style="font-size: 24px; font-weight: bold; color: #EE2737;">${total}</div>
                <div style="color: #7F8C8D;">Fasilitator hadir hari ini</div>
            `
        }
    } catch (error) {
        console.error("Error load rekap:", error)
    }
}

// ========== UPDATE LOKASI SECARA REALTIME (SETIAP 60 DETIK) ==========
setInterval(() => {
    if (latUser && lngUser && navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (position) => {
                latUser = position.coords.latitude
                lngUser = position.coords.longitude
                
                if (userMarker && map) userMarker.setLatLng([latUser, lngUser])
                if (radiusCircle && map) {
                    map.removeLayer(radiusCircle)
                    radiusCircle = drawRadius(map, latUser, lngUser, 100, '#EE2737')
                }
                
                hitungSemuaJarak()
                if (map) map.panTo([latUser, lngUser])
            },
            (error) => console.error("Error update lokasi:", error)
        )
    }
}, 60000)

window.addEventListener('resize', () => {
    if (map) setTimeout(() => map.invalidateSize(), 200)
})

auth.onAuthStateChanged((user) => {
    if (!user && window.location.pathname.includes("dashboard.html")) {
        window.location.href = "index.html"
    }
})