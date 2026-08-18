import { db } from "./firebase-init.js"

import {
    collection,
    getDocs,
    query,
    where
} from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js"


// =====================================================
// AMBIL SEMUA USER
// =====================================================

export async function getUsersMap() {

    const usersSnap = await getDocs(
        collection(db, "users")
    )

    const usersMap = new Map()

    usersSnap.forEach(doc => {

        usersMap.set(doc.id, {
            id: doc.id,
            ...doc.data()
        })

    })

    return usersMap
}


// =====================================================
// AMBIL PRESENSI HARIAN
// =====================================================

export async function getPresensiHarian(tanggal) {

    if (!tanggal) {
        throw new Error("Tanggal belum dipilih")
    }

    const presensiSnap = await getDocs(
        query(
            collection(db, "presensi"),
            where("tanggal", "==", tanggal)
        )
    )

    const data = []

    presensiSnap.forEach(doc => {

        data.push({
            id: doc.id,
            ...doc.data()
        })

    })

    return data
}


// =====================================================
// REKAP HARIAN
// =====================================================

export async function getRekapHarian(tanggal) {

    const [
        presensi,
        usersMap
    ] = await Promise.all([
        getPresensiHarian(tanggal),
        getUsersMap()
    ])


    const data = []

    let hadir = 0
    let terlambat = 0
    let izin = 0
    let sakit = 0
    let alpha = 0


    for (const p of presensi) {

        const user = usersMap.get(p.uid) || {}

        const status = String(
            p.status || "hadir"
        ).toLowerCase()


        if (status === "hadir") {
            hadir++
        }

        else if (
            status === "terlambat" ||
            status === "telat"
        ) {
            terlambat++
        }

        else if (status === "izin") {
            izin++
        }

        else if (status === "sakit") {
            sakit++
        }

        else if (
            status === "alpha" ||
            status === "alpa"
        ) {
            alpha++
        }


        let waktu = "-"

        if (p.waktu?.seconds) {

            waktu = new Date(
                p.waktu.seconds * 1000
            ).toLocaleString("id-ID")

        }


        data.push({

            id: p.id,

            uid: p.uid || "",

            nama: user.nama || "-",

            email: user.email || "-",

            kelurahan: user.kelurahan || "-",

            role: user.role || "-",

            waktu,

            lokasi: p.lokasi || "-",

            status: p.status || "hadir"

        })

    }


    return {

        tanggal,

        total: data.length,

        hadir,

        terlambat,

        izin,

        sakit,

        alpha,

        data

    }

}


// =====================================================
// AMBIL PRESENSI BULANAN
// =====================================================

export async function getPresensiBulanan(bulan) {

    /*
        bulan harus:

        YYYY-MM

        contoh:

        2026-08
    */

    if (!/^\d{4}-\d{2}$/.test(bulan)) {
        throw new Error(
            "Format bulan harus YYYY-MM"
        )
    }


    const awal = `${bulan}-01`


    const [tahun, bulanAngka] =
        bulan.split("-").map(Number)


    const jumlahHari =
        new Date(
            tahun,
            bulanAngka,
            0
        ).getDate()


    const akhir =
        `${bulan}-${String(jumlahHari).padStart(2, "0")}`


    const presensiSnap = await getDocs(
        query(
            collection(db, "presensi"),
            where("tanggal", ">=", awal),
            where("tanggal", "<=", akhir)
        )
    )


    const data = []


    presensiSnap.forEach(doc => {

        data.push({
            id: doc.id,
            ...doc.data()
        })

    })


    return data

}


// =====================================================
// REKAP BULANAN
// =====================================================

