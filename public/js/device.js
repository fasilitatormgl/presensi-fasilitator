import { db } from "./firebase-init.js"
import { doc, getDoc, updateDoc, collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js"

// Generate unique device ID (FIXED: Stabil, Konsisten, Anti-Berubah Saat Relogin)
export function generateDeviceId() {
    try {
        const navigatorInfo = navigator.userAgent || 'unknown'
        let screenWidth = 'unknown'
        let screenHeight = 'unknown'
        try {
            screenWidth = window.screen.width
            screenHeight = window.screen.height
        } catch (e) {
            console.warn('Tidak bisa akses screen:', e)
        }
        
        const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'unknown'
        const language = navigator.language || 'unknown'
        
        // FIX: Menghapus komponen waktu milidetik agar sidik jari browser murni bernilai konstan
        const deviceString = `${navigatorInfo}|${screenWidth}x${screenHeight}|${timezone}|${language}`
        
        let hash = 0
        for (let i = 0; i < deviceString.length; i++) {
            const char = deviceString.charCodeAt(i)
            hash = ((hash << 5) - hash) + char
            hash = hash & hash
        }
        
        return 'DEV_' + Math.abs(hash).toString(36).toUpperCase()
        
    } catch (error) {
        // Fallback jika terjadi kendala pada engine browser, menggunakan generator acak berbasis tanggal terenkripsi
        return 'DEV_' + Date.now().toString(36).toUpperCase() + '_' + Math.random().toString(36).substring(2, 7)
    }
}

// Helper untuk mengekstrak tanggal dalam zona waktu WIB (UTC+7)
function getWIBDateComponents(dateObj) {
    const wibTime = new Date(dateObj.getTime() + (7 * 60 * 60 * 1000));
    return {
        year: wibTime.getUTCFullYear(),
        month: wibTime.getUTCMonth(),
        date: wibTime.getUTCDate()
    };
}

// Validasi device dengan AUTO-RESET setiap 00:00 WIB
export async function validateDevice(uid) {
    try {
        console.log("🔍 Validating device for UID:", uid)
        
        if (!uid || uid === 'undefined') {
            console.log("UID tidak valid, skip device check")
            return true
        }
        
        let deviceId = localStorage.getItem('deviceId')
        
        if (!deviceId) {
            deviceId = generateDeviceId()
            localStorage.setItem('deviceId', deviceId)
        }
        
        let userRef = null
        let userData = null
        
        // Cara 1: Ambil data berdasarkan Document ID (Lebih Cepat)
        try {
            const docRef = doc(db, "users", uid)
            const docSnap = await getDoc(docRef)
            if (docSnap.exists()) {
                userRef = docRef
                userData = docSnap.data()
                console.log("User ditemukan dengan document ID = uid")
            }
        } catch (e) {
            console.warn("Gagal lookup via doc ID:", e)
        }
        
        // Cara 2: Ambil data berdasarkan Query Field 'uid' (Pencarian Cadangan)
        if (!userData) {
            const q = query(collection(db, "users"), where("uid", "==", uid))
            const querySnap = await getDocs(q) // FIX: getDocs sekarang sudah terdefinisi melalui import atas
            if (!querySnap.empty) {
                userRef = doc(db, "users", querySnap.docs[0].id)
                userData = querySnap.docs[0].data()
                console.log("User ditemukan dengan field uid")
            }
        }
        
        if (!userData) {
            console.log("User tidak ditemukan di database, skip device check")
            return true
        }
        
        console.log("User role:", userData.role)
        
        // HAK ISTIMEWA: ADMIN & KOORDINATOR BEBAS PENGUNCIAN DEVICE
        if (userData.role === 'admin' || userData.role === 'koordinator') {
            console.log("👑 Admin/Koordinator - bebas device")
            await updateDoc(userRef, { lastSeen: new Date() })
            return true
        }
        
        // ========== OPERASIONAL USER BIASA (FASILITATOR) ==========
        console.log("👤 User biasa - validasi device harian (WIB)")
        
        // Kasus A: Jika user baru terdaftar atau datanya baru direset oleh admin
        if (!userData.deviceId) {
            console.log("User belum terikat device apa pun, mendaftarkan device ini.")
            await updateDoc(userRef, {
                deviceId: deviceId,
                lastSeen: new Date()
            })
            return true
        }
        
        // Kasus B: Terjadi ketidakcocokan ID Perangkat (Indikasi pindah device / ganti browser)
        if (userData.deviceId !== deviceId) {
            console.log("❌ Device mismatch! Stored:", userData.deviceId, "Current:", deviceId)
            
            const lastSeen = userData.lastSeen?.seconds 
                ? new Date(userData.lastSeen.seconds * 1000) 
                : new Date(0);
            
            const now = new Date();
            
            const lastSeenWIB = getWIBDateComponents(lastSeen);
            const nowWIB = getWIBDateComponents(now);
            
            // Periksa pergantian tanggal kalender WIB
            const isNewDayWIB = 
                lastSeenWIB.year !== nowWIB.year ||
                lastSeenWIB.month !== nowWIB.month ||
                lastSeenWIB.date !== nowWIB.date;
            
            console.log(`⏱️ Terakhir aktif (UTC): ${lastSeen.toISOString()}`);
            console.log(`⏱️ Waktu sekarang (UTC): ${now.toISOString()}`);
            
            // Sub-Kasus B1: Jika sudah berganti hari kerja baru, izinkan migrasi otomatis
            if (isNewDayWIB) {
                console.log("✅ Ganti hari (00:00 WIB terlewati), auto-binding device baru diizinkan.");
                await updateDoc(userRef, {
                    deviceId: deviceId,
                    lastSeen: new Date(),
                    lastAutoReset: new Date()
                });
                return true;
            }
            
            // Sub-Kasus B2: Percobaan pemindahan akun di hari kerja yang sama (Blokir akses)
            console.log("🚫 User DIBLOKIR - Menggunakan device berbeda pada hari yang sama.");
            return false;
        }
        
        // Kasus C: Sesi aman, device sesuai dengan data terdaftar
        await updateDoc(userRef, { lastSeen: new Date() })
        return true
        
    } catch (error) {
        console.error("Kesalahan sistem saat validasi device:", error)
        return true // Jika sistem internal bermasalah, loloskan login agar tidak mematikan aplikasi total
    }
}

// Reset device user (Manual dari tindakan klik tombol di Dashboard Koordinator/Admin)
export async function resetUserDevice(uid) {
    try {
        console.log("🔄 Resetting device for UID:", uid)
        
        if (!uid || uid === 'undefined') {
            throw new Error("UID tidak valid")
        }
        
        let userRef = null
        let userFound = false
        
        try {
            const testRef = doc(db, "users", uid)
            const testDoc = await getDoc(testRef)
            if (testDoc.exists()) {
                userRef = testRef
                userFound = true
                console.log("User ditemukan dengan document ID")
            }
        } catch (e) {}
        
        if (!userFound) {
            const q = query(collection(db, "users"), where("uid", "==", uid))
            const querySnap = await getDocs(q) // FIX: Teratasi dengan penambahan objek import di atas
            if (!querySnap.empty) {
                userRef = doc(db, "users", querySnap.docs[0].id)
                userFound = true
                console.log("User ditemukan dengan field uid")
            }
        }
        
        if (!userFound) {
            throw new Error("User tidak ditemukan di database")
        }
        
        // Kosongkan field deviceId agar login berikutnya dianggap sebagai pendaftaran device baru
        await updateDoc(userRef, {
            deviceId: null,
            deviceResetAt: new Date()
        })
        
        return { success: true, message: "Device berhasil direset" }
        
    } catch (error) {
        console.error("Error reset device:", error)
        return { success: false, message: error.message }
    }
}