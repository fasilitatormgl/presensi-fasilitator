import { db } from "./firebase-init.js"
import { collection, addDoc, getDocs, query, where, doc, setDoc, writeBatch } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js"
import { getAuth, createUserWithEmailAndPassword, fetchSignInMethodsForEmail } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js"

export async function importFromExcel(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader()
        
        reader.onload = async (e) => {
            try {
                console.log("📂 Reading Excel file...")
                const data = new Uint8Array(e.target.result)
                const workbook = XLSX.read(data, { type: 'array' })
                
                console.log("📄 Sheets found:", workbook.SheetNames)
                
                let result = { users: 0, lokasi: 0, skipped: 0, errors: [] }
                
                // ========== IMPORT USERS DENGAN BATCH ==========
                if (workbook.SheetNames.includes('USER')) {
                    console.log("👥 Processing USER sheet...")
                    const sheet = workbook.Sheets['USER']
                    const users = XLSX.utils.sheet_to_json(sheet)
                    
                    console.log(`📊 Found ${users.length} users`)
                    
                    // Proses users satu per satu karena perlu Auth
                    for (let i = 0; i < users.length; i++) {
                        const user = users[i]
                        
                        try {
                            console.log(`⏳ Processing user ${i + 1}/${users.length}: ${user.email || 'no email'}`)
                            
                            // Validasi data
                            if (!user.nama || !user.email || !user.password || !user.role) {
                                console.warn(`⚠️ Incomplete data:`, user)
                                result.errors.push(`User ${i+1}: Data tidak lengkap`)
                                result.skipped++
                                continue
                            }
                            
                            // Validasi email
                            if (!user.email.includes('@')) {
                                console.warn(`⚠️ Invalid email: ${user.email}`)
                                result.errors.push(`User ${i+1}: Email tidak valid (${user.email})`)
                                result.skipped++
                                continue
                            }
                            
                            // Cek email di Authentication
                            const auth = getAuth()
                            let methods = []
                            try {
                                methods = await fetchSignInMethodsForEmail(auth, user.email)
                            } catch (error) {
                                console.warn(`⚠️ Error checking email ${user.email}:`, error)
                            }
                            
                            if (methods.length > 0) {
                                console.log(`⏭️ Email already registered: ${user.email}`)
                                result.errors.push(`User ${i+1}: Email ${user.email} sudah terdaftar`)
                                result.skipped++
                                continue
                            }
                            
                            // BUAT USER DI AUTHENTICATION
                            let userCredential
                            try {
                                userCredential = await createUserWithEmailAndPassword(
                                    auth,
                                    user.email,
                                    user.password
                                )
                                console.log(`✅ Auth created: ${user.email} with UID: ${userCredential.user.uid}`)
                            } catch (authError) {
                                console.error(`❌ Auth error:`, authError)
                                result.errors.push(`User ${i+1}: Gagal auth - ${authError.message}`)
                                result.skipped++
                                continue
                            }
                            
                            // Data user
                            const userData = {
                                uid: userCredential.user.uid,
                                nama: user.nama,
                                email: user.email,
                                role: user.role,
                                kelurahan: user.kelurahan || null,
                                deviceId: null,
                                deviceCheckEnabled: true,
                                deviceResetAt: new Date(),
                                lastResetBy: "import",
                                lastSeen: new Date(),
                                createdAt: new Date()
                            }
                            
                            // Simpan ke Firestore dengan UID sebagai document ID
                            await setDoc(doc(db, "users", userCredential.user.uid), userData);
                            console.log(`✅ User saved with UID as document ID: ${userCredential.user.uid}`);
                            
                            result.users++
                            
                        } catch (error) {
                            console.error(`❌ Error for user ${i+1}:`, error)
                            result.errors.push(`User ${i+1}: ${error.message}`)
                            result.skipped++
                        }
                        
                        // Jeda 500ms
                        await new Promise(resolve => setTimeout(resolve, 500))
                    }
                } else {
                    console.warn("⚠️ USER sheet not found")
                    result.errors.push("Sheet USER tidak ditemukan")
                }
                
                // ========== IMPORT LOKASI DENGAN BATCH ==========
                if (workbook.SheetNames.includes('LOKASI')) {
                    console.log("📍 Processing LOKASI sheet with BATCH...")
                    const sheet = workbook.Sheets['LOKASI']
                    const lokasiList = XLSX.utils.sheet_to_json(sheet)
                    
                    console.log(`📊 Found ${lokasiList.length} locations`)
                    
                    // Gunakan batch untuk menulis banyak lokasi sekaligus
                    const batch = writeBatch(db);
                    let batchCount = 0;
                    
                    for (let i = 0; i < lokasiList.length; i++) {
                        const loc = lokasiList[i]
                        
                        try {
                            console.log(`⏳ Processing location ${i + 1}/${lokasiList.length}: ${loc.nama || 'no name'}`)
                            
                            // Validasi
                            if (!loc.nama || !loc.tipe || !loc.lat || !loc.lng) {
                                console.warn(`⚠️ Incomplete location data:`, loc)
                                result.errors.push(`Lokasi ${i+1}: Data tidak lengkap`)
                                result.skipped++
                                continue
                            }
                            
                            // Validasi tipe
                            if (loc.tipe !== 'kantor' && loc.tipe !== 'kelurahan') {
                                console.warn(`⚠️ Invalid type: ${loc.tipe}`)
                                result.errors.push(`Lokasi ${i+1}: Tipe harus 'kantor'/'kelurahan'`)
                                result.skipped++
                                continue
                            }
                            
                            // Cek duplikat (tetap perlu read)
                            const q = query(
                                collection(db, "lokasi"),
                                where("nama", "==", loc.nama)
                            )
                            const existing = await getDocs(q)
                            
                            if (!existing.empty) {
                                console.log(`⏭️ Location already exists: ${loc.nama}`)
                                result.errors.push(`Lokasi ${i+1}: ${loc.nama} sudah ada`)
                                result.skipped++
                                continue
                            }
                            
                            // Tambah ke batch
                            const docRef = doc(collection(db, "lokasi"));
                            batch.set(docRef, {
                                nama: loc.nama,
                                tipe: loc.tipe,
                                lat: parseFloat(loc.lat),
                                lng: parseFloat(loc.lng),
                                createdAt: new Date()
                            });
                            
                            batchCount++;
                            result.lokasi++;
                            
                            // Commit batch setiap 20 dokumen
                            if (batchCount >= 20) {
                                await batch.commit();
                                console.log(`✅ Batch committed (${batchCount} locations)`);
                                batchCount = 0;
                            }
                            
                        } catch (error) {
                            console.error(`❌ Error for location ${i+1}:`, error)
                            result.errors.push(`Lokasi ${i+1}: ${error.message}`)
                            result.skipped++
                        }
                    }
                    
                    // Commit sisa batch
                    if (batchCount > 0) {
                        await batch.commit();
                        console.log(`✅ Final batch committed (${batchCount} locations)`);
                    }
                    
                } else {
                    console.warn("⚠️ LOKASI sheet not found")
                    result.errors.push("Sheet LOKASI tidak ditemukan")
                }
                
                console.log("🎉 IMPORT COMPLETED!", result)
                
                resolve(result)
                
            } catch (error) {
                console.error("❌ FATAL ERROR:", error)
                reject(error)
            }
        }
        
        reader.onerror = (error) => {
            console.error("❌ FileReader error:", error)
            reject(error)
        }
        
        reader.readAsArrayBuffer(file)
    })
}