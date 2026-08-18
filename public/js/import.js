import { db } from "./firebase-init.js";
import {
  collection, getDocs, query, where, doc, setDoc, writeBatch, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-functions.js";

const functions = getFunctions(undefined, "asia-southeast2");
const adminUserAction = httpsCallable(functions, "adminUserAction");

export async function importFromExcel(file, onProgress = () => {}) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = async (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: "array" });
        const result = { users: 0, lokasi: 0, skipped: 0, errors: [] };

        if (workbook.SheetNames.includes("USER")) {
          const users = XLSX.utils.sheet_to_json(workbook.Sheets["USER"]);

          for (let i = 0; i < users.length; i++) {
            const user = users[i];

            try {
              if (!user.nama || !user.email || !user.password || !user.role) {
                throw new Error("nama, email, password dan role wajib diisi");
              }

              const email = String(user.email).trim();
              if (!email.includes("@")) throw new Error("email tidak valid");

              await adminUserAction({
                action: "create",
                nama: String(user.nama).trim(),
                email,
                password: String(user.password),
                role: String(user.role).trim(),
                kecamatan: user.kecamatan ? String(user.kecamatan).trim() : null,
                kelurahan: user.kelurahan ? String(user.kelurahan).trim() : null,
                kota: user.kota ? String(user.kota).trim() : null,
                active: user.active !== false && String(user.active).toLowerCase() !== "false",
                deviceCheckEnabled: user.deviceCheckEnabled !== false && String(user.deviceCheckEnabled).toLowerCase() !== "false"
              });

              result.users++;
            } catch (error) {
              result.errors.push(`User ${i + 1}: ${error.message}`);
              result.skipped++;
            }

            onProgress(Math.max(1, Math.round(((i + 1) / Math.max(users.length, 1)) * 70)));
            await new Promise(r => setTimeout(r, 150));
          }
        }

        if (workbook.SheetNames.includes("LOKASI")) {
          const lokasiList = XLSX.utils.sheet_to_json(workbook.Sheets["LOKASI"]);
          const existing = await getDocs(collection(db, "lokasi"));
          const names = new Set(existing.docs.map(d => d.data().nama));

          let batch = writeBatch(db);
          let batchCount = 0;

          for (let i = 0; i < lokasiList.length; i++) {
            const loc = lokasiList[i];
            const nama = loc.nama ? String(loc.nama).trim() : "";
            const tipe = loc.tipe ? String(loc.tipe).trim() : "";
            const lat = Number(loc.lat);
            const lng = Number(loc.lng);
            const radius = Number(loc.radius || 100);

            if (!nama || !["kantor","kelurahan"].includes(tipe) || !Number.isFinite(lat) || !Number.isFinite(lng)) {
              result.errors.push(`Lokasi ${i + 1}: data tidak lengkap/tidak valid`);
              result.skipped++;
              continue;
            }

            if (names.has(nama)) {
              result.errors.push(`Lokasi ${i + 1}: ${nama} sudah ada`);
              result.skipped++;
              continue;
            }

            const ref = doc(collection(db, "lokasi"));
            batch.set(ref, {
              nama, tipe, lat, lng, radius,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp()
            });
            names.add(nama);
            result.lokasi++;
            batchCount++;

            if (batchCount >= 450) {
              await batch.commit();
              batch = writeBatch(db);
              batchCount = 0;
            }

            onProgress(70 + Math.round(((i + 1) / Math.max(lokasiList.length, 1)) * 30));
          }

          if (batchCount) await batch.commit();
        }

        onProgress(100);
        resolve(result);
      } catch (error) {
        reject(error);
      }
    };

    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}
