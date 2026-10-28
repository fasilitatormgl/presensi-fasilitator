import { db } from "./firebase-init.js"
import { collection, getDocs, query, where, doc, setDoc, writeBatch } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js"
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
                
                // Deteksi nama sheet secara fleksibel (USER / Users)
                const userSheetName = workbook.SheetNames.find(name => name.toUpperCase() === 'USER' || name.toUpperCase() === 'USERS');
                
                // ========== IMPORT USERS ==========
                if (userSheetName) {
                    console.log(`👥 Processing user sheet (${userSheetName})...`)
                    const sheet = workbook.Sheets[userSheetName]
                    const users = XLSX.utils.sheet_to_json(sheet)
                    
                    console.log(`📊 Found ${users.length} users`)
                    
                    for (let i = 0; i < users.length; i++) {
                        const user = users[i]
                        
                        try {
                            console.log(`⏳ Processing user ${i + 1}/${users.length}: ${user.email || 'no email'}`)
                            
                            if (!user.nama || !user.email || !user.password || !user.role) {
                                console.warn(`⚠️ Incomplete data:`, user)
                                result.errors.push(`User ${i+1}: Data tidak lengkap`)
                                result.skipped++
                                continue
                            }
                            
                            if (!user.email.includes('@')) {
                                console.warn(`⚠️ Invalid email: ${user.email}`)
                                result.errors.push(`User ${i+1}: Email tidak valid (${user.email})`)
                                result.skipped++
                                continue
                            }
                            
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
                            
                            let userCredential
                            try {
                                userCredential = await createUserWithEmailAndPassword(
                                    auth,
                                    user.email,
                                    String(user.password)
                                )
                                console.log(`✅ Auth created: ${user.email} with UID: ${userCredential.user.uid}`)
                            } catch (authError) {
                                console.error(`❌ Auth error:`, authError)
                                result.errors.push(`User ${i+1}: Gagal auth - ${authError.message}`)
                                result.skipped++
                                continue
                            }
                            
                            const userData = {
                                uid: userCredential.user.uid,
                                nama: user.nama,
                                email: user.email,
                                password: String(user.password),
                                role: user.role,
                                kecamatan: user.kecamatan || "",
                                kelurahan: user.kelurahan || "",
                                kota: user.kota || "Magelang",
                                deviceId: null,
                                deviceCheckEnabled: true,
                                deviceResetAt: new Date(),
                                lastResetBy: "import",
                                lastSeen: new Date(),
                                createdAt: new Date()
                            }
                            
                            await setDoc(doc(db, "users", userCredential.user.uid), userData);
                            console.log(`✅ User saved with UID as document ID: ${userCredential.user.uid}`);
                            
                            result.users++
                            
                        } catch (error) {
                            console.error(`❌ Error for user ${i+1}:`, error)
                            result.errors.push(`User ${i+1}: ${error.message}`)
                            result.skipped++
                        }
                        
                        await new Promise(resolve => setTimeout(resolve, 300))
                    }
                } else {
                    console.warn("⚠️ USER sheet not found")
                    result.errors.push("Sheet USER tidak ditemukan")
                }
                
                // Deteksi nama sheet lokasi secara fleksibel (LOKASI / Lokasi)
                const lokasiSheetName = workbook.SheetNames.find(name => name.toUpperCase() === 'LOKASI' || name.toUpperCase() === 'LOKASIS');

                // ========== IMPORT LOKASI DENGAN BATCH ==========
                if (lokasiSheetName) {
                    console.log(`📍 Processing location sheet (${lokasiSheetName}) with BATCH...`)
                    const sheet = workbook.Sheets[lokasiSheetName]
                    const lokasiList = XLSX.utils.sheet_to_json(sheet)
                    
                    console.log(`📊 Found ${lokasiList.length} locations`)
                    
                    const batch = writeBatch(db);
                    let batchCount = 0;
                    
                    for (let i = 0; i < lokasiList.length; i++) {
                        const loc = lokasiList[i]
                        
                        try {
                            console.log(`⏳ Processing location ${i + 1}/${lokasiList.length}: ${loc.nama || 'no name'}`)
                            
                            if (!loc.nama || !loc.tipe || loc.lat === undefined || loc.lng === undefined) {
                                console.warn(`⚠️ Incomplete location data:`, loc)
                                result.errors.push(`Lokasi ${i+1}: Data tidak lengkap`)
                                result.skipped++
                                continue
                            }
                            
                            const tipeLower = String(loc.tipe).trim().toLowerCase();
                            if (tipeLower !== 'kantor' && tipeLower !== 'kelurahan') {
                                console.warn(`⚠️ Invalid type: ${loc.tipe}`)
                                result.errors.push(`Lokasi ${i+1}: Tipe harus 'kantor'/'kelurahan'`)
                                result.skipped++
                                continue
                            }
                            
                            const q = query(
                                collection(db, "lokasi"),
                                where("nama", "==", String(loc.nama).trim())
                            )
                            const existing = await getDocs(q)
                            
                            if (!existing.empty) {
                                console.log(`⏭️ Location already exists: ${loc.nama}`)
                                result.errors.push(`Lokasi ${i+1}: ${loc.nama} sudah ada`)
                                result.skipped++
                                continue
                            }
                            
                            const docRef = doc(collection(db, "lokasi"));
                            batch.set(docRef, {
                                nama: String(loc.nama).trim(),
                                tipe: tipeLower,
                                lat: parseFloat(loc.lat),
                                lng: parseFloat(loc.lng),
                                radius: parseInt(loc.radius) || 100,
                                createdAt: new Date()
                            });
                            
                            batchCount++;
                            result.lokasi++;
                            
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
