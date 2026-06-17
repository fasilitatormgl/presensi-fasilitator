import { db } from "./firebase-init.js"
import { collection, getDocs, query, where } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js"

export async function exportToExcel(tanggal) {
    try {
        const presensiSnap = await getDocs(
            query(collection(db, "presensi"), where("tanggal", "==", tanggal))
        )
        
        const usersSnap = await getDocs(collection(db, "users"))
        const usersMap = new Map()
        usersSnap.forEach(doc => usersMap.set(doc.id, doc.data()))
        
        const data = [['No', 'Nama', 'Email', 'Kelurahan', 'Waktu', 'Lokasi']]
        
        let no = 1
        for (const doc of presensiSnap.docs) {
            const p = doc.data()
            const user = usersMap.get(p.uid) || {}
            const waktu = p.waktu?.seconds ? new Date(p.waktu.seconds * 1000).toLocaleString() : '-'
            
            data.push([
                no++,
                user.nama || '-',
                user.email || '-',
                user.kelurahan || '-',
                waktu,
                p.lokasi || '-'
            ])
        }
        
        const wb = XLSX.utils.book_new()
        const ws = XLSX.utils.aoa_to_sheet(data)
        XLSX.utils.book_append_sheet(wb, ws, `Presensi ${tanggal}`)
        XLSX.writeFile(wb, `rekap_presensi_${tanggal}.xlsx`)
        
    } catch (error) {
        console.error("Error export:", error)
        throw error
    }
}