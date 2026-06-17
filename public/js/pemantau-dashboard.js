// ========== PEMANTAU DASHBOARD LOADER ==========
// File ini berfungsi memastikan bahwa halaman pemantau-dashboard.html
// menggunakan modul pemantau.js yang sesuai

document.addEventListener('DOMContentLoaded', () => {
    // Cek role dari localStorage
    const userData = JSON.parse(localStorage.getItem("userData") || "{}")
    
    if (!userData || userData.role !== 'pemantau') {
        // Redirect jika bukan pemantau
        window.location.href = "index.html"
        return
    }

    // Load script pemantau.js secara dinamis
    const script = document.createElement('script')
    script.type = 'module'
    script.src = 'pemantau.js'
    document.body.appendChild(script)

    console.log('Pemantau Dashboard dimuat')
})
