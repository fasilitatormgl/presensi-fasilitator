import { auth, db } from "./firebase-init.js"
import { signInWithEmailAndPassword, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js"
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js"

// === FITUR TOGGLE PASSWORD & DETEKSI ENTER ===
window.togglePassword = function() {
    const passwordInput = document.getElementById("password");
    const toggleBtn = document.getElementById("toggleBtn");
    
    if (passwordInput && passwordInput.type === "password") {
        passwordInput.type = "text";
        toggleBtn.textContent = "🙈"; 
    } else if (passwordInput) {
        passwordInput.type = "password";
        toggleBtn.textContent = "👁️"; 
    }
};

document.addEventListener('DOMContentLoaded', () => {
    const emailInput = document.getElementById("email");
    const passwordInput = document.getElementById("password");
    
    const handleEnter = (event) => {
        if (event.key === 'Enter') {
            event.preventDefault(); 
            window.login();
        }
    };
    
    if (emailInput) emailInput.addEventListener('keypress', handleEnter);
    if (passwordInput) passwordInput.addEventListener('keypress', handleEnter);
});

// === FUNGSI LOGIN ===
window.login = async function() {
    const email = document.getElementById("email").value.trim()
    const password = document.getElementById("password").value
    const loading = document.getElementById("loading")
    
    if (!email || !password) {
        alert("Email dan password harus diisi!")
        return
    }
    
    try {
        if (loading) loading.style.display = "flex"
        console.log("🔑 Mencoba login dengan email:", email)
        
        const userCredential = await signInWithEmailAndPassword(auth, email, password)
        const user = userCredential.user
        
        console.log("✅ Login sukses, UID:", user.uid)
        
        const userDoc = await getDoc(doc(db, "users", user.uid))
        
        if (userDoc.exists()) {
            const userData = userDoc.data()
            
            if (!userData.role) {
                alert("Error: Data user tidak lengkap (role tidak ada). Hubungi admin.")
                await auth.signOut();
                return
            }
            
            // Simpan data esensial ke localStorage sebagai cadangan
            localStorage.setItem("userData", JSON.stringify({
                uid: user.uid,
                nama: userData.nama || user.email.split('@')[0],
                email: userData.email,
                role: userData.role,
                kelurahan: userData.kelurahan || null
            }))
            
            console.log("💾 Data tersimpan di localStorage, role:", userData.role)
            
            // REDIRECT BERDASARKAN ROLE (Menggunakan replace agar history login hancur & anti-loop)
            if (userData.role === "admin") {
            window.location.replace("admin.html");
            }
            else if (userData.role === "koordinator") {
            window.location.replace("koordinator-dashboard.html");
            }
            else if (userData.role === "pemantau") {
            window.location.replace("pemantau-dashboard.html");
            }
else {
    window.location.replace("dashboard.html");
}
        } else {
            alert("Data user tidak ditemukan di database! Hubungi admin.");
            await auth.signOut();
        }
        
    } catch (error) {
        console.error("❌ Login error:", error)
        let errorMessage = "Login gagal! "
        switch (error.code) {
            case 'auth/invalid-credential':
            case 'auth/user-not-found':
            case 'auth/wrong-password':
                errorMessage += "Email atau password salah."
                break
            case 'auth/too-many-requests':
                errorMessage += "Terlalu banyak percobaan. Coba lagi nanti."
                break
            default:
                errorMessage += error.message
        }
        alert(errorMessage)
    } finally {
        if (loading) loading.style.display = "none"
    }
}

// === FUNGSI RESET PASSWORD ===
window.resetPassword = async function(email) {
    if (!email) {
        email = document.getElementById('email').value;
        if (!email) {
            alert('Masukkan email!');
            return;
        }
    }
    const loading = document.getElementById("loading");
    try {
        if (loading) loading.style.display = "flex";
        const { sendPasswordResetEmail } = await import("https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js");
        await sendPasswordResetEmail(auth, email);
        alert(`✅ Email reset password telah dikirim ke ${email}\n\nCek inbox/spam folder Anda.`);
    } catch (error) {
        console.error("❌ Error reset password:", error);
        let errorMessage = "Gagal kirim email: ";
        if (error.code === 'auth/user-not-found') errorMessage += "Email tidak terdaftar";
        else if (error.code === 'auth/too-many-requests') errorMessage += "Terlalu banyak permintaan";
        else errorMessage += error.message;
        alert(errorMessage);
    } finally {
        if (loading) loading.style.display = "none";
    }
}

// === DETEKSI OTOMATIS STATUS AUTH (SINKRON & AMAN DARI DISKO) ===
onAuthStateChanged(auth, async (user) => {
    const path = window.location.pathname;
    // Mengambil segmen nama berkas paling akhir secara absolut
    const currentPage = path.substring(path.lastIndexOf('/') + 1);
    
    // Validasi halaman login yang jauh lebih ketat
    const isLoginPage = currentPage === 'index.html' || currentPage === 'index' || currentPage === '';

    if (user) {
        // Jika user sudah terautentikasi dan mencoba diam di halaman login, kunci arahnya
        if (isLoginPage) {
            try {
                const userDoc = await getDoc(doc(db, "users", user.uid))
                if (userDoc.exists()) {
                    const role = userDoc.data().role;
                    console.log("🔄 Auto redirect aktif, role:", role);
                    
                    if (role === 'admin') {
                    window.location.replace('admin.html');
                }
                    else if (role === 'koordinator') {
                    window.location.replace('koordinator-dashboard.html');
                }
                    else if (role === 'pemantau') {
                    window.location.replace('pemantau-dashboard.html');
                }
                    else {
                    window.location.replace('dashboard.html');
                }
                }
            } catch (err) {
                console.error("Gagal memproses auto-redirect:", err);
            }
        }
    } else {
        // Jika tidak ada user aktif dan posisi saat ini berada di halaman dalam (dashboard)
        if (!isLoginPage) {
            console.log("🚫 Sesi tidak ditemukan, mengeluarkan user ke halaman utama.");
            localStorage.clear(); // Bersihkan seluruh cache lokal agar tidak korup
            window.location.replace('index.html');
        }
    }
});