export async function getRekapBulanan(bulan) {

    const [
        presensi,
        usersMap
    ] = await Promise.all([
        getPresensiBulanan(bulan),
        getUsersMap()
    ])


    /*
        Buat daftar semua user.

        User yang tidak memiliki presensi tetap muncul
        sehingga bisa digunakan untuk melihat alpha.
    */

    const userData = new Map()


    for (const [uid, user] of usersMap) {

        userData.set(uid, {

            uid,

            nama: user.nama || "-",

            email: user.email || "-",

            kelurahan: user.kelurahan || "-",

            role: user.role || "-",

            hadir: 0,

            terlambat: 0,

            izin: 0,

            sakit: 0,

            alpha: 0,

            totalPresensi: 0,

            detail: []

        })

    }


    // ===============================================
    // MASUKKAN DATA PRESENSI
    // ===============================================

    for (const p of presensi) {

        const user =
            usersMap.get(p.uid) || {}


        if (!userData.has(p.uid)) {

            userData.set(p.uid, {

                uid: p.uid,

                nama: user.nama || "-",

                email: user.email || "-",

                kelurahan: user.kelurahan || "-",

                role: user.role || "-",

                hadir: 0,

                terlambat: 0,

                izin: 0,

                sakit: 0,

                alpha: 0,

                totalPresensi: 0,

                detail: []

            })

        }


        const row =
            userData.get(p.uid)


        const status =
            String(
                p.status || "hadir"
            ).toLowerCase()


        if (status === "hadir") {
            row.hadir++
        }

        else if (
            status === "terlambat" ||
            status === "telat"
        ) {
            row.terlambat++
        }

        else if (status === "izin") {
            row.izin++
        }

        else if (status === "sakit") {
            row.sakit++
        }

        else if (
            status === "alpha" ||
            status === "alpa"
        ) {
            row.alpha++
        }


        row.totalPresensi++


        row.detail.push({

            tanggal: p.tanggal,

            status: p.status || "hadir",

            waktu:
                p.waktu?.seconds
                    ? new Date(
                        p.waktu.seconds * 1000
                    ).toLocaleString("id-ID")
                    : "-",

            lokasi: p.lokasi || "-"

        })

    }


    return {

        bulan,

        data: Array.from(
            userData.values()
        )

    }

}


// =====================================================
// REKAP KOORDINATOR
// =====================================================

export async function getRekapKoordinator(
    bulan,
    koordinatorId = null
) {

    const rekap =
        await getRekapBulanan(bulan)


    /*
        Kalau koordinatorId diberikan,
        hanya anggota koordinator tersebut
        yang dikembalikan.

        Kalau null:
        semua koordinator dikembalikan.
    */

    let data = rekap.data


    if (koordinatorId) {

        data = data.filter(user => {

            return (
                user.koordinatorId ===
                koordinatorId
            )

        })

    }


    return {

        bulan,

        totalAnggota: data.length,

        totalHadir:
            data.reduce(
                (total, user) =>
                    total + user.hadir,
                0
            ),

        totalTerlambat:
            data.reduce(
                (total, user) =>
                    total + user.terlambat,
                0
            ),

        totalIzin:
            data.reduce(
                (total, user) =>
                    total + user.izin,
                0
            ),

        totalSakit:
            data.reduce(
                (total, user) =>
                    total + user.sakit,
                0
            ),

        totalAlpha:
            data.reduce(
                (total, user) =>
                    total + user.alpha,
                0
            ),

        data

    }

}


// =====================================================
// REKAP PEMANTAU
// =====================================================

export async function getRekapPemantau(
    mode,
    tanggalAtauBulan
) {

    if (mode === "harian") {

        return await getRekapHarian(
            tanggalAtauBulan
        )

    }


    if (mode === "bulanan") {

        return await getRekapBulanan(
            tanggalAtauBulan
        )

    }


    throw new Error(
        "Mode rekap harus 'harian' atau 'bulanan'"
    )

}


// =====================================================
// DATA EXPORT HARIAN
// =====================================================

export async function getExportHarian(
    tanggal
) {

    const rekap =
        await getRekapHarian(tanggal)


    const data = [
        [
            "No",
            "Nama",
            "Email",
            "Kelurahan",
            "Status",
            "Waktu",
            "Lokasi"
        ]
    ]


    let no = 1


    for (const row of rekap.data) {

        data.push([

            no++,

            row.nama,

            row.email,

            row.kelurahan,

            row.status,

            row.waktu,

            row.lokasi

        ])

    }


    return data

}


// =====================================================
// DATA EXPORT BULANAN
// =====================================================

export async function getExportBulanan(
    bulan
) {

    const rekap =
        await getRekapBulanan(bulan)


    const data = [

        [
            "No",
            "Nama",
            "Email",
            "Kelurahan",
            "Hadir",
            "Terlambat",
            "Izin",
            "Sakit",
            "Alpha",
            "Total Presensi"
        ]

    ]


    let no = 1


    for (const row of rekap.data) {

        data.push([

            no++,

            row.nama,

            row.email,

            row.kelurahan,

            row.hadir,

            row.terlambat,

            row.izin,

            row.sakit,

            row.alpha,

            row.totalPresensi

        ])

    }


    return data

}
